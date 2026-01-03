package models

import (
	"time"

	"gorm.io/gorm"
)

// User represents an admin user
type User struct {
	gorm.Model
	Username     string `gorm:"uniqueIndex;not null" json:"username"`
	PasswordHash string `gorm:"not null" json:"-"`
}

// Setting represents a key-value configuration setting
type Setting struct {
	gorm.Model
	Key         string `gorm:"uniqueIndex;not null" json:"key"`
	Value       string `gorm:"type:text" json:"value"` // Encrypted for sensitive data
	Description string `json:"description,omitempty"`
}

// Repository represents a cloned GitHub repository
type Repository struct {
	gorm.Model
	Name      string    `gorm:"not null" json:"name"`
	URL       string    `gorm:"not null" json:"url"`
	LocalPath string    `gorm:"not null" json:"local_path"`
	Size      int64     `json:"size"`
	ClonedAt  time.Time `json:"cloned_at"`
}

// Container represents a Docker container instance
type Container struct {
	gorm.Model
	DockerID     string     `gorm:"uniqueIndex" json:"docker_id"`
	Name         string     `gorm:"not null" json:"name"`
	Status       string     `json:"status"` // created, running, stopped, deleted
	RepositoryID uint       `json:"repository_id"`
	Repository   Repository `gorm:"foreignKey:RepositoryID" json:"repository,omitempty"`
	StartedAt    *time.Time `json:"started_at,omitempty"`
	StoppedAt    *time.Time `json:"stopped_at,omitempty"`
}

// ClaudeConfig represents Claude Code configuration
type ClaudeConfig struct {
	gorm.Model
	APIKey         string `gorm:"type:text" json:"-"`      // Encrypted
	APIURL         string `json:"api_url,omitempty"`
	CustomEnvVars  string `gorm:"type:text" json:"custom_env_vars,omitempty"` // JSON format
	StartupCommand string `json:"startup_command,omitempty"`
}

// ContainerStatus constants
const (
	ContainerStatusCreated = "created"
	ContainerStatusRunning = "running"
	ContainerStatusStopped = "stopped"
	ContainerStatusDeleted = "deleted"
)
