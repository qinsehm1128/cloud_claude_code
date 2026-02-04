package models

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"time"

	"gorm.io/gorm"
)

// ConfigType represents the type of Claude Code configuration
type ConfigType string

const (
	ConfigTypeClaudeMD ConfigType = "CLAUDE_MD"
	ConfigTypeSkill    ConfigType = "SKILL"
	ConfigTypeMCP      ConfigType = "MCP"
	ConfigTypeCommand  ConfigType = "COMMAND"
)

// ValidConfigTypes returns all valid ConfigType values
func ValidConfigTypes() []ConfigType {
	return []ConfigType{
		ConfigTypeClaudeMD,
		ConfigTypeSkill,
		ConfigTypeMCP,
		ConfigTypeCommand,
	}
}

// IsValid checks if the ConfigType is a valid value
func (ct ConfigType) IsValid() bool {
	switch ct {
	case ConfigTypeClaudeMD, ConfigTypeSkill, ConfigTypeMCP, ConfigTypeCommand:
		return true
	default:
		return false
	}
}

// ClaudeConfigTemplate represents a Claude Code configuration template stored in the database
type ClaudeConfigTemplate struct {
	gorm.Model
	Name        string     `gorm:"not null;uniqueIndex:idx_name_config_type" json:"name"`
	ConfigType  ConfigType `gorm:"not null;index;uniqueIndex:idx_name_config_type" json:"config_type"`
	Content     string     `gorm:"type:text;not null" json:"content"` // Markdown or JSON, includes all metadata
	Description string     `gorm:"type:text" json:"description,omitempty"`
}

// TableName specifies the table name for ClaudeConfigTemplate
func (ClaudeConfigTemplate) TableName() string {
	return "claude_config_templates"
}

// SkillMetadata represents skill-specific metadata parsed from Markdown frontmatter at runtime
// This is not stored separately in the database; it's extracted from the Content field
type SkillMetadata struct {
	AllowedTools           []string `json:"allowed_tools,omitempty"`
	DisableModelInvocation bool     `json:"disable_model_invocation,omitempty"`
}

// InjectionStatus represents the result of configuration injection into a container
// This is stored as JSON in the Container's InjectionStatus field
type InjectionStatus struct {
	ContainerID string           `json:"container_id"`
	Successful  []string         `json:"successful"`  // Template names that were successfully injected
	Failed      []FailedTemplate `json:"failed"`      // Templates that failed and why
	Warnings    []string         `json:"warnings"`    // General warnings during injection
	InjectedAt  time.Time        `json:"injected_at"`
}

// FailedTemplate represents a template that failed to inject with the reason
type FailedTemplate struct {
	TemplateName string `json:"template_name"`
	ConfigType   string `json:"config_type"`
	Reason       string `json:"reason"` // Human-readable error message
}

// Scan implements the sql.Scanner interface for InjectionStatus
// This allows GORM to read JSON data from the database into the struct
func (i *InjectionStatus) Scan(value interface{}) error {
	if value == nil {
		return nil
	}

	var bytes []byte
	switch v := value.(type) {
	case []byte:
		bytes = v
	case string:
		bytes = []byte(v)
	default:
		return fmt.Errorf("failed to scan InjectionStatus: unsupported type %T", value)
	}

	if len(bytes) == 0 {
		return nil
	}

	return json.Unmarshal(bytes, i)
}

// Value implements the driver.Valuer interface for InjectionStatus
// This allows GORM to write the struct as JSON to the database
func (i InjectionStatus) Value() (driver.Value, error) {
	if i.ContainerID == "" && len(i.Successful) == 0 && len(i.Failed) == 0 {
		return nil, nil
	}
	return json.Marshal(i)
}
