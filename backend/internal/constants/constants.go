package constants

import "time"

// ===========================================
// Port Ranges
// ===========================================

const (
	// CodeServerPortStart is the starting port for code-server host mapping
	CodeServerPortStart = 18443
	// CodeServerPortEnd is the ending port for code-server host mapping
	CodeServerPortEnd = 18543
	// CodeServerInternalPort is the fixed port code-server listens on inside the container
	CodeServerInternalPort = 8443
)

// ===========================================
// Timeouts
// ===========================================

const (
	// ContainerInitTimeout is the maximum time for container initialization
	ContainerInitTimeout = 30 * time.Minute
	// ContainerStopTimeout is the timeout for stopping a container
	ContainerStopTimeout = 60 * time.Second
	// ContainerDeleteTimeout is the timeout for deleting a container
	ContainerDeleteTimeout = 60 * time.Second
	// CodeServerStartTimeout is the timeout for starting code-server
	CodeServerStartTimeout = 30 * time.Second
	// CodeServerStartDelay is the delay before starting code-server after container start
	CodeServerStartDelay = 2 * time.Second
)

// ===========================================
// WebSocket Settings
// ===========================================

const (
	// WebSocketPingInterval is the interval between ping messages
	WebSocketPingInterval = 54 * time.Second
	// WebSocketPongTimeout is the timeout for pong response
	WebSocketPongTimeout = 60 * time.Second
	// WebSocketWriteTimeout is the timeout for write operations
	WebSocketWriteTimeout = 10 * time.Second
)

// ===========================================
// Terminal History
// ===========================================

const (
	// HistoryBufferSize is the size of the history buffer
	HistoryBufferSize = 64 * 1024
	// HistoryFlushThreshold is the threshold for flushing history to database
	HistoryFlushThreshold = 32 * 1024
	// HistoryChunkDelay is the delay between sending history chunks
	HistoryChunkDelay = 10 * time.Millisecond
	// SessionIdleTimeout is the timeout for idle sessions
	SessionIdleTimeout = 30 * time.Minute
)

// ===========================================
// Resource Limits
// ===========================================

const (
	// DefaultMemoryLimitMB is the default memory limit in MB
	DefaultMemoryLimitMB = 2048
	// DefaultCPULimit is the default CPU limit in cores
	DefaultCPULimit = 1.0
	// MaxMemoryLimitMB is the maximum memory limit in MB (128GB)
	MaxMemoryLimitMB = 128 * 1024
	// MaxCPULimit is the maximum CPU limit in cores
	MaxCPULimit = 64
)

// ===========================================
// Cleanup Intervals
// ===========================================

const (
	// PortCleanupInterval is the interval for cleaning up orphaned ports
	PortCleanupInterval = 5 * time.Minute
)

// ===========================================
// Container Name Validation
// ===========================================

const (
	// ContainerNameMinLength is the minimum length for container names
	ContainerNameMinLength = 1
	// ContainerNameMaxLength is the maximum length for container names
	ContainerNameMaxLength = 63
)
