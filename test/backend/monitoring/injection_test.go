package monitoring_test

import (
	"strings"
	"testing"
	"testing/quick"

	"cc-platform/internal/models"
	"cc-platform/internal/monitoring"
)

// TestProperty7_InjectionPlaceholderExpansion verifies Property 7: Injection Placeholder Expansion
// For any injection command containing placeholder variables ({container_id}, {session_id},
// {timestamp}, {silence_duration}), all placeholders SHALL be replaced with their actual
// values, and the resulting command SHALL contain no unexpanded placeholders.
// Validates: Requirements 3.2

func TestProperty7_InjectionPlaceholderExpansion_AllPlaceholders(t *testing.T) {
	command := "echo container={container_id} session={session_id} time={timestamp} silence={silence_duration} docker={docker_id}"

	result := monitoring.ExpandPlaceholders(command, 123, "session-abc", "docker-xyz", 30)

	// Should not contain any unexpanded placeholders
	if monitoring.HasUnexpandedPlaceholders(result) {
		t.Errorf("Result still contains unexpanded placeholders: %s", result)
	}

	// Should contain actual values
	if !strings.Contains(result, "container=123") {
		t.Error("container_id not expanded correctly")
	}
	if !strings.Contains(result, "session=session-abc") {
		t.Error("session_id not expanded correctly")
	}
	if !strings.Contains(result, "docker=docker-xyz") {
		t.Error("docker_id not expanded correctly")
	}
	if !strings.Contains(result, "silence=30") {
		t.Error("silence_duration not expanded correctly")
	}
}

func TestProperty7_InjectionPlaceholderExpansion_NoPlaceholders(t *testing.T) {
	command := "echo hello world"

	result := monitoring.ExpandPlaceholders(command, 123, "session-abc", "docker-xyz", 30)

	if result != command {
		t.Errorf("Command without placeholders should remain unchanged: got %s", result)
	}
}

func TestProperty7_InjectionPlaceholderExpansion_PartialPlaceholders(t *testing.T) {
	command := "echo {container_id} and some text"

	result := monitoring.ExpandPlaceholders(command, 456, "session-def", "docker-123", 60)

	if monitoring.HasUnexpandedPlaceholders(result) {
		t.Errorf("Result still contains unexpanded placeholders: %s", result)
	}

	if !strings.Contains(result, "456") {
		t.Error("container_id not expanded")
	}
}

func TestProperty7_InjectionPlaceholderExpansion_MultipleSamePlaceholder(t *testing.T) {
	command := "{container_id} {container_id} {container_id}"

	result := monitoring.ExpandPlaceholders(command, 789, "session", "docker", 0)

	if result != "789 789 789" {
		t.Errorf("Multiple same placeholders not expanded correctly: %s", result)
	}
}

func TestProperty7_InjectionPlaceholderExpansion_QuickCheck(t *testing.T) {
	// Property: After expansion, no supported placeholders remain
	f := func(containerID uint, sessionID string, silenceDuration uint8) bool {
		// Build command with all placeholders
		command := "{container_id}|{session_id}|{timestamp}|{silence_duration}|{docker_id}"

		result := monitoring.ExpandPlaceholders(command, containerID, sessionID, "docker-test", int(silenceDuration))

		// Should not contain any of the supported placeholders
		for _, placeholder := range monitoring.GetSupportedPlaceholders() {
			if strings.Contains(result, placeholder) {
				return false
			}
		}
		return true
	}

	if err := quick.Check(f, &quick.Config{MaxCount: 1000}); err != nil {
		t.Errorf("Property 7 (Placeholder Expansion) failed: %v", err)
	}
}

func TestProperty7_InjectionPlaceholderExpansion_UnsupportedPlaceholder(t *testing.T) {
	// Unsupported placeholders should remain unchanged
	command := "echo {unsupported_placeholder}"

	result := monitoring.ExpandPlaceholders(command, 123, "session", "docker", 30)

	if !strings.Contains(result, "{unsupported_placeholder}") {
		t.Error("Unsupported placeholder should remain unchanged")
	}
}

// TestProperty8_InjectionNewlineNormalization verifies Property 8: Injection Newline Normalization
// For any injection command, the command written to PTY stdin SHALL end with exactly
// one newline character, regardless of whether the original command had zero, one,
// or multiple trailing newlines.
// Validates: Requirements 3.4

func TestProperty8_InjectionNewlineNormalization_NoNewline(t *testing.T) {
	command := "echo hello"
	result := monitoring.NormalizeNewline(command)

	if !strings.HasSuffix(result, "\n") {
		t.Error("Result should end with newline")
	}
	if strings.HasSuffix(result, "\n\n") {
		t.Error("Result should not have multiple newlines")
	}
	if result != "echo hello\n" {
		t.Errorf("Expected 'echo hello\\n', got %q", result)
	}
}

func TestProperty8_InjectionNewlineNormalization_OneNewline(t *testing.T) {
	command := "echo hello\n"
	result := monitoring.NormalizeNewline(command)

	if result != "echo hello\n" {
		t.Errorf("Expected 'echo hello\\n', got %q", result)
	}
}

func TestProperty8_InjectionNewlineNormalization_MultipleNewlines(t *testing.T) {
	command := "echo hello\n\n\n"
	result := monitoring.NormalizeNewline(command)

	if result != "echo hello\n" {
		t.Errorf("Expected 'echo hello\\n', got %q", result)
	}
}

func TestProperty8_InjectionNewlineNormalization_CarriageReturn(t *testing.T) {
	command := "echo hello\r\n"
	result := monitoring.NormalizeNewline(command)

	if result != "echo hello\n" {
		t.Errorf("Expected 'echo hello\\n', got %q", result)
	}
}

func TestProperty8_InjectionNewlineNormalization_MixedNewlines(t *testing.T) {
	command := "echo hello\r\n\n\r"
	result := monitoring.NormalizeNewline(command)

	if result != "echo hello\n" {
		t.Errorf("Expected 'echo hello\\n', got %q", result)
	}
}

func TestProperty8_InjectionNewlineNormalization_QuickCheck(t *testing.T) {
	// Property: Result always ends with exactly one newline
	f := func(command string, trailingNewlines uint8) bool {
		// Add random number of trailing newlines
		input := command
		for i := uint8(0); i < trailingNewlines%10; i++ {
			if i%2 == 0 {
				input += "\n"
			} else {
				input += "\r\n"
			}
		}

		result := monitoring.NormalizeNewline(input)

		// Must end with exactly one newline
		if !strings.HasSuffix(result, "\n") {
			return false
		}

		// Must not end with multiple newlines
		if strings.HasSuffix(result, "\n\n") {
			return false
		}

		// Must not end with carriage return before newline
		if strings.HasSuffix(result, "\r\n") && len(result) > 2 {
			// \r\n at end is normalized to just \n
			return false
		}

		return true
	}

	if err := quick.Check(f, &quick.Config{MaxCount: 1000}); err != nil {
		t.Errorf("Property 8 (Newline Normalization) failed: %v", err)
	}
}

func TestProperty8_InjectionNewlineNormalization_EmptyCommand(t *testing.T) {
	command := ""
	result := monitoring.NormalizeNewline(command)

	if result != "\n" {
		t.Errorf("Empty command should become single newline, got %q", result)
	}
}

func TestProperty8_InjectionNewlineNormalization_OnlyNewlines(t *testing.T) {
	command := "\n\n\n"
	result := monitoring.NormalizeNewline(command)

	if result != "\n" {
		t.Errorf("Only newlines should become single newline, got %q", result)
	}
}

func TestInjectionStrategy_Validate(t *testing.T) {
	strategy := monitoring.NewInjectionStrategy()

	// Valid config
	validConfig := &models.MonitoringConfig{
		InjectionCommand: "echo hello",
	}
	if err := strategy.Validate(validConfig); err != nil {
		t.Errorf("Valid config should pass: %v", err)
	}

	// Invalid config - empty command
	invalidConfig := &models.MonitoringConfig{
		InjectionCommand: "",
	}
	if err := strategy.Validate(invalidConfig); err == nil {
		t.Error("Empty command should fail validation")
	}
}

func TestInjectionStrategy_Name(t *testing.T) {
	strategy := monitoring.NewInjectionStrategy()

	if strategy.Name() != models.StrategyInjection {
		t.Errorf("Expected strategy name %s, got %s", models.StrategyInjection, strategy.Name())
	}
}

func TestGetSupportedPlaceholders(t *testing.T) {
	placeholders := monitoring.GetSupportedPlaceholders()

	expected := []string{
		"{container_id}",
		"{session_id}",
		"{timestamp}",
		"{silence_duration}",
		"{docker_id}",
	}

	if len(placeholders) != len(expected) {
		t.Errorf("Expected %d placeholders, got %d", len(expected), len(placeholders))
	}

	for _, exp := range expected {
		found := false
		for _, p := range placeholders {
			if p == exp {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("Missing expected placeholder: %s", exp)
		}
	}
}
