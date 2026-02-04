package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"cc-platform/internal/models"
	"cc-platform/internal/services"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// ============================================================================
// Integration Test Setup
// ============================================================================

// testDBCounter is used to generate unique database names for each test
var testDBCounter int

// setupIntegrationTestDB creates an in-memory SQLite database for integration testing
// Each test gets its own isolated database to prevent test interference
func setupIntegrationTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	// Use a unique database name for each test to ensure isolation
	testDBCounter++
	dbName := fmt.Sprintf("file:memdb%d?mode=memory&cache=shared", testDBCounter)

	db, err := gorm.Open(sqlite.Open(dbName), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		t.Fatalf("failed to open db: %v", err)
	}

	// Auto migrate the ClaudeConfigTemplate model
	if err := db.AutoMigrate(&models.ClaudeConfigTemplate{}); err != nil {
		t.Fatalf("failed to migrate: %v", err)
	}

	return db
}

// setupIntegrationTestRouter creates a test router with real service and database
func setupIntegrationTestRouter(t *testing.T) (*gin.Engine, *gorm.DB) {
	t.Helper()

	db := setupIntegrationTestDB(t)
	service := services.NewConfigTemplateService(db)

	gin.SetMode(gin.TestMode)
	router := gin.New()
	handler := NewConfigTemplateHandler(service)
	handler.RegisterRoutes(router.Group("/api"))

	return router, db
}


// ============================================================================
// End-to-End CRUD Flow Integration Tests
// ============================================================================

// TestIntegration_EndToEndCRUDFlow_ClaudeMD tests the full CRUD flow for CLAUDE_MD type
// Create → List → Get → Update → Get → Delete → Get (404)
func TestIntegration_EndToEndCRUDFlow_ClaudeMD(t *testing.T) {
	router, _ := setupIntegrationTestRouter(t)

	// Step 1: Create a CLAUDE_MD template
	createBody := map[string]interface{}{
		"name":        "my-claude-md",
		"config_type": "CLAUDE_MD",
		"content":     "# My Project\n\nThis is my CLAUDE.md file.",
		"description": "Main project configuration",
	}
	createJSON, _ := json.Marshal(createBody)

	createReq, _ := http.NewRequest("POST", "/api/claude-configs", bytes.NewBuffer(createJSON))
	createReq.Header.Set("Content-Type", "application/json")
	createW := httptest.NewRecorder()
	router.ServeHTTP(createW, createReq)

	if createW.Code != http.StatusCreated {
		t.Fatalf("Create failed: expected %d, got %d. Body: %s", http.StatusCreated, createW.Code, createW.Body.String())
	}

	var created models.ClaudeConfigTemplate
	if err := json.Unmarshal(createW.Body.Bytes(), &created); err != nil {
		t.Fatalf("Failed to unmarshal created template: %v", err)
	}

	if created.ID == 0 {
		t.Fatal("Expected non-zero ID for created template")
	}
	if created.Name != "my-claude-md" {
		t.Errorf("Expected name 'my-claude-md', got %q", created.Name)
	}
	if created.ConfigType != models.ConfigTypeClaudeMD {
		t.Errorf("Expected config_type 'CLAUDE_MD', got %q", created.ConfigType)
	}

	// Step 2: List templates and verify the created one exists
	listReq, _ := http.NewRequest("GET", "/api/claude-configs", nil)
	listW := httptest.NewRecorder()
	router.ServeHTTP(listW, listReq)

	if listW.Code != http.StatusOK {
		t.Fatalf("List failed: expected %d, got %d. Body: %s", http.StatusOK, listW.Code, listW.Body.String())
	}

	var listed []models.ClaudeConfigTemplate
	if err := json.Unmarshal(listW.Body.Bytes(), &listed); err != nil {
		t.Fatalf("Failed to unmarshal list response: %v", err)
	}

	if len(listed) != 1 {
		t.Fatalf("Expected 1 template in list, got %d", len(listed))
	}
	if listed[0].ID != created.ID {
		t.Errorf("Expected listed template ID %d, got %d", created.ID, listed[0].ID)
	}

	// Step 3: Get the specific template by ID
	getReq, _ := http.NewRequest("GET", fmt.Sprintf("/api/claude-configs/%d", created.ID), nil)
	getW := httptest.NewRecorder()
	router.ServeHTTP(getW, getReq)

	if getW.Code != http.StatusOK {
		t.Fatalf("Get failed: expected %d, got %d. Body: %s", http.StatusOK, getW.Code, getW.Body.String())
	}

	var fetched models.ClaudeConfigTemplate
	if err := json.Unmarshal(getW.Body.Bytes(), &fetched); err != nil {
		t.Fatalf("Failed to unmarshal fetched template: %v", err)
	}

	if fetched.ID != created.ID {
		t.Errorf("Expected fetched ID %d, got %d", created.ID, fetched.ID)
	}
	if fetched.Content != created.Content {
		t.Errorf("Expected fetched content %q, got %q", created.Content, fetched.Content)
	}

	// Step 4: Update the template
	updateBody := map[string]interface{}{
		"name":        "updated-claude-md",
		"content":     "# Updated Project\n\nThis is the updated CLAUDE.md file.",
		"description": "Updated project configuration",
	}
	updateJSON, _ := json.Marshal(updateBody)

	updateReq, _ := http.NewRequest("PUT", fmt.Sprintf("/api/claude-configs/%d", created.ID), bytes.NewBuffer(updateJSON))
	updateReq.Header.Set("Content-Type", "application/json")
	updateW := httptest.NewRecorder()
	router.ServeHTTP(updateW, updateReq)

	if updateW.Code != http.StatusOK {
		t.Fatalf("Update failed: expected %d, got %d. Body: %s", http.StatusOK, updateW.Code, updateW.Body.String())
	}

	var updated models.ClaudeConfigTemplate
	if err := json.Unmarshal(updateW.Body.Bytes(), &updated); err != nil {
		t.Fatalf("Failed to unmarshal updated template: %v", err)
	}

	if updated.Name != "updated-claude-md" {
		t.Errorf("Expected updated name 'updated-claude-md', got %q", updated.Name)
	}
	if updated.Description != "Updated project configuration" {
		t.Errorf("Expected updated description, got %q", updated.Description)
	}

	// Step 5: Get the template again to verify the update persisted
	getAfterUpdateReq, _ := http.NewRequest("GET", fmt.Sprintf("/api/claude-configs/%d", created.ID), nil)
	getAfterUpdateW := httptest.NewRecorder()
	router.ServeHTTP(getAfterUpdateW, getAfterUpdateReq)

	if getAfterUpdateW.Code != http.StatusOK {
		t.Fatalf("Get after update failed: expected %d, got %d", http.StatusOK, getAfterUpdateW.Code)
	}

	var fetchedAfterUpdate models.ClaudeConfigTemplate
	json.Unmarshal(getAfterUpdateW.Body.Bytes(), &fetchedAfterUpdate)

	if fetchedAfterUpdate.Name != "updated-claude-md" {
		t.Errorf("Expected name 'updated-claude-md' after update, got %q", fetchedAfterUpdate.Name)
	}

	// Step 6: Delete the template
	deleteReq, _ := http.NewRequest("DELETE", fmt.Sprintf("/api/claude-configs/%d", created.ID), nil)
	deleteW := httptest.NewRecorder()
	router.ServeHTTP(deleteW, deleteReq)

	if deleteW.Code != http.StatusNoContent {
		t.Fatalf("Delete failed: expected %d, got %d. Body: %s", http.StatusNoContent, deleteW.Code, deleteW.Body.String())
	}

	// Step 7: Verify the template is deleted (404)
	getAfterDeleteReq, _ := http.NewRequest("GET", fmt.Sprintf("/api/claude-configs/%d", created.ID), nil)
	getAfterDeleteW := httptest.NewRecorder()
	router.ServeHTTP(getAfterDeleteW, getAfterDeleteReq)

	if getAfterDeleteW.Code != http.StatusNotFound {
		t.Errorf("Expected 404 after delete, got %d. Body: %s", getAfterDeleteW.Code, getAfterDeleteW.Body.String())
	}
}


// TestIntegration_EndToEndCRUDFlow_Skill tests the full CRUD flow for SKILL type
func TestIntegration_EndToEndCRUDFlow_Skill(t *testing.T) {
	router, _ := setupIntegrationTestRouter(t)

	// Step 1: Create a SKILL template with frontmatter
	createBody := map[string]interface{}{
		"name":        "my-skill",
		"config_type": "SKILL",
		"content": `---
allowed_tools:
  - Read
  - Write
  - Edit
---
# My Skill

This skill allows file operations.`,
		"description": "File operations skill",
	}
	createJSON, _ := json.Marshal(createBody)

	createReq, _ := http.NewRequest("POST", "/api/claude-configs", bytes.NewBuffer(createJSON))
	createReq.Header.Set("Content-Type", "application/json")
	createW := httptest.NewRecorder()
	router.ServeHTTP(createW, createReq)

	if createW.Code != http.StatusCreated {
		t.Fatalf("Create SKILL failed: expected %d, got %d. Body: %s", http.StatusCreated, createW.Code, createW.Body.String())
	}

	var created models.ClaudeConfigTemplate
	json.Unmarshal(createW.Body.Bytes(), &created)

	if created.ConfigType != models.ConfigTypeSkill {
		t.Errorf("Expected config_type 'SKILL', got %q", created.ConfigType)
	}

	// Step 2: List with type filter
	listReq, _ := http.NewRequest("GET", "/api/claude-configs?type=SKILL", nil)
	listW := httptest.NewRecorder()
	router.ServeHTTP(listW, listReq)

	if listW.Code != http.StatusOK {
		t.Fatalf("List SKILL failed: expected %d, got %d", http.StatusOK, listW.Code)
	}

	var listed []models.ClaudeConfigTemplate
	json.Unmarshal(listW.Body.Bytes(), &listed)

	if len(listed) != 1 {
		t.Fatalf("Expected 1 SKILL template, got %d", len(listed))
	}

	// Step 3: Get by ID
	getReq, _ := http.NewRequest("GET", fmt.Sprintf("/api/claude-configs/%d", created.ID), nil)
	getW := httptest.NewRecorder()
	router.ServeHTTP(getW, getReq)

	if getW.Code != http.StatusOK {
		t.Fatalf("Get SKILL failed: expected %d, got %d", http.StatusOK, getW.Code)
	}

	// Step 4: Update
	updateBody := map[string]interface{}{
		"name": "updated-skill",
		"content": `---
allowed_tools:
  - Read
  - Write
  - Edit
  - Bash
---
# Updated Skill

This skill now includes Bash.`,
	}
	updateJSON, _ := json.Marshal(updateBody)

	updateReq, _ := http.NewRequest("PUT", fmt.Sprintf("/api/claude-configs/%d", created.ID), bytes.NewBuffer(updateJSON))
	updateReq.Header.Set("Content-Type", "application/json")
	updateW := httptest.NewRecorder()
	router.ServeHTTP(updateW, updateReq)

	if updateW.Code != http.StatusOK {
		t.Fatalf("Update SKILL failed: expected %d, got %d. Body: %s", http.StatusOK, updateW.Code, updateW.Body.String())
	}

	// Step 5: Verify update
	getAfterUpdateReq, _ := http.NewRequest("GET", fmt.Sprintf("/api/claude-configs/%d", created.ID), nil)
	getAfterUpdateW := httptest.NewRecorder()
	router.ServeHTTP(getAfterUpdateW, getAfterUpdateReq)

	var fetchedAfterUpdate models.ClaudeConfigTemplate
	json.Unmarshal(getAfterUpdateW.Body.Bytes(), &fetchedAfterUpdate)

	if fetchedAfterUpdate.Name != "updated-skill" {
		t.Errorf("Expected name 'updated-skill', got %q", fetchedAfterUpdate.Name)
	}

	// Step 6: Delete
	deleteReq, _ := http.NewRequest("DELETE", fmt.Sprintf("/api/claude-configs/%d", created.ID), nil)
	deleteW := httptest.NewRecorder()
	router.ServeHTTP(deleteW, deleteReq)

	if deleteW.Code != http.StatusNoContent {
		t.Fatalf("Delete SKILL failed: expected %d, got %d", http.StatusNoContent, deleteW.Code)
	}

	// Step 7: Verify deleted
	getAfterDeleteReq, _ := http.NewRequest("GET", fmt.Sprintf("/api/claude-configs/%d", created.ID), nil)
	getAfterDeleteW := httptest.NewRecorder()
	router.ServeHTTP(getAfterDeleteW, getAfterDeleteReq)

	if getAfterDeleteW.Code != http.StatusNotFound {
		t.Errorf("Expected 404 after delete, got %d", getAfterDeleteW.Code)
	}
}


// TestIntegration_EndToEndCRUDFlow_MCP tests the full CRUD flow for MCP type
func TestIntegration_EndToEndCRUDFlow_MCP(t *testing.T) {
	router, _ := setupIntegrationTestRouter(t)

	// Step 1: Create an MCP template
	createBody := map[string]interface{}{
		"name":        "my-mcp-server",
		"config_type": "MCP",
		"content":     `{"command": "node", "args": ["server.js"], "env": {"NODE_ENV": "production"}}`,
		"description": "Node.js MCP server",
	}
	createJSON, _ := json.Marshal(createBody)

	createReq, _ := http.NewRequest("POST", "/api/claude-configs", bytes.NewBuffer(createJSON))
	createReq.Header.Set("Content-Type", "application/json")
	createW := httptest.NewRecorder()
	router.ServeHTTP(createW, createReq)

	if createW.Code != http.StatusCreated {
		t.Fatalf("Create MCP failed: expected %d, got %d. Body: %s", http.StatusCreated, createW.Code, createW.Body.String())
	}

	var created models.ClaudeConfigTemplate
	json.Unmarshal(createW.Body.Bytes(), &created)

	if created.ConfigType != models.ConfigTypeMCP {
		t.Errorf("Expected config_type 'MCP', got %q", created.ConfigType)
	}

	// Step 2: List with type filter
	listReq, _ := http.NewRequest("GET", "/api/claude-configs?type=MCP", nil)
	listW := httptest.NewRecorder()
	router.ServeHTTP(listW, listReq)

	if listW.Code != http.StatusOK {
		t.Fatalf("List MCP failed: expected %d, got %d", http.StatusOK, listW.Code)
	}

	var listed []models.ClaudeConfigTemplate
	json.Unmarshal(listW.Body.Bytes(), &listed)

	if len(listed) != 1 {
		t.Fatalf("Expected 1 MCP template, got %d", len(listed))
	}

	// Step 3: Get by ID
	getReq, _ := http.NewRequest("GET", fmt.Sprintf("/api/claude-configs/%d", created.ID), nil)
	getW := httptest.NewRecorder()
	router.ServeHTTP(getW, getReq)

	if getW.Code != http.StatusOK {
		t.Fatalf("Get MCP failed: expected %d, got %d", http.StatusOK, getW.Code)
	}

	// Step 4: Update with new MCP config
	updateBody := map[string]interface{}{
		"name":    "updated-mcp-server",
		"content": `{"command": "python", "args": ["-m", "mcp_server"], "env": {"PYTHONPATH": "/app"}}`,
	}
	updateJSON, _ := json.Marshal(updateBody)

	updateReq, _ := http.NewRequest("PUT", fmt.Sprintf("/api/claude-configs/%d", created.ID), bytes.NewBuffer(updateJSON))
	updateReq.Header.Set("Content-Type", "application/json")
	updateW := httptest.NewRecorder()
	router.ServeHTTP(updateW, updateReq)

	if updateW.Code != http.StatusOK {
		t.Fatalf("Update MCP failed: expected %d, got %d. Body: %s", http.StatusOK, updateW.Code, updateW.Body.String())
	}

	// Step 5: Verify update
	getAfterUpdateReq, _ := http.NewRequest("GET", fmt.Sprintf("/api/claude-configs/%d", created.ID), nil)
	getAfterUpdateW := httptest.NewRecorder()
	router.ServeHTTP(getAfterUpdateW, getAfterUpdateReq)

	var fetchedAfterUpdate models.ClaudeConfigTemplate
	json.Unmarshal(getAfterUpdateW.Body.Bytes(), &fetchedAfterUpdate)

	if fetchedAfterUpdate.Name != "updated-mcp-server" {
		t.Errorf("Expected name 'updated-mcp-server', got %q", fetchedAfterUpdate.Name)
	}

	// Verify the content was updated
	var mcpConfig map[string]interface{}
	if err := json.Unmarshal([]byte(fetchedAfterUpdate.Content), &mcpConfig); err != nil {
		t.Fatalf("Failed to parse updated MCP content: %v", err)
	}
	if mcpConfig["command"] != "python" {
		t.Errorf("Expected command 'python', got %v", mcpConfig["command"])
	}

	// Step 6: Delete
	deleteReq, _ := http.NewRequest("DELETE", fmt.Sprintf("/api/claude-configs/%d", created.ID), nil)
	deleteW := httptest.NewRecorder()
	router.ServeHTTP(deleteW, deleteReq)

	if deleteW.Code != http.StatusNoContent {
		t.Fatalf("Delete MCP failed: expected %d, got %d", http.StatusNoContent, deleteW.Code)
	}

	// Step 7: Verify deleted
	getAfterDeleteReq, _ := http.NewRequest("GET", fmt.Sprintf("/api/claude-configs/%d", created.ID), nil)
	getAfterDeleteW := httptest.NewRecorder()
	router.ServeHTTP(getAfterDeleteW, getAfterDeleteReq)

	if getAfterDeleteW.Code != http.StatusNotFound {
		t.Errorf("Expected 404 after delete, got %d", getAfterDeleteW.Code)
	}
}


// TestIntegration_EndToEndCRUDFlow_Command tests the full CRUD flow for COMMAND type
func TestIntegration_EndToEndCRUDFlow_Command(t *testing.T) {
	router, _ := setupIntegrationTestRouter(t)

	// Step 1: Create a COMMAND template
	createBody := map[string]interface{}{
		"name":        "my-command",
		"config_type": "COMMAND",
		"content":     "# /deploy\n\nDeploy the application to production.\n\n## Steps\n1. Build the project\n2. Run tests\n3. Deploy",
		"description": "Deployment command",
	}
	createJSON, _ := json.Marshal(createBody)

	createReq, _ := http.NewRequest("POST", "/api/claude-configs", bytes.NewBuffer(createJSON))
	createReq.Header.Set("Content-Type", "application/json")
	createW := httptest.NewRecorder()
	router.ServeHTTP(createW, createReq)

	if createW.Code != http.StatusCreated {
		t.Fatalf("Create COMMAND failed: expected %d, got %d. Body: %s", http.StatusCreated, createW.Code, createW.Body.String())
	}

	var created models.ClaudeConfigTemplate
	json.Unmarshal(createW.Body.Bytes(), &created)

	if created.ConfigType != models.ConfigTypeCommand {
		t.Errorf("Expected config_type 'COMMAND', got %q", created.ConfigType)
	}

	// Step 2: List with type filter
	listReq, _ := http.NewRequest("GET", "/api/claude-configs?type=COMMAND", nil)
	listW := httptest.NewRecorder()
	router.ServeHTTP(listW, listReq)

	if listW.Code != http.StatusOK {
		t.Fatalf("List COMMAND failed: expected %d, got %d", http.StatusOK, listW.Code)
	}

	var listed []models.ClaudeConfigTemplate
	json.Unmarshal(listW.Body.Bytes(), &listed)

	if len(listed) != 1 {
		t.Fatalf("Expected 1 COMMAND template, got %d", len(listed))
	}

	// Step 3: Get by ID
	getReq, _ := http.NewRequest("GET", fmt.Sprintf("/api/claude-configs/%d", created.ID), nil)
	getW := httptest.NewRecorder()
	router.ServeHTTP(getW, getReq)

	if getW.Code != http.StatusOK {
		t.Fatalf("Get COMMAND failed: expected %d, got %d", http.StatusOK, getW.Code)
	}

	// Step 4: Update
	updateBody := map[string]interface{}{
		"name":    "updated-command",
		"content": "# /deploy-staging\n\nDeploy the application to staging environment.",
	}
	updateJSON, _ := json.Marshal(updateBody)

	updateReq, _ := http.NewRequest("PUT", fmt.Sprintf("/api/claude-configs/%d", created.ID), bytes.NewBuffer(updateJSON))
	updateReq.Header.Set("Content-Type", "application/json")
	updateW := httptest.NewRecorder()
	router.ServeHTTP(updateW, updateReq)

	if updateW.Code != http.StatusOK {
		t.Fatalf("Update COMMAND failed: expected %d, got %d. Body: %s", http.StatusOK, updateW.Code, updateW.Body.String())
	}

	// Step 5: Verify update
	getAfterUpdateReq, _ := http.NewRequest("GET", fmt.Sprintf("/api/claude-configs/%d", created.ID), nil)
	getAfterUpdateW := httptest.NewRecorder()
	router.ServeHTTP(getAfterUpdateW, getAfterUpdateReq)

	var fetchedAfterUpdate models.ClaudeConfigTemplate
	json.Unmarshal(getAfterUpdateW.Body.Bytes(), &fetchedAfterUpdate)

	if fetchedAfterUpdate.Name != "updated-command" {
		t.Errorf("Expected name 'updated-command', got %q", fetchedAfterUpdate.Name)
	}

	// Step 6: Delete
	deleteReq, _ := http.NewRequest("DELETE", fmt.Sprintf("/api/claude-configs/%d", created.ID), nil)
	deleteW := httptest.NewRecorder()
	router.ServeHTTP(deleteW, deleteReq)

	if deleteW.Code != http.StatusNoContent {
		t.Fatalf("Delete COMMAND failed: expected %d, got %d", http.StatusNoContent, deleteW.Code)
	}

	// Step 7: Verify deleted
	getAfterDeleteReq, _ := http.NewRequest("GET", fmt.Sprintf("/api/claude-configs/%d", created.ID), nil)
	getAfterDeleteW := httptest.NewRecorder()
	router.ServeHTTP(getAfterDeleteW, getAfterDeleteReq)

	if getAfterDeleteW.Code != http.StatusNotFound {
		t.Errorf("Expected 404 after delete, got %d", getAfterDeleteW.Code)
	}
}


// TestIntegration_AllConfigTypes_InSingleDatabase tests that all four config types
// can coexist in the same database and be filtered correctly
func TestIntegration_AllConfigTypes_InSingleDatabase(t *testing.T) {
	router, _ := setupIntegrationTestRouter(t)

	// Create one template of each type
	templates := []map[string]interface{}{
		{
			"name":        "claude-md-1",
			"config_type": "CLAUDE_MD",
			"content":     "# CLAUDE.MD Content",
		},
		{
			"name":        "skill-1",
			"config_type": "SKILL",
			"content":     "# Skill Content",
		},
		{
			"name":        "mcp-1",
			"config_type": "MCP",
			"content":     `{"command": "test", "args": []}`,
		},
		{
			"name":        "command-1",
			"config_type": "COMMAND",
			"content":     "# Command Content",
		},
	}

	// Create all templates
	for _, tmpl := range templates {
		jsonBody, _ := json.Marshal(tmpl)
		req, _ := http.NewRequest("POST", "/api/claude-configs", bytes.NewBuffer(jsonBody))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusCreated {
			t.Fatalf("Failed to create %s template: %d - %s", tmpl["config_type"], w.Code, w.Body.String())
		}
	}

	// List all templates (should be 4)
	listAllReq, _ := http.NewRequest("GET", "/api/claude-configs", nil)
	listAllW := httptest.NewRecorder()
	router.ServeHTTP(listAllW, listAllReq)

	var allTemplates []models.ClaudeConfigTemplate
	json.Unmarshal(listAllW.Body.Bytes(), &allTemplates)

	if len(allTemplates) != 4 {
		t.Errorf("Expected 4 templates total, got %d", len(allTemplates))
	}

	// Test filtering by each type
	typeFilters := []struct {
		configType    string
		expectedCount int
	}{
		{"CLAUDE_MD", 1},
		{"SKILL", 1},
		{"MCP", 1},
		{"COMMAND", 1},
	}

	for _, tf := range typeFilters {
		req, _ := http.NewRequest("GET", fmt.Sprintf("/api/claude-configs?type=%s", tf.configType), nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("List %s failed: %d", tf.configType, w.Code)
			continue
		}

		var filtered []models.ClaudeConfigTemplate
		json.Unmarshal(w.Body.Bytes(), &filtered)

		if len(filtered) != tf.expectedCount {
			t.Errorf("Expected %d %s templates, got %d", tf.expectedCount, tf.configType, len(filtered))
		}

		// Verify all returned templates have the correct type
		for _, tmpl := range filtered {
			if string(tmpl.ConfigType) != tf.configType {
				t.Errorf("Expected config_type %s, got %s", tf.configType, tmpl.ConfigType)
			}
		}
	}
}


// TestIntegration_UniqueNameConstraint tests that duplicate names within the same
// config type are rejected, but same names across different types are allowed
func TestIntegration_UniqueNameConstraint(t *testing.T) {
	router, _ := setupIntegrationTestRouter(t)

	// Create a SKILL template
	createBody := map[string]interface{}{
		"name":        "shared-name",
		"config_type": "SKILL",
		"content":     "# Skill Content",
	}
	createJSON, _ := json.Marshal(createBody)

	createReq, _ := http.NewRequest("POST", "/api/claude-configs", bytes.NewBuffer(createJSON))
	createReq.Header.Set("Content-Type", "application/json")
	createW := httptest.NewRecorder()
	router.ServeHTTP(createW, createReq)

	if createW.Code != http.StatusCreated {
		t.Fatalf("First create failed: %d - %s", createW.Code, createW.Body.String())
	}

	// Try to create another SKILL with the same name (should fail with 409)
	duplicateReq, _ := http.NewRequest("POST", "/api/claude-configs", bytes.NewBuffer(createJSON))
	duplicateReq.Header.Set("Content-Type", "application/json")
	duplicateW := httptest.NewRecorder()
	router.ServeHTTP(duplicateW, duplicateReq)

	if duplicateW.Code != http.StatusConflict {
		t.Errorf("Expected 409 for duplicate name within same type, got %d", duplicateW.Code)
	}

	// Create a COMMAND with the same name (should succeed - different type)
	differentTypeBody := map[string]interface{}{
		"name":        "shared-name",
		"config_type": "COMMAND",
		"content":     "# Command Content",
	}
	differentTypeJSON, _ := json.Marshal(differentTypeBody)

	differentTypeReq, _ := http.NewRequest("POST", "/api/claude-configs", bytes.NewBuffer(differentTypeJSON))
	differentTypeReq.Header.Set("Content-Type", "application/json")
	differentTypeW := httptest.NewRecorder()
	router.ServeHTTP(differentTypeW, differentTypeReq)

	if differentTypeW.Code != http.StatusCreated {
		t.Errorf("Expected 201 for same name with different type, got %d - %s", differentTypeW.Code, differentTypeW.Body.String())
	}
}

// TestIntegration_MCPValidation tests that MCP templates require valid JSON with command and args
func TestIntegration_MCPValidation(t *testing.T) {
	router, _ := setupIntegrationTestRouter(t)

	testCases := []struct {
		name           string
		content        string
		expectedStatus int
	}{
		{
			name:           "valid MCP config",
			content:        `{"command": "node", "args": ["server.js"]}`,
			expectedStatus: http.StatusCreated,
		},
		{
			name:           "invalid JSON",
			content:        `not valid json`,
			expectedStatus: http.StatusBadRequest,
		},
		{
			name:           "missing command field",
			content:        `{"args": ["server.js"]}`,
			expectedStatus: http.StatusBadRequest,
		},
		{
			name:           "missing args field",
			content:        `{"command": "node"}`,
			expectedStatus: http.StatusBadRequest,
		},
	}

	for i, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			body := map[string]interface{}{
				"name":        fmt.Sprintf("mcp-test-%d", i),
				"config_type": "MCP",
				"content":     tc.content,
			}
			jsonBody, _ := json.Marshal(body)

			req, _ := http.NewRequest("POST", "/api/claude-configs", bytes.NewBuffer(jsonBody))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			if w.Code != tc.expectedStatus {
				t.Errorf("Expected status %d, got %d. Body: %s", tc.expectedStatus, w.Code, w.Body.String())
			}
		})
	}
}


// TestIntegration_PartialUpdate tests that partial updates only modify specified fields
func TestIntegration_PartialUpdate(t *testing.T) {
	router, _ := setupIntegrationTestRouter(t)

	// Create a template
	createBody := map[string]interface{}{
		"name":        "partial-update-test",
		"config_type": "CLAUDE_MD",
		"content":     "# Original Content",
		"description": "Original description",
	}
	createJSON, _ := json.Marshal(createBody)

	createReq, _ := http.NewRequest("POST", "/api/claude-configs", bytes.NewBuffer(createJSON))
	createReq.Header.Set("Content-Type", "application/json")
	createW := httptest.NewRecorder()
	router.ServeHTTP(createW, createReq)

	var created models.ClaudeConfigTemplate
	json.Unmarshal(createW.Body.Bytes(), &created)

	// Update only the name
	updateBody := map[string]interface{}{
		"name": "new-name-only",
	}
	updateJSON, _ := json.Marshal(updateBody)

	updateReq, _ := http.NewRequest("PUT", fmt.Sprintf("/api/claude-configs/%d", created.ID), bytes.NewBuffer(updateJSON))
	updateReq.Header.Set("Content-Type", "application/json")
	updateW := httptest.NewRecorder()
	router.ServeHTTP(updateW, updateReq)

	if updateW.Code != http.StatusOK {
		t.Fatalf("Partial update failed: %d - %s", updateW.Code, updateW.Body.String())
	}

	var updated models.ClaudeConfigTemplate
	json.Unmarshal(updateW.Body.Bytes(), &updated)

	// Name should be updated
	if updated.Name != "new-name-only" {
		t.Errorf("Expected name 'new-name-only', got %q", updated.Name)
	}

	// Content and description should remain unchanged
	if updated.Content != "# Original Content" {
		t.Errorf("Expected content to remain '# Original Content', got %q", updated.Content)
	}
	if updated.Description != "Original description" {
		t.Errorf("Expected description to remain 'Original description', got %q", updated.Description)
	}
}

// TestIntegration_ListEmptyDatabase tests listing when no templates exist
func TestIntegration_ListEmptyDatabase(t *testing.T) {
	router, _ := setupIntegrationTestRouter(t)

	// List all templates (should be empty)
	listReq, _ := http.NewRequest("GET", "/api/claude-configs", nil)
	listW := httptest.NewRecorder()
	router.ServeHTTP(listW, listReq)

	if listW.Code != http.StatusOK {
		t.Fatalf("List failed: %d - %s", listW.Code, listW.Body.String())
	}

	var templates []models.ClaudeConfigTemplate
	if err := json.Unmarshal(listW.Body.Bytes(), &templates); err != nil {
		t.Fatalf("Failed to unmarshal response: %v", err)
	}

	if len(templates) != 0 {
		t.Errorf("Expected 0 templates, got %d", len(templates))
	}

	// List with type filter (should also be empty)
	listFilteredReq, _ := http.NewRequest("GET", "/api/claude-configs?type=SKILL", nil)
	listFilteredW := httptest.NewRecorder()
	router.ServeHTTP(listFilteredW, listFilteredReq)

	if listFilteredW.Code != http.StatusOK {
		t.Fatalf("Filtered list failed: %d - %s", listFilteredW.Code, listFilteredW.Body.String())
	}

	var filteredTemplates []models.ClaudeConfigTemplate
	json.Unmarshal(listFilteredW.Body.Bytes(), &filteredTemplates)

	if len(filteredTemplates) != 0 {
		t.Errorf("Expected 0 filtered templates, got %d", len(filteredTemplates))
	}
}
