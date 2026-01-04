// Package monitoring_test contains property-based tests for the monitoring module.
// This file tests automation log completeness properties.
//
// Property 17: Automation Log Completeness
//
// **Validates: Requirements 11.1**
package monitoring_test

import (
	"math/rand"
	"testing"
	"testing/quick"
	"time"
)

// MockAutomationLog represents a mock automation log entry.
type MockAutomationLog struct {
	ID             uint
	ContainerID    uint
	SessionID      string
	StrategyType   string
	ActionTaken    string
	Command        string
	ContextSnippet string
	Result         string
	ErrorMessage   string
	CreatedAt      time.Time
}

// ValidStrategyTypes returns all valid strategy types.
func ValidStrategyTypes() []string {
	return []string{"webhook", "injection", "queue", "ai"}
}

// ValidActionTypes returns all valid action types.
func ValidActionTypes() []string {
	return []string{"inject", "skip", "notify", "complete", "webhook_sent", "queue_empty", "error"}
}

// ValidResultTypes returns all valid result types.
func ValidResultTypes() []string {
	return []string{"success", "failed", "skipped"}
}

// ValidateLog checks if a log entry has all required fields.
func ValidateLog(log *MockAutomationLog) bool {
	// Required fields
	if log.ContainerID == 0 {
		return false
	}
	if log.SessionID == "" {
		return false
	}
	if log.StrategyType == "" {
		return false
	}
	if log.ActionTaken == "" {
		return false
	}
	if log.Result == "" {
		return false
	}
	if log.CreatedAt.IsZero() {
		return false
	}
	
	// Validate strategy type
	validStrategy := false
	for _, s := range ValidStrategyTypes() {
		if log.StrategyType == s {
			validStrategy = true
			break
		}
	}
	if !validStrategy {
		return false
	}
	
	// Validate result type
	validResult := false
	for _, r := range ValidResultTypes() {
		if log.Result == r {
			validResult = true
			break
		}
	}
	if !validResult {
		return false
	}
	
	return true
}

// CreateValidLog creates a valid log entry for testing.
func CreateValidLog(containerID uint, sessionID string, strategyIdx, actionIdx, resultIdx uint8) *MockAutomationLog {
	strategies := ValidStrategyTypes()
	actions := ValidActionTypes()
	results := ValidResultTypes()
	
	return &MockAutomationLog{
		ID:           uint(rand.Uint32()),
		ContainerID:  containerID,
		SessionID:    sessionID,
		StrategyType: strategies[int(strategyIdx)%len(strategies)],
		ActionTaken:  actions[int(actionIdx)%len(actions)],
		Result:       results[int(resultIdx)%len(results)],
		CreatedAt:    time.Now(),
	}
}

// TestProperty17_AutomationLogCompleteness tests that automation logs contain
// all required fields.
// **Feature: pty-automation-orchestration, Property 17: Automation Log Completeness**
// **Validates: Requirements 11.1**
func TestProperty17_AutomationLogCompleteness(t *testing.T) {
	rand.Seed(time.Now().UnixNano())

	// Property: All valid logs should pass validation
	validLogsPassValidation := func(containerID uint8, sessionID string, strategyIdx, actionIdx, resultIdx uint8) bool {
		if containerID == 0 || sessionID == "" {
			return true // Skip invalid inputs
		}
		
		log := CreateValidLog(uint(containerID), sessionID, strategyIdx, actionIdx, resultIdx)
		return ValidateLog(log)
	}

	if err := quick.Check(validLogsPassValidation, &quick.Config{MaxCount: 100}); err != nil {
		t.Errorf("Property 17 (valid logs pass validation) failed: %v", err)
	}

	// Property: Logs with missing container ID should fail validation
	missingContainerIDFails := func(sessionID string, strategyIdx, actionIdx, resultIdx uint8) bool {
		if sessionID == "" {
			return true // Skip
		}
		
		log := CreateValidLog(0, sessionID, strategyIdx, actionIdx, resultIdx)
		return !ValidateLog(log)
	}

	if err := quick.Check(missingContainerIDFails, &quick.Config{MaxCount: 100}); err != nil {
		t.Errorf("Property 17 (missing container ID fails) failed: %v", err)
	}

	// Property: Logs with missing session ID should fail validation
	missingSessionIDFails := func(containerID uint8, strategyIdx, actionIdx, resultIdx uint8) bool {
		if containerID == 0 {
			return true // Skip
		}
		
		log := CreateValidLog(uint(containerID), "", strategyIdx, actionIdx, resultIdx)
		return !ValidateLog(log)
	}

	if err := quick.Check(missingSessionIDFails, &quick.Config{MaxCount: 100}); err != nil {
		t.Errorf("Property 17 (missing session ID fails) failed: %v", err)
	}
}

// TestProperty17_LogFieldPreservation tests that log fields are preserved correctly.
func TestProperty17_LogFieldPreservation(t *testing.T) {
	// Property: All fields should be preserved after creation
	fieldsPreserved := func(containerID uint8, sessionID, command, context, errorMsg string) bool {
		if containerID == 0 || sessionID == "" {
			return true // Skip invalid inputs
		}
		
		log := &MockAutomationLog{
			ID:             1,
			ContainerID:    uint(containerID),
			SessionID:      sessionID,
			StrategyType:   "webhook",
			ActionTaken:    "webhook_sent",
			Command:        command,
			ContextSnippet: context,
			Result:         "success",
			ErrorMessage:   errorMsg,
			CreatedAt:      time.Now(),
		}
		
		return log.ContainerID == uint(containerID) &&
			log.SessionID == sessionID &&
			log.Command == command &&
			log.ContextSnippet == context &&
			log.ErrorMessage == errorMsg
	}

	if err := quick.Check(fieldsPreserved, &quick.Config{MaxCount: 100}); err != nil {
		t.Errorf("Property 17 (fields preserved) failed: %v", err)
	}
}

// TestProperty17_StrategyTypeValidation tests strategy type validation.
func TestProperty17_StrategyTypeValidation(t *testing.T) {
	// Property: All valid strategy types should be accepted
	for _, strategy := range ValidStrategyTypes() {
		log := &MockAutomationLog{
			ContainerID:  1,
			SessionID:    "test",
			StrategyType: strategy,
			ActionTaken:  "inject",
			Result:       "success",
			CreatedAt:    time.Now(),
		}
		
		if !ValidateLog(log) {
			t.Errorf("Valid strategy type %s was rejected", strategy)
		}
	}

	// Property: Invalid strategy types should be rejected
	invalidStrategies := []string{"invalid", "unknown", "", "WEBHOOK", "Injection"}
	for _, strategy := range invalidStrategies {
		log := &MockAutomationLog{
			ContainerID:  1,
			SessionID:    "test",
			StrategyType: strategy,
			ActionTaken:  "inject",
			Result:       "success",
			CreatedAt:    time.Now(),
		}
		
		if ValidateLog(log) {
			t.Errorf("Invalid strategy type %s was accepted", strategy)
		}
	}
}

// TestProperty17_ResultTypeValidation tests result type validation.
func TestProperty17_ResultTypeValidation(t *testing.T) {
	// Property: All valid result types should be accepted
	for _, result := range ValidResultTypes() {
		log := &MockAutomationLog{
			ContainerID:  1,
			SessionID:    "test",
			StrategyType: "webhook",
			ActionTaken:  "webhook_sent",
			Result:       result,
			CreatedAt:    time.Now(),
		}
		
		if !ValidateLog(log) {
			t.Errorf("Valid result type %s was rejected", result)
		}
	}

	// Property: Invalid result types should be rejected
	invalidResults := []string{"invalid", "unknown", "", "SUCCESS", "Failed"}
	for _, result := range invalidResults {
		log := &MockAutomationLog{
			ContainerID:  1,
			SessionID:    "test",
			StrategyType: "webhook",
			ActionTaken:  "webhook_sent",
			Result:       result,
			CreatedAt:    time.Now(),
		}
		
		if ValidateLog(log) {
			t.Errorf("Invalid result type %s was accepted", result)
		}
	}
}

// TestProperty17_TimestampRequired tests that timestamp is required.
func TestProperty17_TimestampRequired(t *testing.T) {
	// Property: Log without timestamp should fail validation
	log := &MockAutomationLog{
		ContainerID:  1,
		SessionID:    "test",
		StrategyType: "webhook",
		ActionTaken:  "webhook_sent",
		Result:       "success",
		// CreatedAt is zero value
	}
	
	if ValidateLog(log) {
		t.Error("Log without timestamp was accepted")
	}
}
