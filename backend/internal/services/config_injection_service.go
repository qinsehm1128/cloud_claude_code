package services

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"time"

	"cc-platform/internal/docker"
	"cc-platform/internal/models"

	log "github.com/sirupsen/logrus"
)

// MCPServerConfig represents a single MCP server configuration
type MCPServerConfig struct {
	Name      string            `json:"name"`
	Command   string            `json:"command"`
	Args      []string          `json:"args"`
	Env       map[string]string `json:"env,omitempty"`
	Transport string            `json:"transport,omitempty"`
	URL       string            `json:"url,omitempty"`
}

// ConfigInjectionService defines the interface for injecting configurations into containers
type ConfigInjectionService interface {
	// InjectConfigs injects configurations into container and returns injection status
	InjectConfigs(ctx context.Context, containerID string, templateIDs []uint) (*models.InjectionStatus, error)

	// Individual injection methods
	InjectClaudeMD(ctx context.Context, containerID string, content string) error
	InjectSkill(ctx context.Context, containerID string, name string, content string) error
	InjectSkillArchive(ctx context.Context, containerID string, name string, archiveData string) error
	InjectMCP(ctx context.Context, containerID string, configs []MCPServerConfig) error
	InjectCommand(ctx context.Context, containerID string, name string, content string) error
}

// configInjectionServiceImpl is the implementation of ConfigInjectionService
type configInjectionServiceImpl struct {
	dockerClient    *docker.Client
	templateService ConfigTemplateService
}

// NewConfigInjectionService creates a new ConfigInjectionService
func NewConfigInjectionService(dockerClient *docker.Client, templateService ConfigTemplateService) ConfigInjectionService {
	return &configInjectionServiceImpl{
		dockerClient:    dockerClient,
		templateService: templateService,
	}
}

// NewConfigInjectionServiceWithNewClient creates a new ConfigInjectionService with a new docker client
// This is useful when you don't have an existing docker client to pass
func NewConfigInjectionServiceWithNewClient(templateService ConfigTemplateService) ConfigInjectionService {
	dockerClient, err := docker.NewClient()
	if err != nil {
		log.WithError(err).Error("Failed to create docker client for ConfigInjectionService")
		return nil
	}
	return &configInjectionServiceImpl{
		dockerClient:    dockerClient,
		templateService: templateService,
	}
}

// InjectConfigs injects configurations into container and returns injection status
// This method implements error recovery logic - single config failure doesn't affect others
func (s *configInjectionServiceImpl) InjectConfigs(ctx context.Context, containerID string, templateIDs []uint) (*models.InjectionStatus, error) {
	status := &models.InjectionStatus{
		ContainerID: containerID,
		Successful:  []string{},
		Failed:      []models.FailedTemplate{},
		Warnings:    []string{},
		InjectedAt:  time.Now(),
	}

	// If no templates to inject, return empty status
	if len(templateIDs) == 0 {
		return status, nil
	}

	// Collect MCP configs for merging (multiple MCP templates are merged into one file)
	var mcpConfigs []MCPServerConfig

	for _, templateID := range templateIDs {
		// Retrieve template from database
		template, err := s.templateService.GetByID(templateID)
		if err != nil {
			status.Failed = append(status.Failed, models.FailedTemplate{
				TemplateName: fmt.Sprintf("unknown (ID: %d)", templateID),
				ConfigType:   "UNKNOWN",
				Reason:       fmt.Sprintf("failed to retrieve template: %v", err),
			})
			log.WithError(err).Warnf("Failed to retrieve template ID %d", templateID)
			continue
		}

		// Inject based on config type
		if err := s.injectSingleConfig(ctx, containerID, template, &mcpConfigs); err != nil {
			status.Failed = append(status.Failed, models.FailedTemplate{
				TemplateName: template.Name,
				ConfigType:   string(template.ConfigType),
				Reason:       err.Error(),
			})
			log.WithError(err).Warnf("Failed to inject config %s (type: %s)", template.Name, template.ConfigType)
			continue
		}

		// MCP configs are collected and injected together at the end
		if template.ConfigType != models.ConfigTypeMCP {
			status.Successful = append(status.Successful, template.Name)
		}
	}

	// Inject all collected MCP configs together
	if len(mcpConfigs) > 0 {
		if err := s.InjectMCP(ctx, containerID, mcpConfigs); err != nil {
			// Mark all MCP templates as failed
			for _, cfg := range mcpConfigs {
				status.Failed = append(status.Failed, models.FailedTemplate{
					TemplateName: cfg.Name,
					ConfigType:   string(models.ConfigTypeMCP),
					Reason:       fmt.Sprintf("failed to inject MCP config: %v", err),
				})
			}
			log.WithError(err).Warn("Failed to inject MCP configurations")
		} else {
			// Mark all MCP templates as successful
			for _, cfg := range mcpConfigs {
				status.Successful = append(status.Successful, cfg.Name)
			}
		}
	}

	return status, nil
}

// injectSingleConfig injects a single configuration based on its type
// For MCP configs, it collects them into mcpConfigs slice for later batch injection
func (s *configInjectionServiceImpl) injectSingleConfig(ctx context.Context, containerID string, template *models.ClaudeConfigTemplate, mcpConfigs *[]MCPServerConfig) error {
	switch template.ConfigType {
	case models.ConfigTypeClaudeMD:
		return s.InjectClaudeMD(ctx, containerID, template.Content)

	case models.ConfigTypeSkill:
		// Check if this is an archive-based skill
		if template.IsArchive && template.ArchiveData != "" {
			return s.InjectSkillArchive(ctx, containerID, template.Name, template.ArchiveData)
		}
		return s.InjectSkill(ctx, containerID, template.Name, template.Content)

	case models.ConfigTypeMCP:
		// Parse MCP config and collect for batch injection
		mcpConfig, err := s.parseMCPConfig(template.Name, template.Content)
		if err != nil {
			return fmt.Errorf("failed to parse MCP config: %w", err)
		}
		*mcpConfigs = append(*mcpConfigs, *mcpConfig)
		return nil

	case models.ConfigTypeCommand:
		return s.InjectCommand(ctx, containerID, template.Name, template.Content)

	default:
		return fmt.Errorf("unknown config type: %s", template.ConfigType)
	}
}

// parseMCPConfig parses MCP configuration from JSON content
func (s *configInjectionServiceImpl) parseMCPConfig(name string, content string) (*MCPServerConfig, error) {
	var config MCPServerConfig
	if err := json.Unmarshal([]byte(content), &config); err != nil {
		return nil, fmt.Errorf("invalid MCP JSON: %w", err)
	}
	config.Name = name
	return &config, nil
}

// InjectClaudeMD injects CLAUDE.MD content to ~/.claude/CLAUDE.md
func (s *configInjectionServiceImpl) InjectClaudeMD(ctx context.Context, containerID string, content string) error {
	// Create parent directory ~/.claude/ if it doesn't exist
	if err := s.ensureDirectory(ctx, containerID, "$HOME/.claude"); err != nil {
		return fmt.Errorf("failed to create ~/.claude directory: %w", err)
	}

	// Write content to ~/.claude/CLAUDE.md
	return s.writeFile(ctx, containerID, "$HOME/.claude/CLAUDE.md", content)
}

// InjectSkill injects a skill to ~/.claude/skills/{name}/SKILL.md
func (s *configInjectionServiceImpl) InjectSkill(ctx context.Context, containerID string, name string, content string) error {
	// Create parent directory ~/.claude/skills/{name}/ if it doesn't exist
	skillDir := fmt.Sprintf("$HOME/.claude/skills/%s", name)
	if err := s.ensureDirectory(ctx, containerID, skillDir); err != nil {
		return fmt.Errorf("failed to create skill directory %s: %w", skillDir, err)
	}

	// Write content to ~/.claude/skills/{name}/SKILL.md
	skillPath := fmt.Sprintf("%s/SKILL.md", skillDir)
	return s.writeFile(ctx, containerID, skillPath, content)
}

// InjectSkillArchive injects a multi-file skill from a base64-encoded zip archive
// The zip file should contain the skill folder structure (SKILL.md + scripts/resources)
func (s *configInjectionServiceImpl) InjectSkillArchive(ctx context.Context, containerID string, name string, archiveData string) error {
	// Decode base64 data
	zipData, err := base64.StdEncoding.DecodeString(archiveData)
	if err != nil {
		return fmt.Errorf("failed to decode archive data: %w", err)
	}

	// Create the skills directory
	skillsDir := "$HOME/.claude/skills"
	if err := s.ensureDirectory(ctx, containerID, skillsDir); err != nil {
		return fmt.Errorf("failed to create skills directory: %w", err)
	}

	// Create target skill directory
	skillDir := fmt.Sprintf("%s/%s", skillsDir, name)
	if err := s.ensureDirectory(ctx, containerID, skillDir); err != nil {
		return fmt.Errorf("failed to create skill directory %s: %w", skillDir, err)
	}

	// Write zip file to a temporary location in container
	tempZipPath := fmt.Sprintf("/tmp/skill_%s.zip", name)
	if err := s.writeBinaryFile(ctx, containerID, tempZipPath, zipData); err != nil {
		return fmt.Errorf("failed to write zip file: %w", err)
	}

	// Extract zip to skill directory
	// Use unzip -o to overwrite existing files
	extractCmd := []string{"sh", "-c", fmt.Sprintf("cd %s && unzip -o %s && rm %s", skillDir, tempZipPath, tempZipPath)}
	_, err = s.dockerClient.ExecInContainer(ctx, containerID, extractCmd)
	if err != nil {
		return fmt.Errorf("failed to extract skill archive: %w", err)
	}

	log.Infof("Successfully injected skill archive '%s' to container %s", name, containerID)
	return nil
}

// InjectMCP injects MCP configurations into ~/.claude.json
// Multiple MCP configs are merged into a single file under the mcpServers field
func (s *configInjectionServiceImpl) InjectMCP(ctx context.Context, containerID string, configs []MCPServerConfig) error {
	if len(configs) == 0 {
		return nil
	}

	// Build the mcpServers map
	mcpServers := make(map[string]interface{})
	for _, cfg := range configs {
		serverConfig := map[string]interface{}{
			"command": cfg.Command,
			"args":    cfg.Args,
		}
		if len(cfg.Env) > 0 {
			serverConfig["env"] = cfg.Env
		}
		if cfg.Transport != "" {
			serverConfig["transport"] = cfg.Transport
		}
		if cfg.URL != "" {
			serverConfig["url"] = cfg.URL
		}
		mcpServers[cfg.Name] = serverConfig
	}

	// Build the full claude.json structure
	claudeJSON := map[string]interface{}{
		"mcpServers": mcpServers,
	}

	// Marshal to JSON with indentation for readability
	jsonContent, err := json.MarshalIndent(claudeJSON, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal MCP config: %w", err)
	}

	// Write to ~/.claude.json
	return s.writeFile(ctx, containerID, "$HOME/.claude.json", string(jsonContent))
}

// InjectCommand injects a command to ~/.claude/commands/{name}.md
func (s *configInjectionServiceImpl) InjectCommand(ctx context.Context, containerID string, name string, content string) error {
	// Create parent directory ~/.claude/commands/ if it doesn't exist
	if err := s.ensureDirectory(ctx, containerID, "$HOME/.claude/commands"); err != nil {
		return fmt.Errorf("failed to create ~/.claude/commands directory: %w", err)
	}

	// Write content to ~/.claude/commands/{name}.md
	commandPath := fmt.Sprintf("$HOME/.claude/commands/%s.md", name)
	return s.writeFile(ctx, containerID, commandPath, content)
}

// ensureDirectory creates a directory if it doesn't exist
func (s *configInjectionServiceImpl) ensureDirectory(ctx context.Context, containerID string, path string) error {
	// Use mkdir -p to create directory and all parent directories
	cmd := []string{"sh", "-c", fmt.Sprintf("mkdir -p %s", path)}
	_, err := s.dockerClient.ExecInContainer(ctx, containerID, cmd)
	if err != nil {
		return fmt.Errorf("failed to create directory %s: %w", path, err)
	}
	return nil
}

// writeFile writes content to a file in the container
func (s *configInjectionServiceImpl) writeFile(ctx context.Context, containerID string, path string, content string) error {
	// Use cat with heredoc to write content to file
	// This handles multi-line content and special characters properly
	cmd := []string{"sh", "-c", fmt.Sprintf("cat > %s << 'CONFIGEOF'\n%s\nCONFIGEOF", path, content)}
	_, err := s.dockerClient.ExecInContainer(ctx, containerID, cmd)
	if err != nil {
		return fmt.Errorf("failed to write file %s: %w", path, err)
	}
	return nil
}

// writeBinaryFile writes binary data to a file in the container using base64 encoding
func (s *configInjectionServiceImpl) writeBinaryFile(ctx context.Context, containerID string, path string, data []byte) error {
	// Encode binary data as base64
	b64Data := base64.StdEncoding.EncodeToString(data)

	// Use echo with base64 decode to write binary file
	// Split into chunks to avoid command line length limits
	const chunkSize = 65536 // 64KB chunks
	for i := 0; i < len(b64Data); i += chunkSize {
		end := i + chunkSize
		if end > len(b64Data) {
			end = len(b64Data)
		}
		chunk := b64Data[i:end]

		var cmd []string
		if i == 0 {
			// First chunk: create file
			cmd = []string{"sh", "-c", fmt.Sprintf("echo -n '%s' > %s.b64", chunk, path)}
		} else {
			// Subsequent chunks: append to file
			cmd = []string{"sh", "-c", fmt.Sprintf("echo -n '%s' >> %s.b64", chunk, path)}
		}

		_, err := s.dockerClient.ExecInContainer(ctx, containerID, cmd)
		if err != nil {
			return fmt.Errorf("failed to write chunk to %s: %w", path, err)
		}
	}

	// Decode base64 file to binary
	decodeCmd := []string{"sh", "-c", fmt.Sprintf("base64 -d %s.b64 > %s && rm %s.b64", path, path, path)}
	_, err := s.dockerClient.ExecInContainer(ctx, containerID, decodeCmd)
	if err != nil {
		return fmt.Errorf("failed to decode binary file %s: %w", path, err)
	}

	return nil
}
