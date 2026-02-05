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
	WorkDir        string     `json:"work_dir,omitempty" gorm:"default:/app"` // Working directory inside container, default: /app
	SkipClaudeInit bool       `json:"skip_claude_init"`        // Skip Claude Code initialization
	// Claude Config Management fields
	SkipGitRepo     bool             `json:"skip_git_repo"`                                        // Allow creating container without GitHub repository
	EnableYoloMode  bool             `json:"enable_yolo_mode"`                                     // Enable YOLO mode (--dangerously-skip-permissions)
	RunAsRoot       bool             `json:"run_as_root"`                                          // Run container as root user (default: false, runs as dev user)
	InjectionStatus *InjectionStatus `gorm:"type:text" json:"injection_status,omitempty"`         // JSON serialized config injection status
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
	// code-server configuration
	EnableCodeServer   bool   `json:"enable_code_server"`          // Enable code-server (Web VS Code)
	CodeServerPort     int    `json:"code_server_port"`            // code-server port (host port for direct access, or internal port 8443)
	CodeServerDomain   string `json:"code_server_domain,omitempty"` // code-server subdomain (e.g., "mycontainer.code.example.com")
	// Configuration profile references (nil = use default)
	GitHubTokenID           *uint `json:"github_token_id,omitempty"`
	EnvVarsProfileID        *uint `json:"env_vars_profile_id,omitempty"`
	StartupCommandProfileID *uint `json:"startup_command_profile_id,omitempty"`
	StartedAt      *time.Time `json:"started_at,omitempty"`
	StoppedAt      *time.Time `json:"stopped_at,omitempty"`
	InitializedAt  *time.Time `json:"initialized_at,omitempty"`
}

// ClaudeConfig represents Claude Code configuration (legacy - kept for migration)
type ClaudeConfig struct {
	gorm.Model
	CustomEnvVars  string `gorm:"type:text" json:"custom_env_vars,omitempty"` // Multi-line VAR=value format
	StartupCommand string `json:"startup_command,omitempty"`
}

// ==================== Multi-Configuration Profile Models ====================

// GitHubToken represents a GitHub personal access token with metadata
type GitHubToken struct {
	gorm.Model
	Nickname  string `gorm:"not null" json:"nickname"`
	Remark    string `gorm:"type:text" json:"remark,omitempty"`
	Token     string `gorm:"type:text;not null" json:"-"` // Encrypted, not exposed in JSON
	IsDefault bool   `gorm:"default:false" json:"is_default"`
}

// EnvVarsProfile represents a group of environment variables
type EnvVarsProfile struct {
	gorm.Model
	Name            string `gorm:"not null" json:"name"`
	Description     string `gorm:"type:text" json:"description,omitempty"`
	EnvVars         string `gorm:"type:text" json:"env_vars"`           // Multi-line VAR=value format
	ApiUrlVarName   string `json:"api_url_var_name,omitempty"`          // Variable name for API URL (e.g., ANTHROPIC_BASE_URL)
	ApiTokenVarName string `json:"api_token_var_name,omitempty"`        // Variable name for API Token (e.g., ANTHROPIC_API_KEY)
	IsDefault       bool   `gorm:"default:false" json:"is_default"`
}

// StartupCommandProfile represents a Claude startup command configuration
type StartupCommandProfile struct {
	gorm.Model
	Name        string `gorm:"not null" json:"name"`
	Description string `gorm:"type:text" json:"description,omitempty"`
	Command     string `gorm:"type:text;not null" json:"command"`
	IsDefault   bool   `gorm:"default:false" json:"is_default"`
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

// ContainerPort represents an exposed port for a container
type ContainerPort struct {
	gorm.Model
	ContainerID uint   `gorm:"index" json:"container_id"`
	Port        int    `json:"port"`                       // Container internal port
	Name        string `json:"name"`                       // Service name (e.g., "App", "VS Code")
	Protocol    string `json:"protocol" gorm:"default:http"` // http/https/tcp
	AutoCreated bool   `json:"auto_created"`               // Auto-created by system (e.g., code-server)
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

// ==================== PTY Automation Monitoring Models ====================

// MonitoringConfig represents automation monitoring configuration for a container
type MonitoringConfig struct {
	gorm.Model
	ContainerID      uint    `gorm:"index" json:"container_id"`
	Enabled          bool    `gorm:"default:false" json:"enabled"`
	SilenceThreshold int     `gorm:"default:30" json:"silence_threshold"` // Seconds (5-300)
	ActiveStrategy   string  `gorm:"default:'webhook'" json:"active_strategy"` // webhook, injection, queue, ai

	// Webhook configuration
	WebhookURL     string `gorm:"type:text" json:"webhook_url,omitempty"`
	WebhookHeaders string `gorm:"type:text" json:"webhook_headers,omitempty"` // JSON format

	// Injection configuration
	InjectionCommand string `gorm:"type:text" json:"injection_command,omitempty"`

	// Queue configuration
	UserPromptTemplate string `gorm:"type:text" json:"user_prompt_template,omitempty"`

	// AI configuration
	AIEndpoint      string  `gorm:"type:text" json:"ai_endpoint,omitempty"`
	AIAPIKey        string  `gorm:"type:text" json:"ai_api_key,omitempty"` // Encrypted
	AIModel         string  `gorm:"default:'gpt-4'" json:"ai_model,omitempty"`
	AISystemPrompt  string  `gorm:"type:text" json:"ai_system_prompt,omitempty"`
	AITemperature   float64 `gorm:"default:0.7" json:"ai_temperature"`
	AITimeout       int     `gorm:"default:30" json:"ai_timeout"` // Seconds
	AIDefaultAction string  `gorm:"default:'skip'" json:"ai_default_action,omitempty"` // skip, inject, notify

	// Context buffer configuration
	ContextBufferSize int `gorm:"default:8192" json:"context_buffer_size"` // Bytes
}

// Task represents a task in the automation queue
type Task struct {
	gorm.Model
	ContainerID uint       `gorm:"index" json:"container_id"`
	OrderIndex  int        `gorm:"index" json:"order_index"`
	Text        string     `gorm:"type:text;not null" json:"text"`
	Status      TaskStatus `gorm:"default:'pending'" json:"status"`
	StartedAt   *time.Time `json:"started_at,omitempty"`
	CompletedAt *time.Time `json:"completed_at,omitempty"`
}

// TaskStatus represents the status of a task
type TaskStatus string

const (
	TaskStatusPending    TaskStatus = "pending"
	TaskStatusInProgress TaskStatus = "in_progress"
	TaskStatusRunning    TaskStatus = "running" // Alias for in_progress
	TaskStatusCompleted  TaskStatus = "completed"
	TaskStatusSkipped    TaskStatus = "skipped"
	TaskStatusFailed     TaskStatus = "failed"
)

// AutomationLog represents a log entry for automation operations
type AutomationLog struct {
	gorm.Model
	ContainerID    uint   `gorm:"index" json:"container_id"`
	SessionID      string `gorm:"index" json:"session_id"`
	StrategyType   string `json:"strategy_type"` // webhook, injection, queue, ai
	ActionTaken    string `json:"action_taken"`  // inject, skip, notify, complete, webhook_sent
	Command        string `gorm:"type:text" json:"command,omitempty"`
	ContextSnippet string `gorm:"type:text" json:"context_snippet,omitempty"`
	AIResponse     string `gorm:"type:text" json:"ai_response,omitempty"` // JSON format
	Result         string `json:"result"`                                  // success, failed, skipped
	ErrorMessage   string `gorm:"type:text" json:"error_message,omitempty"`
}

// GlobalAutomationConfig represents global automation settings
type GlobalAutomationConfig struct {
	gorm.Model
	Key   string `gorm:"uniqueIndex;not null" json:"key"`
	Value string `gorm:"type:text" json:"value"`
}

// Strategy type constants
const (
	StrategyWebhook   = "webhook"
	StrategyInjection = "injection"
	StrategyQueue     = "queue"
	StrategyAI        = "ai"
)

// AI action constants
const (
	AIActionInject   = "inject"
	AIActionSkip     = "skip"
	AIActionNotify   = "notify"
	AIActionComplete = "complete"
)

// Automation log result constants
const (
	AutomationResultSuccess = "success"
	AutomationResultFailed  = "failed"
	AutomationResultSkipped = "skipped"
)
