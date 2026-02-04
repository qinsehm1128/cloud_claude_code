package handlers

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"cc-platform/internal/models"
	"cc-platform/internal/services"

	"github.com/gin-gonic/gin"
)

// ============================================================================
// Mock ConfigTemplateService for Handler Tests
// ============================================================================

// mockConfigTemplateStore is an in-memory store for testing
type mockConfigTemplateStore struct {
	mu        sync.RWMutex
	templates map[uint]*models.ClaudeConfigTemplate
	nextID    uint
}

func newMockStore() *mockConfigTemplateStore {
	return &mockConfigTemplateStore{
		templates: make(map[uint]*models.ClaudeConfigTemplate),
		nextID:    1,
	}
}

// mockConfigTemplateServiceForHandler implements ConfigTemplateService for handler testing
type mockConfigTemplateServiceForHandler struct {
	store *mockConfigTemplateStore
}

func newMockServiceForHandler() *mockConfigTemplateServiceForHandler {
	return &mockConfigTemplateServiceForHandler{
		store: newMockStore(),
	}
}

func (s *mockConfigTemplateServiceForHandler) Create(input services.CreateConfigTemplateInput) (*models.ClaudeConfigTemplate, error) {
	// Validate config type
	if !input.ConfigType.IsValid() {
		return nil, services.ErrInvalidConfigType
	}

	// Validate content based on config type
	if err := s.ValidateContent(input.ConfigType, input.Content); err != nil {
		return nil, err
	}

	s.store.mu.Lock()
	defer s.store.mu.Unlock()

	// Check for duplicate name within same config type
	for _, tmpl := range s.store.templates {
		if tmpl.Name == input.Name && tmpl.ConfigType == input.ConfigType {
			return nil, services.ErrDuplicateTemplateName
		}
	}

	template := &models.ClaudeConfigTemplate{
		Name:        input.Name,
		ConfigType:  input.ConfigType,
		Content:     input.Content,
		Description: input.Description,
	}
	template.ID = s.store.nextID
	s.store.nextID++

	s.store.templates[template.ID] = template
	return template, nil
}

func (s *mockConfigTemplateServiceForHandler) GetByID(id uint) (*models.ClaudeConfigTemplate, error) {
	s.store.mu.RLock()
	defer s.store.mu.RUnlock()

	template, exists := s.store.templates[id]
	if !exists {
		return nil, services.ErrTemplateNotFound
	}
	return template, nil
}

func (s *mockConfigTemplateServiceForHandler) List(configType *models.ConfigType) ([]models.ClaudeConfigTemplate, error) {
	s.store.mu.RLock()
	defer s.store.mu.RUnlock()

	if configType != nil && !configType.IsValid() {
		return nil, services.ErrInvalidConfigType
	}

	var result []models.ClaudeConfigTemplate
	for _, tmpl := range s.store.templates {
		if configType == nil || tmpl.ConfigType == *configType {
			result = append(result, *tmpl)
		}
	}
	return result, nil
}

func (s *mockConfigTemplateServiceForHandler) Update(id uint, input services.UpdateConfigTemplateInput) (*models.ClaudeConfigTemplate, error) {
	s.store.mu.Lock()
	defer s.store.mu.Unlock()

	template, exists := s.store.templates[id]
	if !exists {
		return nil, services.ErrTemplateNotFound
	}

	if input.Name != nil {
		// Check for duplicate name within same config type
		for _, tmpl := range s.store.templates {
			if tmpl.ID != id && tmpl.Name == *input.Name && tmpl.ConfigType == template.ConfigType {
				return nil, services.ErrDuplicateTemplateName
			}
		}
		template.Name = *input.Name
	}

	if input.Content != nil {
		if err := s.ValidateContent(template.ConfigType, *input.Content); err != nil {
			return nil, err
		}
		template.Content = *input.Content
	}

	if input.Description != nil {
		template.Description = *input.Description
	}

	return template, nil
}

func (s *mockConfigTemplateServiceForHandler) Delete(id uint) error {
	s.store.mu.Lock()
	defer s.store.mu.Unlock()

	if _, exists := s.store.templates[id]; !exists {
		return services.ErrTemplateNotFound
	}

	delete(s.store.templates, id)
	return nil
}

func (s *mockConfigTemplateServiceForHandler) ValidateContent(configType models.ConfigType, content string) error {
	if content == "" {
		return errors.New("content cannot be empty")
	}

	switch configType {
	case models.ConfigTypeMCP:
		return s.ValidateMCPConfig(content)
	case models.ConfigTypeSkill:
		_, err := s.ParseSkillMetadata(content)
		return err
	case models.ConfigTypeClaudeMD, models.ConfigTypeCommand:
		return nil
	default:
		return services.ErrInvalidConfigType
	}
}

func (s *mockConfigTemplateServiceForHandler) ParseSkillMetadata(content string) (*models.SkillMetadata, error) {
	// Simplified implementation for testing
	return &models.SkillMetadata{}, nil
}

func (s *mockConfigTemplateServiceForHandler) ValidateMCPConfig(content string) error {
	var config map[string]interface{}
	if err := json.Unmarshal([]byte(content), &config); err != nil {
		return errors.New("invalid MCP configuration: invalid JSON")
	}

	if _, hasCommand := config["command"]; !hasCommand {
		return errors.New("invalid MCP configuration: missing required field 'command'")
	}

	if _, hasArgs := config["args"]; !hasArgs {
		return errors.New("invalid MCP configuration: missing required field 'args'")
	}

	return nil
}

// ============================================================================
// Test Setup Helpers
// ============================================================================

// setupTestRouter creates a test router with the handler registered
func setupTestRouter(service services.ConfigTemplateService) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	handler := NewConfigTemplateHandler(service)
	handler.RegisterRoutes(router.Group("/api"))
	return router
}

// setupTestRouterWithMock creates a test router with a fresh mock service
func setupTestRouterWithMock() (*gin.Engine, *mockConfigTemplateServiceForHandler) {
	service := newMockServiceForHandler()
	router := setupTestRouter(service)
	return router, service
}

// ============================================================================
// POST /api/claude-configs Tests
// ============================================================================

// TestCreateTemplate_Success tests successful creation of a config template (201)
func TestCreateTemplate_Success(t *testing.T) {
	router, _ := setupTestRouterWithMock()

	body := map[string]interface{}{
		"name":        "test-template",
		"config_type": "CLAUDE_MD",
		"content":     "# Test Content",
		"description": "A test template",
	}
	jsonBody, _ := json.Marshal(body)

	req, _ := http.NewRequest("POST", "/api/claude-configs", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Errorf("Expected status %d, got %d. Body: %s", http.StatusCreated, w.Code, w.Body.String())
	}

	var response models.ClaudeConfigTemplate
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to unmarshal response: %v", err)
	}

	if response.Name != "test-template" {
		t.Errorf("Expected name 'test-template', got %q", response.Name)
	}
	if response.ConfigType != models.ConfigTypeClaudeMD {
		t.Errorf("Expected config_type 'CLAUDE_MD', got %q", response.ConfigType)
	}
}

// TestCreateTemplate_ValidationError tests 400 response for validation errors
func TestCreateTemplate_ValidationError(t *testing.T) {
	router, _ := setupTestRouterWithMock()

	testCases := []struct {
		name     string
		body     map[string]interface{}
		expected string
	}{
		{
			name: "missing name",
			body: map[string]interface{}{
				"config_type": "CLAUDE_MD",
				"content":     "# Content",
			},
			expected: "Invalid request body",
		},
		{
			name: "missing config_type",
			body: map[string]interface{}{
				"name":    "test",
				"content": "# Content",
			},
			expected: "Invalid request body",
		},
		{
			name: "missing content",
			body: map[string]interface{}{
				"name":        "test",
				"config_type": "CLAUDE_MD",
			},
			expected: "Invalid request body",
		},
		{
			name: "empty content",
			body: map[string]interface{}{
				"name":        "test",
				"config_type": "CLAUDE_MD",
				"content":     "",
			},
			expected: "Invalid request body",
		},
		{
			name: "invalid config_type",
			body: map[string]interface{}{
				"name":        "test",
				"config_type": "INVALID_TYPE",
				"content":     "# Content",
			},
			expected: "invalid config_type",
		},
		{
			name: "invalid MCP JSON",
			body: map[string]interface{}{
				"name":        "test",
				"config_type": "MCP",
				"content":     "not valid json",
			},
			expected: "invalid MCP configuration",
		},
		{
			name: "MCP missing command field",
			body: map[string]interface{}{
				"name":        "test",
				"config_type": "MCP",
				"content":     `{"args": []}`,
			},
			expected: "invalid MCP configuration",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			jsonBody, _ := json.Marshal(tc.body)
			req, _ := http.NewRequest("POST", "/api/claude-configs", bytes.NewBuffer(jsonBody))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			router.ServeHTTP(w, req)

			if w.Code != http.StatusBadRequest {
				t.Errorf("Expected status %d, got %d. Body: %s", http.StatusBadRequest, w.Code, w.Body.String())
			}

			var response map[string]string
			json.Unmarshal(w.Body.Bytes(), &response)
			if response["error"] == "" {
				t.Error("Expected error message in response")
			}
		})
	}
}

// TestCreateTemplate_DuplicateName tests 409 response for duplicate name
func TestCreateTemplate_DuplicateName(t *testing.T) {
	router, _ := setupTestRouterWithMock()

	body := map[string]interface{}{
		"name":        "duplicate-name",
		"config_type": "SKILL",
		"content":     "# Skill Content",
	}
	jsonBody, _ := json.Marshal(body)

	// Create first template
	req1, _ := http.NewRequest("POST", "/api/claude-configs", bytes.NewBuffer(jsonBody))
	req1.Header.Set("Content-Type", "application/json")
	w1 := httptest.NewRecorder()
	router.ServeHTTP(w1, req1)

	if w1.Code != http.StatusCreated {
		t.Fatalf("First create failed: %d - %s", w1.Code, w1.Body.String())
	}

	// Try to create second template with same name and type
	req2, _ := http.NewRequest("POST", "/api/claude-configs", bytes.NewBuffer(jsonBody))
	req2.Header.Set("Content-Type", "application/json")
	w2 := httptest.NewRecorder()
	router.ServeHTTP(w2, req2)

	if w2.Code != http.StatusConflict {
		t.Errorf("Expected status %d for duplicate name, got %d. Body: %s", http.StatusConflict, w2.Code, w2.Body.String())
	}
}

// TestCreateTemplate_AllConfigTypes tests successful creation for all config types
func TestCreateTemplate_AllConfigTypes(t *testing.T) {
	router, _ := setupTestRouterWithMock()

	testCases := []struct {
		name       string
		configType string
		content    string
	}{
		{"claude-md-test", "CLAUDE_MD", "# CLAUDE.MD Content"},
		{"skill-test", "SKILL", "# Skill Content"},
		{"mcp-test", "MCP", `{"command": "node", "args": ["server.js"]}`},
		{"command-test", "COMMAND", "# Command Content"},
	}

	for _, tc := range testCases {
		t.Run(tc.configType, func(t *testing.T) {
			body := map[string]interface{}{
				"name":        tc.name,
				"config_type": tc.configType,
				"content":     tc.content,
			}
			jsonBody, _ := json.Marshal(body)

			req, _ := http.NewRequest("POST", "/api/claude-configs", bytes.NewBuffer(jsonBody))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			router.ServeHTTP(w, req)

			if w.Code != http.StatusCreated {
				t.Errorf("Expected status %d, got %d. Body: %s", http.StatusCreated, w.Code, w.Body.String())
			}
		})
	}
}

// ============================================================================
// GET /api/claude-configs Tests
// ============================================================================

// TestListTemplates_Success tests successful listing of templates (200)
func TestListTemplates_Success(t *testing.T) {
	router, service := setupTestRouterWithMock()

	// Create some templates
	service.Create(services.CreateConfigTemplateInput{
		Name:       "template1",
		ConfigType: models.ConfigTypeClaudeMD,
		Content:    "# Content 1",
	})
	service.Create(services.CreateConfigTemplateInput{
		Name:       "template2",
		ConfigType: models.ConfigTypeSkill,
		Content:    "# Content 2",
	})

	req, _ := http.NewRequest("GET", "/api/claude-configs", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status %d, got %d. Body: %s", http.StatusOK, w.Code, w.Body.String())
	}

	var response []models.ClaudeConfigTemplate
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to unmarshal response: %v", err)
	}

	if len(response) != 2 {
		t.Errorf("Expected 2 templates, got %d", len(response))
	}
}

// TestListTemplates_EmptyList tests listing when no templates exist (200)
func TestListTemplates_EmptyList(t *testing.T) {
	router, _ := setupTestRouterWithMock()

	req, _ := http.NewRequest("GET", "/api/claude-configs", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status %d, got %d. Body: %s", http.StatusOK, w.Code, w.Body.String())
	}

	var response []models.ClaudeConfigTemplate
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to unmarshal response: %v", err)
	}

	if response == nil {
		// Empty array is acceptable, but nil should be converted to empty array
		response = []models.ClaudeConfigTemplate{}
	}

	if len(response) != 0 {
		t.Errorf("Expected 0 templates, got %d", len(response))
	}
}

// TestListTemplates_FilterByType tests filtering templates by type parameter (200)
func TestListTemplates_FilterByType(t *testing.T) {
	router, service := setupTestRouterWithMock()

	// Create templates of different types
	service.Create(services.CreateConfigTemplateInput{
		Name:       "skill1",
		ConfigType: models.ConfigTypeSkill,
		Content:    "# Skill 1",
	})
	service.Create(services.CreateConfigTemplateInput{
		Name:       "skill2",
		ConfigType: models.ConfigTypeSkill,
		Content:    "# Skill 2",
	})
	service.Create(services.CreateConfigTemplateInput{
		Name:       "claude-md",
		ConfigType: models.ConfigTypeClaudeMD,
		Content:    "# CLAUDE.MD",
	})
	service.Create(services.CreateConfigTemplateInput{
		Name:       "mcp",
		ConfigType: models.ConfigTypeMCP,
		Content:    `{"command": "test", "args": []}`,
	})

	// Filter by SKILL type
	req, _ := http.NewRequest("GET", "/api/claude-configs?type=SKILL", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status %d, got %d. Body: %s", http.StatusOK, w.Code, w.Body.String())
	}

	var response []models.ClaudeConfigTemplate
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to unmarshal response: %v", err)
	}

	if len(response) != 2 {
		t.Errorf("Expected 2 SKILL templates, got %d", len(response))
	}

	for _, tmpl := range response {
		if tmpl.ConfigType != models.ConfigTypeSkill {
			t.Errorf("Expected config_type SKILL, got %q", tmpl.ConfigType)
		}
	}
}

// TestListTemplates_InvalidTypeFilter tests 400 response for invalid type filter
func TestListTemplates_InvalidTypeFilter(t *testing.T) {
	router, _ := setupTestRouterWithMock()

	req, _ := http.NewRequest("GET", "/api/claude-configs?type=INVALID_TYPE", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected status %d, got %d. Body: %s", http.StatusBadRequest, w.Code, w.Body.String())
	}

	var response map[string]string
	json.Unmarshal(w.Body.Bytes(), &response)
	if response["error"] == "" {
		t.Error("Expected error message in response")
	}
}

// ============================================================================
// GET /api/claude-configs/:id Tests
// ============================================================================

// TestGetTemplate_Success tests successful retrieval of a template (200)
func TestGetTemplate_Success(t *testing.T) {
	router, service := setupTestRouterWithMock()

	// Create a template
	created, _ := service.Create(services.CreateConfigTemplateInput{
		Name:        "get-test",
		ConfigType:  models.ConfigTypeClaudeMD,
		Content:     "# Test Content",
		Description: "Test description",
	})

	req, _ := http.NewRequest("GET", "/api/claude-configs/1", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status %d, got %d. Body: %s", http.StatusOK, w.Code, w.Body.String())
	}

	var response models.ClaudeConfigTemplate
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to unmarshal response: %v", err)
	}

	if response.ID != created.ID {
		t.Errorf("Expected ID %d, got %d", created.ID, response.ID)
	}
	if response.Name != created.Name {
		t.Errorf("Expected name %q, got %q", created.Name, response.Name)
	}
	if response.ConfigType != created.ConfigType {
		t.Errorf("Expected config_type %q, got %q", created.ConfigType, response.ConfigType)
	}
	if response.Content != created.Content {
		t.Errorf("Expected content %q, got %q", created.Content, response.Content)
	}
}

// TestGetTemplate_NotFound tests 404 response for non-existing template
func TestGetTemplate_NotFound(t *testing.T) {
	router, _ := setupTestRouterWithMock()

	req, _ := http.NewRequest("GET", "/api/claude-configs/99999", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("Expected status %d, got %d. Body: %s", http.StatusNotFound, w.Code, w.Body.String())
	}

	var response map[string]string
	json.Unmarshal(w.Body.Bytes(), &response)
	if response["error"] != "template not found" {
		t.Errorf("Expected error 'template not found', got %q", response["error"])
	}
}

// TestGetTemplate_InvalidID tests 400 response for invalid ID format
func TestGetTemplate_InvalidID(t *testing.T) {
	router, _ := setupTestRouterWithMock()

	req, _ := http.NewRequest("GET", "/api/claude-configs/invalid", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected status %d, got %d. Body: %s", http.StatusBadRequest, w.Code, w.Body.String())
	}
}

// ============================================================================
// PUT /api/claude-configs/:id Tests
// ============================================================================

// TestUpdateTemplate_Success tests successful update of a template (200)
func TestUpdateTemplate_Success(t *testing.T) {
	router, service := setupTestRouterWithMock()

	// Create a template
	service.Create(services.CreateConfigTemplateInput{
		Name:        "update-test",
		ConfigType:  models.ConfigTypeClaudeMD,
		Content:     "# Original Content",
		Description: "Original description",
	})

	body := map[string]interface{}{
		"name":        "updated-name",
		"content":     "# Updated Content",
		"description": "Updated description",
	}
	jsonBody, _ := json.Marshal(body)

	req, _ := http.NewRequest("PUT", "/api/claude-configs/1", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status %d, got %d. Body: %s", http.StatusOK, w.Code, w.Body.String())
	}

	var response models.ClaudeConfigTemplate
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to unmarshal response: %v", err)
	}

	if response.Name != "updated-name" {
		t.Errorf("Expected name 'updated-name', got %q", response.Name)
	}
	if response.Content != "# Updated Content" {
		t.Errorf("Expected content '# Updated Content', got %q", response.Content)
	}
	if response.Description != "Updated description" {
		t.Errorf("Expected description 'Updated description', got %q", response.Description)
	}
}

// TestUpdateTemplate_PartialUpdate tests partial update of a template (200)
func TestUpdateTemplate_PartialUpdate(t *testing.T) {
	router, service := setupTestRouterWithMock()

	// Create a template
	created, _ := service.Create(services.CreateConfigTemplateInput{
		Name:        "partial-update-test",
		ConfigType:  models.ConfigTypeClaudeMD,
		Content:     "# Original Content",
		Description: "Original description",
	})

	// Update only the name
	body := map[string]interface{}{
		"name": "new-name-only",
	}
	jsonBody, _ := json.Marshal(body)

	req, _ := http.NewRequest("PUT", "/api/claude-configs/1", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status %d, got %d. Body: %s", http.StatusOK, w.Code, w.Body.String())
	}

	var response models.ClaudeConfigTemplate
	json.Unmarshal(w.Body.Bytes(), &response)

	if response.Name != "new-name-only" {
		t.Errorf("Expected name 'new-name-only', got %q", response.Name)
	}
	// Other fields should remain unchanged
	if response.Content != created.Content {
		t.Errorf("Expected content to remain %q, got %q", created.Content, response.Content)
	}
}

// TestUpdateTemplate_NotFound tests 404 response for non-existing template
func TestUpdateTemplate_NotFound(t *testing.T) {
	router, _ := setupTestRouterWithMock()

	body := map[string]interface{}{
		"name": "new-name",
	}
	jsonBody, _ := json.Marshal(body)

	req, _ := http.NewRequest("PUT", "/api/claude-configs/99999", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("Expected status %d, got %d. Body: %s", http.StatusNotFound, w.Code, w.Body.String())
	}

	var response map[string]string
	json.Unmarshal(w.Body.Bytes(), &response)
	if response["error"] != "template not found" {
		t.Errorf("Expected error 'template not found', got %q", response["error"])
	}
}

// TestUpdateTemplate_ValidationError tests 400 response for validation errors
func TestUpdateTemplate_ValidationError(t *testing.T) {
	router, service := setupTestRouterWithMock()

	// Create an MCP template
	service.Create(services.CreateConfigTemplateInput{
		Name:       "mcp-update-test",
		ConfigType: models.ConfigTypeMCP,
		Content:    `{"command": "test", "args": []}`,
	})

	// Try to update with invalid MCP JSON
	body := map[string]interface{}{
		"content": "not valid json",
	}
	jsonBody, _ := json.Marshal(body)

	req, _ := http.NewRequest("PUT", "/api/claude-configs/1", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected status %d, got %d. Body: %s", http.StatusBadRequest, w.Code, w.Body.String())
	}
}

// TestUpdateTemplate_InvalidID tests 400 response for invalid ID format
func TestUpdateTemplate_InvalidID(t *testing.T) {
	router, _ := setupTestRouterWithMock()

	body := map[string]interface{}{
		"name": "new-name",
	}
	jsonBody, _ := json.Marshal(body)

	req, _ := http.NewRequest("PUT", "/api/claude-configs/invalid", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected status %d, got %d. Body: %s", http.StatusBadRequest, w.Code, w.Body.String())
	}
}

// ============================================================================
// DELETE /api/claude-configs/:id Tests
// ============================================================================

// TestDeleteTemplate_Success tests successful deletion of a template (204)
func TestDeleteTemplate_Success(t *testing.T) {
	router, service := setupTestRouterWithMock()

	// Create a template
	service.Create(services.CreateConfigTemplateInput{
		Name:       "delete-test",
		ConfigType: models.ConfigTypeClaudeMD,
		Content:    "# Content",
	})

	req, _ := http.NewRequest("DELETE", "/api/claude-configs/1", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	if w.Code != http.StatusNoContent {
		t.Errorf("Expected status %d, got %d. Body: %s", http.StatusNoContent, w.Code, w.Body.String())
	}

	// Verify template is deleted
	getReq, _ := http.NewRequest("GET", "/api/claude-configs/1", nil)
	getW := httptest.NewRecorder()
	router.ServeHTTP(getW, getReq)

	if getW.Code != http.StatusNotFound {
		t.Errorf("Expected template to be deleted, but GET returned status %d", getW.Code)
	}
}

// TestDeleteTemplate_NotFound tests 404 response for non-existing template
func TestDeleteTemplate_NotFound(t *testing.T) {
	router, _ := setupTestRouterWithMock()

	req, _ := http.NewRequest("DELETE", "/api/claude-configs/99999", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("Expected status %d, got %d. Body: %s", http.StatusNotFound, w.Code, w.Body.String())
	}

	var response map[string]string
	json.Unmarshal(w.Body.Bytes(), &response)
	if response["error"] != "template not found" {
		t.Errorf("Expected error 'template not found', got %q", response["error"])
	}
}

// TestDeleteTemplate_InvalidID tests 400 response for invalid ID format
func TestDeleteTemplate_InvalidID(t *testing.T) {
	router, _ := setupTestRouterWithMock()

	req, _ := http.NewRequest("DELETE", "/api/claude-configs/invalid", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected status %d, got %d. Body: %s", http.StatusBadRequest, w.Code, w.Body.String())
	}
}

// TestDeleteTemplate_VerifyListAfterDelete tests that deleted template is not in list
func TestDeleteTemplate_VerifyListAfterDelete(t *testing.T) {
	router, service := setupTestRouterWithMock()

	// Create two templates
	service.Create(services.CreateConfigTemplateInput{
		Name:       "template1",
		ConfigType: models.ConfigTypeClaudeMD,
		Content:    "# Content 1",
	})
	service.Create(services.CreateConfigTemplateInput{
		Name:       "template2",
		ConfigType: models.ConfigTypeClaudeMD,
		Content:    "# Content 2",
	})

	// Delete the first template
	deleteReq, _ := http.NewRequest("DELETE", "/api/claude-configs/1", nil)
	deleteW := httptest.NewRecorder()
	router.ServeHTTP(deleteW, deleteReq)

	if deleteW.Code != http.StatusNoContent {
		t.Fatalf("Delete failed: %d - %s", deleteW.Code, deleteW.Body.String())
	}

	// List templates
	listReq, _ := http.NewRequest("GET", "/api/claude-configs", nil)
	listW := httptest.NewRecorder()
	router.ServeHTTP(listW, listReq)

	var response []models.ClaudeConfigTemplate
	json.Unmarshal(listW.Body.Bytes(), &response)

	if len(response) != 1 {
		t.Errorf("Expected 1 template after deletion, got %d", len(response))
	}

	if len(response) > 0 && response[0].Name != "template2" {
		t.Errorf("Expected remaining template to be 'template2', got %q", response[0].Name)
	}
}
