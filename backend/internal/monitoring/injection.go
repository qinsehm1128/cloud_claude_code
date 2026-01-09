package monitoring

import (
	"context"
	"fmt"
	"regexp"
	"strings"
	"time"

	"cc-platform/internal/models"
)

// InjectionStrategy implements the command injection strategy.
type InjectionStrategy struct{}

// NewInjectionStrategy creates a new injection strategy.
func NewInjectionStrategy() *InjectionStrategy {
	return &InjectionStrategy{}
}

// Name returns the strategy identifier.
func (s *InjectionStrategy) Name() string {
	return models.StrategyInjection
}

// Execute injects a command into the PTY.
func (s *InjectionStrategy) Execute(ctx context.Context, session *MonitoringSession) (*StrategyResult, error) {
	if session.Config.InjectionCommand == "" {
		return &StrategyResult{
			Action:       "skip",
			Success:      false,
			ErrorMessage: "injection command not configured",
			Timestamp:    time.Now(),
		}, fmt.Errorf("injection command not configured")
	}

	// Expand placeholders
	command := s.expandPlaceholders(session.Config.InjectionCommand, session)

	// Remove trailing newlines - we'll send them separately
	command = strings.TrimRight(command, "\r\n")

	// Check context cancellation
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
	}

	// Write command text to PTY (without newline)
	err := session.WriteToPTY([]byte(command))
	if err != nil {
		return &StrategyResult{
			Action:       "inject",
			Command:      command,
			Success:      false,
			ErrorMessage: err.Error(),
			Timestamp:    time.Now(),
		}, err
	}

	// Small delay to let the terminal process the input before sending Enter
	time.Sleep(150 * time.Millisecond)

	// Now send the Enter key (use \r which is what xterm.js sends for Enter)
	err = session.WriteToPTY([]byte("\r"))
	if err != nil {
		return &StrategyResult{
			Action:       "inject",
			Command:      command,
			Success:      false,
			ErrorMessage: err.Error(),
			Timestamp:    time.Now(),
		}, err
	}

	return &StrategyResult{
		Action:    "inject",
		Command:   command,
		Success:   true,
		Timestamp: time.Now(),
	}, nil
}

// Validate checks if the injection configuration is valid.
// Validation is lenient - empty command is allowed (strategy will skip on execute).
func (s *InjectionStrategy) Validate(config *models.MonitoringConfig) error {
	// Allow empty command - strategy will skip on execute
	return nil
}

// expandPlaceholders replaces placeholder variables in the command.
// Supported placeholders:
// - {container_id}: Container ID
// - {session_id}: PTY session ID
// - {timestamp}: Current Unix timestamp
// - {silence_duration}: Silence duration in seconds
// - {docker_id}: Docker container ID
func (s *InjectionStrategy) expandPlaceholders(command string, session *MonitoringSession) string {
	// Use PTYSessionID instead of PTYSession.ID to avoid nil pointer
	sessionID := session.PTYSessionID
	if sessionID == "" {
		sessionID = fmt.Sprintf("container-%d", session.ContainerID)
	}

	replacements := map[string]string{
		"{container_id}":     fmt.Sprintf("%d", session.ContainerID),
		"{session_id}":       sessionID,
		"{timestamp}":        fmt.Sprintf("%d", time.Now().Unix()),
		"{silence_duration}": fmt.Sprintf("%d", int(session.GetSilenceDuration().Seconds())),
		"{docker_id}":        session.DockerID,
	}

	result := command
	for placeholder, value := range replacements {
		result = strings.ReplaceAll(result, placeholder, value)
	}

	return result
}

// NormalizeNewline ensures the command ends with exactly one newline.
func NormalizeNewline(command string) string {
	// Remove all trailing newlines and carriage returns
	command = strings.TrimRight(command, "\r\n")
	// Add exactly one newline
	return command + "\n"
}

// ExpandPlaceholders is the exported version for testing.
func ExpandPlaceholders(command string, containerID uint, sessionID string, dockerID string, silenceDuration int) string {
	replacements := map[string]string{
		"{container_id}":     fmt.Sprintf("%d", containerID),
		"{session_id}":       sessionID,
		"{timestamp}":        fmt.Sprintf("%d", time.Now().Unix()),
		"{silence_duration}": fmt.Sprintf("%d", silenceDuration),
		"{docker_id}":        dockerID,
	}

	result := command
	for placeholder, value := range replacements {
		result = strings.ReplaceAll(result, placeholder, value)
	}

	return result
}

// HasUnexpandedPlaceholders checks if a command still contains unexpanded placeholders.
func HasUnexpandedPlaceholders(command string) bool {
	// Match pattern like {word}
	pattern := regexp.MustCompile(`\{[a-z_]+\}`)
	return pattern.MatchString(command)
}

// GetSupportedPlaceholders returns a list of supported placeholder names.
func GetSupportedPlaceholders() []string {
	return []string{
		"{container_id}",
		"{session_id}",
		"{timestamp}",
		"{silence_duration}",
		"{docker_id}",
	}
}
