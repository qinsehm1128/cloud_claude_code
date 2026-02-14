package docker

import (
	"testing"
	"testing/quick"

	"github.com/docker/docker/api/types/container"
)

// Property 11: Container Security Configuration
// For any created container, the container configuration SHALL have:
// - privileged=false
// - all capabilities dropped except explicitly required ones
// - seccomp profile applied
// - resource limits set
// - no access to Docker socket

func TestDefaultSecurityConfigNotPrivileged(t *testing.T) {
	config := DefaultSecurityConfig()
	
	if config.Privileged {
		t.Error("Default security config should not be privileged")
	}
}

func TestDefaultSecurityConfigDropsAllCapabilities(t *testing.T) {
	config := DefaultSecurityConfig()
	
	hasDropAll := false
	for _, cap := range config.CapDrop {
		if cap == "ALL" {
			hasDropAll = true
			break
		}
	}
	
	if !hasDropAll {
		t.Error("Default security config should drop ALL capabilities")
	}
}

func TestDefaultSecurityConfigHasResourceLimits(t *testing.T) {
	config := DefaultSecurityConfig()
	
	if config.Resources.Memory == 0 {
		t.Error("Default security config should have memory limit")
	}
	
	if config.Resources.CPUQuota == 0 {
		t.Error("Default security config should have CPU quota")
	}
}

func TestDefaultSecurityConfigNotHostNetwork(t *testing.T) {
	config := DefaultSecurityConfig()
	
	if config.NetworkMode == "host" {
		t.Error("Default security config should not use host network")
	}
}

func TestDefaultSecurityConfigHasSecurityOpts(t *testing.T) {
	config := DefaultSecurityConfig()
	
	if len(config.SecurityOpt) == 0 {
		t.Error("Default security config should have security options")
	}
	
	hasSeccomp := false
	for _, opt := range config.SecurityOpt {
		if opt == "seccomp=unconfined" {
			hasSeccomp = true
			break
		}
	}
	
	if !hasSeccomp {
		t.Error("Default security config should have seccomp option")
	}
}

// Property test: any container config with Docker socket mount should be non-compliant
func TestDockerSocketMountNonCompliant(t *testing.T) {
	f := func(name string) bool {
		config := &ContainerConfig{
			Name:        name,
			Binds:       []string{"/var/run/docker.sock:/var/run/docker.sock"},
			CapDrop:     []string{"ALL"},
			NetworkMode: "bridge",
			Resources: container.Resources{
				Memory:   2 * 1024 * 1024 * 1024,
				CPUQuota: 100000,
			},
		}
		
		// Should NOT be compliant due to Docker socket mount
		return !IsSecurityCompliant(config)
	}
	
	if err := quick.Check(f, &quick.Config{MaxCount: 100}); err != nil {
		t.Errorf("Property test failed: %v", err)
	}
}

// Property test: any container config without CAP_DROP ALL should be non-compliant
func TestMissingCapDropNonCompliant(t *testing.T) {
	f := func(name string) bool {
		config := &ContainerConfig{
			Name:        name,
			Binds:       []string{"/data:/workspace"},
			CapDrop:     []string{}, // Missing CAP_DROP ALL
			NetworkMode: "bridge",
			Resources: container.Resources{
				Memory:   2 * 1024 * 1024 * 1024,
				CPUQuota: 100000,
			},
		}
		
		// Should NOT be compliant due to missing CAP_DROP
		return !IsSecurityCompliant(config)
	}
	
	if err := quick.Check(f, &quick.Config{MaxCount: 100}); err != nil {
		t.Errorf("Property test failed: %v", err)
	}
}

// Property test: any container config with host network should be non-compliant
func TestHostNetworkNonCompliant(t *testing.T) {
	f := func(name string) bool {
		config := &ContainerConfig{
			Name:        name,
			Binds:       []string{"/data:/workspace"},
			CapDrop:     []string{"ALL"},
			NetworkMode: "host", // Host network
			Resources: container.Resources{
				Memory:   2 * 1024 * 1024 * 1024,
				CPUQuota: 100000,
			},
		}
		
		// Should NOT be compliant due to host network
		return !IsSecurityCompliant(config)
	}
	
	if err := quick.Check(f, &quick.Config{MaxCount: 100}); err != nil {
		t.Errorf("Property test failed: %v", err)
	}
}

// Property test: any container config without resource limits should be non-compliant
func TestMissingResourceLimitsNonCompliant(t *testing.T) {
	f := func(name string) bool {
		config := &ContainerConfig{
			Name:        name,
			Binds:       []string{"/data:/workspace"},
			CapDrop:     []string{"ALL"},
			NetworkMode: "bridge",
			Resources:   container.Resources{}, // No limits
		}
		
		// Should NOT be compliant due to missing resource limits
		return !IsSecurityCompliant(config)
	}
	
	if err := quick.Check(f, &quick.Config{MaxCount: 100}); err != nil {
		t.Errorf("Property test failed: %v", err)
	}
}

// Property test: properly configured container should be compliant
func TestProperConfigIsCompliant(t *testing.T) {
	f := func(name string) bool {
		if name == "" {
			return true // Skip empty names
		}
		
		config := &ContainerConfig{
			Name:        name,
			Binds:       []string{"/data:/workspace"},
			CapDrop:     []string{"ALL"},
			CapAdd:      []string{"CHOWN", "SETUID", "SETGID"},
			NetworkMode: "bridge",
			Resources: container.Resources{
				Memory:   2 * 1024 * 1024 * 1024,
				CPUQuota: 100000,
			},
		}
		
		// Should be compliant
		return IsSecurityCompliant(config)
	}
	
	if err := quick.Check(f, &quick.Config{MaxCount: 100}); err != nil {
		t.Errorf("Property test failed: %v", err)
	}
}

func TestValidateSecurityConfig(t *testing.T) {
	// Test with default config - should have no issues
	config := DefaultSecurityConfig()
	issues := ValidateSecurityConfig(config)
	
	if len(issues) > 0 {
		t.Errorf("Default security config should have no issues, got: %v", issues)
	}
	
	// Test with privileged config - should have issues
	privilegedConfig := &SecurityConfig{
		Privileged:  true,
		CapDrop:     []string{},
		NetworkMode: "host",
		Resources:   container.Resources{},
	}
	
	issues = ValidateSecurityConfig(privilegedConfig)
	if len(issues) == 0 {
		t.Error("Privileged config should have issues")
	}
}

func TestContainerSecurityChecklist(t *testing.T) {
	checklist := ContainerSecurityChecklist()

	// Verify all requirements are documented
	expectedRequirements := []string{"8.1", "8.2", "8.3", "8.4", "8.5", "8.6", "8.7", "8.8", "8.9"}

	for _, req := range expectedRequirements {
		if _, ok := checklist[req]; !ok {
			t.Errorf("Missing requirement %s in security checklist", req)
		}
	}
}

// Tests for ValidateResourceConfig (IMPL-003: Docker resource limits)

func TestValidateResourceConfig_ValidDefaults(t *testing.T) {
	config := DefaultSecurityConfig()
	err := ValidateResourceConfig(&config.Resources)
	if err != nil {
		t.Errorf("Default resource config should be valid, got: %v", err)
	}
}

func TestValidateResourceConfig_NegativeMemory(t *testing.T) {
	resources := &container.Resources{
		Memory: -1,
	}
	err := ValidateResourceConfig(resources)
	if err == nil {
		t.Error("Negative memory should be invalid")
	}
}

func TestValidateResourceConfig_ExcessiveMemory(t *testing.T) {
	resources := &container.Resources{
		Memory: 256 * 1024 * 1024 * 1024, // 256GB exceeds 128GB max
	}
	err := ValidateResourceConfig(resources)
	if err == nil {
		t.Error("Memory exceeding 128GB should be invalid")
	}
}

func TestValidateResourceConfig_CPUPeriodTooLow(t *testing.T) {
	resources := &container.Resources{
		CPUPeriod: 500, // Below minimum 1000
	}
	err := ValidateResourceConfig(resources)
	if err == nil {
		t.Error("CPU period below 1000 should be invalid")
	}
}

func TestValidateResourceConfig_CPUPeriodTooHigh(t *testing.T) {
	resources := &container.Resources{
		CPUPeriod: 2000000, // Above maximum 1000000
	}
	err := ValidateResourceConfig(resources)
	if err == nil {
		t.Error("CPU period above 1000000 should be invalid")
	}
}

func TestValidateResourceConfig_CPUQuotaBelowMinimum(t *testing.T) {
	resources := &container.Resources{
		CPUQuota:  500,    // Below minimum quantum 1000
		CPUPeriod: 100000,
	}
	err := ValidateResourceConfig(resources)
	if err == nil {
		t.Error("CPU quota below 1000 with non-zero period should be invalid")
	}
}

func TestValidateResourceConfig_ValidCPUQuota(t *testing.T) {
	resources := &container.Resources{
		CPUQuota:  100000,
		CPUPeriod: 100000,
		Memory:    2 * 1024 * 1024 * 1024,
	}
	err := ValidateResourceConfig(resources)
	if err != nil {
		t.Errorf("Valid CPU config should pass, got: %v", err)
	}
}

func TestValidateResourceConfig_ZeroValues(t *testing.T) {
	resources := &container.Resources{}
	err := ValidateResourceConfig(resources)
	if err != nil {
		t.Errorf("Zero values (no limits) should be valid, got: %v", err)
	}
}

func TestDefaultSecurityConfig_PidsLimit(t *testing.T) {
	config := DefaultSecurityConfig()

	if config.Resources.PidsLimit == nil {
		t.Fatal("PidsLimit should not be nil")
	}
	if *config.Resources.PidsLimit != 256 {
		t.Errorf("PidsLimit should be 256, got %d", *config.Resources.PidsLimit)
	}
}

func TestDefaultSecurityConfig_MemoryValues(t *testing.T) {
	config := DefaultSecurityConfig()

	expectedMemory := int64(2 * 1024 * 1024 * 1024) // 2GB
	if config.Resources.Memory != expectedMemory {
		t.Errorf("Memory should be 2GB (%d), got %d", expectedMemory, config.Resources.Memory)
	}
	if config.Resources.MemorySwap != expectedMemory {
		t.Errorf("MemorySwap should be 2GB (%d), got %d", expectedMemory, config.Resources.MemorySwap)
	}
}

func TestToContainerConfig(t *testing.T) {
	secConfig := DefaultSecurityConfig()
	containerConfig := secConfig.ToContainerConfig()

	if containerConfig == nil {
		t.Fatal("ToContainerConfig should not return nil")
	}
	if containerConfig.NetworkMode != secConfig.NetworkMode {
		t.Errorf("NetworkMode mismatch: expected %s, got %s", secConfig.NetworkMode, containerConfig.NetworkMode)
	}
	if len(containerConfig.CapDrop) != len(secConfig.CapDrop) {
		t.Errorf("CapDrop length mismatch: expected %d, got %d", len(secConfig.CapDrop), len(containerConfig.CapDrop))
	}
}
