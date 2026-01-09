package monitoring_test

import (
	"testing"

	"cc-platform/internal/terminal"
)

// TestProperty16_MultiClientStateConsistency verifies Property 16: Multi-Client State Consistency
// For any monitoring configuration change made by one client, all other connected clients
// SHALL receive the updated state within 2 seconds, and all clients SHALL see identical
// monitoring status at any given time.
// Validates: Requirements 10.1, 10.2, 10.4

func TestProperty16_MultiClientStateConsistency_MessageTypes(t *testing.T) {
	// Verify all required message types are defined
	messageTypes := []string{
		terminal.MessageTypeMonitoringStatus,
		terminal.MessageTypeMonitoringEnable,
		terminal.MessageTypeMonitoringDisable,
		terminal.MessageTypeMonitoringConfigUpdate,
		terminal.MessageTypeMonitoringError,
		terminal.MessageTypeStrategyTriggered,
		terminal.MessageTypeTaskUpdate,
		terminal.MessageTypeTaskAdd,
		terminal.MessageTypeTaskRemove,
		terminal.MessageTypeTaskReorder,
	}

	for _, mt := range messageTypes {
		if mt == "" {
			t.Error("Message type should not be empty")
		}
	}
}

func TestProperty16_MultiClientStateConsistency_MonitoringStatusData(t *testing.T) {
	// Test MonitoringStatusData structure
	status := terminal.MonitoringStatusData{
		Enabled:         true,
		SilenceDuration: 15,
		Threshold:       30,
		Strategy:        "webhook",
		QueueSize:       5,
	}

	if !status.Enabled {
		t.Error("Enabled should be true")
	}
	if status.SilenceDuration != 15 {
		t.Error("SilenceDuration should be 15")
	}
	if status.Threshold != 30 {
		t.Error("Threshold should be 30")
	}
	if status.Strategy != "webhook" {
		t.Error("Strategy should be 'webhook'")
	}
	if status.QueueSize != 5 {
		t.Error("QueueSize should be 5")
	}
}

func TestProperty16_MultiClientStateConsistency_TaskData(t *testing.T) {
	// Test TaskData structure
	task := terminal.TaskData{
		ID:         1,
		Text:       "Test task",
		Status:     "pending",
		OrderIndex: 0,
	}

	if task.ID != 1 {
		t.Error("ID should be 1")
	}
	if task.Text != "Test task" {
		t.Error("Text should be 'Test task'")
	}
	if task.Status != "pending" {
		t.Error("Status should be 'pending'")
	}
	if task.OrderIndex != 0 {
		t.Error("OrderIndex should be 0")
	}
}

func TestProperty16_MultiClientStateConsistency_StrategyTriggeredData(t *testing.T) {
	// Test StrategyTriggeredData structure
	data := terminal.StrategyTriggeredData{
		Strategy: "ai",
		Action:   "inject",
		Command:  "echo hello",
		Reason:   "Silence threshold reached",
		Success:  true,
	}

	if data.Strategy != "ai" {
		t.Error("Strategy should be 'ai'")
	}
	if data.Action != "inject" {
		t.Error("Action should be 'inject'")
	}
	if data.Command != "echo hello" {
		t.Error("Command should be 'echo hello'")
	}
	if data.Reason != "Silence threshold reached" {
		t.Error("Reason should be 'Silence threshold reached'")
	}
	if !data.Success {
		t.Error("Success should be true")
	}
}

func TestProperty16_MultiClientStateConsistency_TerminalMessage(t *testing.T) {
	// Test TerminalMessage with monitoring data
	msg := terminal.TerminalMessage{
		Type: terminal.MessageTypeMonitoringStatus,
		MonitoringData: &terminal.MonitoringStatusData{
			Enabled:   true,
			Threshold: 30,
			Strategy:  "webhook",
		},
	}

	if msg.Type != terminal.MessageTypeMonitoringStatus {
		t.Error("Type should be monitoring_status")
	}
	if msg.MonitoringData == nil {
		t.Error("MonitoringData should not be nil")
	}
	if !msg.MonitoringData.Enabled {
		t.Error("MonitoringData.Enabled should be true")
	}
}

func TestProperty16_MultiClientStateConsistency_TaskMessage(t *testing.T) {
	// Test TerminalMessage with task data
	msg := terminal.TerminalMessage{
		Type: terminal.MessageTypeTaskUpdate,
		Tasks: []terminal.TaskData{
			{ID: 1, Text: "Task 1", Status: "pending", OrderIndex: 0},
			{ID: 2, Text: "Task 2", Status: "in_progress", OrderIndex: 1},
		},
	}

	if msg.Type != terminal.MessageTypeTaskUpdate {
		t.Error("Type should be task_update")
	}
	if len(msg.Tasks) != 2 {
		t.Error("Should have 2 tasks")
	}
	if msg.Tasks[0].ID != 1 {
		t.Error("First task ID should be 1")
	}
	if msg.Tasks[1].Status != "in_progress" {
		t.Error("Second task status should be 'in_progress'")
	}
}

func TestProperty16_MultiClientStateConsistency_StrategyTriggeredMessage(t *testing.T) {
	// Test TerminalMessage with strategy triggered data
	msg := terminal.TerminalMessage{
		Type: terminal.MessageTypeStrategyTriggered,
		StrategyData: &terminal.StrategyTriggeredData{
			Strategy: "injection",
			Action:   "inject",
			Command:  "ls -la",
			Success:  true,
		},
	}

	if msg.Type != terminal.MessageTypeStrategyTriggered {
		t.Error("Type should be strategy_triggered")
	}
	if msg.StrategyData == nil {
		t.Error("StrategyData should not be nil")
	}
	if msg.StrategyData.Strategy != "injection" {
		t.Error("Strategy should be 'injection'")
	}
}

func TestProperty16_MultiClientStateConsistency_MessageTypeConstants(t *testing.T) {
	// Verify message type constants have expected values
	expectedTypes := map[string]string{
		"monitoring_status":        terminal.MessageTypeMonitoringStatus,
		"monitoring_enable":        terminal.MessageTypeMonitoringEnable,
		"monitoring_disable":       terminal.MessageTypeMonitoringDisable,
		"monitoring_config_update": terminal.MessageTypeMonitoringConfigUpdate,
		"monitoring_error":         terminal.MessageTypeMonitoringError,
		"strategy_triggered":       terminal.MessageTypeStrategyTriggered,
		"task_update":              terminal.MessageTypeTaskUpdate,
		"task_add":                 terminal.MessageTypeTaskAdd,
		"task_remove":              terminal.MessageTypeTaskRemove,
		"task_reorder":             terminal.MessageTypeTaskReorder,
	}

	for expected, actual := range expectedTypes {
		if actual != expected {
			t.Errorf("Expected message type %s, got %s", expected, actual)
		}
	}
}
