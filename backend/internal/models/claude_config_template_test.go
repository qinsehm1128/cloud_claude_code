package models

import (
	"encoding/json"
	"testing"
	"time"
)

// TestConfigTypeIsValid_ValidTypes tests that IsValid returns true for all valid ConfigType values
func TestConfigTypeIsValid_ValidTypes(t *testing.T) {
	validTypes := []ConfigType{
		ConfigTypeClaudeMD,
		ConfigTypeSkill,
		ConfigTypeMCP,
		ConfigTypeCommand,
	}

	for _, ct := range validTypes {
		if !ct.IsValid() {
			t.Errorf("IsValid() returned false for valid ConfigType %q", ct)
		}
	}
}

// TestConfigTypeIsValid_InvalidTypes tests that IsValid returns false for invalid ConfigType values
func TestConfigTypeIsValid_InvalidTypes(t *testing.T) {
	invalidTypes := []ConfigType{
		"",
		"INVALID",
		"claude_md",
		"skill",
		"mcp",
		"command",
		"CLAUDE_MD_EXTRA",
		"UNKNOWN_TYPE",
		"123",
		" CLAUDE_MD",
		"CLAUDE_MD ",
	}

	for _, ct := range invalidTypes {
		if ct.IsValid() {
			t.Errorf("IsValid() returned true for invalid ConfigType %q", ct)
		}
	}
}

// TestValidConfigTypes_ReturnsAllFourTypes tests that ValidConfigTypes returns exactly the four valid types
func TestValidConfigTypes_ReturnsAllFourTypes(t *testing.T) {
	types := ValidConfigTypes()

	if len(types) != 4 {
		t.Errorf("ValidConfigTypes() returned %d types, expected 4", len(types))
	}

	expectedTypes := map[ConfigType]bool{
		ConfigTypeClaudeMD: false,
		ConfigTypeSkill:    false,
		ConfigTypeMCP:      false,
		ConfigTypeCommand:  false,
	}

	for _, ct := range types {
		if _, exists := expectedTypes[ct]; !exists {
			t.Errorf("ValidConfigTypes() returned unexpected type %q", ct)
		}
		expectedTypes[ct] = true
	}

	for ct, found := range expectedTypes {
		if !found {
			t.Errorf("ValidConfigTypes() did not return expected type %q", ct)
		}
	}
}

// TestValidConfigTypes_AllTypesAreValid tests that all types returned by ValidConfigTypes pass IsValid
func TestValidConfigTypes_AllTypesAreValid(t *testing.T) {
	types := ValidConfigTypes()

	for _, ct := range types {
		if !ct.IsValid() {
			t.Errorf("ValidConfigTypes() returned type %q that fails IsValid()", ct)
		}
	}
}

// TestInjectionStatus_JSONSerialization tests that InjectionStatus can be serialized to JSON correctly
func TestInjectionStatus_JSONSerialization(t *testing.T) {
	injectedAt := time.Date(2024, 1, 15, 10, 30, 0, 0, time.UTC)

	status := InjectionStatus{
		ContainerID: "container-123",
		Successful:  []string{"template1", "template2"},
		Failed: []FailedTemplate{
			{
				TemplateName: "template3",
				ConfigType:   "MCP",
				Reason:       "invalid JSON format",
			},
		},
		Warnings:   []string{"warning1", "warning2"},
		InjectedAt: injectedAt,
	}

	jsonData, err := json.Marshal(status)
	if err != nil {
		t.Fatalf("Failed to marshal InjectionStatus: %v", err)
	}

	// Verify JSON contains expected fields
	var jsonMap map[string]interface{}
	if err := json.Unmarshal(jsonData, &jsonMap); err != nil {
		t.Fatalf("Failed to unmarshal JSON to map: %v", err)
	}

	if jsonMap["container_id"] != "container-123" {
		t.Errorf("Expected container_id to be 'container-123', got %v", jsonMap["container_id"])
	}

	successful, ok := jsonMap["successful"].([]interface{})
	if !ok || len(successful) != 2 {
		t.Errorf("Expected successful to have 2 items, got %v", jsonMap["successful"])
	}

	failed, ok := jsonMap["failed"].([]interface{})
	if !ok || len(failed) != 1 {
		t.Errorf("Expected failed to have 1 item, got %v", jsonMap["failed"])
	}

	warnings, ok := jsonMap["warnings"].([]interface{})
	if !ok || len(warnings) != 2 {
		t.Errorf("Expected warnings to have 2 items, got %v", jsonMap["warnings"])
	}
}

// TestInjectionStatus_JSONDeserialization tests that InjectionStatus can be deserialized from JSON correctly
func TestInjectionStatus_JSONDeserialization(t *testing.T) {
	jsonStr := `{
		"container_id": "container-456",
		"successful": ["config1", "config2", "config3"],
		"failed": [
			{
				"template_name": "config4",
				"config_type": "SKILL",
				"reason": "file write error"
			},
			{
				"template_name": "config5",
				"config_type": "COMMAND",
				"reason": "permission denied"
			}
		],
		"warnings": ["disk space low"],
		"injected_at": "2024-01-15T10:30:00Z"
	}`

	var status InjectionStatus
	if err := json.Unmarshal([]byte(jsonStr), &status); err != nil {
		t.Fatalf("Failed to unmarshal InjectionStatus: %v", err)
	}

	if status.ContainerID != "container-456" {
		t.Errorf("Expected ContainerID to be 'container-456', got %q", status.ContainerID)
	}

	if len(status.Successful) != 3 {
		t.Errorf("Expected 3 successful items, got %d", len(status.Successful))
	}

	if len(status.Failed) != 2 {
		t.Errorf("Expected 2 failed items, got %d", len(status.Failed))
	}

	if status.Failed[0].TemplateName != "config4" {
		t.Errorf("Expected first failed template name to be 'config4', got %q", status.Failed[0].TemplateName)
	}

	if status.Failed[0].ConfigType != "SKILL" {
		t.Errorf("Expected first failed config type to be 'SKILL', got %q", status.Failed[0].ConfigType)
	}

	if status.Failed[0].Reason != "file write error" {
		t.Errorf("Expected first failed reason to be 'file write error', got %q", status.Failed[0].Reason)
	}

	if len(status.Warnings) != 1 {
		t.Errorf("Expected 1 warning, got %d", len(status.Warnings))
	}

	expectedTime := time.Date(2024, 1, 15, 10, 30, 0, 0, time.UTC)
	if !status.InjectedAt.Equal(expectedTime) {
		t.Errorf("Expected InjectedAt to be %v, got %v", expectedTime, status.InjectedAt)
	}
}

// TestInjectionStatus_JSONRoundTrip tests that InjectionStatus can be serialized and deserialized without data loss
func TestInjectionStatus_JSONRoundTrip(t *testing.T) {
	original := InjectionStatus{
		ContainerID: "container-789",
		Successful:  []string{"template-a", "template-b"},
		Failed: []FailedTemplate{
			{
				TemplateName: "template-c",
				ConfigType:   "MCP",
				Reason:       "connection timeout",
			},
		},
		Warnings:   []string{"warning message"},
		InjectedAt: time.Date(2024, 6, 20, 14, 45, 30, 0, time.UTC),
	}

	// Serialize
	jsonData, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("Failed to marshal InjectionStatus: %v", err)
	}

	// Deserialize
	var restored InjectionStatus
	if err := json.Unmarshal(jsonData, &restored); err != nil {
		t.Fatalf("Failed to unmarshal InjectionStatus: %v", err)
	}

	// Verify all fields match
	if restored.ContainerID != original.ContainerID {
		t.Errorf("ContainerID mismatch: expected %q, got %q", original.ContainerID, restored.ContainerID)
	}

	if len(restored.Successful) != len(original.Successful) {
		t.Errorf("Successful length mismatch: expected %d, got %d", len(original.Successful), len(restored.Successful))
	}

	for i, s := range original.Successful {
		if restored.Successful[i] != s {
			t.Errorf("Successful[%d] mismatch: expected %q, got %q", i, s, restored.Successful[i])
		}
	}

	if len(restored.Failed) != len(original.Failed) {
		t.Errorf("Failed length mismatch: expected %d, got %d", len(original.Failed), len(restored.Failed))
	}

	for i, f := range original.Failed {
		if restored.Failed[i].TemplateName != f.TemplateName {
			t.Errorf("Failed[%d].TemplateName mismatch: expected %q, got %q", i, f.TemplateName, restored.Failed[i].TemplateName)
		}
		if restored.Failed[i].ConfigType != f.ConfigType {
			t.Errorf("Failed[%d].ConfigType mismatch: expected %q, got %q", i, f.ConfigType, restored.Failed[i].ConfigType)
		}
		if restored.Failed[i].Reason != f.Reason {
			t.Errorf("Failed[%d].Reason mismatch: expected %q, got %q", i, f.Reason, restored.Failed[i].Reason)
		}
	}

	if len(restored.Warnings) != len(original.Warnings) {
		t.Errorf("Warnings length mismatch: expected %d, got %d", len(original.Warnings), len(restored.Warnings))
	}

	for i, w := range original.Warnings {
		if restored.Warnings[i] != w {
			t.Errorf("Warnings[%d] mismatch: expected %q, got %q", i, w, restored.Warnings[i])
		}
	}

	if !restored.InjectedAt.Equal(original.InjectedAt) {
		t.Errorf("InjectedAt mismatch: expected %v, got %v", original.InjectedAt, restored.InjectedAt)
	}
}

// TestInjectionStatus_EmptyLists tests that InjectionStatus handles empty lists correctly
func TestInjectionStatus_EmptyLists(t *testing.T) {
	status := InjectionStatus{
		ContainerID: "container-empty",
		Successful:  []string{},
		Failed:      []FailedTemplate{},
		Warnings:    []string{},
		InjectedAt:  time.Now(),
	}

	jsonData, err := json.Marshal(status)
	if err != nil {
		t.Fatalf("Failed to marshal InjectionStatus with empty lists: %v", err)
	}

	var restored InjectionStatus
	if err := json.Unmarshal(jsonData, &restored); err != nil {
		t.Fatalf("Failed to unmarshal InjectionStatus with empty lists: %v", err)
	}

	if restored.ContainerID != "container-empty" {
		t.Errorf("Expected ContainerID to be 'container-empty', got %q", restored.ContainerID)
	}

	// Empty slices should be preserved (or nil, which is equivalent for JSON)
	if restored.Successful != nil && len(restored.Successful) != 0 {
		t.Errorf("Expected Successful to be empty, got %v", restored.Successful)
	}

	if restored.Failed != nil && len(restored.Failed) != 0 {
		t.Errorf("Expected Failed to be empty, got %v", restored.Failed)
	}

	if restored.Warnings != nil && len(restored.Warnings) != 0 {
		t.Errorf("Expected Warnings to be empty, got %v", restored.Warnings)
	}
}

// TestFailedTemplate_JSONSerialization tests that FailedTemplate can be serialized correctly
func TestFailedTemplate_JSONSerialization(t *testing.T) {
	failed := FailedTemplate{
		TemplateName: "my-template",
		ConfigType:   "CLAUDE_MD",
		Reason:       "file not found",
	}

	jsonData, err := json.Marshal(failed)
	if err != nil {
		t.Fatalf("Failed to marshal FailedTemplate: %v", err)
	}

	var jsonMap map[string]string
	if err := json.Unmarshal(jsonData, &jsonMap); err != nil {
		t.Fatalf("Failed to unmarshal JSON to map: %v", err)
	}

	if jsonMap["template_name"] != "my-template" {
		t.Errorf("Expected template_name to be 'my-template', got %q", jsonMap["template_name"])
	}

	if jsonMap["config_type"] != "CLAUDE_MD" {
		t.Errorf("Expected config_type to be 'CLAUDE_MD', got %q", jsonMap["config_type"])
	}

	if jsonMap["reason"] != "file not found" {
		t.Errorf("Expected reason to be 'file not found', got %q", jsonMap["reason"])
	}
}

// TestClaudeConfigTemplate_JSONTags tests that ClaudeConfigTemplate has correct JSON tags
func TestClaudeConfigTemplate_JSONTags(t *testing.T) {
	template := ClaudeConfigTemplate{
		Name:        "test-template",
		ConfigType:  ConfigTypeSkill,
		Content:     "# Test Content",
		Description: "A test template",
	}

	jsonData, err := json.Marshal(template)
	if err != nil {
		t.Fatalf("Failed to marshal ClaudeConfigTemplate: %v", err)
	}

	var jsonMap map[string]interface{}
	if err := json.Unmarshal(jsonData, &jsonMap); err != nil {
		t.Fatalf("Failed to unmarshal JSON to map: %v", err)
	}

	// Verify JSON field names match the tags
	if jsonMap["name"] != "test-template" {
		t.Errorf("Expected name to be 'test-template', got %v", jsonMap["name"])
	}

	if jsonMap["config_type"] != "SKILL" {
		t.Errorf("Expected config_type to be 'SKILL', got %v", jsonMap["config_type"])
	}

	if jsonMap["content"] != "# Test Content" {
		t.Errorf("Expected content to be '# Test Content', got %v", jsonMap["content"])
	}

	if jsonMap["description"] != "A test template" {
		t.Errorf("Expected description to be 'A test template', got %v", jsonMap["description"])
	}
}

// TestClaudeConfigTemplate_OmitEmptyDescription tests that empty description is omitted in JSON
func TestClaudeConfigTemplate_OmitEmptyDescription(t *testing.T) {
	template := ClaudeConfigTemplate{
		Name:        "test-template",
		ConfigType:  ConfigTypeMCP,
		Content:     `{"command": "test"}`,
		Description: "", // Empty description
	}

	jsonData, err := json.Marshal(template)
	if err != nil {
		t.Fatalf("Failed to marshal ClaudeConfigTemplate: %v", err)
	}

	var jsonMap map[string]interface{}
	if err := json.Unmarshal(jsonData, &jsonMap); err != nil {
		t.Fatalf("Failed to unmarshal JSON to map: %v", err)
	}

	// Empty description should be omitted due to omitempty tag
	if _, exists := jsonMap["description"]; exists {
		t.Errorf("Expected description to be omitted when empty, but it was present: %v", jsonMap["description"])
	}
}

// TestSkillMetadata_JSONSerialization tests that SkillMetadata can be serialized correctly
func TestSkillMetadata_JSONSerialization(t *testing.T) {
	metadata := SkillMetadata{
		AllowedTools:           []string{"tool1", "tool2", "tool3"},
		DisableModelInvocation: true,
	}

	jsonData, err := json.Marshal(metadata)
	if err != nil {
		t.Fatalf("Failed to marshal SkillMetadata: %v", err)
	}

	var restored SkillMetadata
	if err := json.Unmarshal(jsonData, &restored); err != nil {
		t.Fatalf("Failed to unmarshal SkillMetadata: %v", err)
	}

	if len(restored.AllowedTools) != 3 {
		t.Errorf("Expected 3 allowed tools, got %d", len(restored.AllowedTools))
	}

	if !restored.DisableModelInvocation {
		t.Error("Expected DisableModelInvocation to be true")
	}
}

// TestSkillMetadata_OmitEmpty tests that empty fields are omitted in SkillMetadata JSON
func TestSkillMetadata_OmitEmpty(t *testing.T) {
	metadata := SkillMetadata{
		AllowedTools:           nil,
		DisableModelInvocation: false,
	}

	jsonData, err := json.Marshal(metadata)
	if err != nil {
		t.Fatalf("Failed to marshal SkillMetadata: %v", err)
	}

	var jsonMap map[string]interface{}
	if err := json.Unmarshal(jsonData, &jsonMap); err != nil {
		t.Fatalf("Failed to unmarshal JSON to map: %v", err)
	}

	// Both fields should be omitted due to omitempty
	if _, exists := jsonMap["allowed_tools"]; exists {
		t.Errorf("Expected allowed_tools to be omitted when nil, but it was present")
	}

	if _, exists := jsonMap["disable_model_invocation"]; exists {
		t.Errorf("Expected disable_model_invocation to be omitted when false, but it was present")
	}
}
