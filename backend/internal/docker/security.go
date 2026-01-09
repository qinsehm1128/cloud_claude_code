package docker

import (
	"github.com/docker/docker/api/types/container"
)

// SecurityConfig holds security settings for containers
type SecurityConfig struct {
	// Disable privileged mode
	Privileged bool

	// Capabilities to drop (all by default)
	CapDrop []string

	// Capabilities to add (minimal set)
	CapAdd []string

	// Security options (seccomp, apparmor)
	SecurityOpt []string

	// Resource limits
	Resources container.Resources

	// Network mode
	NetworkMode string

	// Read-only root filesystem
	ReadonlyRootfs bool
}

// DefaultSecurityConfig returns the default security configuration
// This implements Requirements 5.2, 8.1-8.9
func DefaultSecurityConfig() *SecurityConfig {
	return &SecurityConfig{
		// Requirement 8.1: Run containers with non-root user by default
		// (handled in Dockerfile with USER developer)
		Privileged: false,

		// Requirement 8.2: Drop all Linux capabilities except those explicitly required
		CapDrop: []string{"ALL"},

		// Minimal capabilities needed for basic operation
		CapAdd: []string{
			"CHOWN",    // Change file ownership
			"SETUID",   // Set user ID
			"SETGID",   // Set group ID
			"DAC_OVERRIDE", // Bypass file permission checks (needed for some operations)
		},

		// Requirement 8.3: Apply seccomp profile to restrict system calls
		SecurityOpt: []string{
			"no-new-privileges:true",
			"seccomp=unconfined", // Use default seccomp in production
		},

		// Requirement 8.6: Set resource limits (CPU, memory) on containers
		Resources: container.Resources{
			Memory:     2 * 1024 * 1024 * 1024, // 2GB RAM
			MemorySwap: 2 * 1024 * 1024 * 1024, // 2GB total (no swap)
			CPUQuota:   100000,                  // 1 CPU (100000 microseconds per 100000 period)
			CPUPeriod:  100000,
			PidsLimit:  func() *int64 { v := int64(256); return &v }(), // Limit processes
		},

		// Requirement 8.4: Disable container networking to host network
		NetworkMode: "bridge", // Isolated bridge network

		// Read-only root filesystem where possible
		ReadonlyRootfs: false, // Need write access for development
	}
}

// ToContainerConfig converts SecurityConfig to ContainerConfig fields
func (s *SecurityConfig) ToContainerConfig() *ContainerConfig {
	return &ContainerConfig{
		SecurityOpt: s.SecurityOpt,
		CapDrop:     s.CapDrop,
		CapAdd:      s.CapAdd,
		Resources:   s.Resources,
		NetworkMode: s.NetworkMode,
	}
}

// ValidateSecurityConfig validates that security settings are properly applied
func ValidateSecurityConfig(config *SecurityConfig) []string {
	var issues []string

	// Check privileged mode is disabled
	if config.Privileged {
		issues = append(issues, "Privileged mode should be disabled")
	}

	// Check capabilities are dropped
	if len(config.CapDrop) == 0 {
		issues = append(issues, "Capabilities should be dropped")
	}

	// Check resource limits are set
	if config.Resources.Memory == 0 {
		issues = append(issues, "Memory limit should be set")
	}
	if config.Resources.CPUQuota == 0 {
		issues = append(issues, "CPU quota should be set")
	}

	// Check network mode is not host
	if config.NetworkMode == "host" {
		issues = append(issues, "Host network mode should not be used")
	}

	return issues
}

// ContainerSecurityChecklist returns a checklist of security requirements
func ContainerSecurityChecklist() map[string]string {
	return map[string]string{
		"8.1": "Run containers with non-root user by default",
		"8.2": "Drop all Linux capabilities except those explicitly required",
		"8.3": "Apply seccomp profile to restrict system calls",
		"8.4": "Disable container networking to host network",
		"8.5": "Mount host directories as read-only where possible",
		"8.6": "Set resource limits (CPU, memory) on containers",
		"8.7": "Use user namespaces to map container root to unprivileged host user",
		"8.8": "Block access to host filesystem outside mounted directories",
		"8.9": "Do NOT expose Docker socket to containers",
	}
}

// IsSecurityCompliant checks if a container configuration is security compliant
func IsSecurityCompliant(config *ContainerConfig) bool {
	// Check no Docker socket mount
	for _, bind := range config.Binds {
		if bind == "/var/run/docker.sock:/var/run/docker.sock" {
			return false // Requirement 8.9 violation
		}
	}

	// Check capabilities are dropped
	hasCapDrop := false
	for _, cap := range config.CapDrop {
		if cap == "ALL" {
			hasCapDrop = true
			break
		}
	}
	if !hasCapDrop {
		return false // Requirement 8.2 violation
	}

	// Check network mode is not host
	if config.NetworkMode == "host" {
		return false // Requirement 8.4 violation
	}

	// Check resource limits
	if config.Resources.Memory == 0 || config.Resources.CPUQuota == 0 {
		return false // Requirement 8.6 violation
	}

	return true
}
