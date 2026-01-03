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
	DockerID      string     `gorm:"uniqueIndex" json:"docker_id"`
	Name          string     `gorm:"not null" json:"name"`
	Status        string     `json:"status"`      // created, running, stopped, deleted
	InitStatus    string     `json:"init_status"` // pending, cloning, initializing, ready, failed
	InitMessage   string     `json:"init_message,omitempty"`
	GitRepoURL    string     `json:"git_repo_url,omitempty"`  // GitHub repo URL to clone
	GitRepoName   string     `json:"git_repo_name,omitempty"` // GitHub repo name
	WorkDir       string     `json:"work_dir,omitempty"`      // Working directory inside container
	StartedAt     *time.Time `json:"started_at,omitempty"`
	StoppedAt     *time.Time `json:"stopped_at,omitempty"`
	InitializedAt *time.Time `json:"initialized_at,omitempty"`
}

// ClaudeConfig represents Claude Code configuration
type ClaudeConfig struct {
	gorm.Model
	CustomEnvVars  string `gorm:"type:text" json:"custom_env_vars,omitempty"` // Multi-line VAR=value format
	StartupCommand string `json:"startup_command,omitempty"`
}

// ContainerStatus constants
const (
	ContainerStatusCreated = "created"
	ContainerStatusRunning = "running"
	ContainerStatusStopped = "stopped"
	ContainerStatusDeleted = "deleted"
)

// ContainerInitStatus constants
const (
	InitStatusPending      = "pending"
	InitStatusCloning      = "cloning"
	InitStatusInitializing = "initializing"
	InitStatusReady        = "ready"
	InitStatusFailed       = "failed"
)

// ContainerLog represents a log entry for container operations
type ContainerLog struct {
	gorm.Model
	ContainerID uint   `gorm:"index" json:"container_id"`
	Level       string `json:"level"` // info, warn, error
	Stage       string `json:"stage"` // startup, clone, init, ready
	Message     string `gorm:"type:text" json:"message"`
}

// LogLevel constants
const (
	LogLevelInfo  = "info"
	LogLevelWarn  = "warn"
	LogLevelError = "error"
)

// LogStage constants
const (
	LogStageStartup = "startup"
	LogStageClone   = "clone"
	LogStageInit    = "init"
	LogStageReady   = "ready"
)
