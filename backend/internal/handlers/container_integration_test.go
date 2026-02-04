package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"cc-platform/internal/models"
	"cc-platform/internal/services"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// ============================================================================
// Container Integration Test Setup
// ============================================================================

// containerIntegrationTestDBCounter is used to generate unique database names
var containerIntegrationTestDBCounter int

// setupContainerIntegrationTestDB creates an in-memory SQLite database for integration testing
func setupContainerIntegrationTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	containerIntegrationTestDBCounter++
	dbName := fmt.Sprintf("file:container_memdb%d?mode=memory&cache=shared", containerIntegrationTestDBCounter)

	db, err := gorm.Open(sqlite.Open(dbName), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	require.NoError(t, err, "failed to open db")

	// Auto migrate all required models
	err = db.AutoMigrate(
		&models.ClaudeConfigTemplate{},
		&models.Container{},
		&models.ContainerLog{},
	)
	require.NoError(t, err, "failed to migrate")

	return db
}

// mockDockerClientForIntegration is a mock Docker client for integration tests
type mockDockerClientForIntegration struct {
	execResults map[string]string
	execErrors  map[string]error
}

func newMockDockerClientForIntegration() *mockDockerClientForIntegration {
	return &mockDockerClientForIntegration{
		execResults: make(map[string]string),
		execErrors:  make(map[string]error),
	}
}

// mockConfigInjectionService is a mock implementation of ConfigInjectionService for integration tests
type mockConfigInjectionService struct {
	templateService services.ConfigTemplateService
	injectedConfigs map[string][]uint // containerID -> templateIDs
	shouldFail      map[uint]string   // templateID -> error reason (for simulating failures)
}

func newMockConfigInjectionService(templateService services.ConfigTemplateService) *mockConfigInjectionService {
	return &mockConfigInjectionService{
		templateService: templateService,
		injectedConfigs: make(map[string][]uint),
		shouldFail:      make(map[uint]string),
	}
}

func (m *mockConfigInjectionService) InjectConfigs(ctx context.Context, containerID string, templateIDs []uint) (*models.InjectionStatus, error) {
	m.injectedConfigs[containerID] = templateIDs

	status := &models.InjectionStatus{
		ContainerID: containerID,
		Successful:  []string{},
		Failed:      []models.FailedTemplate{},
		Warnings:    []string{},
		InjectedAt:  time.Now(),
	}

	for _, templateID := range templateIDs {
		// Check if this template should fail
		if reason, shouldFail := m.shouldFail[templateID]; shouldFail {
			template, _ := m.templateService.GetByID(templateID)
			templateName := fmt.Sprintf("unknown (ID: %d)", templateID)
			configType := "UNKNOWN"
			if template != nil {
				templateName = template.Name
				configType = string(template.ConfigType)
			}
			status.Failed = append(status.Failed, models.FailedTemplate{
				TemplateName: templateName,
				ConfigType:   configType,
				Reason:       reason,
			})
			continue
		}

		// Get template and mark as successful
		template, err := m.templateService.GetByID(templateID)
		if err != nil {
			status.Failed = append(status.Failed, models.FailedTemplate{
				TemplateName: fmt.Sprintf("unknown (ID: %d)", templateID),
				ConfigType:   "UNKNOWN",
				Reason:       fmt.Sprintf("failed to retrieve template: %v", err),
			})
			continue
		}
		status.Successful = append(status.Successful, template.Name)
	}

	return status, nil
}

func (m *mockConfigInjectionService) InjectClaudeMD(ctx context.Context, containerID string, content string) error {
	return nil
}

func (m *mockConfigInjectionService) InjectSkill(ctx context.Context, containerID string, name string, content string) error {
	return nil
}

func (m *mockConfigInjectionService) InjectMCP(ctx context.Context, containerID string, configs []services.MCPServerConfig) error {
	return nil
}

func (m *mockConfigInjectionService) InjectCommand(ctx context.Context, containerID string, name string, content string) error {
	return nil
}

// mockContainerServiceForIntegration is a mock container service that uses real DB and mock injection
type mockContainerServiceForIntegration struct {
	db                     *gorm.DB
	templateService        services.ConfigTemplateService
	configInjectionService *mockConfigInjectionService
	nextDockerID           int
}

func newMockContainerServiceForIntegration(db *gorm.DB, templateService services.ConfigTemplateService, injectionService *mockConfigInjectionService) *mockContainerServiceForIntegration {
	return &mockContainerServiceForIntegration{
		db:                     db,
		templateService:        templateService,
		configInjectionService: injectionService,
		nextDockerID:           1,
	}
}

func (m *mockContainerServiceForIntegration) CreateContainer(ctx context.Context, input services.CreateContainerInput) (*models.Container, error) {
	// Generate mock Docker ID
	dockerID := fmt.Sprintf("mock-docker-%d", m.nextDockerID)
	m.nextDockerID++

	// Determine WorkDir
	workDir := "/app"
	if !input.SkipGitRepo && input.GitRepoName != "" {
		workDir = "/workspace/" + input.GitRepoName
	}

	// Create container in database
	container := &models.Container{
		DockerID:       dockerID,
		Name:           input.Name,
		Status:         models.ContainerStatusCreated,
		InitStatus:     models.InitStatusPending,
		GitRepoURL:     input.GitRepoURL,
		GitRepoName:    input.GitRepoName,
		WorkDir:        workDir,
		SkipGitRepo:    input.SkipGitRepo,
		EnableYoloMode: input.EnableYoloMode,
	}

	if err := m.db.Create(container).Error; err != nil {
		return nil, err
	}

	// Collect all template IDs for config injection
	var templateIDs []uint
	if input.SelectedClaudeMD != nil {
		templateIDs = append(templateIDs, *input.SelectedClaudeMD)
	}
	templateIDs = append(templateIDs, input.SelectedSkills...)
	templateIDs = append(templateIDs, input.SelectedMCPs...)
	templateIDs = append(templateIDs, input.SelectedCommands...)

	// Inject configs if any templates were selected
	if len(templateIDs) > 0 && m.configInjectionService != nil {
		injectionStatus, err := m.configInjectionService.InjectConfigs(ctx, dockerID, templateIDs)
		if err != nil {
			// Log error but don't fail container creation
			container.InjectionStatus = &models.InjectionStatus{
				ContainerID: dockerID,
				Failed: []models.FailedTemplate{{
					TemplateName: "injection",
					ConfigType:   "SYSTEM",
					Reason:       err.Error(),
				}},
				InjectedAt: time.Now(),
			}
		} else {
			container.InjectionStatus = injectionStatus
		}

		// Update container with injection status
		if err := m.db.Model(container).Update("injection_status", container.InjectionStatus).Error; err != nil {
			return nil, err
		}
	}

	// Update status to running (simulating successful start)
	container.Status = models.ContainerStatusRunning
	container.InitStatus = models.InitStatusReady
	if err := m.db.Save(container).Error; err != nil {
		return nil, err
	}

	return container, nil
}

func (m *mockContainerServiceForIntegration) GetContainer(id uint) (*models.Container, error) {
	var container models.Container
	if err := m.db.First(&container, id).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, services.ErrContainerNotFound
		}
		return nil, err
	}
	return &container, nil
}

func (m *mockContainerServiceForIntegration) ListContainers() ([]models.Container, error) {
	var containers []models.Container
	if err := m.db.Find(&containers).Error; err != nil {
		return nil, err
	}
	return containers, nil
}

// containerIntegrationTestHandler wraps the mock service for HTTP testing
type containerIntegrationTestHandler struct {
	containerService *mockContainerServiceForIntegration
	templateService  services.ConfigTemplateService
}

func (h *containerIntegrationTestHandler) CreateContainer(c *gin.Context) {
	var req CreateContainerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	input := services.CreateContainerInput{
		Name:             req.Name,
		GitRepoURL:       req.GitRepoURL,
		GitRepoName:      req.GitRepoName,
		SkipGitRepo:      req.SkipGitRepo,
		EnableYoloMode:   req.EnableYoloMode,
		SelectedClaudeMD: req.SelectedClaudeMD,
		SelectedSkills:   req.SelectedSkills,
		SelectedMCPs:     req.SelectedMCPs,
		SelectedCommands: req.SelectedCommands,
	}

	container, err := h.containerService.CreateContainer(c.Request.Context(), input)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"container": services.ToContainerInfo(container),
		"message":   "Container created and initialization started",
	})
}

func (h *containerIntegrationTestHandler) GetContainer(c *gin.Context) {
	id, err := parseID(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid container ID"})
		return
	}

	container, err := h.containerService.GetContainer(id)
	if err != nil {
		if err == services.ErrContainerNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Container not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get container"})
		return
	}

	c.JSON(http.StatusOK, services.ToContainerInfo(container))
}

// setupContainerIntegrationTestRouter creates a test router with real DB and mock Docker
func setupContainerIntegrationTestRouter(t *testing.T) (*gin.Engine, *gorm.DB, *mockConfigInjectionService) {
	t.Helper()

	db := setupContainerIntegrationTestDB(t)
	templateService := services.NewConfigTemplateService(db)
	injectionService := newMockConfigInjectionService(templateService)
	containerService := newMockContainerServiceForIntegration(db, templateService, injectionService)

	gin.SetMode(gin.TestMode)
	router := gin.New()

	handler := &containerIntegrationTestHandler{
		containerService: containerService,
		templateService:  templateService,
	}

	// Register container routes
	api := router.Group("/api")
	api.POST("/containers", handler.CreateContainer)
	api.GET("/containers/:id", handler.GetContainer)

	// Register config template routes
	configHandler := NewConfigTemplateHandler(templateService)
	configHandler.RegisterRoutes(api)

	return router, db, injectionService
}

// ============================================================================
// Task 14.2: Container Creation Integration Tests
// ============================================================================

// TestIntegration_ContainerCreation_WithAllConfigTypes tests creating a container
// with all four config types selected and verifies InjectionStatus is correct
func TestIntegration_ContainerCreation_WithAllConfigTypes(t *testing.T) {
	router, _, _ := setupContainerIntegrationTestRouter(t)

	// Step 1: Create config templates of each type
	templates := []map[string]interface{}{
		{
			"name":        "my-claude-md",
			"config_type": "CLAUDE_MD",
			"content":     "# My Project\n\nThis is my CLAUDE.md file.",
			"description": "Main project configuration",
		},
		{
			"name":        "my-skill",
			"config_type": "SKILL",
			"content":     "---\nallowed_tools:\n  - Read\n  - Write\n---\n# My Skill",
			"description": "File operations skill",
		},
		{
			"name":        "my-mcp",
			"config_type": "MCP",
			"content":     `{"command": "node", "args": ["server.js"]}`,
			"description": "Node.js MCP server",
		},
		{
			"name":        "my-command",
			"config_type": "COMMAND",
			"content":     "# /deploy\n\nDeploy the application.",
			"description": "Deployment command",
		},
	}

	var createdIDs []uint
	for _, tmpl := range templates {
		jsonBody, _ := json.Marshal(tmpl)
		req, _ := http.NewRequest("POST", "/api/claude-configs", bytes.NewBuffer(jsonBody))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		require.Equal(t, http.StatusCreated, w.Code, "Failed to create template %s: %s", tmpl["name"], w.Body.String())

		var created models.ClaudeConfigTemplate
		err := json.Unmarshal(w.Body.Bytes(), &created)
		require.NoError(t, err)
		createdIDs = append(createdIDs, created.ID)
	}

	// Step 2: Create container with all config templates selected
	claudeMDID := createdIDs[0]
	containerBody := map[string]interface{}{
		"name":               "test-container-all-configs",
		"skip_git_repo":      true,
		"selected_claude_md": claudeMDID,
		"selected_skills":    []uint{createdIDs[1]},
		"selected_mcps":      []uint{createdIDs[2]},
		"selected_commands":  []uint{createdIDs[3]},
	}
	containerJSON, _ := json.Marshal(containerBody)

	createReq, _ := http.NewRequest("POST", "/api/containers", bytes.NewBuffer(containerJSON))
	createReq.Header.Set("Content-Type", "application/json")
	createW := httptest.NewRecorder()
	router.ServeHTTP(createW, createReq)

	require.Equal(t, http.StatusCreated, createW.Code, "Failed to create container: %s", createW.Body.String())

	var createResponse map[string]interface{}
	err := json.Unmarshal(createW.Body.Bytes(), &createResponse)
	require.NoError(t, err)

	containerData := createResponse["container"].(map[string]interface{})
	containerID := uint(containerData["id"].(float64))

	// Step 3: Get container and verify InjectionStatus
	getReq, _ := http.NewRequest("GET", fmt.Sprintf("/api/containers/%d", containerID), nil)
	getW := httptest.NewRecorder()
	router.ServeHTTP(getW, getReq)

	require.Equal(t, http.StatusOK, getW.Code, "Failed to get container: %s", getW.Body.String())

	var getResponse map[string]interface{}
	err = json.Unmarshal(getW.Body.Bytes(), &getResponse)
	require.NoError(t, err)

	// Verify InjectionStatus is present
	injectionStatus, exists := getResponse["injection_status"]
	assert.True(t, exists, "Response should include injection_status field")
	assert.NotNil(t, injectionStatus, "injection_status should not be nil")

	statusMap := injectionStatus.(map[string]interface{})

	// Verify successful list contains all 4 templates
	successful := statusMap["successful"].([]interface{})
	assert.Equal(t, 4, len(successful), "Expected 4 successful injections")

	// Verify template names are in successful list
	successfulNames := make([]string, len(successful))
	for i, s := range successful {
		successfulNames[i] = s.(string)
	}
	assert.Contains(t, successfulNames, "my-claude-md")
	assert.Contains(t, successfulNames, "my-skill")
	assert.Contains(t, successfulNames, "my-mcp")
	assert.Contains(t, successfulNames, "my-command")

	// Verify failed list is empty
	failed := statusMap["failed"].([]interface{})
	assert.Equal(t, 0, len(failed), "Expected 0 failed injections")
}

// TestIntegration_ContainerCreation_WithPartialFailure tests creating a container
// where some config injections fail and verifies InjectionStatus correctly tracks failures
func TestIntegration_ContainerCreation_WithPartialFailure(t *testing.T) {
	router, _, injectionService := setupContainerIntegrationTestRouter(t)

	// Step 1: Create config templates
	templates := []map[string]interface{}{
		{
			"name":        "success-claude-md",
			"config_type": "CLAUDE_MD",
			"content":     "# Success CLAUDE.md",
		},
		{
			"name":        "fail-skill",
			"config_type": "SKILL",
			"content":     "# Fail Skill",
		},
		{
			"name":        "success-mcp",
			"config_type": "MCP",
			"content":     `{"command": "python", "args": ["-m", "server"]}`,
		},
	}

	var createdIDs []uint
	for _, tmpl := range templates {
		jsonBody, _ := json.Marshal(tmpl)
		req, _ := http.NewRequest("POST", "/api/claude-configs", bytes.NewBuffer(jsonBody))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		require.Equal(t, http.StatusCreated, w.Code, "Failed to create template: %s", w.Body.String())

		var created models.ClaudeConfigTemplate
		json.Unmarshal(w.Body.Bytes(), &created)
		createdIDs = append(createdIDs, created.ID)
	}

	// Step 2: Configure the second template (fail-skill) to fail injection
	injectionService.shouldFail[createdIDs[1]] = "permission denied: cannot write to ~/.claude/skills/"

	// Step 3: Create container with all templates
	claudeMDID := createdIDs[0]
	containerBody := map[string]interface{}{
		"name":               "test-container-partial-fail",
		"skip_git_repo":      true,
		"selected_claude_md": claudeMDID,
		"selected_skills":    []uint{createdIDs[1]},
		"selected_mcps":      []uint{createdIDs[2]},
	}
	containerJSON, _ := json.Marshal(containerBody)

	createReq, _ := http.NewRequest("POST", "/api/containers", bytes.NewBuffer(containerJSON))
	createReq.Header.Set("Content-Type", "application/json")
	createW := httptest.NewRecorder()
	router.ServeHTTP(createW, createReq)

	require.Equal(t, http.StatusCreated, createW.Code, "Failed to create container: %s", createW.Body.String())

	var createResponse map[string]interface{}
	json.Unmarshal(createW.Body.Bytes(), &createResponse)

	containerData := createResponse["container"].(map[string]interface{})
	containerID := uint(containerData["id"].(float64))

	// Step 4: Get container and verify InjectionStatus
	getReq, _ := http.NewRequest("GET", fmt.Sprintf("/api/containers/%d", containerID), nil)
	getW := httptest.NewRecorder()
	router.ServeHTTP(getW, getReq)

	require.Equal(t, http.StatusOK, getW.Code)

	var getResponse map[string]interface{}
	json.Unmarshal(getW.Body.Bytes(), &getResponse)

	injectionStatus := getResponse["injection_status"].(map[string]interface{})

	// Verify successful list contains 2 templates
	successful := injectionStatus["successful"].([]interface{})
	assert.Equal(t, 2, len(successful), "Expected 2 successful injections")

	successfulNames := make([]string, len(successful))
	for i, s := range successful {
		successfulNames[i] = s.(string)
	}
	assert.Contains(t, successfulNames, "success-claude-md")
	assert.Contains(t, successfulNames, "success-mcp")

	// Verify failed list contains 1 template with correct reason
	failed := injectionStatus["failed"].([]interface{})
	assert.Equal(t, 1, len(failed), "Expected 1 failed injection")

	failedItem := failed[0].(map[string]interface{})
	assert.Equal(t, "fail-skill", failedItem["template_name"])
	assert.Equal(t, "SKILL", failedItem["config_type"])
	assert.Equal(t, "permission denied: cannot write to ~/.claude/skills/", failedItem["reason"])
}

// TestIntegration_ContainerCreation_WithNoConfigs tests creating a container
// without any config templates selected
func TestIntegration_ContainerCreation_WithNoConfigs(t *testing.T) {
	router, _, _ := setupContainerIntegrationTestRouter(t)

	// Create container without any config templates
	containerBody := map[string]interface{}{
		"name":          "test-container-no-configs",
		"skip_git_repo": true,
	}
	containerJSON, _ := json.Marshal(containerBody)

	createReq, _ := http.NewRequest("POST", "/api/containers", bytes.NewBuffer(containerJSON))
	createReq.Header.Set("Content-Type", "application/json")
	createW := httptest.NewRecorder()
	router.ServeHTTP(createW, createReq)

	require.Equal(t, http.StatusCreated, createW.Code, "Failed to create container: %s", createW.Body.String())

	var createResponse map[string]interface{}
	json.Unmarshal(createW.Body.Bytes(), &createResponse)

	containerData := createResponse["container"].(map[string]interface{})
	containerID := uint(containerData["id"].(float64))

	// Get container and verify InjectionStatus is nil or empty
	getReq, _ := http.NewRequest("GET", fmt.Sprintf("/api/containers/%d", containerID), nil)
	getW := httptest.NewRecorder()
	router.ServeHTTP(getW, getReq)

	require.Equal(t, http.StatusOK, getW.Code)

	var getResponse map[string]interface{}
	json.Unmarshal(getW.Body.Bytes(), &getResponse)

	// InjectionStatus should be nil or not present when no configs selected
	injectionStatus, exists := getResponse["injection_status"]
	if exists && injectionStatus != nil {
		// If present, it should have empty lists
		statusMap := injectionStatus.(map[string]interface{})
		if successful, ok := statusMap["successful"]; ok && successful != nil {
			successfulArr := successful.([]interface{})
			assert.Equal(t, 0, len(successfulArr), "Successful list should be empty")
		}
		if failed, ok := statusMap["failed"]; ok && failed != nil {
			failedArr := failed.([]interface{})
			assert.Equal(t, 0, len(failedArr), "Failed list should be empty")
		}
	}
}

// TestIntegration_ContainerCreation_WithMultipleSkillsAndMCPs tests creating a container
// with multiple skills and MCPs selected
func TestIntegration_ContainerCreation_WithMultipleSkillsAndMCPs(t *testing.T) {
	router, _, _ := setupContainerIntegrationTestRouter(t)

	// Create multiple skills
	skills := []map[string]interface{}{
		{
			"name":        "skill-read",
			"config_type": "SKILL",
			"content":     "---\nallowed_tools:\n  - Read\n---\n# Read Skill",
		},
		{
			"name":        "skill-write",
			"config_type": "SKILL",
			"content":     "---\nallowed_tools:\n  - Write\n---\n# Write Skill",
		},
		{
			"name":        "skill-bash",
			"config_type": "SKILL",
			"content":     "---\nallowed_tools:\n  - Bash\n---\n# Bash Skill",
		},
	}

	var skillIDs []uint
	for _, skill := range skills {
		jsonBody, _ := json.Marshal(skill)
		req, _ := http.NewRequest("POST", "/api/claude-configs", bytes.NewBuffer(jsonBody))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		require.Equal(t, http.StatusCreated, w.Code)

		var created models.ClaudeConfigTemplate
		json.Unmarshal(w.Body.Bytes(), &created)
		skillIDs = append(skillIDs, created.ID)
	}

	// Create multiple MCPs
	mcps := []map[string]interface{}{
		{
			"name":        "mcp-node",
			"config_type": "MCP",
			"content":     `{"command": "node", "args": ["server.js"]}`,
		},
		{
			"name":        "mcp-python",
			"config_type": "MCP",
			"content":     `{"command": "python", "args": ["-m", "mcp"]}`,
		},
	}

	var mcpIDs []uint
	for _, mcp := range mcps {
		jsonBody, _ := json.Marshal(mcp)
		req, _ := http.NewRequest("POST", "/api/claude-configs", bytes.NewBuffer(jsonBody))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		require.Equal(t, http.StatusCreated, w.Code)

		var created models.ClaudeConfigTemplate
		json.Unmarshal(w.Body.Bytes(), &created)
		mcpIDs = append(mcpIDs, created.ID)
	}

	// Create container with multiple skills and MCPs
	containerBody := map[string]interface{}{
		"name":            "test-container-multi",
		"skip_git_repo":   true,
		"selected_skills": skillIDs,
		"selected_mcps":   mcpIDs,
	}
	containerJSON, _ := json.Marshal(containerBody)

	createReq, _ := http.NewRequest("POST", "/api/containers", bytes.NewBuffer(containerJSON))
	createReq.Header.Set("Content-Type", "application/json")
	createW := httptest.NewRecorder()
	router.ServeHTTP(createW, createReq)

	require.Equal(t, http.StatusCreated, createW.Code)

	var createResponse map[string]interface{}
	json.Unmarshal(createW.Body.Bytes(), &createResponse)

	containerData := createResponse["container"].(map[string]interface{})
	containerID := uint(containerData["id"].(float64))

	// Get container and verify InjectionStatus
	getReq, _ := http.NewRequest("GET", fmt.Sprintf("/api/containers/%d", containerID), nil)
	getW := httptest.NewRecorder()
	router.ServeHTTP(getW, getReq)

	require.Equal(t, http.StatusOK, getW.Code)

	var getResponse map[string]interface{}
	json.Unmarshal(getW.Body.Bytes(), &getResponse)

	injectionStatus := getResponse["injection_status"].(map[string]interface{})

	// Verify all 5 templates (3 skills + 2 MCPs) are successful
	successful := injectionStatus["successful"].([]interface{})
	assert.Equal(t, 5, len(successful), "Expected 5 successful injections")

	successfulNames := make([]string, len(successful))
	for i, s := range successful {
		successfulNames[i] = s.(string)
	}
	assert.Contains(t, successfulNames, "skill-read")
	assert.Contains(t, successfulNames, "skill-write")
	assert.Contains(t, successfulNames, "skill-bash")
	assert.Contains(t, successfulNames, "mcp-node")
	assert.Contains(t, successfulNames, "mcp-python")

	// Verify no failures
	failed := injectionStatus["failed"].([]interface{})
	assert.Equal(t, 0, len(failed))
}

// TestIntegration_ContainerCreation_WithNonExistentTemplate tests creating a container
// with a non-existent template ID and verifies it's tracked in failed list
func TestIntegration_ContainerCreation_WithNonExistentTemplate(t *testing.T) {
	router, _, _ := setupContainerIntegrationTestRouter(t)

	// Create one valid template
	validTemplate := map[string]interface{}{
		"name":        "valid-claude-md",
		"config_type": "CLAUDE_MD",
		"content":     "# Valid CLAUDE.md",
	}
	jsonBody, _ := json.Marshal(validTemplate)
	req, _ := http.NewRequest("POST", "/api/claude-configs", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusCreated, w.Code)

	var created models.ClaudeConfigTemplate
	json.Unmarshal(w.Body.Bytes(), &created)
	validID := created.ID

	// Create container with valid template and non-existent template ID
	nonExistentID := uint(99999)
	containerBody := map[string]interface{}{
		"name":               "test-container-nonexistent",
		"skip_git_repo":      true,
		"selected_claude_md": validID,
		"selected_skills":    []uint{nonExistentID},
	}
	containerJSON, _ := json.Marshal(containerBody)

	createReq, _ := http.NewRequest("POST", "/api/containers", bytes.NewBuffer(containerJSON))
	createReq.Header.Set("Content-Type", "application/json")
	createW := httptest.NewRecorder()
	router.ServeHTTP(createW, createReq)

	require.Equal(t, http.StatusCreated, createW.Code)

	var createResponse map[string]interface{}
	json.Unmarshal(createW.Body.Bytes(), &createResponse)

	containerData := createResponse["container"].(map[string]interface{})
	containerID := uint(containerData["id"].(float64))

	// Get container and verify InjectionStatus
	getReq, _ := http.NewRequest("GET", fmt.Sprintf("/api/containers/%d", containerID), nil)
	getW := httptest.NewRecorder()
	router.ServeHTTP(getW, getReq)

	require.Equal(t, http.StatusOK, getW.Code)

	var getResponse map[string]interface{}
	json.Unmarshal(getW.Body.Bytes(), &getResponse)

	injectionStatus := getResponse["injection_status"].(map[string]interface{})

	// Verify valid template is successful
	successful := injectionStatus["successful"].([]interface{})
	assert.Equal(t, 1, len(successful))
	assert.Equal(t, "valid-claude-md", successful[0].(string))

	// Verify non-existent template is in failed list
	failed := injectionStatus["failed"].([]interface{})
	assert.Equal(t, 1, len(failed))

	failedItem := failed[0].(map[string]interface{})
	assert.Contains(t, failedItem["template_name"].(string), "99999")
	assert.Equal(t, "UNKNOWN", failedItem["config_type"])
	assert.Contains(t, failedItem["reason"].(string), "failed to retrieve template")
}

// TestIntegration_ContainerCreation_WithYoloMode tests creating a container
// with YOLO mode enabled and config templates
func TestIntegration_ContainerCreation_WithYoloMode(t *testing.T) {
	router, db, _ := setupContainerIntegrationTestRouter(t)

	// Create a CLAUDE_MD template
	template := map[string]interface{}{
		"name":        "yolo-claude-md",
		"config_type": "CLAUDE_MD",
		"content":     "# YOLO Mode Project\n\nThis project runs in YOLO mode.",
	}
	jsonBody, _ := json.Marshal(template)
	req, _ := http.NewRequest("POST", "/api/claude-configs", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusCreated, w.Code)

	var created models.ClaudeConfigTemplate
	json.Unmarshal(w.Body.Bytes(), &created)

	// Create container with YOLO mode and config template
	containerBody := map[string]interface{}{
		"name":               "test-container-yolo",
		"skip_git_repo":      true,
		"enable_yolo_mode":   true,
		"selected_claude_md": created.ID,
	}
	containerJSON, _ := json.Marshal(containerBody)

	createReq, _ := http.NewRequest("POST", "/api/containers", bytes.NewBuffer(containerJSON))
	createReq.Header.Set("Content-Type", "application/json")
	createW := httptest.NewRecorder()
	router.ServeHTTP(createW, createReq)

	require.Equal(t, http.StatusCreated, createW.Code)

	var createResponse map[string]interface{}
	json.Unmarshal(createW.Body.Bytes(), &createResponse)

	containerData := createResponse["container"].(map[string]interface{})
	containerID := uint(containerData["id"].(float64))

	// Verify YOLO mode is enabled in the database (not exposed in API response)
	var dbContainer models.Container
	err := db.First(&dbContainer, containerID).Error
	require.NoError(t, err)
	assert.True(t, dbContainer.EnableYoloMode, "YOLO mode should be enabled in database")

	// Get container and verify InjectionStatus
	getReq, _ := http.NewRequest("GET", fmt.Sprintf("/api/containers/%d", containerID), nil)
	getW := httptest.NewRecorder()
	router.ServeHTTP(getW, getReq)

	require.Equal(t, http.StatusOK, getW.Code)

	var getResponse map[string]interface{}
	json.Unmarshal(getW.Body.Bytes(), &getResponse)

	// Verify injection was successful
	injectionStatus := getResponse["injection_status"].(map[string]interface{})
	successful := injectionStatus["successful"].([]interface{})
	assert.Equal(t, 1, len(successful))
	assert.Equal(t, "yolo-claude-md", successful[0].(string))
}

// TestIntegration_ContainerCreation_AllFailures tests creating a container
// where all config injections fail
func TestIntegration_ContainerCreation_AllFailures(t *testing.T) {
	router, _, injectionService := setupContainerIntegrationTestRouter(t)

	// Create templates
	templates := []map[string]interface{}{
		{
			"name":        "fail-claude-md",
			"config_type": "CLAUDE_MD",
			"content":     "# Fail CLAUDE.md",
		},
		{
			"name":        "fail-skill",
			"config_type": "SKILL",
			"content":     "# Fail Skill",
		},
	}

	var createdIDs []uint
	for _, tmpl := range templates {
		jsonBody, _ := json.Marshal(tmpl)
		req, _ := http.NewRequest("POST", "/api/claude-configs", bytes.NewBuffer(jsonBody))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		require.Equal(t, http.StatusCreated, w.Code)

		var created models.ClaudeConfigTemplate
		json.Unmarshal(w.Body.Bytes(), &created)
		createdIDs = append(createdIDs, created.ID)
	}

	// Configure all templates to fail
	injectionService.shouldFail[createdIDs[0]] = "disk full: cannot write to ~/.claude/"
	injectionService.shouldFail[createdIDs[1]] = "permission denied: cannot create directory"

	// Create container
	claudeMDID := createdIDs[0]
	containerBody := map[string]interface{}{
		"name":               "test-container-all-fail",
		"skip_git_repo":      true,
		"selected_claude_md": claudeMDID,
		"selected_skills":    []uint{createdIDs[1]},
	}
	containerJSON, _ := json.Marshal(containerBody)

	createReq, _ := http.NewRequest("POST", "/api/containers", bytes.NewBuffer(containerJSON))
	createReq.Header.Set("Content-Type", "application/json")
	createW := httptest.NewRecorder()
	router.ServeHTTP(createW, createReq)

	// Container creation should still succeed (injection failures are non-fatal)
	require.Equal(t, http.StatusCreated, createW.Code)

	var createResponse map[string]interface{}
	json.Unmarshal(createW.Body.Bytes(), &createResponse)

	containerData := createResponse["container"].(map[string]interface{})
	containerID := uint(containerData["id"].(float64))

	// Get container and verify InjectionStatus
	getReq, _ := http.NewRequest("GET", fmt.Sprintf("/api/containers/%d", containerID), nil)
	getW := httptest.NewRecorder()
	router.ServeHTTP(getW, getReq)

	require.Equal(t, http.StatusOK, getW.Code)

	var getResponse map[string]interface{}
	json.Unmarshal(getW.Body.Bytes(), &getResponse)

	injectionStatus := getResponse["injection_status"].(map[string]interface{})

	// Verify successful list is empty
	successful := injectionStatus["successful"].([]interface{})
	assert.Equal(t, 0, len(successful), "Expected 0 successful injections")

	// Verify failed list contains both templates
	failed := injectionStatus["failed"].([]interface{})
	assert.Equal(t, 2, len(failed), "Expected 2 failed injections")

	// Verify failure details
	failedNames := make(map[string]string)
	for _, f := range failed {
		item := f.(map[string]interface{})
		failedNames[item["template_name"].(string)] = item["reason"].(string)
	}

	assert.Contains(t, failedNames, "fail-claude-md")
	assert.Contains(t, failedNames["fail-claude-md"], "disk full")
	assert.Contains(t, failedNames, "fail-skill")
	assert.Contains(t, failedNames["fail-skill"], "permission denied")
}

// TestIntegration_ContainerCreation_InjectionStatusPersistence tests that
// InjectionStatus is correctly persisted in the database and retrieved
func TestIntegration_ContainerCreation_InjectionStatusPersistence(t *testing.T) {
	router, db, _ := setupContainerIntegrationTestRouter(t)

	// Create a template
	template := map[string]interface{}{
		"name":        "persist-test-claude-md",
		"config_type": "CLAUDE_MD",
		"content":     "# Persistence Test",
	}
	jsonBody, _ := json.Marshal(template)
	req, _ := http.NewRequest("POST", "/api/claude-configs", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusCreated, w.Code)

	var created models.ClaudeConfigTemplate
	json.Unmarshal(w.Body.Bytes(), &created)

	// Create container
	containerBody := map[string]interface{}{
		"name":               "test-container-persist",
		"skip_git_repo":      true,
		"selected_claude_md": created.ID,
	}
	containerJSON, _ := json.Marshal(containerBody)

	createReq, _ := http.NewRequest("POST", "/api/containers", bytes.NewBuffer(containerJSON))
	createReq.Header.Set("Content-Type", "application/json")
	createW := httptest.NewRecorder()
	router.ServeHTTP(createW, createReq)

	require.Equal(t, http.StatusCreated, createW.Code)

	var createResponse map[string]interface{}
	json.Unmarshal(createW.Body.Bytes(), &createResponse)

	containerData := createResponse["container"].(map[string]interface{})
	containerID := uint(containerData["id"].(float64))

	// Directly query the database to verify persistence
	var dbContainer models.Container
	err := db.First(&dbContainer, containerID).Error
	require.NoError(t, err)

	// Verify InjectionStatus is stored in database
	assert.NotNil(t, dbContainer.InjectionStatus, "InjectionStatus should be persisted in database")
	assert.Equal(t, 1, len(dbContainer.InjectionStatus.Successful))
	assert.Equal(t, "persist-test-claude-md", dbContainer.InjectionStatus.Successful[0])
	assert.Equal(t, 0, len(dbContainer.InjectionStatus.Failed))
}


// ============================================================================
// Task 14.3: Empty Container Creation Tests (No GitHub Repository)
// ============================================================================

// TestIntegration_EmptyContainer_WorkDirIsApp tests that creating a container
// without a GitHub repository sets WorkDir to "/app"
func TestIntegration_EmptyContainer_WorkDirIsApp(t *testing.T) {
	router, db, _ := setupContainerIntegrationTestRouter(t)

	// Create container without GitHub repository (skip_git_repo=true)
	containerBody := map[string]interface{}{
		"name":          "test-empty-container",
		"skip_git_repo": true,
	}
	containerJSON, _ := json.Marshal(containerBody)

	createReq, _ := http.NewRequest("POST", "/api/containers", bytes.NewBuffer(containerJSON))
	createReq.Header.Set("Content-Type", "application/json")
	createW := httptest.NewRecorder()
	router.ServeHTTP(createW, createReq)

	require.Equal(t, http.StatusCreated, createW.Code, "Failed to create container: %s", createW.Body.String())

	var createResponse map[string]interface{}
	err := json.Unmarshal(createW.Body.Bytes(), &createResponse)
	require.NoError(t, err)

	containerData := createResponse["container"].(map[string]interface{})
	containerID := uint(containerData["id"].(float64))

	// Verify WorkDir is "/app" in API response
	workDir := containerData["work_dir"].(string)
	assert.Equal(t, "/app", workDir, "WorkDir should be /app for empty container")

	// Verify in database as well
	var dbContainer models.Container
	err = db.First(&dbContainer, containerID).Error
	require.NoError(t, err)
	assert.Equal(t, "/app", dbContainer.WorkDir, "WorkDir should be /app in database")
	assert.True(t, dbContainer.SkipGitRepo, "SkipGitRepo should be true in database")
}

// TestIntegration_EmptyContainer_NoGitRepoFields tests that creating a container
// without a GitHub repository has empty git repo URL and name
func TestIntegration_EmptyContainer_NoGitRepoFields(t *testing.T) {
	router, db, _ := setupContainerIntegrationTestRouter(t)

	// Create container without GitHub repository
	containerBody := map[string]interface{}{
		"name":          "test-empty-no-git",
		"skip_git_repo": true,
	}
	containerJSON, _ := json.Marshal(containerBody)

	createReq, _ := http.NewRequest("POST", "/api/containers", bytes.NewBuffer(containerJSON))
	createReq.Header.Set("Content-Type", "application/json")
	createW := httptest.NewRecorder()
	router.ServeHTTP(createW, createReq)

	require.Equal(t, http.StatusCreated, createW.Code)

	var createResponse map[string]interface{}
	json.Unmarshal(createW.Body.Bytes(), &createResponse)

	containerData := createResponse["container"].(map[string]interface{})
	containerID := uint(containerData["id"].(float64))

	// Verify git repo fields are empty in API response
	gitRepoURL, urlExists := containerData["git_repo_url"]
	gitRepoName, nameExists := containerData["git_repo_name"]

	// Either the fields don't exist or they are empty strings
	if urlExists {
		assert.Empty(t, gitRepoURL, "git_repo_url should be empty for empty container")
	}
	if nameExists {
		assert.Empty(t, gitRepoName, "git_repo_name should be empty for empty container")
	}

	// Verify in database
	var dbContainer models.Container
	err := db.First(&dbContainer, containerID).Error
	require.NoError(t, err)
	assert.Empty(t, dbContainer.GitRepoURL, "GitRepoURL should be empty in database")
	assert.Empty(t, dbContainer.GitRepoName, "GitRepoName should be empty in database")
}

// TestIntegration_EmptyContainer_WithConfigInjection tests that an empty container
// can still have config templates injected successfully
func TestIntegration_EmptyContainer_WithConfigInjection(t *testing.T) {
	router, db, _ := setupContainerIntegrationTestRouter(t)

	// Step 1: Create config templates
	claudeMDTemplate := map[string]interface{}{
		"name":        "empty-container-claude-md",
		"config_type": "CLAUDE_MD",
		"content":     "# Empty Container Project\n\nThis is a project without a git repository.",
		"description": "CLAUDE.md for empty container",
	}
	jsonBody, _ := json.Marshal(claudeMDTemplate)
	req, _ := http.NewRequest("POST", "/api/claude-configs", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusCreated, w.Code)

	var createdTemplate models.ClaudeConfigTemplate
	json.Unmarshal(w.Body.Bytes(), &createdTemplate)

	// Create a skill template as well
	skillTemplate := map[string]interface{}{
		"name":        "empty-container-skill",
		"config_type": "SKILL",
		"content":     "---\nallowed_tools:\n  - Read\n  - Write\n---\n# File Operations Skill",
	}
	jsonBody, _ = json.Marshal(skillTemplate)
	req, _ = http.NewRequest("POST", "/api/claude-configs", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusCreated, w.Code)

	var createdSkill models.ClaudeConfigTemplate
	json.Unmarshal(w.Body.Bytes(), &createdSkill)

	// Step 2: Create empty container with config templates
	containerBody := map[string]interface{}{
		"name":               "test-empty-with-configs",
		"skip_git_repo":      true,
		"selected_claude_md": createdTemplate.ID,
		"selected_skills":    []uint{createdSkill.ID},
	}
	containerJSON, _ := json.Marshal(containerBody)

	createReq, _ := http.NewRequest("POST", "/api/containers", bytes.NewBuffer(containerJSON))
	createReq.Header.Set("Content-Type", "application/json")
	createW := httptest.NewRecorder()
	router.ServeHTTP(createW, createReq)

	require.Equal(t, http.StatusCreated, createW.Code, "Failed to create container: %s", createW.Body.String())

	var createResponse map[string]interface{}
	json.Unmarshal(createW.Body.Bytes(), &createResponse)

	containerData := createResponse["container"].(map[string]interface{})
	containerID := uint(containerData["id"].(float64))

	// Step 3: Verify container properties
	// WorkDir should be /app
	workDir := containerData["work_dir"].(string)
	assert.Equal(t, "/app", workDir, "WorkDir should be /app for empty container")

	// Step 4: Get container and verify InjectionStatus
	getReq, _ := http.NewRequest("GET", fmt.Sprintf("/api/containers/%d", containerID), nil)
	getW := httptest.NewRecorder()
	router.ServeHTTP(getW, getReq)

	require.Equal(t, http.StatusOK, getW.Code)

	var getResponse map[string]interface{}
	json.Unmarshal(getW.Body.Bytes(), &getResponse)

	// Verify InjectionStatus shows successful injection
	injectionStatus, exists := getResponse["injection_status"]
	assert.True(t, exists, "injection_status should be present")
	assert.NotNil(t, injectionStatus, "injection_status should not be nil")

	statusMap := injectionStatus.(map[string]interface{})
	successful := statusMap["successful"].([]interface{})
	assert.Equal(t, 2, len(successful), "Expected 2 successful injections")

	successfulNames := make([]string, len(successful))
	for i, s := range successful {
		successfulNames[i] = s.(string)
	}
	assert.Contains(t, successfulNames, "empty-container-claude-md")
	assert.Contains(t, successfulNames, "empty-container-skill")

	// Verify no failures
	failed := statusMap["failed"].([]interface{})
	assert.Equal(t, 0, len(failed), "Expected 0 failed injections")

	// Verify in database
	var dbContainer models.Container
	err := db.First(&dbContainer, containerID).Error
	require.NoError(t, err)
	assert.Equal(t, "/app", dbContainer.WorkDir)
	assert.True(t, dbContainer.SkipGitRepo)
	assert.NotNil(t, dbContainer.InjectionStatus)
	assert.Equal(t, 2, len(dbContainer.InjectionStatus.Successful))
}

// TestIntegration_EmptyContainer_ContainerIsFullyFunctional tests that an empty container
// is created successfully and is in running state (simulated)
func TestIntegration_EmptyContainer_ContainerIsFullyFunctional(t *testing.T) {
	router, db, _ := setupContainerIntegrationTestRouter(t)

	// Create empty container
	containerBody := map[string]interface{}{
		"name":          "test-empty-functional",
		"skip_git_repo": true,
	}
	containerJSON, _ := json.Marshal(containerBody)

	createReq, _ := http.NewRequest("POST", "/api/containers", bytes.NewBuffer(containerJSON))
	createReq.Header.Set("Content-Type", "application/json")
	createW := httptest.NewRecorder()
	router.ServeHTTP(createW, createReq)

	require.Equal(t, http.StatusCreated, createW.Code)

	var createResponse map[string]interface{}
	json.Unmarshal(createW.Body.Bytes(), &createResponse)

	containerData := createResponse["container"].(map[string]interface{})
	containerID := uint(containerData["id"].(float64))

	// Verify container status is running (mock service sets this)
	status := containerData["status"].(string)
	assert.Equal(t, "running", status, "Container should be in running state")

	// Verify init_status is ready
	initStatus := containerData["init_status"].(string)
	assert.Equal(t, "ready", initStatus, "Container init_status should be ready")

	// Verify in database
	var dbContainer models.Container
	err := db.First(&dbContainer, containerID).Error
	require.NoError(t, err)
	assert.Equal(t, models.ContainerStatusRunning, dbContainer.Status)
	assert.Equal(t, models.InitStatusReady, dbContainer.InitStatus)
}

// TestIntegration_EmptyContainer_WithYoloMode tests creating an empty container
// with YOLO mode enabled
func TestIntegration_EmptyContainer_WithYoloMode(t *testing.T) {
	router, db, _ := setupContainerIntegrationTestRouter(t)

	// Create empty container with YOLO mode
	containerBody := map[string]interface{}{
		"name":             "test-empty-yolo",
		"skip_git_repo":    true,
		"enable_yolo_mode": true,
	}
	containerJSON, _ := json.Marshal(containerBody)

	createReq, _ := http.NewRequest("POST", "/api/containers", bytes.NewBuffer(containerJSON))
	createReq.Header.Set("Content-Type", "application/json")
	createW := httptest.NewRecorder()
	router.ServeHTTP(createW, createReq)

	require.Equal(t, http.StatusCreated, createW.Code)

	var createResponse map[string]interface{}
	json.Unmarshal(createW.Body.Bytes(), &createResponse)

	containerData := createResponse["container"].(map[string]interface{})
	containerID := uint(containerData["id"].(float64))

	// Verify WorkDir is /app
	workDir := containerData["work_dir"].(string)
	assert.Equal(t, "/app", workDir)

	// Verify YOLO mode is enabled in database
	var dbContainer models.Container
	err := db.First(&dbContainer, containerID).Error
	require.NoError(t, err)
	assert.True(t, dbContainer.EnableYoloMode, "YOLO mode should be enabled")
	assert.True(t, dbContainer.SkipGitRepo, "SkipGitRepo should be true")
	assert.Equal(t, "/app", dbContainer.WorkDir)
}

// TestIntegration_ContainerWithGitRepo_WorkDirIsWorkspace tests that creating a container
// WITH a GitHub repository sets WorkDir to "/workspace/{repo_name}" (contrast to empty container)
func TestIntegration_ContainerWithGitRepo_WorkDirIsWorkspace(t *testing.T) {
	router, db, _ := setupContainerIntegrationTestRouter(t)

	// Create container WITH GitHub repository (skip_git_repo=false or not set)
	containerBody := map[string]interface{}{
		"name":          "test-with-git-repo",
		"git_repo_url":  "https://github.com/user/my-project.git",
		"git_repo_name": "my-project",
		"skip_git_repo": false,
	}
	containerJSON, _ := json.Marshal(containerBody)

	createReq, _ := http.NewRequest("POST", "/api/containers", bytes.NewBuffer(containerJSON))
	createReq.Header.Set("Content-Type", "application/json")
	createW := httptest.NewRecorder()
	router.ServeHTTP(createW, createReq)

	require.Equal(t, http.StatusCreated, createW.Code, "Failed to create container: %s", createW.Body.String())

	var createResponse map[string]interface{}
	err := json.Unmarshal(createW.Body.Bytes(), &createResponse)
	require.NoError(t, err)

	containerData := createResponse["container"].(map[string]interface{})
	containerID := uint(containerData["id"].(float64))

	// Verify WorkDir is "/workspace/my-project" in API response
	workDir := containerData["work_dir"].(string)
	assert.Equal(t, "/workspace/my-project", workDir, "WorkDir should be /workspace/{repo_name} for container with git repo")

	// Verify in database
	var dbContainer models.Container
	err = db.First(&dbContainer, containerID).Error
	require.NoError(t, err)
	assert.Equal(t, "/workspace/my-project", dbContainer.WorkDir, "WorkDir should be /workspace/{repo_name} in database")
	assert.False(t, dbContainer.SkipGitRepo, "SkipGitRepo should be false in database")
	assert.Equal(t, "https://github.com/user/my-project.git", dbContainer.GitRepoURL)
	assert.Equal(t, "my-project", dbContainer.GitRepoName)
}


// ============================================================================
// Task 14.4: YOLO Mode Tests
// ============================================================================

// TestIntegration_YoloMode_EnabledAndPersisted tests that creating a container
// with YOLO mode enabled correctly stores the EnableYoloMode flag in the database
// and it can be retrieved after creation
func TestIntegration_YoloMode_EnabledAndPersisted(t *testing.T) {
	router, db, _ := setupContainerIntegrationTestRouter(t)

	// Create container with YOLO mode enabled
	containerBody := map[string]interface{}{
		"name":             "test-yolo-persisted",
		"skip_git_repo":    true,
		"enable_yolo_mode": true,
	}
	containerJSON, _ := json.Marshal(containerBody)

	createReq, _ := http.NewRequest("POST", "/api/containers", bytes.NewBuffer(containerJSON))
	createReq.Header.Set("Content-Type", "application/json")
	createW := httptest.NewRecorder()
	router.ServeHTTP(createW, createReq)

	require.Equal(t, http.StatusCreated, createW.Code, "Failed to create container: %s", createW.Body.String())

	var createResponse map[string]interface{}
	err := json.Unmarshal(createW.Body.Bytes(), &createResponse)
	require.NoError(t, err)

	containerData := createResponse["container"].(map[string]interface{})
	containerID := uint(containerData["id"].(float64))

	// Verify YOLO mode is enabled in the database
	var dbContainer models.Container
	err = db.First(&dbContainer, containerID).Error
	require.NoError(t, err)
	assert.True(t, dbContainer.EnableYoloMode, "EnableYoloMode should be true in database")

	// Verify YOLO mode persists when retrieving the container via API
	getReq, _ := http.NewRequest("GET", fmt.Sprintf("/api/containers/%d", containerID), nil)
	getW := httptest.NewRecorder()
	router.ServeHTTP(getW, getReq)

	require.Equal(t, http.StatusOK, getW.Code)

	var getResponse map[string]interface{}
	json.Unmarshal(getW.Body.Bytes(), &getResponse)

	// Note: The API response may or may not include enable_yolo_mode depending on ToContainerInfo
	// We verify persistence via direct database query above
}

// TestIntegration_YoloMode_DisabledByDefault tests that creating a container
// without specifying enable_yolo_mode defaults to false
func TestIntegration_YoloMode_DisabledByDefault(t *testing.T) {
	router, db, _ := setupContainerIntegrationTestRouter(t)

	// Create container without specifying enable_yolo_mode
	containerBody := map[string]interface{}{
		"name":          "test-yolo-default",
		"skip_git_repo": true,
	}
	containerJSON, _ := json.Marshal(containerBody)

	createReq, _ := http.NewRequest("POST", "/api/containers", bytes.NewBuffer(containerJSON))
	createReq.Header.Set("Content-Type", "application/json")
	createW := httptest.NewRecorder()
	router.ServeHTTP(createW, createReq)

	require.Equal(t, http.StatusCreated, createW.Code)

	var createResponse map[string]interface{}
	json.Unmarshal(createW.Body.Bytes(), &createResponse)

	containerData := createResponse["container"].(map[string]interface{})
	containerID := uint(containerData["id"].(float64))

	// Verify YOLO mode is disabled by default in the database
	var dbContainer models.Container
	err := db.First(&dbContainer, containerID).Error
	require.NoError(t, err)
	assert.False(t, dbContainer.EnableYoloMode, "EnableYoloMode should be false by default")
}

// TestIntegration_YoloMode_ExplicitlyDisabled tests that creating a container
// with enable_yolo_mode=false correctly stores the flag as false
func TestIntegration_YoloMode_ExplicitlyDisabled(t *testing.T) {
	router, db, _ := setupContainerIntegrationTestRouter(t)

	// Create container with YOLO mode explicitly disabled
	containerBody := map[string]interface{}{
		"name":             "test-yolo-explicit-false",
		"skip_git_repo":    true,
		"enable_yolo_mode": false,
	}
	containerJSON, _ := json.Marshal(containerBody)

	createReq, _ := http.NewRequest("POST", "/api/containers", bytes.NewBuffer(containerJSON))
	createReq.Header.Set("Content-Type", "application/json")
	createW := httptest.NewRecorder()
	router.ServeHTTP(createW, createReq)

	require.Equal(t, http.StatusCreated, createW.Code)

	var createResponse map[string]interface{}
	json.Unmarshal(createW.Body.Bytes(), &createResponse)

	containerData := createResponse["container"].(map[string]interface{})
	containerID := uint(containerData["id"].(float64))

	// Verify YOLO mode is disabled in the database
	var dbContainer models.Container
	err := db.First(&dbContainer, containerID).Error
	require.NoError(t, err)
	assert.False(t, dbContainer.EnableYoloMode, "EnableYoloMode should be false when explicitly set to false")
}

// TestIntegration_YoloMode_WithConfigTemplates tests that YOLO mode works correctly
// when combined with config template injection
func TestIntegration_YoloMode_WithConfigTemplates(t *testing.T) {
	router, db, _ := setupContainerIntegrationTestRouter(t)

	// Step 1: Create config templates
	claudeMDTemplate := map[string]interface{}{
		"name":        "yolo-test-claude-md",
		"config_type": "CLAUDE_MD",
		"content":     "# YOLO Mode Test Project\n\nThis project runs with YOLO mode enabled.",
		"description": "CLAUDE.md for YOLO mode testing",
	}
	jsonBody, _ := json.Marshal(claudeMDTemplate)
	req, _ := http.NewRequest("POST", "/api/claude-configs", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusCreated, w.Code)

	var createdClaudeMD models.ClaudeConfigTemplate
	json.Unmarshal(w.Body.Bytes(), &createdClaudeMD)

	// Create a skill template
	skillTemplate := map[string]interface{}{
		"name":        "yolo-test-skill",
		"config_type": "SKILL",
		"content":     "---\nallowed_tools:\n  - Read\n  - Write\n  - Bash\n---\n# Full Access Skill\n\nThis skill allows full file and bash access.",
	}
	jsonBody, _ = json.Marshal(skillTemplate)
	req, _ = http.NewRequest("POST", "/api/claude-configs", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusCreated, w.Code)

	var createdSkill models.ClaudeConfigTemplate
	json.Unmarshal(w.Body.Bytes(), &createdSkill)

	// Create an MCP template
	mcpTemplate := map[string]interface{}{
		"name":        "yolo-test-mcp",
		"config_type": "MCP",
		"content":     `{"command": "node", "args": ["mcp-server.js"]}`,
	}
	jsonBody, _ = json.Marshal(mcpTemplate)
	req, _ = http.NewRequest("POST", "/api/claude-configs", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusCreated, w.Code)

	var createdMCP models.ClaudeConfigTemplate
	json.Unmarshal(w.Body.Bytes(), &createdMCP)

	// Step 2: Create container with YOLO mode and all config templates
	containerBody := map[string]interface{}{
		"name":               "test-yolo-with-configs",
		"skip_git_repo":      true,
		"enable_yolo_mode":   true,
		"selected_claude_md": createdClaudeMD.ID,
		"selected_skills":    []uint{createdSkill.ID},
		"selected_mcps":      []uint{createdMCP.ID},
	}
	containerJSON, _ := json.Marshal(containerBody)

	createReq, _ := http.NewRequest("POST", "/api/containers", bytes.NewBuffer(containerJSON))
	createReq.Header.Set("Content-Type", "application/json")
	createW := httptest.NewRecorder()
	router.ServeHTTP(createW, createReq)

	require.Equal(t, http.StatusCreated, createW.Code, "Failed to create container: %s", createW.Body.String())

	var createResponse map[string]interface{}
	json.Unmarshal(createW.Body.Bytes(), &createResponse)

	containerData := createResponse["container"].(map[string]interface{})
	containerID := uint(containerData["id"].(float64))

	// Step 3: Verify YOLO mode is enabled in database
	var dbContainer models.Container
	err := db.First(&dbContainer, containerID).Error
	require.NoError(t, err)
	assert.True(t, dbContainer.EnableYoloMode, "EnableYoloMode should be true")
	assert.True(t, dbContainer.SkipGitRepo, "SkipGitRepo should be true")
	assert.Equal(t, "/app", dbContainer.WorkDir, "WorkDir should be /app for empty container")

	// Step 4: Verify config injection was successful
	getReq, _ := http.NewRequest("GET", fmt.Sprintf("/api/containers/%d", containerID), nil)
	getW := httptest.NewRecorder()
	router.ServeHTTP(getW, getReq)

	require.Equal(t, http.StatusOK, getW.Code)

	var getResponse map[string]interface{}
	json.Unmarshal(getW.Body.Bytes(), &getResponse)

	injectionStatus := getResponse["injection_status"].(map[string]interface{})
	successful := injectionStatus["successful"].([]interface{})
	assert.Equal(t, 3, len(successful), "Expected 3 successful injections")

	successfulNames := make([]string, len(successful))
	for i, s := range successful {
		successfulNames[i] = s.(string)
	}
	assert.Contains(t, successfulNames, "yolo-test-claude-md")
	assert.Contains(t, successfulNames, "yolo-test-skill")
	assert.Contains(t, successfulNames, "yolo-test-mcp")

	// Verify no failures
	failed := injectionStatus["failed"].([]interface{})
	assert.Equal(t, 0, len(failed), "Expected 0 failed injections")
}

// TestIntegration_YoloMode_WithEmptyContainer tests that YOLO mode works correctly
// with an empty container (skip_git_repo=true)
func TestIntegration_YoloMode_WithEmptyContainer(t *testing.T) {
	router, db, _ := setupContainerIntegrationTestRouter(t)

	// Create empty container with YOLO mode
	containerBody := map[string]interface{}{
		"name":             "test-yolo-empty-container",
		"skip_git_repo":    true,
		"enable_yolo_mode": true,
	}
	containerJSON, _ := json.Marshal(containerBody)

	createReq, _ := http.NewRequest("POST", "/api/containers", bytes.NewBuffer(containerJSON))
	createReq.Header.Set("Content-Type", "application/json")
	createW := httptest.NewRecorder()
	router.ServeHTTP(createW, createReq)

	require.Equal(t, http.StatusCreated, createW.Code, "Failed to create container: %s", createW.Body.String())

	var createResponse map[string]interface{}
	json.Unmarshal(createW.Body.Bytes(), &createResponse)

	containerData := createResponse["container"].(map[string]interface{})
	containerID := uint(containerData["id"].(float64))

	// Verify container properties
	workDir := containerData["work_dir"].(string)
	assert.Equal(t, "/app", workDir, "WorkDir should be /app for empty container")

	status := containerData["status"].(string)
	assert.Equal(t, "running", status, "Container should be running")

	// Verify in database
	var dbContainer models.Container
	err := db.First(&dbContainer, containerID).Error
	require.NoError(t, err)
	assert.True(t, dbContainer.EnableYoloMode, "EnableYoloMode should be true")
	assert.True(t, dbContainer.SkipGitRepo, "SkipGitRepo should be true")
	assert.Equal(t, "/app", dbContainer.WorkDir, "WorkDir should be /app")
	assert.Equal(t, models.ContainerStatusRunning, dbContainer.Status, "Status should be running")
}

// TestIntegration_YoloMode_WithGitRepo tests that YOLO mode works correctly
// with a container that has a GitHub repository
func TestIntegration_YoloMode_WithGitRepo(t *testing.T) {
	router, db, _ := setupContainerIntegrationTestRouter(t)

	// Create container with GitHub repository and YOLO mode
	containerBody := map[string]interface{}{
		"name":             "test-yolo-with-repo",
		"git_repo_url":     "https://github.com/user/yolo-project.git",
		"git_repo_name":    "yolo-project",
		"skip_git_repo":    false,
		"enable_yolo_mode": true,
	}
	containerJSON, _ := json.Marshal(containerBody)

	createReq, _ := http.NewRequest("POST", "/api/containers", bytes.NewBuffer(containerJSON))
	createReq.Header.Set("Content-Type", "application/json")
	createW := httptest.NewRecorder()
	router.ServeHTTP(createW, createReq)

	require.Equal(t, http.StatusCreated, createW.Code, "Failed to create container: %s", createW.Body.String())

	var createResponse map[string]interface{}
	json.Unmarshal(createW.Body.Bytes(), &createResponse)

	containerData := createResponse["container"].(map[string]interface{})
	containerID := uint(containerData["id"].(float64))

	// Verify container properties
	workDir := containerData["work_dir"].(string)
	assert.Equal(t, "/workspace/yolo-project", workDir, "WorkDir should be /workspace/{repo_name}")

	// Verify in database
	var dbContainer models.Container
	err := db.First(&dbContainer, containerID).Error
	require.NoError(t, err)
	assert.True(t, dbContainer.EnableYoloMode, "EnableYoloMode should be true")
	assert.False(t, dbContainer.SkipGitRepo, "SkipGitRepo should be false")
	assert.Equal(t, "/workspace/yolo-project", dbContainer.WorkDir, "WorkDir should be /workspace/yolo-project")
	assert.Equal(t, "https://github.com/user/yolo-project.git", dbContainer.GitRepoURL)
	assert.Equal(t, "yolo-project", dbContainer.GitRepoName)
}

// TestIntegration_YoloMode_MultipleContainers tests that multiple containers
// can have different YOLO mode settings
func TestIntegration_YoloMode_MultipleContainers(t *testing.T) {
	router, db, _ := setupContainerIntegrationTestRouter(t)

	// Create first container with YOLO mode enabled
	container1Body := map[string]interface{}{
		"name":             "test-yolo-multi-1",
		"skip_git_repo":    true,
		"enable_yolo_mode": true,
	}
	container1JSON, _ := json.Marshal(container1Body)

	createReq1, _ := http.NewRequest("POST", "/api/containers", bytes.NewBuffer(container1JSON))
	createReq1.Header.Set("Content-Type", "application/json")
	createW1 := httptest.NewRecorder()
	router.ServeHTTP(createW1, createReq1)

	require.Equal(t, http.StatusCreated, createW1.Code)

	var createResponse1 map[string]interface{}
	json.Unmarshal(createW1.Body.Bytes(), &createResponse1)
	containerData1 := createResponse1["container"].(map[string]interface{})
	containerID1 := uint(containerData1["id"].(float64))

	// Create second container with YOLO mode disabled
	container2Body := map[string]interface{}{
		"name":             "test-yolo-multi-2",
		"skip_git_repo":    true,
		"enable_yolo_mode": false,
	}
	container2JSON, _ := json.Marshal(container2Body)

	createReq2, _ := http.NewRequest("POST", "/api/containers", bytes.NewBuffer(container2JSON))
	createReq2.Header.Set("Content-Type", "application/json")
	createW2 := httptest.NewRecorder()
	router.ServeHTTP(createW2, createReq2)

	require.Equal(t, http.StatusCreated, createW2.Code)

	var createResponse2 map[string]interface{}
	json.Unmarshal(createW2.Body.Bytes(), &createResponse2)
	containerData2 := createResponse2["container"].(map[string]interface{})
	containerID2 := uint(containerData2["id"].(float64))

	// Create third container without specifying YOLO mode (should default to false)
	container3Body := map[string]interface{}{
		"name":          "test-yolo-multi-3",
		"skip_git_repo": true,
	}
	container3JSON, _ := json.Marshal(container3Body)

	createReq3, _ := http.NewRequest("POST", "/api/containers", bytes.NewBuffer(container3JSON))
	createReq3.Header.Set("Content-Type", "application/json")
	createW3 := httptest.NewRecorder()
	router.ServeHTTP(createW3, createReq3)

	require.Equal(t, http.StatusCreated, createW3.Code)

	var createResponse3 map[string]interface{}
	json.Unmarshal(createW3.Body.Bytes(), &createResponse3)
	containerData3 := createResponse3["container"].(map[string]interface{})
	containerID3 := uint(containerData3["id"].(float64))

	// Verify each container has the correct YOLO mode setting
	var dbContainer1, dbContainer2, dbContainer3 models.Container

	err := db.First(&dbContainer1, containerID1).Error
	require.NoError(t, err)
	assert.True(t, dbContainer1.EnableYoloMode, "Container 1 should have YOLO mode enabled")

	err = db.First(&dbContainer2, containerID2).Error
	require.NoError(t, err)
	assert.False(t, dbContainer2.EnableYoloMode, "Container 2 should have YOLO mode disabled")

	err = db.First(&dbContainer3, containerID3).Error
	require.NoError(t, err)
	assert.False(t, dbContainer3.EnableYoloMode, "Container 3 should have YOLO mode disabled (default)")
}

// TestIntegration_YoloMode_WithPartialConfigFailure tests that YOLO mode container
// creation succeeds even when some config injections fail
func TestIntegration_YoloMode_WithPartialConfigFailure(t *testing.T) {
	router, db, injectionService := setupContainerIntegrationTestRouter(t)

	// Create config templates
	claudeMDTemplate := map[string]interface{}{
		"name":        "yolo-partial-claude-md",
		"config_type": "CLAUDE_MD",
		"content":     "# YOLO Partial Failure Test",
	}
	jsonBody, _ := json.Marshal(claudeMDTemplate)
	req, _ := http.NewRequest("POST", "/api/claude-configs", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusCreated, w.Code)

	var createdClaudeMD models.ClaudeConfigTemplate
	json.Unmarshal(w.Body.Bytes(), &createdClaudeMD)

	skillTemplate := map[string]interface{}{
		"name":        "yolo-partial-skill",
		"config_type": "SKILL",
		"content":     "# Skill that will fail",
	}
	jsonBody, _ = json.Marshal(skillTemplate)
	req, _ = http.NewRequest("POST", "/api/claude-configs", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	require.Equal(t, http.StatusCreated, w.Code)

	var createdSkill models.ClaudeConfigTemplate
	json.Unmarshal(w.Body.Bytes(), &createdSkill)

	// Configure the skill template to fail injection
	injectionService.shouldFail[createdSkill.ID] = "permission denied: cannot write skill file"

	// Create YOLO mode container with both templates
	containerBody := map[string]interface{}{
		"name":               "test-yolo-partial-fail",
		"skip_git_repo":      true,
		"enable_yolo_mode":   true,
		"selected_claude_md": createdClaudeMD.ID,
		"selected_skills":    []uint{createdSkill.ID},
	}
	containerJSON, _ := json.Marshal(containerBody)

	createReq, _ := http.NewRequest("POST", "/api/containers", bytes.NewBuffer(containerJSON))
	createReq.Header.Set("Content-Type", "application/json")
	createW := httptest.NewRecorder()
	router.ServeHTTP(createW, createReq)

	// Container creation should succeed despite partial injection failure
	require.Equal(t, http.StatusCreated, createW.Code)

	var createResponse map[string]interface{}
	json.Unmarshal(createW.Body.Bytes(), &createResponse)

	containerData := createResponse["container"].(map[string]interface{})
	containerID := uint(containerData["id"].(float64))

	// Verify YOLO mode is enabled
	var dbContainer models.Container
	err := db.First(&dbContainer, containerID).Error
	require.NoError(t, err)
	assert.True(t, dbContainer.EnableYoloMode, "EnableYoloMode should be true")

	// Verify injection status shows partial failure
	getReq, _ := http.NewRequest("GET", fmt.Sprintf("/api/containers/%d", containerID), nil)
	getW := httptest.NewRecorder()
	router.ServeHTTP(getW, getReq)

	require.Equal(t, http.StatusOK, getW.Code)

	var getResponse map[string]interface{}
	json.Unmarshal(getW.Body.Bytes(), &getResponse)

	injectionStatus := getResponse["injection_status"].(map[string]interface{})

	// Verify CLAUDE.MD was successful
	successful := injectionStatus["successful"].([]interface{})
	assert.Equal(t, 1, len(successful))
	assert.Equal(t, "yolo-partial-claude-md", successful[0].(string))

	// Verify skill failed
	failed := injectionStatus["failed"].([]interface{})
	assert.Equal(t, 1, len(failed))
	failedItem := failed[0].(map[string]interface{})
	assert.Equal(t, "yolo-partial-skill", failedItem["template_name"])
	assert.Contains(t, failedItem["reason"].(string), "permission denied")
}
