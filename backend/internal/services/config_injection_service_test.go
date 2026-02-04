package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"testing"

	"cc-platform/internal/models"
)

// ============================================================================
// Mock Implementations
// ============================================================================

// mockDockerClient mocks the Docker client for testing
type mockDockerClient struct {
	mu           sync.Mutex
	execCalls    []execCall
	execResults  map[string]execResult
	defaultError error
}

type execCall struct {
	containerID string
	cmd         []string
}

type execResult struct {
	output string
	err    error
}

func newMockDockerClient() *mockDockerClient {
	return &mockDockerClient{
		execCalls:   []execCall{},
		execResults: make(map[string]execResult),
	}
}

func (m *mockDockerClient) ExecInContainer(ctx context.Context, containerID string, cmd []string) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.execCalls = append(m.execCalls, execCall{containerID: containerID, cmd: cmd})

	// Check for specific result based on command pattern
	cmdKey := fmt.Sprintf("%s:%v", containerID, cmd)
	if result, ok := m.execResults[cmdKey]; ok {
		return result.output, result.err
	}

	// Return default error if set
	if m.defaultError != nil {
		return "", m.defaultError
	}

	return "", nil
}

func (m *mockDockerClient) setExecResult(containerID string, cmd []string, output string, err error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	cmdKey := fmt.Sprintf("%s:%v", containerID, cmd)
	m.execResults[cmdKey] = execResult{output: output, err: err}
}

func (m *mockDockerClient) setDefaultError(err error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.defaultError = err
}

func (m *mockDockerClient) getExecCalls() []execCall {
	m.mu.Lock()
	defer m.mu.Unlock()
	return append([]execCall{}, m.execCalls...)
}

// mockConfigTemplateServiceForInjection mocks ConfigTemplateService for injection tests
type mockConfigTemplateServiceForInjection struct {
	mu        sync.RWMutex
	templates map[uint]*models.ClaudeConfigTemplate
}

func newMockConfigTemplateServiceForInjection() *mockConfigTemplateServiceForInjection {
	return &mockConfigTemplateServiceForInjection{
		templates: make(map[uint]*models.ClaudeConfigTemplate),
	}
}

func (s *mockConfigTemplateServiceForInjection) addTemplate(template *models.ClaudeConfigTemplate) {
	s.mu.Lock()
	defer s.mu.Unlock()
	// Store template by its ID
	s.templates[template.ID] = template
}

func (s *mockConfigTemplateServiceForInjection) Create(input CreateConfigTemplateInput) (*models.ClaudeConfigTemplate, error) {
	return nil, errors.New("not implemented")
}

func (s *mockConfigTemplateServiceForInjection) GetByID(id uint) (*models.ClaudeConfigTemplate, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	template, exists := s.templates[id]
	if !exists {
		return nil, ErrTemplateNotFound
	}
	return template, nil
}

func (s *mockConfigTemplateServiceForInjection) List(configType *models.ConfigType) ([]models.ClaudeConfigTemplate, error) {
	return nil, errors.New("not implemented")
}

func (s *mockConfigTemplateServiceForInjection) Update(id uint, input UpdateConfigTemplateInput) (*models.ClaudeConfigTemplate, error) {
	return nil, errors.New("not implemented")
}

func (s *mockConfigTemplateServiceForInjection) Delete(id uint) error {
	return errors.New("not implemented")
}

func (s *mockConfigTemplateServiceForInjection) ValidateContent(configType models.ConfigType, content string) error {
	return nil
}

func (s *mockConfigTemplateServiceForInjection) ParseSkillMetadata(content string) (*models.SkillMetadata, error) {
	return &models.SkillMetadata{}, nil
}

func (s *mockConfigTemplateServiceForInjection) ValidateMCPConfig(content string) error {
	return nil
}

// testableConfigInjectionService wraps configInjectionServiceImpl for testing
// It uses the mock docker client instead of the real one
type testableConfigInjectionService struct {
	mockDocker      *mockDockerClient
	templateService ConfigTemplateService
}

func newTestableConfigInjectionService(mockDocker *mockDockerClient, templateService ConfigTemplateService) *testableConfigInjectionService {
	return &testableConfigInjectionService{
		mockDocker:      mockDocker,
		templateService: templateService,
	}
}

func (s *testableConfigInjectionService) InjectConfigs(ctx context.Context, containerID string, templateIDs []uint) (*models.InjectionStatus, error) {
	status := &models.InjectionStatus{
		ContainerID: containerID,
		Successful:  []string{},
		Failed:      []models.FailedTemplate{},
		Warnings:    []string{},
	}

	if len(templateIDs) == 0 {
		return status, nil
	}

	var mcpConfigs []MCPServerConfig

	for _, templateID := range templateIDs {
		template, err := s.templateService.GetByID(templateID)
		if err != nil {
			status.Failed = append(status.Failed, models.FailedTemplate{
				TemplateName: fmt.Sprintf("unknown (ID: %d)", templateID),
				ConfigType:   "UNKNOWN",
				Reason:       fmt.Sprintf("failed to retrieve template: %v", err),
			})
			continue
		}

		if err := s.injectSingleConfig(ctx, containerID, template, &mcpConfigs); err != nil {
			status.Failed = append(status.Failed, models.FailedTemplate{
				TemplateName: template.Name,
				ConfigType:   string(template.ConfigType),
				Reason:       err.Error(),
			})
			continue
		}

		if template.ConfigType != models.ConfigTypeMCP {
			status.Successful = append(status.Successful, template.Name)
		}
	}

	if len(mcpConfigs) > 0 {
		if err := s.InjectMCP(ctx, containerID, mcpConfigs); err != nil {
			for _, cfg := range mcpConfigs {
				status.Failed = append(status.Failed, models.FailedTemplate{
					TemplateName: cfg.Name,
					ConfigType:   string(models.ConfigTypeMCP),
					Reason:       fmt.Sprintf("failed to inject MCP config: %v", err),
				})
			}
		} else {
			for _, cfg := range mcpConfigs {
				status.Successful = append(status.Successful, cfg.Name)
			}
		}
	}

	return status, nil
}

func (s *testableConfigInjectionService) injectSingleConfig(ctx context.Context, containerID string, template *models.ClaudeConfigTemplate, mcpConfigs *[]MCPServerConfig) error {
	switch template.ConfigType {
	case models.ConfigTypeClaudeMD:
		return s.InjectClaudeMD(ctx, containerID, template.Content)
	case models.ConfigTypeSkill:
		return s.InjectSkill(ctx, containerID, template.Name, template.Content)
	case models.ConfigTypeMCP:
		mcpConfig, err := s.parseMCPConfig(template.Name, template.Content)
		if err != nil {
			return fmt.Errorf("failed to parse MCP config: %w", err)
		}
		*mcpConfigs = append(*mcpConfigs, *mcpConfig)
		return nil
	case models.ConfigTypeCommand:
		return s.InjectCommand(ctx, containerID, template.Name, template.Content)
	default:
		return fmt.Errorf("unknown config type: %s", template.ConfigType)
	}
}

func (s *testableConfigInjectionService) parseMCPConfig(name string, content string) (*MCPServerConfig, error) {
	var config MCPServerConfig
	if err := json.Unmarshal([]byte(content), &config); err != nil {
		return nil, fmt.Errorf("invalid MCP JSON: %w", err)
	}
	config.Name = name
	return &config, nil
}

func (s *testableConfigInjectionService) InjectClaudeMD(ctx context.Context, containerID string, content string) error {
	if err := s.ensureDirectory(ctx, containerID, "$HOME/.claude"); err != nil {
		return fmt.Errorf("failed to create ~/.claude directory: %w", err)
	}
	return s.writeFile(ctx, containerID, "$HOME/.claude/CLAUDE.md", content)
}

func (s *testableConfigInjectionService) InjectSkill(ctx context.Context, containerID string, name string, content string) error {
	skillDir := fmt.Sprintf("$HOME/.claude/skills/%s", name)
	if err := s.ensureDirectory(ctx, containerID, skillDir); err != nil {
		return fmt.Errorf("failed to create skill directory %s: %w", skillDir, err)
	}
	skillPath := fmt.Sprintf("%s/SKILL.md", skillDir)
	return s.writeFile(ctx, containerID, skillPath, content)
}

func (s *testableConfigInjectionService) InjectMCP(ctx context.Context, containerID string, configs []MCPServerConfig) error {
	if len(configs) == 0 {
		return nil
	}

	mcpServers := make(map[string]interface{})
	for _, cfg := range configs {
		serverConfig := map[string]interface{}{
			"command": cfg.Command,
			"args":    cfg.Args,
		}
		if len(cfg.Env) > 0 {
			serverConfig["env"] = cfg.Env
		}
		mcpServers[cfg.Name] = serverConfig
	}

	claudeJSON := map[string]interface{}{
		"mcpServers": mcpServers,
	}

	jsonContent, err := json.MarshalIndent(claudeJSON, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal MCP config: %w", err)
	}

	return s.writeFile(ctx, containerID, "$HOME/.claude.json", string(jsonContent))
}

func (s *testableConfigInjectionService) InjectCommand(ctx context.Context, containerID string, name string, content string) error {
	if err := s.ensureDirectory(ctx, containerID, "$HOME/.claude/commands"); err != nil {
		return fmt.Errorf("failed to create ~/.claude/commands directory: %w", err)
	}
	commandPath := fmt.Sprintf("$HOME/.claude/commands/%s.md", name)
	return s.writeFile(ctx, containerID, commandPath, content)
}

func (s *testableConfigInjectionService) ensureDirectory(ctx context.Context, containerID string, path string) error {
	cmd := []string{"sh", "-c", fmt.Sprintf("mkdir -p %s", path)}
	_, err := s.mockDocker.ExecInContainer(ctx, containerID, cmd)
	if err != nil {
		return fmt.Errorf("failed to create directory %s: %w", path, err)
	}
	return nil
}

func (s *testableConfigInjectionService) writeFile(ctx context.Context, containerID string, path string, content string) error {
	cmd := []string{"sh", "-c", fmt.Sprintf("cat > %s << 'CONFIGEOF'\n%s\nCONFIGEOF", path, content)}
	_, err := s.mockDocker.ExecInContainer(ctx, containerID, cmd)
	if err != nil {
		return fmt.Errorf("failed to write file %s: %w", path, err)
	}
	return nil
}

// ============================================================================
// Test 1: InjectConfigs - All Templates Succeed
// ============================================================================

func TestInjectConfigs_AllTemplatesSucceed(t *testing.T) {
	mockDocker := newMockDockerClient()
	mockTemplateService := newMockConfigTemplateServiceForInjection()

	// Add test templates with IDs set before adding
	template1 := &models.ClaudeConfigTemplate{
		Name:       "my-claude-md",
		ConfigType: models.ConfigTypeClaudeMD,
		Content:    "# Project Description",
	}
	template1.ID = 1
	mockTemplateService.addTemplate(template1)

	template2 := &models.ClaudeConfigTemplate{
		Name:       "my-skill",
		ConfigType: models.ConfigTypeSkill,
		Content:    "# Skill Content",
	}
	template2.ID = 2
	mockTemplateService.addTemplate(template2)

	template3 := &models.ClaudeConfigTemplate{
		Name:       "my-command",
		ConfigType: models.ConfigTypeCommand,
		Content:    "# Command Content",
	}
	template3.ID = 3
	mockTemplateService.addTemplate(template3)

	service := newTestableConfigInjectionService(mockDocker, mockTemplateService)

	ctx := context.Background()
	status, err := service.InjectConfigs(ctx, "test-container-123", []uint{1, 2, 3})

	if err != nil {
		t.Fatalf("InjectConfigs returned error: %v", err)
	}

	if status == nil {
		t.Fatal("Expected non-nil status")
	}

	// Verify all templates are in successful list
	if len(status.Successful) != 3 {
		t.Errorf("Expected 3 successful templates, got %d", len(status.Successful))
	}

	// Verify no failures
	if len(status.Failed) != 0 {
		t.Errorf("Expected 0 failed templates, got %d", len(status.Failed))
	}

	// Verify container ID is set
	if status.ContainerID != "test-container-123" {
		t.Errorf("Expected container ID 'test-container-123', got %q", status.ContainerID)
	}
}

// ============================================================================
// Test 2: InjectConfigs - Some Templates Fail (Partial Success)
// ============================================================================

func TestInjectConfigs_PartialSuccess(t *testing.T) {
	mockDocker := newMockDockerClient()
	mockTemplateService := newMockConfigTemplateServiceForInjection()

	// Add test templates - only template 1 and 3 exist
	template1 := &models.ClaudeConfigTemplate{
		Name:       "existing-template",
		ConfigType: models.ConfigTypeClaudeMD,
		Content:    "# Content",
	}
	template1.ID = 1
	mockTemplateService.addTemplate(template1)

	template3 := &models.ClaudeConfigTemplate{
		Name:       "another-existing",
		ConfigType: models.ConfigTypeCommand,
		Content:    "# Command",
	}
	template3.ID = 3
	mockTemplateService.addTemplate(template3)

	service := newTestableConfigInjectionService(mockDocker, mockTemplateService)

	ctx := context.Background()
	// Template ID 2 doesn't exist, should fail
	status, err := service.InjectConfigs(ctx, "test-container", []uint{1, 2, 3})

	if err != nil {
		t.Fatalf("InjectConfigs returned error: %v", err)
	}

	// Verify 2 successful templates
	if len(status.Successful) != 2 {
		t.Errorf("Expected 2 successful templates, got %d", len(status.Successful))
	}

	// Verify 1 failed template
	if len(status.Failed) != 1 {
		t.Errorf("Expected 1 failed template, got %d", len(status.Failed))
	}

	// Verify the failed template has correct info
	if len(status.Failed) > 0 {
		failed := status.Failed[0]
		if failed.ConfigType != "UNKNOWN" {
			t.Errorf("Expected config type 'UNKNOWN' for not found template, got %q", failed.ConfigType)
		}
		if failed.Reason == "" {
			t.Error("Expected non-empty reason for failed template")
		}
	}
}

// ============================================================================
// Test 3: InjectConfigs - All Templates Fail
// ============================================================================

func TestInjectConfigs_AllTemplatesFail(t *testing.T) {
	mockDocker := newMockDockerClient()
	mockTemplateService := newMockConfigTemplateServiceForInjection()

	// Don't add any templates - all IDs will fail to retrieve

	service := newTestableConfigInjectionService(mockDocker, mockTemplateService)

	ctx := context.Background()
	status, err := service.InjectConfigs(ctx, "test-container", []uint{1, 2, 3})

	if err != nil {
		t.Fatalf("InjectConfigs returned error: %v", err)
	}

	// Verify no successful templates
	if len(status.Successful) != 0 {
		t.Errorf("Expected 0 successful templates, got %d", len(status.Successful))
	}

	// Verify all 3 templates failed
	if len(status.Failed) != 3 {
		t.Errorf("Expected 3 failed templates, got %d", len(status.Failed))
	}

	// Verify each failed template has a reason
	for i, failed := range status.Failed {
		if failed.Reason == "" {
			t.Errorf("Failed template %d has empty reason", i)
		}
		if failed.ConfigType != "UNKNOWN" {
			t.Errorf("Expected config type 'UNKNOWN' for failed template %d, got %q", i, failed.ConfigType)
		}
	}
}

// ============================================================================
// Test 4: InjectConfigs - Empty Template List Returns Empty Status
// ============================================================================

func TestInjectConfigs_EmptyTemplateList(t *testing.T) {
	mockDocker := newMockDockerClient()
	mockTemplateService := newMockConfigTemplateServiceForInjection()

	service := newTestableConfigInjectionService(mockDocker, mockTemplateService)

	ctx := context.Background()
	status, err := service.InjectConfigs(ctx, "test-container", []uint{})

	if err != nil {
		t.Fatalf("InjectConfigs returned error: %v", err)
	}

	if status == nil {
		t.Fatal("Expected non-nil status")
	}

	if len(status.Successful) != 0 {
		t.Errorf("Expected 0 successful templates, got %d", len(status.Successful))
	}

	if len(status.Failed) != 0 {
		t.Errorf("Expected 0 failed templates, got %d", len(status.Failed))
	}

	if status.ContainerID != "test-container" {
		t.Errorf("Expected container ID 'test-container', got %q", status.ContainerID)
	}
}

// ============================================================================
// Test 5: InjectConfigs - Template Not Found Error is Captured in Failed List
// ============================================================================

func TestInjectConfigs_TemplateNotFoundCapturedInFailed(t *testing.T) {
	mockDocker := newMockDockerClient()
	mockTemplateService := newMockConfigTemplateServiceForInjection()

	// Add only one template
	template1 := &models.ClaudeConfigTemplate{
		Name:       "existing-template",
		ConfigType: models.ConfigTypeClaudeMD,
		Content:    "# Content",
	}
	template1.ID = 1
	mockTemplateService.addTemplate(template1)

	service := newTestableConfigInjectionService(mockDocker, mockTemplateService)

	ctx := context.Background()
	// Template ID 999 doesn't exist
	status, err := service.InjectConfigs(ctx, "test-container", []uint{1, 999})

	if err != nil {
		t.Fatalf("InjectConfigs returned error: %v", err)
	}

	// Verify 1 successful
	if len(status.Successful) != 1 {
		t.Errorf("Expected 1 successful template, got %d", len(status.Successful))
	}

	// Verify 1 failed
	if len(status.Failed) != 1 {
		t.Errorf("Expected 1 failed template, got %d", len(status.Failed))
	}

	// Verify the failed template info
	if len(status.Failed) > 0 {
		failed := status.Failed[0]
		// Template name should indicate unknown with ID
		if failed.TemplateName != "unknown (ID: 999)" {
			t.Errorf("Expected template name 'unknown (ID: 999)', got %q", failed.TemplateName)
		}
		// Config type should be UNKNOWN since we couldn't retrieve the template
		if failed.ConfigType != "UNKNOWN" {
			t.Errorf("Expected config type 'UNKNOWN', got %q", failed.ConfigType)
		}
		// Reason should mention retrieval failure
		if failed.Reason == "" {
			t.Error("Expected non-empty reason")
		}
	}
}

// ============================================================================
// Test 6: InjectionStatus - Successful List Contains Correct Template Names
// ============================================================================

func TestInjectionStatus_SuccessfulListContainsCorrectNames(t *testing.T) {
	mockDocker := newMockDockerClient()
	mockTemplateService := newMockConfigTemplateServiceForInjection()

	// Add templates with specific names
	template1 := &models.ClaudeConfigTemplate{
		Name:       "project-readme",
		ConfigType: models.ConfigTypeClaudeMD,
		Content:    "# Project README",
	}
	template1.ID = 1
	mockTemplateService.addTemplate(template1)

	template2 := &models.ClaudeConfigTemplate{
		Name:       "code-review-skill",
		ConfigType: models.ConfigTypeSkill,
		Content:    "# Code Review Skill",
	}
	template2.ID = 2
	mockTemplateService.addTemplate(template2)

	template3 := &models.ClaudeConfigTemplate{
		Name:       "deploy-command",
		ConfigType: models.ConfigTypeCommand,
		Content:    "# Deploy Command",
	}
	template3.ID = 3
	mockTemplateService.addTemplate(template3)

	service := newTestableConfigInjectionService(mockDocker, mockTemplateService)

	ctx := context.Background()
	status, err := service.InjectConfigs(ctx, "test-container", []uint{1, 2, 3})

	if err != nil {
		t.Fatalf("InjectConfigs returned error: %v", err)
	}

	// Verify successful list contains the exact template names
	expectedNames := map[string]bool{
		"project-readme":    false,
		"code-review-skill": false,
		"deploy-command":    false,
	}

	for _, name := range status.Successful {
		if _, exists := expectedNames[name]; exists {
			expectedNames[name] = true
		} else {
			t.Errorf("Unexpected template name in successful list: %q", name)
		}
	}

	for name, found := range expectedNames {
		if !found {
			t.Errorf("Expected template name %q not found in successful list", name)
		}
	}
}

// ============================================================================
// Test 7: InjectionStatus - Failed List Contains Template Name, Config Type, and Reason
// ============================================================================

func TestInjectionStatus_FailedListContainsCompleteInfo(t *testing.T) {
	mockDocker := newMockDockerClient()
	// Set docker to fail all exec calls
	mockDocker.setDefaultError(errors.New("docker exec failed: container not running"))

	mockTemplateService := newMockConfigTemplateServiceForInjection()

	// Add a template that will fail during injection (docker exec fails)
	template1 := &models.ClaudeConfigTemplate{
		Name:       "failing-template",
		ConfigType: models.ConfigTypeClaudeMD,
		Content:    "# Content",
	}
	template1.ID = 1
	mockTemplateService.addTemplate(template1)

	service := newTestableConfigInjectionService(mockDocker, mockTemplateService)

	ctx := context.Background()
	status, err := service.InjectConfigs(ctx, "test-container", []uint{1})

	if err != nil {
		t.Fatalf("InjectConfigs returned error: %v", err)
	}

	// Verify 1 failed template
	if len(status.Failed) != 1 {
		t.Fatalf("Expected 1 failed template, got %d", len(status.Failed))
	}

	failed := status.Failed[0]

	// Verify template name is captured
	if failed.TemplateName != "failing-template" {
		t.Errorf("Expected template name 'failing-template', got %q", failed.TemplateName)
	}

	// Verify config type is captured
	if failed.ConfigType != string(models.ConfigTypeClaudeMD) {
		t.Errorf("Expected config type %q, got %q", models.ConfigTypeClaudeMD, failed.ConfigType)
	}

	// Verify reason is captured and non-empty
	if failed.Reason == "" {
		t.Error("Expected non-empty reason for failed template")
	}
}

// ============================================================================
// Test 8: Error Recovery - Single Failure Doesn't Stop Other Injections
// ============================================================================

func TestErrorRecovery_SingleFailureDoesntStopOthers(t *testing.T) {
	mockDocker := newMockDockerClient()
	mockTemplateService := newMockConfigTemplateServiceForInjection()

	// Add 3 templates - template 2 will fail (not found)
	template1 := &models.ClaudeConfigTemplate{
		Name:       "first-template",
		ConfigType: models.ConfigTypeClaudeMD,
		Content:    "# First",
	}
	template1.ID = 1
	mockTemplateService.addTemplate(template1)

	// Template ID 2 is NOT added - will fail

	template3 := &models.ClaudeConfigTemplate{
		Name:       "third-template",
		ConfigType: models.ConfigTypeCommand,
		Content:    "# Third",
	}
	template3.ID = 3
	mockTemplateService.addTemplate(template3)

	service := newTestableConfigInjectionService(mockDocker, mockTemplateService)

	ctx := context.Background()
	// Inject templates 1, 2, 3 - template 2 will fail but 1 and 3 should succeed
	status, err := service.InjectConfigs(ctx, "test-container", []uint{1, 2, 3})

	if err != nil {
		t.Fatalf("InjectConfigs returned error: %v", err)
	}

	// Verify that despite template 2 failing, templates 1 and 3 succeeded
	if len(status.Successful) != 2 {
		t.Errorf("Expected 2 successful templates (error recovery), got %d", len(status.Successful))
	}

	// Verify template 2 is in failed list
	if len(status.Failed) != 1 {
		t.Errorf("Expected 1 failed template, got %d", len(status.Failed))
	}

	// Verify the successful templates are the correct ones
	successfulNames := make(map[string]bool)
	for _, name := range status.Successful {
		successfulNames[name] = true
	}

	if !successfulNames["first-template"] {
		t.Error("Expected 'first-template' to be in successful list")
	}
	if !successfulNames["third-template"] {
		t.Error("Expected 'third-template' to be in successful list")
	}
}

// ============================================================================
// Additional Test: MCP Templates Are Merged and Injected Together
// ============================================================================

func TestInjectConfigs_MCPTemplatesMergedTogether(t *testing.T) {
	mockDocker := newMockDockerClient()
	mockTemplateService := newMockConfigTemplateServiceForInjection()

	// Add two MCP templates
	template1 := &models.ClaudeConfigTemplate{
		Name:       "mcp-server-1",
		ConfigType: models.ConfigTypeMCP,
		Content:    `{"command": "node", "args": ["server1.js"]}`,
	}
	template1.ID = 1
	mockTemplateService.addTemplate(template1)

	template2 := &models.ClaudeConfigTemplate{
		Name:       "mcp-server-2",
		ConfigType: models.ConfigTypeMCP,
		Content:    `{"command": "python", "args": ["-m", "server2"]}`,
	}
	template2.ID = 2
	mockTemplateService.addTemplate(template2)

	service := newTestableConfigInjectionService(mockDocker, mockTemplateService)

	ctx := context.Background()
	status, err := service.InjectConfigs(ctx, "test-container", []uint{1, 2})

	if err != nil {
		t.Fatalf("InjectConfigs returned error: %v", err)
	}

	// Both MCP templates should be in successful list
	if len(status.Successful) != 2 {
		t.Errorf("Expected 2 successful templates, got %d", len(status.Successful))
	}

	// Verify both MCP server names are in successful list
	successfulNames := make(map[string]bool)
	for _, name := range status.Successful {
		successfulNames[name] = true
	}

	if !successfulNames["mcp-server-1"] {
		t.Error("Expected 'mcp-server-1' to be in successful list")
	}
	if !successfulNames["mcp-server-2"] {
		t.Error("Expected 'mcp-server-2' to be in successful list")
	}
}

// ============================================================================
// Additional Test: Docker Exec Failure During Injection
// ============================================================================

func TestInjectConfigs_DockerExecFailureCaptured(t *testing.T) {
	mockDocker := newMockDockerClient()
	mockDocker.setDefaultError(errors.New("permission denied"))

	mockTemplateService := newMockConfigTemplateServiceForInjection()

	template1 := &models.ClaudeConfigTemplate{
		Name:       "test-skill",
		ConfigType: models.ConfigTypeSkill,
		Content:    "# Skill Content",
	}
	template1.ID = 1
	mockTemplateService.addTemplate(template1)

	service := newTestableConfigInjectionService(mockDocker, mockTemplateService)

	ctx := context.Background()
	status, err := service.InjectConfigs(ctx, "test-container", []uint{1})

	if err != nil {
		t.Fatalf("InjectConfigs returned error: %v", err)
	}

	// Template should be in failed list due to docker exec failure
	if len(status.Failed) != 1 {
		t.Errorf("Expected 1 failed template, got %d", len(status.Failed))
	}

	if len(status.Failed) > 0 {
		failed := status.Failed[0]
		if failed.TemplateName != "test-skill" {
			t.Errorf("Expected template name 'test-skill', got %q", failed.TemplateName)
		}
		if failed.ConfigType != string(models.ConfigTypeSkill) {
			t.Errorf("Expected config type %q, got %q", models.ConfigTypeSkill, failed.ConfigType)
		}
	}
}


// ============================================================================
// InjectClaudeMD Tests
// ============================================================================

// TestInjectClaudeMD_CorrectPath tests that InjectClaudeMD writes to ~/.claude/CLAUDE.md
func TestInjectClaudeMD_CorrectPath(t *testing.T) {
	mockDocker := newMockDockerClient()
	mockTemplateService := newMockConfigTemplateServiceForInjection()
	service := newTestableConfigInjectionService(mockDocker, mockTemplateService)

	ctx := context.Background()
	content := "# Project Description\n\nThis is a test project."
	err := service.InjectClaudeMD(ctx, "test-container", content)

	if err != nil {
		t.Fatalf("InjectClaudeMD returned error: %v", err)
	}

	// Verify the correct path was used
	calls := mockDocker.getExecCalls()
	foundWriteCall := false
	for _, call := range calls {
		cmdStr := fmt.Sprintf("%v", call.cmd)
		if containsStr(cmdStr, "$HOME/.claude/CLAUDE.md") {
			foundWriteCall = true
			break
		}
	}

	if !foundWriteCall {
		t.Error("Expected write call to $HOME/.claude/CLAUDE.md")
	}
}

// TestInjectClaudeMD_CreatesParentDirectory tests that ~/.claude/ directory is created
func TestInjectClaudeMD_CreatesParentDirectory(t *testing.T) {
	mockDocker := newMockDockerClient()
	mockTemplateService := newMockConfigTemplateServiceForInjection()
	service := newTestableConfigInjectionService(mockDocker, mockTemplateService)

	ctx := context.Background()
	err := service.InjectClaudeMD(ctx, "test-container", "# Content")

	if err != nil {
		t.Fatalf("InjectClaudeMD returned error: %v", err)
	}

	// Verify mkdir -p was called for ~/.claude
	calls := mockDocker.getExecCalls()
	foundMkdirCall := false
	for _, call := range calls {
		cmdStr := fmt.Sprintf("%v", call.cmd)
		if containsStr(cmdStr, "mkdir -p") && containsStr(cmdStr, "$HOME/.claude") {
			foundMkdirCall = true
			break
		}
	}

	if !foundMkdirCall {
		t.Error("Expected mkdir -p call for $HOME/.claude directory")
	}
}

// ============================================================================
// InjectSkill Tests
// ============================================================================

// TestInjectSkill_CorrectPath tests that InjectSkill writes to ~/.claude/skills/{name}/SKILL.md
func TestInjectSkill_CorrectPath(t *testing.T) {
	mockDocker := newMockDockerClient()
	mockTemplateService := newMockConfigTemplateServiceForInjection()
	service := newTestableConfigInjectionService(mockDocker, mockTemplateService)

	ctx := context.Background()
	err := service.InjectSkill(ctx, "test-container", "code-review", "# Code Review Skill")

	if err != nil {
		t.Fatalf("InjectSkill returned error: %v", err)
	}

	// Verify the correct path was used with skill name
	calls := mockDocker.getExecCalls()
	foundWriteCall := false
	for _, call := range calls {
		cmdStr := fmt.Sprintf("%v", call.cmd)
		if containsStr(cmdStr, "$HOME/.claude/skills/code-review/SKILL.md") {
			foundWriteCall = true
			break
		}
	}

	if !foundWriteCall {
		t.Error("Expected write call to $HOME/.claude/skills/code-review/SKILL.md")
	}
}

// TestInjectSkill_SkillNameInPath tests that skill name is included in the path
func TestInjectSkill_SkillNameInPath(t *testing.T) {
	mockDocker := newMockDockerClient()
	mockTemplateService := newMockConfigTemplateServiceForInjection()
	service := newTestableConfigInjectionService(mockDocker, mockTemplateService)

	ctx := context.Background()
	skillName := "my-custom-skill"
	err := service.InjectSkill(ctx, "test-container", skillName, "# Skill Content")

	if err != nil {
		t.Fatalf("InjectSkill returned error: %v", err)
	}

	// Verify skill name is in the path
	calls := mockDocker.getExecCalls()
	foundSkillName := false
	for _, call := range calls {
		cmdStr := fmt.Sprintf("%v", call.cmd)
		if containsStr(cmdStr, skillName) {
			foundSkillName = true
			break
		}
	}

	if !foundSkillName {
		t.Errorf("Expected skill name %q to be in the path", skillName)
	}
}

// TestInjectSkill_CreatesParentDirectory tests that skill directory is created
func TestInjectSkill_CreatesParentDirectory(t *testing.T) {
	mockDocker := newMockDockerClient()
	mockTemplateService := newMockConfigTemplateServiceForInjection()
	service := newTestableConfigInjectionService(mockDocker, mockTemplateService)

	ctx := context.Background()
	err := service.InjectSkill(ctx, "test-container", "test-skill", "# Content")

	if err != nil {
		t.Fatalf("InjectSkill returned error: %v", err)
	}

	// Verify mkdir -p was called for skill directory
	calls := mockDocker.getExecCalls()
	foundMkdirCall := false
	for _, call := range calls {
		cmdStr := fmt.Sprintf("%v", call.cmd)
		if containsStr(cmdStr, "mkdir -p") && containsStr(cmdStr, "$HOME/.claude/skills/test-skill") {
			foundMkdirCall = true
			break
		}
	}

	if !foundMkdirCall {
		t.Error("Expected mkdir -p call for skill directory")
	}
}

// ============================================================================
// InjectMCP Tests
// ============================================================================

// TestInjectMCP_SingleConfig tests that single MCP config generates correct JSON
func TestInjectMCP_SingleConfig(t *testing.T) {
	mockDocker := newMockDockerClient()
	mockTemplateService := newMockConfigTemplateServiceForInjection()
	service := newTestableConfigInjectionService(mockDocker, mockTemplateService)

	ctx := context.Background()
	configs := []MCPServerConfig{
		{
			Name:    "test-server",
			Command: "node",
			Args:    []string{"server.js"},
		},
	}

	err := service.InjectMCP(ctx, "test-container", configs)

	if err != nil {
		t.Fatalf("InjectMCP returned error: %v", err)
	}

	// Verify write was called
	calls := mockDocker.getExecCalls()
	foundWriteCall := false
	for _, call := range calls {
		cmdStr := fmt.Sprintf("%v", call.cmd)
		if containsStr(cmdStr, "$HOME/.claude.json") && containsStr(cmdStr, "mcpServers") {
			foundWriteCall = true
			break
		}
	}

	if !foundWriteCall {
		t.Error("Expected write call to $HOME/.claude.json with mcpServers")
	}
}

// TestInjectMCP_MultipleConfigsMerged tests that multiple MCP configs are merged
func TestInjectMCP_MultipleConfigsMerged(t *testing.T) {
	mockDocker := newMockDockerClient()
	mockTemplateService := newMockConfigTemplateServiceForInjection()
	service := newTestableConfigInjectionService(mockDocker, mockTemplateService)

	ctx := context.Background()
	configs := []MCPServerConfig{
		{
			Name:    "server-1",
			Command: "node",
			Args:    []string{"server1.js"},
		},
		{
			Name:    "server-2",
			Command: "python",
			Args:    []string{"-m", "server2"},
		},
	}

	err := service.InjectMCP(ctx, "test-container", configs)

	if err != nil {
		t.Fatalf("InjectMCP returned error: %v", err)
	}

	// Verify both servers are in the output
	calls := mockDocker.getExecCalls()
	foundServer1 := false
	foundServer2 := false
	for _, call := range calls {
		cmdStr := fmt.Sprintf("%v", call.cmd)
		if containsStr(cmdStr, "server-1") {
			foundServer1 = true
		}
		if containsStr(cmdStr, "server-2") {
			foundServer2 = true
		}
	}

	if !foundServer1 {
		t.Error("Expected server-1 to be in the merged config")
	}
	if !foundServer2 {
		t.Error("Expected server-2 to be in the merged config")
	}
}

// TestInjectMCP_OptionalFieldsIncluded tests that optional fields are included when present
func TestInjectMCP_OptionalFieldsIncluded(t *testing.T) {
	mockDocker := newMockDockerClient()
	mockTemplateService := newMockConfigTemplateServiceForInjection()
	service := newTestableConfigInjectionService(mockDocker, mockTemplateService)

	ctx := context.Background()
	configs := []MCPServerConfig{
		{
			Name:    "full-server",
			Command: "node",
			Args:    []string{"server.js"},
			Env: map[string]string{
				"API_KEY": "test-key",
			},
		},
	}

	err := service.InjectMCP(ctx, "test-container", configs)

	if err != nil {
		t.Fatalf("InjectMCP returned error: %v", err)
	}

	// Verify env field is in the output
	calls := mockDocker.getExecCalls()
	foundEnv := false
	for _, call := range calls {
		cmdStr := fmt.Sprintf("%v", call.cmd)
		if containsStr(cmdStr, "env") && containsStr(cmdStr, "API_KEY") {
			foundEnv = true
			break
		}
	}

	if !foundEnv {
		t.Error("Expected env field to be included in the config")
	}
}

// ============================================================================
// InjectCommand Tests
// ============================================================================

// TestInjectCommand_CorrectPath tests that InjectCommand writes to ~/.claude/commands/{name}.md
func TestInjectCommand_CorrectPath(t *testing.T) {
	mockDocker := newMockDockerClient()
	mockTemplateService := newMockConfigTemplateServiceForInjection()
	service := newTestableConfigInjectionService(mockDocker, mockTemplateService)

	ctx := context.Background()
	err := service.InjectCommand(ctx, "test-container", "deploy", "# Deploy Command")

	if err != nil {
		t.Fatalf("InjectCommand returned error: %v", err)
	}

	// Verify the correct path was used
	calls := mockDocker.getExecCalls()
	foundWriteCall := false
	for _, call := range calls {
		cmdStr := fmt.Sprintf("%v", call.cmd)
		if containsStr(cmdStr, "$HOME/.claude/commands/deploy.md") {
			foundWriteCall = true
			break
		}
	}

	if !foundWriteCall {
		t.Error("Expected write call to $HOME/.claude/commands/deploy.md")
	}
}

// TestInjectCommand_CreatesParentDirectory tests that commands directory is created
func TestInjectCommand_CreatesParentDirectory(t *testing.T) {
	mockDocker := newMockDockerClient()
	mockTemplateService := newMockConfigTemplateServiceForInjection()
	service := newTestableConfigInjectionService(mockDocker, mockTemplateService)

	ctx := context.Background()
	err := service.InjectCommand(ctx, "test-container", "test-cmd", "# Content")

	if err != nil {
		t.Fatalf("InjectCommand returned error: %v", err)
	}

	// Verify mkdir -p was called for commands directory
	calls := mockDocker.getExecCalls()
	foundMkdirCall := false
	for _, call := range calls {
		cmdStr := fmt.Sprintf("%v", call.cmd)
		if containsStr(cmdStr, "mkdir -p") && containsStr(cmdStr, "$HOME/.claude/commands") {
			foundMkdirCall = true
			break
		}
	}

	if !foundMkdirCall {
		t.Error("Expected mkdir -p call for commands directory")
	}
}

// ============================================================================
// Auto-Directory Creation Tests
// ============================================================================

// TestAutoDirectoryCreation_DirectoryCreatedWhenNotExists tests directory creation
func TestAutoDirectoryCreation_DirectoryCreatedWhenNotExists(t *testing.T) {
	mockDocker := newMockDockerClient()
	mockTemplateService := newMockConfigTemplateServiceForInjection()
	service := newTestableConfigInjectionService(mockDocker, mockTemplateService)

	ctx := context.Background()
	err := service.InjectClaudeMD(ctx, "test-container", "# Content")

	if err != nil {
		t.Fatalf("InjectClaudeMD returned error: %v", err)
	}

	// Verify mkdir -p was called before write
	calls := mockDocker.getExecCalls()
	mkdirIndex := -1
	writeIndex := -1

	for i, call := range calls {
		cmdStr := fmt.Sprintf("%v", call.cmd)
		if containsStr(cmdStr, "mkdir -p") {
			mkdirIndex = i
		}
		if containsStr(cmdStr, "cat >") {
			writeIndex = i
		}
	}

	if mkdirIndex == -1 {
		t.Error("Expected mkdir -p call")
	}
	if writeIndex == -1 {
		t.Error("Expected write call")
	}
	if mkdirIndex >= writeIndex {
		t.Error("Expected mkdir -p to be called before write")
	}
}

// TestAutoDirectoryCreation_PermissionErrorCaptured tests permission error handling
func TestAutoDirectoryCreation_PermissionErrorCaptured(t *testing.T) {
	mockDocker := newMockDockerClient()
	mockDocker.setDefaultError(errors.New("permission denied"))

	mockTemplateService := newMockConfigTemplateServiceForInjection()
	service := newTestableConfigInjectionService(mockDocker, mockTemplateService)

	ctx := context.Background()
	err := service.InjectClaudeMD(ctx, "test-container", "# Content")

	if err == nil {
		t.Fatal("Expected error for permission denied")
	}

	// Verify error message contains useful information
	errStr := err.Error()
	if !containsStr(errStr, "permission denied") && !containsStr(errStr, "failed") {
		t.Errorf("Expected error to contain 'permission denied' or 'failed', got: %v", err)
	}
}

// Helper function for string contains check (injection tests)
func containsStr(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsSubstrHelper(s, substr))
}

func containsSubstrHelper(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
