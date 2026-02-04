package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"cc-platform/internal/models"
	"cc-platform/internal/services"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

// ============================================================================
// Mock ContainerService for Handler Tests
// ============================================================================

// mockContainerService implements a minimal mock for container handler testing
type mockContainerService struct {
	containers       map[uint]*models.Container
	nextID           uint
	createError      error
	getError         error
	lastCreateInput  *services.CreateContainerInput
}

func newMockContainerService() *mockContainerService {
	return &mockContainerService{
		containers: make(map[uint]*models.Container),
		nextID:     1,
	}
}

func (m *mockContainerService) CreateContainer(ctx context.Context, input services.CreateContainerInput) (*models.Container, error) {
	m.lastCreateInput = &input
	if m.createError != nil {
		return nil, m.createError
	}

	// Determine WorkDir based on SkipGitRepo
	workDir := "/app"
	if !input.SkipGitRepo && input.GitRepoName != "" {
		workDir = "/workspace/" + input.GitRepoName
	}

	container := &models.Container{
		Name:           input.Name,
		DockerID:       "docker-" + input.Name,
		Status:         models.ContainerStatusCreated,
		InitStatus:     models.InitStatusPending,
		GitRepoURL:     input.GitRepoURL,
		GitRepoName:    input.GitRepoName,
		WorkDir:        workDir,
		SkipGitRepo:    input.SkipGitRepo,
		EnableYoloMode: input.EnableYoloMode,
	}
	container.ID = m.nextID
	container.CreatedAt = time.Now()
	m.nextID++

	m.containers[container.ID] = container
	return container, nil
}

func (m *mockContainerService) GetContainer(id uint) (*models.Container, error) {
	if m.getError != nil {
		return nil, m.getError
	}
	container, exists := m.containers[id]
	if !exists {
		return nil, services.ErrContainerNotFound
	}
	return container, nil
}

func (m *mockContainerService) ListContainers() ([]models.Container, error) {
	result := make([]models.Container, 0, len(m.containers))
	for _, c := range m.containers {
		result = append(result, *c)
	}
	return result, nil
}

// ============================================================================
// Test Setup Helpers
// ============================================================================

// setupContainerTestRouter creates a test router with the container handler
func setupContainerTestRouter(mockService *mockContainerService) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()

	// Create a minimal handler that uses our mock
	handler := &testContainerHandler{
		mockService: mockService,
	}

	api := router.Group("/api")
	api.POST("/containers", handler.CreateContainer)
	api.GET("/containers/:id", handler.GetContainer)

	return router
}

// testContainerHandler is a test handler that uses the mock service
type testContainerHandler struct {
	mockService *mockContainerService
}

func (h *testContainerHandler) CreateContainer(c *gin.Context) {
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

	container, err := h.mockService.CreateContainer(c.Request.Context(), input)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"container": services.ToContainerInfo(container),
		"message":   "Container created and initialization started",
	})
}

func (h *testContainerHandler) GetContainer(c *gin.Context) {
	id, err := parseID(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid container ID"})
		return
	}

	container, err := h.mockService.GetContainer(id)
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

// ============================================================================
// Task 6.3: POST /api/containers New Fields Tests
// ============================================================================

// TestCreateContainer_WithSelectedClaudeMD tests creating container with selected_claude_md field
func TestCreateContainer_WithSelectedClaudeMD(t *testing.T) {
	mockService := newMockContainerService()
	router := setupContainerTestRouter(mockService)

	claudeMDID := uint(1)
	body := map[string]interface{}{
		"name":              "test-container",
		"skip_git_repo":     true,
		"selected_claude_md": claudeMDID,
	}
	jsonBody, _ := json.Marshal(body)

	req, _ := http.NewRequest("POST", "/api/containers", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code, "Expected status 201, got %d. Body: %s", w.Code, w.Body.String())

	// Verify the input was passed correctly to the service
	assert.NotNil(t, mockService.lastCreateInput)
	assert.NotNil(t, mockService.lastCreateInput.SelectedClaudeMD)
	assert.Equal(t, claudeMDID, *mockService.lastCreateInput.SelectedClaudeMD)
}

// TestCreateContainer_WithSelectedSkills tests creating container with selected_skills array
func TestCreateContainer_WithSelectedSkills(t *testing.T) {
	mockService := newMockContainerService()
	router := setupContainerTestRouter(mockService)

	skillIDs := []uint{1, 2, 3}
	body := map[string]interface{}{
		"name":            "test-container",
		"skip_git_repo":   true,
		"selected_skills": skillIDs,
	}
	jsonBody, _ := json.Marshal(body)

	req, _ := http.NewRequest("POST", "/api/containers", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code, "Expected status 201, got %d. Body: %s", w.Code, w.Body.String())

	// Verify the input was passed correctly to the service
	assert.NotNil(t, mockService.lastCreateInput)
	assert.Equal(t, len(skillIDs), len(mockService.lastCreateInput.SelectedSkills))
	for i, id := range skillIDs {
		assert.Equal(t, id, mockService.lastCreateInput.SelectedSkills[i])
	}
}

// TestCreateContainer_WithSelectedMCPs tests creating container with selected_mcps array
func TestCreateContainer_WithSelectedMCPs(t *testing.T) {
	mockService := newMockContainerService()
	router := setupContainerTestRouter(mockService)

	mcpIDs := []uint{4, 5}
	body := map[string]interface{}{
		"name":          "test-container",
		"skip_git_repo": true,
		"selected_mcps": mcpIDs,
	}
	jsonBody, _ := json.Marshal(body)

	req, _ := http.NewRequest("POST", "/api/containers", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code, "Expected status 201, got %d. Body: %s", w.Code, w.Body.String())

	// Verify the input was passed correctly to the service
	assert.NotNil(t, mockService.lastCreateInput)
	assert.Equal(t, len(mcpIDs), len(mockService.lastCreateInput.SelectedMCPs))
	for i, id := range mcpIDs {
		assert.Equal(t, id, mockService.lastCreateInput.SelectedMCPs[i])
	}
}

// TestCreateContainer_WithSelectedCommands tests creating container with selected_commands array
func TestCreateContainer_WithSelectedCommands(t *testing.T) {
	mockService := newMockContainerService()
	router := setupContainerTestRouter(mockService)

	commandIDs := []uint{6, 7, 8}
	body := map[string]interface{}{
		"name":              "test-container",
		"skip_git_repo":     true,
		"selected_commands": commandIDs,
	}
	jsonBody, _ := json.Marshal(body)

	req, _ := http.NewRequest("POST", "/api/containers", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code, "Expected status 201, got %d. Body: %s", w.Code, w.Body.String())

	// Verify the input was passed correctly to the service
	assert.NotNil(t, mockService.lastCreateInput)
	assert.Equal(t, len(commandIDs), len(mockService.lastCreateInput.SelectedCommands))
	for i, id := range commandIDs {
		assert.Equal(t, id, mockService.lastCreateInput.SelectedCommands[i])
	}
}

// TestCreateContainer_WithSkipGitRepoTrue tests creating container with skip_git_repo=true
func TestCreateContainer_WithSkipGitRepoTrue(t *testing.T) {
	mockService := newMockContainerService()
	router := setupContainerTestRouter(mockService)

	body := map[string]interface{}{
		"name":          "empty-container",
		"skip_git_repo": true,
	}
	jsonBody, _ := json.Marshal(body)

	req, _ := http.NewRequest("POST", "/api/containers", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code, "Expected status 201, got %d. Body: %s", w.Code, w.Body.String())

	// Verify the input was passed correctly to the service
	assert.NotNil(t, mockService.lastCreateInput)
	assert.True(t, mockService.lastCreateInput.SkipGitRepo)
	assert.Empty(t, mockService.lastCreateInput.GitRepoURL)

	// Verify response contains container with correct WorkDir
	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	assert.NoError(t, err)

	containerData := response["container"].(map[string]interface{})
	assert.Equal(t, "/app", containerData["work_dir"])
}

// TestCreateContainer_WithEnableYoloModeTrue tests creating container with enable_yolo_mode=true
func TestCreateContainer_WithEnableYoloModeTrue(t *testing.T) {
	mockService := newMockContainerService()
	router := setupContainerTestRouter(mockService)

	body := map[string]interface{}{
		"name":             "yolo-container",
		"skip_git_repo":    true,
		"enable_yolo_mode": true,
	}
	jsonBody, _ := json.Marshal(body)

	req, _ := http.NewRequest("POST", "/api/containers", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code, "Expected status 201, got %d. Body: %s", w.Code, w.Body.String())

	// Verify the input was passed correctly to the service
	assert.NotNil(t, mockService.lastCreateInput)
	assert.True(t, mockService.lastCreateInput.EnableYoloMode)
}

// TestCreateContainer_WithAllNewFields tests creating container with all new fields combined
func TestCreateContainer_WithAllNewFields(t *testing.T) {
	mockService := newMockContainerService()
	router := setupContainerTestRouter(mockService)

	claudeMDID := uint(1)
	body := map[string]interface{}{
		"name":               "full-config-container",
		"skip_git_repo":      true,
		"enable_yolo_mode":   true,
		"selected_claude_md": claudeMDID,
		"selected_skills":    []uint{2, 3},
		"selected_mcps":      []uint{4, 5, 6},
		"selected_commands":  []uint{7},
	}
	jsonBody, _ := json.Marshal(body)

	req, _ := http.NewRequest("POST", "/api/containers", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code, "Expected status 201, got %d. Body: %s", w.Code, w.Body.String())

	// Verify all inputs were passed correctly to the service
	assert.NotNil(t, mockService.lastCreateInput)
	assert.True(t, mockService.lastCreateInput.SkipGitRepo)
	assert.True(t, mockService.lastCreateInput.EnableYoloMode)
	assert.NotNil(t, mockService.lastCreateInput.SelectedClaudeMD)
	assert.Equal(t, claudeMDID, *mockService.lastCreateInput.SelectedClaudeMD)
	assert.Equal(t, 2, len(mockService.lastCreateInput.SelectedSkills))
	assert.Equal(t, 3, len(mockService.lastCreateInput.SelectedMCPs))
	assert.Equal(t, 1, len(mockService.lastCreateInput.SelectedCommands))
}

// ============================================================================
// Task 6.3: GET /api/containers/:id Tests - injection_status field
// ============================================================================

// TestGetContainer_WithInjectionStatus tests that response includes injection_status field when present
func TestGetContainer_WithInjectionStatus(t *testing.T) {
	mockService := newMockContainerService()
	router := setupContainerTestRouter(mockService)

	// Create a container with injection status
	now := time.Now()
	injectionStatus := &models.InjectionStatus{
		ContainerID: "docker-test",
		Successful:  []string{"template1", "template2"},
		Failed: []models.FailedTemplate{
			{
				TemplateName: "template3",
				ConfigType:   "MCP",
				Reason:       "invalid JSON format",
			},
		},
		Warnings:   []string{"warning1"},
		InjectedAt: now,
	}

	container := &models.Container{
		Name:            "test-container",
		DockerID:        "docker-test",
		Status:          models.ContainerStatusRunning,
		InitStatus:      models.InitStatusReady,
		WorkDir:         "/app",
		InjectionStatus: injectionStatus,
	}
	container.ID = 1
	container.CreatedAt = now
	mockService.containers[1] = container

	req, _ := http.NewRequest("GET", "/api/containers/1", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code, "Expected status 200, got %d. Body: %s", w.Code, w.Body.String())

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	assert.NoError(t, err)

	// Verify injection_status is present in response
	injectionStatusData, exists := response["injection_status"]
	assert.True(t, exists, "Response should include injection_status field")
	assert.NotNil(t, injectionStatusData)

	// Verify injection_status structure
	statusMap := injectionStatusData.(map[string]interface{})
	assert.Equal(t, "docker-test", statusMap["container_id"])

	successful := statusMap["successful"].([]interface{})
	assert.Equal(t, 2, len(successful))
	assert.Equal(t, "template1", successful[0])
	assert.Equal(t, "template2", successful[1])

	failed := statusMap["failed"].([]interface{})
	assert.Equal(t, 1, len(failed))
	failedItem := failed[0].(map[string]interface{})
	assert.Equal(t, "template3", failedItem["template_name"])
	assert.Equal(t, "MCP", failedItem["config_type"])
	assert.Equal(t, "invalid JSON format", failedItem["reason"])

	warnings := statusMap["warnings"].([]interface{})
	assert.Equal(t, 1, len(warnings))
	assert.Equal(t, "warning1", warnings[0])
}

// TestGetContainer_WithoutInjectionStatus tests that injection_status is omitted when nil
func TestGetContainer_WithoutInjectionStatus(t *testing.T) {
	mockService := newMockContainerService()
	router := setupContainerTestRouter(mockService)

	// Create a container without injection status
	now := time.Now()
	container := &models.Container{
		Name:            "test-container",
		DockerID:        "docker-test",
		Status:          models.ContainerStatusRunning,
		InitStatus:      models.InitStatusReady,
		WorkDir:         "/app",
		InjectionStatus: nil, // No injection status
	}
	container.ID = 1
	container.CreatedAt = now
	mockService.containers[1] = container

	req, _ := http.NewRequest("GET", "/api/containers/1", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code, "Expected status 200, got %d. Body: %s", w.Code, w.Body.String())

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	assert.NoError(t, err)

	// Verify injection_status is omitted (not present or null) when nil
	injectionStatusData, exists := response["injection_status"]
	if exists {
		// If the key exists, it should be null
		assert.Nil(t, injectionStatusData, "injection_status should be null when not set")
	}
	// If the key doesn't exist, that's also acceptable (omitempty behavior)
}

// TestGetContainer_NotFound tests 404 response for non-existing container
func TestGetContainer_NotFound(t *testing.T) {
	mockService := newMockContainerService()
	router := setupContainerTestRouter(mockService)

	req, _ := http.NewRequest("GET", "/api/containers/99999", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNotFound, w.Code, "Expected status 404, got %d. Body: %s", w.Code, w.Body.String())

	var response map[string]string
	json.Unmarshal(w.Body.Bytes(), &response)
	assert.Equal(t, "Container not found", response["error"])
}

// TestGetContainer_InvalidID tests 400 response for invalid ID format
func TestGetContainer_InvalidID(t *testing.T) {
	mockService := newMockContainerService()
	router := setupContainerTestRouter(mockService)

	req, _ := http.NewRequest("GET", "/api/containers/invalid", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code, "Expected status 400, got %d. Body: %s", w.Code, w.Body.String())
}

// TestGetContainer_WithEmptyInjectionStatus tests response with empty successful/failed lists
func TestGetContainer_WithEmptyInjectionStatus(t *testing.T) {
	mockService := newMockContainerService()
	router := setupContainerTestRouter(mockService)

	// Create a container with empty injection status (no configs selected)
	now := time.Now()
	injectionStatus := &models.InjectionStatus{
		ContainerID: "docker-test",
		Successful:  []string{},
		Failed:      []models.FailedTemplate{},
		Warnings:    []string{},
		InjectedAt:  now,
	}

	container := &models.Container{
		Name:            "test-container",
		DockerID:        "docker-test",
		Status:          models.ContainerStatusRunning,
		InitStatus:      models.InitStatusReady,
		WorkDir:         "/app",
		InjectionStatus: injectionStatus,
	}
	container.ID = 1
	container.CreatedAt = now
	mockService.containers[1] = container

	req, _ := http.NewRequest("GET", "/api/containers/1", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code, "Expected status 200, got %d. Body: %s", w.Code, w.Body.String())

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	assert.NoError(t, err)

	// Verify injection_status is present with empty lists
	injectionStatusData, exists := response["injection_status"]
	assert.True(t, exists, "Response should include injection_status field")
	assert.NotNil(t, injectionStatusData)

	statusMap := injectionStatusData.(map[string]interface{})

	// Successful should be empty array or nil
	if successful, ok := statusMap["successful"]; ok && successful != nil {
		successfulArr := successful.([]interface{})
		assert.Equal(t, 0, len(successfulArr), "Successful list should be empty")
	}

	// Failed should be empty array or nil
	if failed, ok := statusMap["failed"]; ok && failed != nil {
		failedArr := failed.([]interface{})
		assert.Equal(t, 0, len(failedArr), "Failed list should be empty")
	}
}
