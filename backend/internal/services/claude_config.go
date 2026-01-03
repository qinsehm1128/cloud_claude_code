package services

import (
	"errors"
	"regexp"
	"strings"

	"cc-platform/internal/config"
	"cc-platform/internal/models"

	"gorm.io/gorm"
)

var (
	ErrInvalidEnvVarFormat = errors.New("invalid environment variable format")
)

// EnvVar pattern: VAR_NAME=value where VAR_NAME matches [A-Z_][A-Z0-9_]*
var envVarNamePattern = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)

// ClaudeConfigService handles Claude Code configuration
type ClaudeConfigService struct {
	db     *gorm.DB
	config *config.Config
}

// NewClaudeConfigService creates a new ClaudeConfigService
func NewClaudeConfigService(db *gorm.DB, cfg *config.Config) *ClaudeConfigService {
	return &ClaudeConfigService{
		db:     db,
		config: cfg,
	}
}

// ClaudeConfigInput represents the input for saving Claude configuration
type ClaudeConfigInput struct {
	CustomEnvVars  string `json:"custom_env_vars"`  // Multi-line VAR=value format
	StartupCommand string `json:"startup_command"`
}

// ClaudeConfigOutput represents the output for getting Claude configuration
type ClaudeConfigOutput struct {
	CustomEnvVars  string `json:"custom_env_vars"`
	StartupCommand string `json:"startup_command"`
}

// DefaultStartupCommand is the default command to start Claude Code
const DefaultStartupCommand = "claude --dangerously-skip-permissions"

// SaveConfig saves Claude Code configuration
func (s *ClaudeConfigService) SaveConfig(input ClaudeConfigInput) error {
	// Validate custom env vars if provided
	if input.CustomEnvVars != "" {
		if _, err := s.ParseEnvVars(input.CustomEnvVars); err != nil {
			return err
		}
	}

	// Get existing config or create new
	var cfg models.ClaudeConfig
	result := s.db.First(&cfg)
	
	if result.Error == gorm.ErrRecordNotFound {
		// Create new config
		cfg = models.ClaudeConfig{
			CustomEnvVars:  input.CustomEnvVars,
			StartupCommand: input.StartupCommand,
		}
		return s.db.Create(&cfg).Error
	} else if result.Error != nil {
		return result.Error
	}

	// Update existing config
	return s.db.Model(&cfg).Updates(map[string]interface{}{
		"custom_env_vars": input.CustomEnvVars,
		"startup_command": input.StartupCommand,
	}).Error
}

// GetConfig retrieves Claude Code configuration
func (s *ClaudeConfigService) GetConfig() (*ClaudeConfigOutput, error) {
	var cfg models.ClaudeConfig
	result := s.db.First(&cfg)
	
	if result.Error == gorm.ErrRecordNotFound {
		// Return default config
		return &ClaudeConfigOutput{
			CustomEnvVars:  "",
			StartupCommand: DefaultStartupCommand,
		}, nil
	} else if result.Error != nil {
		return nil, result.Error
	}

	return &ClaudeConfigOutput{
		CustomEnvVars:  cfg.CustomEnvVars,
		StartupCommand: cfg.StartupCommand,
	}, nil
}

// HasEnvVars checks if environment variables are configured
func (s *ClaudeConfigService) HasEnvVars() bool {
	var cfg models.ClaudeConfig
	err := s.db.First(&cfg).Error
	return err == nil && cfg.CustomEnvVars != ""
}

// ParseEnvVars parses and validates environment variables from multi-line string
// Format: VAR_NAME=value (one per line)
func (s *ClaudeConfigService) ParseEnvVars(envVarsStr string) (map[string]string, error) {
	result := make(map[string]string)
	
	if envVarsStr == "" {
		return result, nil
	}

	lines := strings.Split(envVarsStr, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue // Skip empty lines and comments
		}

		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			return nil, ErrInvalidEnvVarFormat
		}

		varName := strings.TrimSpace(parts[0])
		varValue := strings.TrimSpace(parts[1])

		if !envVarNamePattern.MatchString(varName) {
			return nil, ErrInvalidEnvVarFormat
		}

		result[varName] = varValue
	}

	return result, nil
}

// GetContainerEnvVars returns all environment variables for container creation
func (s *ClaudeConfigService) GetContainerEnvVars() (map[string]string, error) {
	envVars := make(map[string]string)

	var cfg models.ClaudeConfig
	if err := s.db.First(&cfg).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return envVars, nil // Return empty if no config
		}
		return nil, err
	}

	// Parse and add custom env vars
	if cfg.CustomEnvVars != "" {
		customVars, err := s.ParseEnvVars(cfg.CustomEnvVars)
		if err != nil {
			return nil, err
		}
		for k, v := range customVars {
			envVars[k] = v
		}
	}

	return envVars, nil
}

// GetStartupCommand returns the startup command for Claude Code
func (s *ClaudeConfigService) GetStartupCommand() string {
	var cfg models.ClaudeConfig
	if err := s.db.First(&cfg).Error; err != nil {
		return DefaultStartupCommand
	}

	if cfg.StartupCommand == "" {
		return DefaultStartupCommand
	}

	return cfg.StartupCommand
}

// ValidateEnvVarFormat validates a single environment variable line
func ValidateEnvVarFormat(line string) bool {
	line = strings.TrimSpace(line)
	if line == "" || strings.HasPrefix(line, "#") {
		return true // Empty lines and comments are valid
	}

	parts := strings.SplitN(line, "=", 2)
	if len(parts) != 2 {
		return false
	}

	varName := strings.TrimSpace(parts[0])
	return envVarNamePattern.MatchString(varName)
}
