package services

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"cc-platform/internal/models"

	"gopkg.in/yaml.v3"
	"gorm.io/gorm"
)

var (
	// ErrTemplateNotFound is returned when a template is not found
	ErrTemplateNotFound = errors.New("template not found")
	// ErrDuplicateTemplateName is returned when a template with the same name and type already exists
	ErrDuplicateTemplateName = errors.New("template with this name already exists for this config type")
	// ErrInvalidConfigType is returned when an invalid config type is provided
	ErrInvalidConfigType = errors.New("invalid config_type, must be one of: CLAUDE_MD, SKILL, MCP, COMMAND")
)

// ConfigTemplateService defines the interface for managing Claude config templates
type ConfigTemplateService interface {
	// CRUD operations
	Create(input CreateConfigTemplateInput) (*models.ClaudeConfigTemplate, error)
	GetByID(id uint) (*models.ClaudeConfigTemplate, error)
	List(configType *models.ConfigType) ([]models.ClaudeConfigTemplate, error)
	Update(id uint, input UpdateConfigTemplateInput) (*models.ClaudeConfigTemplate, error)
	Delete(id uint) error

	// Validation
	ValidateContent(configType models.ConfigType, content string) error
	ParseSkillMetadata(content string) (*models.SkillMetadata, error)
	ValidateMCPConfig(content string) error
}

// CreateConfigTemplateInput represents the input for creating a config template
type CreateConfigTemplateInput struct {
	Name        string            `json:"name" binding:"required"`
	ConfigType  models.ConfigType `json:"config_type" binding:"required"`
	Content     string            `json:"content" binding:"required"`
	Description string            `json:"description"`
}

// UpdateConfigTemplateInput represents the input for updating a config template
type UpdateConfigTemplateInput struct {
	Name        *string `json:"name,omitempty"`
	Content     *string `json:"content,omitempty"`
	Description *string `json:"description,omitempty"`
}

// configTemplateServiceImpl is the implementation of ConfigTemplateService
type configTemplateServiceImpl struct {
	db *gorm.DB
}

// NewConfigTemplateService creates a new ConfigTemplateService
func NewConfigTemplateService(db *gorm.DB) ConfigTemplateService {
	return &configTemplateServiceImpl{
		db: db,
	}
}

// Create creates a new config template
func (s *configTemplateServiceImpl) Create(input CreateConfigTemplateInput) (*models.ClaudeConfigTemplate, error) {
	// Validate config type
	if !input.ConfigType.IsValid() {
		return nil, ErrInvalidConfigType
	}

	// Validate content based on config type
	if err := s.ValidateContent(input.ConfigType, input.Content); err != nil {
		return nil, err
	}

	// Create the template
	template := &models.ClaudeConfigTemplate{
		Name:        input.Name,
		ConfigType:  input.ConfigType,
		Content:     input.Content,
		Description: input.Description,
	}

	// Attempt to create - the unique constraint will catch duplicates
	if err := s.db.Create(template).Error; err != nil {
		// Check if it's a unique constraint violation
		if isDuplicateKeyError(err) {
			return nil, fmt.Errorf("%w: '%s' for type '%s'", ErrDuplicateTemplateName, input.Name, input.ConfigType)
		}
		return nil, err
	}

	return template, nil
}

// GetByID retrieves a config template by ID
func (s *configTemplateServiceImpl) GetByID(id uint) (*models.ClaudeConfigTemplate, error) {
	var template models.ClaudeConfigTemplate
	if err := s.db.First(&template, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrTemplateNotFound
		}
		return nil, err
	}
	return &template, nil
}

// List retrieves all config templates, optionally filtered by config type
func (s *configTemplateServiceImpl) List(configType *models.ConfigType) ([]models.ClaudeConfigTemplate, error) {
	var templates []models.ClaudeConfigTemplate
	query := s.db.Order("created_at DESC")

	if configType != nil {
		// Validate the filter config type
		if !configType.IsValid() {
			return nil, ErrInvalidConfigType
		}
		query = query.Where("config_type = ?", *configType)
	}

	if err := query.Find(&templates).Error; err != nil {
		return nil, err
	}

	return templates, nil
}

// Update updates an existing config template
func (s *configTemplateServiceImpl) Update(id uint, input UpdateConfigTemplateInput) (*models.ClaudeConfigTemplate, error) {
	// First, get the existing template
	template, err := s.GetByID(id)
	if err != nil {
		return nil, err
	}

	// Build updates map
	updates := make(map[string]interface{})

	if input.Name != nil {
		updates["name"] = *input.Name
	}

	if input.Content != nil {
		// Validate content if being updated
		if err := s.ValidateContent(template.ConfigType, *input.Content); err != nil {
			return nil, err
		}
		updates["content"] = *input.Content
	}

	if input.Description != nil {
		updates["description"] = *input.Description
	}

	// If no updates, return the existing template
	if len(updates) == 0 {
		return template, nil
	}

	// Apply updates
	if err := s.db.Model(template).Updates(updates).Error; err != nil {
		// Check if it's a unique constraint violation (name change conflict)
		if isDuplicateKeyError(err) {
			return nil, fmt.Errorf("%w: '%s' for type '%s'", ErrDuplicateTemplateName, *input.Name, template.ConfigType)
		}
		return nil, err
	}

	// Reload the template to get updated values
	return s.GetByID(id)
}

// Delete deletes a config template by ID
func (s *configTemplateServiceImpl) Delete(id uint) error {
	// First check if the template exists
	if _, err := s.GetByID(id); err != nil {
		return err
	}

	// Delete the template (soft delete due to gorm.Model)
	if err := s.db.Delete(&models.ClaudeConfigTemplate{}, id).Error; err != nil {
		return err
	}

	return nil
}

// ValidateContent validates the content based on config type
func (s *configTemplateServiceImpl) ValidateContent(configType models.ConfigType, content string) error {
	if content == "" {
		return errors.New("content cannot be empty")
	}

	switch configType {
	case models.ConfigTypeMCP:
		return s.ValidateMCPConfig(content)
	case models.ConfigTypeSkill:
		// Skill content is Markdown with optional YAML frontmatter
		// Validate that if frontmatter exists, it's valid YAML
		_, err := s.ParseSkillMetadata(content)
		return err
	case models.ConfigTypeClaudeMD:
		// CLAUDE.MD is Markdown, basic validation (non-empty content is sufficient)
		return nil
	case models.ConfigTypeCommand:
		// Command is Markdown, basic validation (non-empty content is sufficient)
		return nil
	default:
		return ErrInvalidConfigType
	}
}

// ParseSkillMetadata parses skill metadata from Markdown frontmatter
// Frontmatter is YAML content between --- delimiters at the start of the file
func (s *configTemplateServiceImpl) ParseSkillMetadata(content string) (*models.SkillMetadata, error) {
	metadata := &models.SkillMetadata{}

	// Trim leading whitespace
	content = strings.TrimLeft(content, " \t")

	// Check if content starts with frontmatter delimiter
	if !strings.HasPrefix(content, "---") {
		// No frontmatter, return empty metadata (this is valid)
		return metadata, nil
	}

	// Find the end of frontmatter
	// Skip the first "---" and find the closing "---"
	rest := content[3:] // Skip the opening "---"

	// Handle case where there's a newline after opening ---
	rest = strings.TrimLeft(rest, " \t")
	if len(rest) > 0 && rest[0] == '\n' {
		rest = rest[1:]
	} else if len(rest) > 1 && rest[0] == '\r' && rest[1] == '\n' {
		rest = rest[2:]
	}

	// Find the closing ---
	endIndex := strings.Index(rest, "\n---")
	if endIndex == -1 {
		// Try with \r\n
		endIndex = strings.Index(rest, "\r\n---")
		if endIndex == -1 {
			// Check if the entire remaining content is the frontmatter (no closing delimiter)
			// This is invalid frontmatter
			return nil, errors.New("invalid frontmatter: missing closing delimiter '---'")
		}
	}

	// Extract the YAML content
	yamlContent := rest[:endIndex]

	// If YAML content is empty, return empty metadata
	if strings.TrimSpace(yamlContent) == "" {
		return metadata, nil
	}

	// Parse the YAML frontmatter
	// We use a flexible struct to handle the frontmatter fields
	type frontmatter struct {
		AllowedTools           []string `yaml:"allowed_tools"`
		DisableModelInvocation bool     `yaml:"disable_model_invocation"`
	}

	var fm frontmatter
	if err := yaml.Unmarshal([]byte(yamlContent), &fm); err != nil {
		return nil, fmt.Errorf("invalid frontmatter YAML: %w", err)
	}

	metadata.AllowedTools = fm.AllowedTools
	metadata.DisableModelInvocation = fm.DisableModelInvocation

	return metadata, nil
}

// ValidateMCPConfig validates MCP configuration JSON
// MCP config must be valid JSON with required fields: "command" (string) and "args" (array)
func (s *configTemplateServiceImpl) ValidateMCPConfig(content string) error {
	// First, check if it's valid JSON
	var config map[string]interface{}
	if err := json.Unmarshal([]byte(content), &config); err != nil {
		return fmt.Errorf("invalid MCP configuration: invalid JSON: %w", err)
	}

	// Check for required "command" field
	commandVal, hasCommand := config["command"]
	if !hasCommand {
		return errors.New("invalid MCP configuration: missing required field 'command'")
	}

	// Verify "command" is a string
	if _, ok := commandVal.(string); !ok {
		return errors.New("invalid MCP configuration: 'command' must be a string")
	}

	// Check for required "args" field
	argsVal, hasArgs := config["args"]
	if !hasArgs {
		return errors.New("invalid MCP configuration: missing required field 'args'")
	}

	// Verify "args" is an array
	if _, ok := argsVal.([]interface{}); !ok {
		return errors.New("invalid MCP configuration: 'args' must be an array")
	}

	return nil
}

// isDuplicateKeyError checks if the error is a duplicate key/unique constraint violation
func isDuplicateKeyError(err error) bool {
	if err == nil {
		return false
	}
	errStr := err.Error()
	// SQLite unique constraint error
	return contains(errStr, "UNIQUE constraint failed") ||
		contains(errStr, "duplicate key") ||
		contains(errStr, "Duplicate entry")
}

// contains checks if a string contains a substring (case-insensitive)
func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsSubstring(s, substr))
}

func containsSubstring(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
