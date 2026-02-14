package services

import (
	"context"
	"fmt"
	"strings"

	"cc-platform/internal/docker"

	"github.com/google/uuid"
	log "github.com/sirupsen/logrus"
)

// CLIToolService handles CLI tool integration for sequential workflows
// (Gemini analysis → Codex modification) inside Docker containers
type CLIToolService struct {
	dockerClient *docker.Client
}

// NewCLIToolService creates a new CLIToolService
func NewCLIToolService(dockerClient *docker.Client) *CLIToolService {
	return &CLIToolService{
		dockerClient: dockerClient,
	}
}

// executeGeminiAnalysis runs Gemini CLI analysis inside a container and saves output to a temp file
func (s *CLIToolService) executeGeminiAnalysis(ctx context.Context, containerID string, prompt string, workdir string) (output string, filePath string, err error) {
	// Sanitize prompt for shell safety
	safePrompt := strings.ReplaceAll(prompt, "'", "'\\''")

	cmd := []string{"sh", "-c", fmt.Sprintf("ccw cli -p '%s' --tool gemini --mode analysis --cd '%s'", safePrompt, workdir)}

	log.Infof("[CLIToolService] Executing Gemini analysis in container %s, workdir: %s", containerID, workdir)

	output, err = s.dockerClient.ExecInContainer(ctx, containerID, cmd)
	if err != nil {
		return "", "", fmt.Errorf("failed to execute Gemini analysis: %w", err)
	}

	// Generate unique temp file path for result passing
	filePath = fmt.Sprintf("/tmp/gemini-analysis-%s.json", uuid.New().String())

	// Write output to temp file for Codex to consume
	writeCmd := []string{"sh", "-c", fmt.Sprintf("cat > %s << 'GEMINIEOF'\n%s\nGEMINIEOF", filePath, output)}
	_, err = s.dockerClient.ExecInContainer(ctx, containerID, writeCmd)
	if err != nil {
		return output, "", fmt.Errorf("failed to write Gemini output to temp file: %w", err)
	}

	log.Infof("[CLIToolService] Gemini analysis complete, output saved to %s", filePath)
	return output, filePath, nil
}

// executeCodexModification runs Codex CLI modification inside a container with context from analysis
func (s *CLIToolService) executeCodexModification(ctx context.Context, containerID string, prompt string, contextFilePath string, workdir string) (output string, err error) {
	safePrompt := strings.ReplaceAll(prompt, "'", "'\\''")

	var cmdStr string
	if contextFilePath != "" {
		cmdStr = fmt.Sprintf("ccw cli -p '%s Context: @%s' --tool codex --mode write --cd '%s'", safePrompt, contextFilePath, workdir)
	} else {
		cmdStr = fmt.Sprintf("ccw cli -p '%s' --tool codex --mode write --cd '%s'", safePrompt, workdir)
	}

	cmd := []string{"sh", "-c", cmdStr}

	log.Infof("[CLIToolService] Executing Codex modification in container %s, workdir: %s", containerID, workdir)

	output, err = s.dockerClient.ExecInContainer(ctx, containerID, cmd)
	if err != nil {
		return "", fmt.Errorf("failed to execute Codex modification: %w", err)
	}

	log.Infof("[CLIToolService] Codex modification complete")
	return output, nil
}

// ExecuteGeminiAnalysis runs Gemini CLI analysis and returns the output (without temp file)
func (s *CLIToolService) ExecuteGeminiAnalysis(ctx context.Context, containerID string, prompt string, workdir string) (string, error) {
	safePrompt := strings.ReplaceAll(prompt, "'", "'\\''")

	cmd := []string{"sh", "-c", fmt.Sprintf("ccw cli -p '%s' --tool gemini --mode analysis --cd '%s'", safePrompt, workdir)}

	log.Infof("[CLIToolService] Executing standalone Gemini analysis in container %s, workdir: %s", containerID, workdir)

	output, err := s.dockerClient.ExecInContainer(ctx, containerID, cmd)
	if err != nil {
		return "", fmt.Errorf("failed to execute Gemini analysis: %w", err)
	}

	return output, nil
}

// ExecuteSequentialWorkflow orchestrates Gemini analysis → Codex modification workflow
func (s *CLIToolService) ExecuteSequentialWorkflow(ctx context.Context, containerID string, analysisPrompt string, modificationPrompt string, workdir string) (geminiOutput string, codexOutput string, err error) {
	log.Infof("[CLIToolService] Starting sequential workflow in container %s", containerID)

	// Step 1: Execute Gemini analysis
	geminiOutput, analysisFile, err := s.executeGeminiAnalysis(ctx, containerID, analysisPrompt, workdir)
	if err != nil {
		return "", "", fmt.Errorf("gemini analysis failed: %w", err)
	}

	// Step 2: Execute Codex modification with Gemini output as context
	codexOutput, err = s.executeCodexModification(ctx, containerID, modificationPrompt, analysisFile, workdir)
	if err != nil {
		// Cleanup temp file even on error
		cleanupCmd := []string{"sh", "-c", fmt.Sprintf("rm -f %s", analysisFile)}
		_, _ = s.dockerClient.ExecInContainer(ctx, containerID, cleanupCmd)
		return geminiOutput, "", fmt.Errorf("codex modification failed: %w", err)
	}

	// Step 3: Cleanup temp file
	cleanupCmd := []string{"sh", "-c", fmt.Sprintf("rm -f %s", analysisFile)}
	_, _ = s.dockerClient.ExecInContainer(ctx, containerID, cleanupCmd)

	log.Infof("[CLIToolService] Sequential workflow complete for container %s", containerID)
	return geminiOutput, codexOutput, nil
}
