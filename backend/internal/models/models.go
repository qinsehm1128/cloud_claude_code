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
	DockerID       string     `gorm:"uniqueIndex" json:"docker_id"`
	Name           string     `gorm:"not null" json:"name"`
	Status         string     `json:"status"`      // created, running, stopped, deleted
	InitStatus     string     `json:"init_status"` // pending, cloning, initializing, ready, failed
	InitMessage    string     `json:"init_message,omitempty"`
	GitRepoURL     string     `json:"git_repo_url,omitempty"`  // GitHub repo URL to clone
	GitRepoName    string     `json:"git_repo_name,omitempty"` // GitHub repo name
	WorkDir        string     `json:"work_dir,omitempty"`      // Working directory inside container
	SkipClaudeInit bool       `json:"skip_claude_init"`        // Skip Claude Code initialization
	// Resource configuration
	MemoryLimit    int64      `json:"memory_limit,omitempty"`    // Memory limit in bytes (0 = default 2GB)
	CPULimit       float64    `json:"cpu_limit,omitempty"`       // CPU limit (0 = default 1 core)
	// Port mapping (legacy direct port binding)
	ExposedPorts   string     `json:"exposed_ports,omitempty"`   // JSON array of port mappings
	// Traefik proxy configuration
	ProxyEnabled   bool       `json:"proxy_enabled"`             // Enable Traefik proxy
	ProxyDomain    string     `json:"proxy_domain,omitempty"`    // Subdomain for domain-based access (e.g., "myapp" -> myapp.containers.domain.com)
	ProxyPort      int        `json:"proxy_port,omitempty"`      // Direct port access (e.g., 9001)
	ServicePort    int        `json:"service_port,omitempty"`    // Container internal service port (e.g., 3000)
	StartedAt      *time.Time `json:"started_at,omitempty"`
	StoppedAt      *time.Time `json:"stopped_at,omitempty"`
	InitializedAt  *time.Time `json:"initialized_at,omitempty"`
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

// TerminalSession represents a persistent terminal session
type TerminalSession struct {
	gorm.Model
	SessionID   string `gorm:"uniqueIndex;not null" json:"session_id"`
	ContainerID uint   `gorm:"index" json:"container_id"`
	DockerID    string `json:"docker_id"`
	ExecID      string `json:"exec_id"`
	Width       uint   `json:"width"`
	Height      uint   `json:"height"`
	Active      bool   `gorm:"default:true" json:"active"`
	LastActive  time.Time `json:"last_active"`
}

// TerminalHistory stores terminal output history in chunks
type TerminalHistory struct {
	gorm.Model
	SessionID  string `gorm:"index;not null" json:"session_id"`
	ChunkIndex int    `gorm:"index" json:"chunk_index"` // Order of chunks
	Data       []byte `gorm:"type:blob" json:"-"`       // Compressed data
	DataSize   int    `json:"data_size"`                // Original size before compression
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
