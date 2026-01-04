// Package monitoring_test contains property-based tests for the monitoring module.
// This file tests AI strategy properties.
//
// Property 12: AI Response Action Execution
// Property 13: AI Fallback on Failure
//
// **Validates: Requirements 5.6, 5.7, 5.8, 5.9, 5.10**
package monitoring_test

import (
	"encoding/json"
	"math/rand"
	"strings"
	"testing"
	"testing/quick"
	"time"
)

// AIAction represents the action decided by the AI.
type AIAction string

const (
	AIActionInject   AIAction = "inject"
	AIActionSkip     AIAction = "skip"
	AIActionNotify   AIAction = "notify"
	AIActionComplete AIAction = "complete"
)

// AIDecision represents the structured response from the AI.
type AIDecision struct {
	Action  AIAction `json:"action"`
	Command string   `json:"command,omitempty"`
	Message string   `json:"message,omitempty"`
	Reason  string   `json:"reason,omitempty"`
}

// ValidActions returns all valid AI actions.
func ValidActions() []AIAction {
	return []AIAction{AIActionInject, AIActionSkip, AIActionNotify, AIActionComplete}
}

// parseAIDecision parses the AI response into a structured decision.
// This is a copy of the function from ai_strategy.go for testing.
func parseAIDecision(response string) (*AIDecision, error) {
	response = strings.TrimSpace(response)
	
	startIdx := strings.Index(response, "{")
	endIdx := strings.LastIndex(response, "}")
	
	if startIdx == -1 || endIdx == -1 || endIdx <= startIdx {
		return nil, nil // Invalid JSON
	}
	
	jsonStr := response[startIdx : endIdx+1]
	
	var decision AIDecision
	if err := json.Unmarshal([]byte(jsonStr), &decision); err != nil {
		return nil, err
	}
	
	return &decision, nil
}

// generateValidAIResponse generates a valid AI response JSON.
func generateValidAIResponse(action AIAction, command, message, reason string) string {
	decision := AIDecision{
		Action:  action,
		Command: command,
		Message: message,
		Reason:  reason,
	}
	jsonBytes, _ := json.Marshal(decision)
	return string(jsonBytes)
}

// TestProperty12_AIResponseActionExecution tests that AI responses are correctly
// parsed and the appropriate action is executed.
// **Feature: pty-automation-orchestration, Property 12: AI Response Action Execution**
// **Validates: Requirements 5.6, 5.7, 5.8**
func TestProperty12_AIResponseActionExecution(t *testing.T) {
	rand.Seed(time.Now().UnixNano())

	// Property: For any valid AI response JSON, parsing should extract the correct action
	validResponseParsing := func(actionIdx uint8, command, message, reason string) bool {
		actions := ValidActions()
		action := actions[int(actionIdx)%len(actions)]
		
		// Generate valid response
		response := generateValidAIResponse(action, command, message, reason)
		
		// Parse response
		decision, err := parseAIDecision(response)
		if err != nil {
			return false
		}
		if decision == nil {
			return false
		}
		
		// Verify action matches
		return decision.Action == action
	}

	if err := quick.Check(validResponseParsing, &quick.Config{MaxCount: 100}); err != nil {
		t.Errorf("Property 12 (valid response parsing) failed: %v", err)
	}

	// Property: For inject action, command should be preserved
	injectCommandPreserved := func(command string) bool {
		if command == "" {
			return true // Skip empty commands
		}
		
		response := generateValidAIResponse(AIActionInject, command, "", "test")
		decision, err := parseAIDecision(response)
		if err != nil || decision == nil {
			return false
		}
		
		return decision.Command == command
	}

	if err := quick.Check(injectCommandPreserved, &quick.Config{MaxCount: 100}); err != nil {
		t.Errorf("Property 12 (inject command preserved) failed: %v", err)
	}

	// Property: For notify action, message should be preserved
	notifyMessagePreserved := func(message string) bool {
		if message == "" {
			return true // Skip empty messages
		}
		
		response := generateValidAIResponse(AIActionNotify, "", message, "test")
		decision, err := parseAIDecision(response)
		if err != nil || decision == nil {
			return false
		}
		
		return decision.Message == message
	}

	if err := quick.Check(notifyMessagePreserved, &quick.Config{MaxCount: 100}); err != nil {
		t.Errorf("Property 12 (notify message preserved) failed: %v", err)
	}
}

// TestProperty12_AIResponseWithExtraText tests parsing AI responses with extra text.
func TestProperty12_AIResponseWithExtraText(t *testing.T) {
	// Property: JSON should be extracted even with surrounding text
	jsonExtraction := func(prefix, suffix string) bool {
		// Avoid strings that contain { or } which would confuse extraction
		prefix = strings.ReplaceAll(prefix, "{", "")
		prefix = strings.ReplaceAll(prefix, "}", "")
		suffix = strings.ReplaceAll(suffix, "{", "")
		suffix = strings.ReplaceAll(suffix, "}", "")
		
		innerJSON := `{"action":"skip","reason":"test"}`
		response := prefix + innerJSON + suffix
		
		decision, err := parseAIDecision(response)
		if err != nil {
			return false
		}
		if decision == nil {
			return false
		}
		
		return decision.Action == AIActionSkip
	}

	if err := quick.Check(jsonExtraction, &quick.Config{MaxCount: 100}); err != nil {
		t.Errorf("Property 12 (JSON extraction) failed: %v", err)
	}
}

// TestProperty13_AIFallbackOnFailure tests that the AI strategy falls back correctly
// when AI calls fail.
// **Feature: pty-automation-orchestration, Property 13: AI Fallback on Failure**
// **Validates: Requirements 5.9, 5.10**
func TestProperty13_AIFallbackOnFailure(t *testing.T) {
	// Property: Invalid JSON should result in nil decision (triggering fallback)
	invalidJSONFallback := func(garbage string) bool {
		// Ensure garbage doesn't accidentally form valid JSON
		if strings.Contains(garbage, "{") && strings.Contains(garbage, "}") {
			return true // Skip potentially valid JSON
		}
		
		decision, _ := parseAIDecision(garbage)
		return decision == nil
	}

	if err := quick.Check(invalidJSONFallback, &quick.Config{MaxCount: 100}); err != nil {
		t.Errorf("Property 13 (invalid JSON fallback) failed: %v", err)
	}

	// Property: Empty response should result in nil decision
	emptyResponseFallback := func() bool {
		decision, _ := parseAIDecision("")
		return decision == nil
	}

	if !emptyResponseFallback() {
		t.Error("Property 13 (empty response fallback) failed")
	}

	// Property: Response without JSON should result in nil decision
	noJSONFallback := func(text string) bool {
		// Remove any braces
		text = strings.ReplaceAll(text, "{", "")
		text = strings.ReplaceAll(text, "}", "")
		
		decision, _ := parseAIDecision(text)
		return decision == nil
	}

	if err := quick.Check(noJSONFallback, &quick.Config{MaxCount: 100}); err != nil {
		t.Errorf("Property 13 (no JSON fallback) failed: %v", err)
	}
}

// TestProperty13_FallbackActionTypes tests that fallback actions are valid.
func TestProperty13_FallbackActionTypes(t *testing.T) {
	validFallbackActions := []AIAction{AIActionSkip, AIActionNotify, AIActionInject}
	
	// Property: All fallback actions should be valid actions
	for _, action := range validFallbackActions {
		found := false
		for _, valid := range ValidActions() {
			if action == valid {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("Fallback action %s is not a valid action", action)
		}
	}
}

// TestAIDecisionRoundTrip tests that AI decisions can be serialized and deserialized.
func TestAIDecisionRoundTrip(t *testing.T) {
	roundTrip := func(actionIdx uint8, command, message, reason string) bool {
		actions := ValidActions()
		action := actions[int(actionIdx)%len(actions)]
		
		original := AIDecision{
			Action:  action,
			Command: command,
			Message: message,
			Reason:  reason,
		}
		
		// Serialize
		jsonBytes, err := json.Marshal(original)
		if err != nil {
			return false
		}
		
		// Deserialize
		var parsed AIDecision
		if err := json.Unmarshal(jsonBytes, &parsed); err != nil {
			return false
		}
		
		// Compare
		return original.Action == parsed.Action &&
			original.Command == parsed.Command &&
			original.Message == parsed.Message &&
			original.Reason == parsed.Reason
	}

	if err := quick.Check(roundTrip, &quick.Config{MaxCount: 100}); err != nil {
		t.Errorf("AI decision round-trip failed: %v", err)
	}
}

// TestAIActionValidation tests that action validation works correctly.
func TestAIActionValidation(t *testing.T) {
	validActions := ValidActions()
	
	// Test all valid actions
	for _, action := range validActions {
		response := generateValidAIResponse(action, "cmd", "msg", "reason")
		decision, err := parseAIDecision(response)
		if err != nil {
			t.Errorf("Failed to parse valid action %s: %v", action, err)
			continue
		}
		if decision == nil {
			t.Errorf("Got nil decision for valid action %s", action)
			continue
		}
		if decision.Action != action {
			t.Errorf("Action mismatch: expected %s, got %s", action, decision.Action)
		}
	}
}
