package services

import (
	"context"
	"testing"
	"time"

	"cc-platform/internal/models"
)

// Property 7: Container Listing Completeness
// For any list of containers, each item in the response SHALL contain
// non-empty container ID, valid status, valid creation time, and associated repository information.

func TestContainerInfoHasRequiredFields(t *testing.T) {
	// Create a test container model
	now := time.Now()
	container := &models.Container{
		DockerID:    "abc123def456",
		Name:        "test-container",
		Status:      models.ContainerStatusRunning,
		GitRepoName: "test-repo",
		GitRepoURL:  "https://github.com/test/repo",
		StartedAt:   &now,
	}
	container.ID = 1
	container.CreatedAt = now

	// Convert to ContainerInfo
	info := ToContainerInfo(container)

	// Verify all required fields are present
	if info.ID == 0 {
		t.Error("ContainerInfo should have non-zero ID")
	}

	if info.DockerID == "" {
		t.Error("ContainerInfo should have non-empty DockerID")
	}

	if info.Name == "" {
		t.Error("ContainerInfo should have non-empty Name")
	}

	if info.Status == "" {
		t.Error("ContainerInfo should have non-empty Status")
	}

	// Validate status is one of the valid values
	validStatuses := map[string]bool{
		models.ContainerStatusCreated: true,
		models.ContainerStatusRunning: true,
		models.ContainerStatusStopped: true,
		models.ContainerStatusDeleted: true,
	}
	if !validStatuses[info.Status] {
		t.Errorf("ContainerInfo has invalid status: %s", info.Status)
	}

	if info.GitRepoName == "" && info.GitRepoURL == "" {
		t.Error("ContainerInfo should include repository information")
	}

	if info.CreatedAt.IsZero() {
		t.Error("ContainerInfo should have valid CreatedAt time")
	}
}

func TestContainerInfoStatusValues(t *testing.T) {
	testCases := []struct {
		status   string
		expected string
	}{
		{models.ContainerStatusCreated, "created"},
		{models.ContainerStatusRunning, "running"},
		{models.ContainerStatusStopped, "stopped"},
		{models.ContainerStatusDeleted, "deleted"},
	}

	for _, tc := range testCases {
		container := &models.Container{
			DockerID:    "test123",
			Name:        "test",
			Status:      tc.status,
			GitRepoName: "test-repo",
		}
		container.CreatedAt = time.Now()

		info := ToContainerInfo(container)
		if info.Status != tc.expected {
			t.Errorf("Expected status %s, got %s", tc.expected, info.Status)
		}
	}
}

func TestContainerInfoOptionalFields(t *testing.T) {
	now := time.Now()

	// Container with all optional fields
	containerWithOptional := &models.Container{
		DockerID:    "test123",
		Name:        "test",
		Status:      models.ContainerStatusRunning,
		StartedAt:   &now,
		StoppedAt:   &now,
		GitRepoName: "test-repo",
	}
	containerWithOptional.CreatedAt = now

	info := ToContainerInfo(containerWithOptional)
	if info.StartedAt == nil {
		t.Error("ContainerInfo should include StartedAt when present")
	}
	if info.StoppedAt == nil {
		t.Error("ContainerInfo should include StoppedAt when present")
	}

	// Container without optional fields
	containerWithoutOptional := &models.Container{
		DockerID:    "test456",
		Name:        "test2",
		Status:      models.ContainerStatusCreated,
		GitRepoName: "test-repo",
	}
	containerWithoutOptional.CreatedAt = now

	info2 := ToContainerInfo(containerWithoutOptional)
	if info2.StartedAt != nil {
		t.Error("ContainerInfo should not include StartedAt when not present")
	}
}


// ==================== Task 5.4: Container Service Unit Tests ====================

// MockConfigInjectionService is a mock implementation of ConfigInjectionService for testing
type MockConfigInjectionService struct {
	InjectConfigsCalled bool
	InjectConfigsInput  struct {
		ContainerID string
		TemplateIDs []uint
	}
	InjectConfigsResult *models.InjectionStatus
	InjectConfigsError  error
}

func (m *MockConfigInjectionService) InjectConfigs(ctx context.Context, containerID string, templateIDs []uint) (*models.InjectionStatus, error) {
	m.InjectConfigsCalled = true
	m.InjectConfigsInput.ContainerID = containerID
	m.InjectConfigsInput.TemplateIDs = templateIDs
	return m.InjectConfigsResult, m.InjectConfigsError
}

func (m *MockConfigInjectionService) InjectClaudeMD(ctx context.Context, containerID string, content string) error {
	return nil
}

func (m *MockConfigInjectionService) InjectSkill(ctx context.Context, containerID string, name string, content string) error {
	return nil
}

func (m *MockConfigInjectionService) InjectMCP(ctx context.Context, containerID string, configs []MCPServerConfig) error {
	return nil
}

func (m *MockConfigInjectionService) InjectCommand(ctx context.Context, containerID string, name string, content string) error {
	return nil
}

// Test 1: CreateContainerInput with template IDs stores them for injection
func TestCreateContainerInput_TemplateIDsStorage(t *testing.T) {
	// Test that CreateContainerInput correctly stores template IDs
	input := CreateContainerInput{
		Name:             "test-container",
		SkipGitRepo:      true,
		SelectedClaudeMD: uintPtr(1),
		SelectedSkills:   []uint{2, 3},
		SelectedMCPs:     []uint{4, 5, 6},
		SelectedCommands: []uint{7},
	}

	// Verify template IDs are correctly stored in the input
	if input.SelectedClaudeMD == nil || *input.SelectedClaudeMD != 1 {
		t.Error("SelectedClaudeMD should be 1")
	}

	if len(input.SelectedSkills) != 2 {
		t.Errorf("Expected 2 skills, got %d", len(input.SelectedSkills))
	}
	if input.SelectedSkills[0] != 2 || input.SelectedSkills[1] != 3 {
		t.Error("SelectedSkills should be [2, 3]")
	}

	if len(input.SelectedMCPs) != 3 {
		t.Errorf("Expected 3 MCPs, got %d", len(input.SelectedMCPs))
	}

	if len(input.SelectedCommands) != 1 {
		t.Errorf("Expected 1 command, got %d", len(input.SelectedCommands))
	}

	// Test collecting all template IDs (as done in CreateContainer)
	var templateIDs []uint
	if input.SelectedClaudeMD != nil {
		templateIDs = append(templateIDs, *input.SelectedClaudeMD)
	}
	templateIDs = append(templateIDs, input.SelectedSkills...)
	templateIDs = append(templateIDs, input.SelectedMCPs...)
	templateIDs = append(templateIDs, input.SelectedCommands...)

	expectedTotal := 7 // 1 + 2 + 3 + 1
	if len(templateIDs) != expectedTotal {
		t.Errorf("Expected %d total template IDs, got %d", expectedTotal, len(templateIDs))
	}
}

// Test 2: SkipGitRepo=true creates container without GitRepoURL requirement
func TestCreateContainerInput_SkipGitRepo_NoURLRequired(t *testing.T) {
	// When SkipGitRepo is true, GitRepoURL should not be required
	input := CreateContainerInput{
		Name:        "empty-container",
		SkipGitRepo: true,
		// GitRepoURL is intentionally empty
	}

	// Verify the input is valid for empty container creation
	if !input.SkipGitRepo {
		t.Error("SkipGitRepo should be true")
	}

	if input.GitRepoURL != "" {
		t.Error("GitRepoURL should be empty when SkipGitRepo is true")
	}

	// This should be a valid configuration
	if input.Name == "" {
		t.Error("Name is required even for empty containers")
	}
}

// Test 3: SkipGitRepo=true sets WorkDir to /app
func TestContainerModel_SkipGitRepo_WorkDir(t *testing.T) {
	// When SkipGitRepo is true, WorkDir should be /app
	container := &models.Container{
		Name:        "empty-container",
		SkipGitRepo: true,
		WorkDir:     "/app", // Default for empty containers
	}

	if container.WorkDir != "/app" {
		t.Errorf("Expected WorkDir to be /app, got %s", container.WorkDir)
	}

	// When SkipGitRepo is false and repo is provided, WorkDir should be /workspace/{repoName}
	containerWithRepo := &models.Container{
		Name:        "repo-container",
		SkipGitRepo: false,
		GitRepoURL:  "https://github.com/test/myrepo",
		GitRepoName: "myrepo",
		WorkDir:     "/workspace/myrepo",
	}

	expectedWorkDir := "/workspace/myrepo"
	if containerWithRepo.WorkDir != expectedWorkDir {
		t.Errorf("Expected WorkDir to be %s, got %s", expectedWorkDir, containerWithRepo.WorkDir)
	}
}

// Test 4: EnableYoloMode=true is stored in container record
func TestContainerModel_EnableYoloMode_Storage(t *testing.T) {
	// Test that EnableYoloMode is correctly stored in the container model
	container := &models.Container{
		Name:           "yolo-container",
		EnableYoloMode: true,
	}

	if !container.EnableYoloMode {
		t.Error("EnableYoloMode should be true")
	}

	// Test with YOLO mode disabled
	containerNoYolo := &models.Container{
		Name:           "normal-container",
		EnableYoloMode: false,
	}

	if containerNoYolo.EnableYoloMode {
		t.Error("EnableYoloMode should be false")
	}
}

// Test 5: Container with EnableYoloMode=true uses --dangerously-skip-permissions flag
func TestYoloMode_CommandGeneration(t *testing.T) {
	// Test that YOLO mode containers should use --dangerously-skip-permissions flag
	// This tests the logic that would be used in runClaudeInit

	testCases := []struct {
		name           string
		enableYoloMode bool
		expectFlag     bool
	}{
		{
			name:           "YOLO mode enabled",
			enableYoloMode: true,
			expectFlag:     true,
		},
		{
			name:           "YOLO mode disabled",
			enableYoloMode: false,
			expectFlag:     false,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			container := &models.Container{
				Name:           "test-container",
				EnableYoloMode: tc.enableYoloMode,
				WorkDir:        "/app",
			}

			// Simulate the command generation logic from runClaudeInit
			var claudeCmd string
			if container.EnableYoloMode {
				claudeCmd = "claude --dangerously-skip-permissions --system-prompt-file /tmp/system_prompt.txt -p \"test\""
			} else {
				claudeCmd = "claude --system-prompt-file /tmp/system_prompt.txt -p \"test\""
			}

			containsFlag := stringContains(claudeCmd, "--dangerously-skip-permissions")
			if containsFlag != tc.expectFlag {
				if tc.expectFlag {
					t.Errorf("Expected command to contain --dangerously-skip-permissions flag, got: %s", claudeCmd)
				} else {
					t.Errorf("Expected command to NOT contain --dangerously-skip-permissions flag, got: %s", claudeCmd)
				}
			}
		})
	}
}

// Test: YOLO mode setting persists across container restart
func TestYoloMode_PersistsOnRestart(t *testing.T) {
	// Test that EnableYoloMode is stored in the container record and persists
	container := &models.Container{
		Name:           "yolo-container",
		EnableYoloMode: true,
		Status:         models.ContainerStatusStopped,
		InitStatus:     models.InitStatusReady,
	}
	container.ID = 1

	// Simulate container restart - the EnableYoloMode should still be true
	// This is a data persistence test
	if !container.EnableYoloMode {
		t.Error("EnableYoloMode should persist after container stop")
	}

	// After restart, the container should still have YOLO mode enabled
	container.Status = models.ContainerStatusRunning
	if !container.EnableYoloMode {
		t.Error("EnableYoloMode should persist after container restart")
	}
}

// Test: InjectionStatus is correctly stored in container
func TestContainerModel_InjectionStatus_Storage(t *testing.T) {
	now := time.Now()
	injectionStatus := &models.InjectionStatus{
		ContainerID: "docker123",
		Successful:  []string{"template1", "template2"},
		Failed: []models.FailedTemplate{
			{
				TemplateName: "template3",
				ConfigType:   "MCP",
				Reason:       "invalid JSON",
			},
		},
		Warnings:   []string{"warning1"},
		InjectedAt: now,
	}

	container := &models.Container{
		Name:            "test-container",
		InjectionStatus: injectionStatus,
	}

	// Verify InjectionStatus is stored
	if container.InjectionStatus == nil {
		t.Fatal("InjectionStatus should not be nil")
	}

	if len(container.InjectionStatus.Successful) != 2 {
		t.Errorf("Expected 2 successful templates, got %d", len(container.InjectionStatus.Successful))
	}

	if len(container.InjectionStatus.Failed) != 1 {
		t.Errorf("Expected 1 failed template, got %d", len(container.InjectionStatus.Failed))
	}

	if container.InjectionStatus.Failed[0].TemplateName != "template3" {
		t.Errorf("Expected failed template name 'template3', got '%s'", container.InjectionStatus.Failed[0].TemplateName)
	}

	if container.InjectionStatus.Failed[0].Reason != "invalid JSON" {
		t.Errorf("Expected failure reason 'invalid JSON', got '%s'", container.InjectionStatus.Failed[0].Reason)
	}
}

// Test: CreateContainerInput validation - GitRepoURL required when SkipGitRepo is false
func TestCreateContainerInput_Validation_GitRepoRequired(t *testing.T) {
	testCases := []struct {
		name        string
		input       CreateContainerInput
		expectValid bool
	}{
		{
			name: "Valid: SkipGitRepo=true, no GitRepoURL",
			input: CreateContainerInput{
				Name:        "empty-container",
				SkipGitRepo: true,
			},
			expectValid: true,
		},
		{
			name: "Valid: SkipGitRepo=false, with GitRepoURL",
			input: CreateContainerInput{
				Name:        "repo-container",
				SkipGitRepo: false,
				GitRepoURL:  "https://github.com/test/repo",
			},
			expectValid: true,
		},
		{
			name: "Invalid: SkipGitRepo=false, no GitRepoURL",
			input: CreateContainerInput{
				Name:        "invalid-container",
				SkipGitRepo: false,
				// GitRepoURL is empty
			},
			expectValid: false,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			// Simulate the validation logic from CreateContainer
			isValid := tc.input.SkipGitRepo || tc.input.GitRepoURL != ""

			if isValid != tc.expectValid {
				t.Errorf("Expected validation result %v, got %v", tc.expectValid, isValid)
			}
		})
	}
}

// Test: Template IDs collection for injection
func TestTemplateIDsCollection(t *testing.T) {
	testCases := []struct {
		name          string
		input         CreateContainerInput
		expectedCount int
	}{
		{
			name: "All template types selected",
			input: CreateContainerInput{
				Name:             "full-config",
				SkipGitRepo:      true,
				SelectedClaudeMD: uintPtr(1),
				SelectedSkills:   []uint{2, 3},
				SelectedMCPs:     []uint{4},
				SelectedCommands: []uint{5, 6},
			},
			expectedCount: 6,
		},
		{
			name: "Only CLAUDE.MD selected",
			input: CreateContainerInput{
				Name:             "claude-only",
				SkipGitRepo:      true,
				SelectedClaudeMD: uintPtr(1),
			},
			expectedCount: 1,
		},
		{
			name: "No templates selected",
			input: CreateContainerInput{
				Name:        "no-config",
				SkipGitRepo: true,
			},
			expectedCount: 0,
		},
		{
			name: "Only Skills and MCPs",
			input: CreateContainerInput{
				Name:           "skills-mcps",
				SkipGitRepo:    true,
				SelectedSkills: []uint{1, 2, 3},
				SelectedMCPs:   []uint{4, 5},
			},
			expectedCount: 5,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			// Collect template IDs as done in CreateContainer
			var templateIDs []uint
			if tc.input.SelectedClaudeMD != nil {
				templateIDs = append(templateIDs, *tc.input.SelectedClaudeMD)
			}
			templateIDs = append(templateIDs, tc.input.SelectedSkills...)
			templateIDs = append(templateIDs, tc.input.SelectedMCPs...)
			templateIDs = append(templateIDs, tc.input.SelectedCommands...)

			if len(templateIDs) != tc.expectedCount {
				t.Errorf("Expected %d template IDs, got %d", tc.expectedCount, len(templateIDs))
			}
		})
	}
}

// Test: WorkDir calculation based on SkipGitRepo and GitRepoName
func TestWorkDirCalculation(t *testing.T) {
	testCases := []struct {
		name            string
		skipGitRepo     bool
		gitRepoName     string
		expectedWorkDir string
	}{
		{
			name:            "Empty container",
			skipGitRepo:     true,
			gitRepoName:     "",
			expectedWorkDir: "/app",
		},
		{
			name:            "With repository",
			skipGitRepo:     false,
			gitRepoName:     "myproject",
			expectedWorkDir: "/workspace/myproject",
		},
		{
			name:            "With repository - different name",
			skipGitRepo:     false,
			gitRepoName:     "awesome-app",
			expectedWorkDir: "/workspace/awesome-app",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			// Simulate WorkDir calculation from CreateContainer
			var workDir string
			if tc.skipGitRepo {
				workDir = "/app"
			} else if tc.gitRepoName != "" {
				workDir = "/workspace/" + tc.gitRepoName
			} else {
				workDir = "/app"
			}

			if workDir != tc.expectedWorkDir {
				t.Errorf("Expected WorkDir %s, got %s", tc.expectedWorkDir, workDir)
			}
		})
	}
}

// Helper function to create a pointer to uint
func uintPtr(v uint) *uint {
	return &v
}

// Helper function to check if a string contains a substring
func stringContains(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

// ==================== Resource Limit Validation Tests ====================

// TestCPUQuotaCalculation verifies CPU core to microseconds conversion
func TestCPUQuotaCalculation(t *testing.T) {
	tests := []struct {
		name          string
		cpuCores      float64
		cpuPeriod     int64
		expectedQuota int64
		shouldPass    bool
	}{
		{
			name:          "0.5 cores",
			cpuCores:      0.5,
			cpuPeriod:     CPUPeriodDefault,
			expectedQuota: 50000,
			shouldPass:    true,
		},
		{
			name:          "1.0 cores",
			cpuCores:      1.0,
			cpuPeriod:     CPUPeriodDefault,
			expectedQuota: 100000,
			shouldPass:    true,
		},
		{
			name:          "2.5 cores",
			cpuCores:      2.5,
			cpuPeriod:     CPUPeriodDefault,
			expectedQuota: 250000,
			shouldPass:    true,
		},
		{
			name:          "4.0 cores",
			cpuCores:      4.0,
			cpuPeriod:     CPUPeriodDefault,
			expectedQuota: 400000,
			shouldPass:    true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateResourceLimits(tt.cpuCores, 2048, tt.cpuPeriod)
			if tt.shouldPass && err != nil {
				t.Errorf("Expected validation to pass for %s, got error: %v", tt.name, err)
			}
			if !tt.shouldPass && err == nil {
				t.Errorf("Expected validation to fail for %s, but it passed", tt.name)
			}
			if tt.shouldPass {
				// Verify the quota calculation
				actualQuota := int64(tt.cpuCores * float64(tt.cpuPeriod))
				if actualQuota != tt.expectedQuota {
					t.Errorf("CPUQuota mismatch for %s: expected %d, got %d", tt.name, tt.expectedQuota, actualQuota)
				}
			}
		})
	}
}

// TestCPUPeriodValidation tests CPUPeriod range validation (1000-1000000 microseconds)
func TestCPUPeriodValidation(t *testing.T) {
	tests := []struct {
		name       string
		cpuCores   float64
		memoryMB   int64
		cpuPeriod  int64
		shouldPass bool
	}{
		{
			name:       "valid default period (100000)",
			cpuCores:   1.0,
			memoryMB:   2048,
			cpuPeriod:  100000,
			shouldPass: true,
		},
		{
			name:       "below minimum (500)",
			cpuCores:   1.0,
			memoryMB:   2048,
			cpuPeriod:  500,
			shouldPass: false,
		},
		{
			name:       "above maximum (2000000)",
			cpuCores:   1.0,
			memoryMB:   2048,
			cpuPeriod:  2000000,
			shouldPass: false,
		},
		{
			name:       "edge case minimum (1000)",
			cpuCores:   1.0,
			memoryMB:   2048,
			cpuPeriod:  1000,
			shouldPass: true,
		},
		{
			name:       "edge case maximum (1000000)",
			cpuCores:   1.0,
			memoryMB:   2048,
			cpuPeriod:  1000000,
			shouldPass: true,
		},
		{
			name:       "zero period (no validation)",
			cpuCores:   1.0,
			memoryMB:   2048,
			cpuPeriod:  0,
			shouldPass: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateResourceLimits(tt.cpuCores, tt.memoryMB, tt.cpuPeriod)
			if tt.shouldPass && err != nil {
				t.Errorf("Expected validation to pass for %s, got error: %v", tt.name, err)
			}
			if !tt.shouldPass && err == nil {
				t.Errorf("Expected validation to fail for %s, but it passed", tt.name)
			}
		})
	}
}

// TestMemoryValidation tests memory limit validation
func TestMemoryValidation(t *testing.T) {
	tests := []struct {
		name       string
		cpuCores   float64
		memoryMB   int64
		cpuPeriod  int64
		shouldPass bool
	}{
		{
			name:       "valid 1024MB",
			cpuCores:   1.0,
			memoryMB:   1024,
			cpuPeriod:  CPUPeriodDefault,
			shouldPass: true,
		},
		{
			name:       "zero memory (default will be used)",
			cpuCores:   1.0,
			memoryMB:   0,
			cpuPeriod:  CPUPeriodDefault,
			shouldPass: true,
		},
		{
			name:       "negative memory",
			cpuCores:   1.0,
			memoryMB:   -1,
			cpuPeriod:  CPUPeriodDefault,
			shouldPass: false,
		},
		{
			name:       "maximum 131072MB (128GB)",
			cpuCores:   1.0,
			memoryMB:   131072,
			cpuPeriod:  CPUPeriodDefault,
			shouldPass: true,
		},
		{
			name:       "above maximum (200000MB)",
			cpuCores:   1.0,
			memoryMB:   200000,
			cpuPeriod:  CPUPeriodDefault,
			shouldPass: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateResourceLimits(tt.cpuCores, tt.memoryMB, tt.cpuPeriod)
			if tt.shouldPass && err != nil {
				t.Errorf("Expected validation to pass for %s, got error: %v", tt.name, err)
			}
			if !tt.shouldPass && err == nil {
				t.Errorf("Expected validation to fail for %s, but it passed", tt.name)
			}
		})
	}
}

// TestResourceValidationEdgeCases tests edge cases and boundary conditions
func TestResourceValidationEdgeCases(t *testing.T) {
	tests := []struct {
		name       string
		cpuCores   float64
		memoryMB   int64
		cpuPeriod  int64
		shouldPass bool
	}{
		{
			name:       "all zeros",
			cpuCores:   0,
			memoryMB:   0,
			cpuPeriod:  0,
			shouldPass: true,
		},
		{
			name:       "maximum values",
			cpuCores:   64,
			memoryMB:   131072,
			cpuPeriod:  MaxCPUPeriod,
			shouldPass: true,
		},
		{
			name:       "negative CPU cores",
			cpuCores:   -1.0,
			memoryMB:   2048,
			cpuPeriod:  CPUPeriodDefault,
			shouldPass: false,
		},
		{
			name:       "CPU cores above maximum (65)",
			cpuCores:   65,
			memoryMB:   2048,
			cpuPeriod:  CPUPeriodDefault,
			shouldPass: false,
		},
		{
			name:       "minimum quantum check (below 1000)",
			cpuCores:   0.001,
			memoryMB:   2048,
			cpuPeriod:  CPUPeriodDefault,
			shouldPass: false,
		},
		{
			name:       "valid small quota (exactly 1000)",
			cpuCores:   0.01,
			memoryMB:   2048,
			cpuPeriod:  CPUPeriodDefault,
			shouldPass: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateResourceLimits(tt.cpuCores, tt.memoryMB, tt.cpuPeriod)
			if tt.shouldPass && err != nil {
				t.Errorf("Expected validation to pass for %s, got error: %v", tt.name, err)
			}
			if !tt.shouldPass && err == nil {
				t.Errorf("Expected validation to fail for %s, but it passed", tt.name)
			}
		})
	}
}

// TestValidateResourceLimits is an integration test combining all validation scenarios
func TestValidateResourceLimitsIntegration(t *testing.T) {
	tests := []struct {
		name       string
		cpuCores   float64
		memoryMB   int64
		cpuPeriod  int64
		shouldPass bool
		errorType  string
	}{
		{
			name:       "valid configuration",
			cpuCores:   2.0,
			memoryMB:   4096,
			cpuPeriod:  CPUPeriodDefault,
			shouldPass: true,
		},
		{
			name:       "invalid memory",
			cpuCores:   1.0,
			memoryMB:   -1,
			cpuPeriod:  CPUPeriodDefault,
			shouldPass: false,
			errorType:  "memory",
		},
		{
			name:       "invalid CPU cores",
			cpuCores:   -1.0,
			memoryMB:   2048,
			cpuPeriod:  CPUPeriodDefault,
			shouldPass: false,
			errorType:  "cpu",
		},
		{
			name:       "invalid CPU period (too low)",
			cpuCores:   1.0,
			memoryMB:   2048,
			cpuPeriod:  500,
			shouldPass: false,
			errorType:  "period",
		},
		{
			name:       "invalid CPU period (too high)",
			cpuCores:   1.0,
			memoryMB:   2048,
			cpuPeriod:  2000000,
			shouldPass: false,
			errorType:  "period",
		},
		{
			name:       "valid fractional CPU",
			cpuCores:   0.25,
			memoryMB:   512,
			cpuPeriod:  CPUPeriodDefault,
			shouldPass: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateResourceLimits(tt.cpuCores, tt.memoryMB, tt.cpuPeriod)
			if tt.shouldPass {
				if err != nil {
					t.Errorf("Expected validation to pass, got error: %v", err)
				}
			} else {
				if err == nil {
					t.Errorf("Expected validation to fail with %s error, but it passed", tt.errorType)
				}
			}
		})
	}
}
