package services

import (
	"strings"
	"testing"
	"testing/quick"
)

// Property 5: Custom Environment Variable Parsing
// For any string in format "VAR_NAME=value" where VAR_NAME matches pattern ^[A-Z_][A-Z0-9_]*$,
// the Platform SHALL successfully parse and store it; for any string not matching this format,
// the Platform SHALL reject with validation error.

func TestValidEnvVarFormat(t *testing.T) {
	// Test valid formats
	validCases := []string{
		"API_KEY=value",
		"MY_VAR=some value",
		"_PRIVATE=test",
		"A=b",
		"VAR_123=value",
		"ANTHROPIC_API_KEY=sk-ant-xxx",
		"BASE_URL=https://api.example.com",
	}

	for _, tc := range validCases {
		if !ValidateEnvVarFormat(tc) {
			t.Errorf("Expected valid format for: %s", tc)
		}
	}
}

func TestInvalidEnvVarFormat(t *testing.T) {
	// Test invalid formats
	invalidCases := []string{
		"lowercase=value",      // lowercase not allowed
		"123VAR=value",         // cannot start with number
		"VAR-NAME=value",       // hyphen not allowed
		"VAR NAME=value",       // space not allowed
		"no_equals_sign",       // missing =
		"=value",               // empty var name
	}

	for _, tc := range invalidCases {
		if ValidateEnvVarFormat(tc) {
			t.Errorf("Expected invalid format for: %s", tc)
		}
	}
}

func TestEmptyAndCommentLinesAreValid(t *testing.T) {
	validCases := []string{
		"",
		"   ",
		"# This is a comment",
		"  # Indented comment",
	}

	for _, tc := range validCases {
		if !ValidateEnvVarFormat(tc) {
			t.Errorf("Expected valid format for empty/comment: %q", tc)
		}
	}
}

// Property test: valid uppercase var names should always be accepted
func TestValidEnvVarNameProperty(t *testing.T) {
	f := func(data []byte) bool {
		// Generate valid var name from data
		varName := ""
		for i, b := range data {
			if i == 0 {
				// First char must be A-Z or _
				if b >= 'A' && b <= 'Z' {
					varName += string(b)
				} else {
					varName += "_"
				}
			} else {
				// Rest can be A-Z, 0-9, or _
				if (b >= 'A' && b <= 'Z') || (b >= '0' && b <= '9') {
					varName += string(b)
				} else {
					varName += "_"
				}
			}
			if len(varName) > 20 {
				break
			}
		}

		if varName == "" {
			return true // Skip empty
		}

		line := varName + "=testvalue"
		return ValidateEnvVarFormat(line)
	}

	if err := quick.Check(f, &quick.Config{MaxCount: 100}); err != nil {
		t.Errorf("Property test failed: %v", err)
	}
}

// Property test: lowercase var names should always be rejected
func TestInvalidLowercaseVarNameProperty(t *testing.T) {
	f := func(data []byte) bool {
		// Generate lowercase var name
		varName := ""
		for _, b := range data {
			if b >= 'a' && b <= 'z' {
				varName += string(b)
			}
			if len(varName) > 10 {
				break
			}
		}

		if varName == "" {
			return true // Skip empty
		}

		line := varName + "=testvalue"
		// Lowercase should be invalid
		return !ValidateEnvVarFormat(line)
	}

	if err := quick.Check(f, &quick.Config{MaxCount: 100}); err != nil {
		t.Errorf("Property test failed: %v", err)
	}
}

// Property test: lines without = should be rejected (unless empty/comment)
func TestMissingEqualsProperty(t *testing.T) {
	f := func(data []byte) bool {
		// Generate string without =
		line := ""
		for _, b := range data {
			if b != '=' && b != '#' && b >= 32 && b < 127 {
				line += string(b)
			}
			if len(line) > 20 {
				break
			}
		}

		line = strings.TrimSpace(line)
		if line == "" {
			return true // Empty is valid
		}

		// Non-empty line without = should be invalid
		return !ValidateEnvVarFormat(line)
	}

	if err := quick.Check(f, &quick.Config{MaxCount: 100}); err != nil {
		t.Errorf("Property test failed: %v", err)
	}
}

func TestParseMultipleEnvVars(t *testing.T) {
	input := `API_KEY=secret123
BASE_URL=https://api.example.com
# This is a comment
CUSTOM_VAR=custom_value

ANOTHER_VAR=another`

	svc := &ClaudeConfigService{}
	result, err := svc.ParseEnvVars(input)
	if err != nil {
		t.Fatalf("ParseEnvVars failed: %v", err)
	}

	expected := map[string]string{
		"API_KEY":     "secret123",
		"BASE_URL":    "https://api.example.com",
		"CUSTOM_VAR":  "custom_value",
		"ANOTHER_VAR": "another",
	}

	if len(result) != len(expected) {
		t.Errorf("Expected %d vars, got %d", len(expected), len(result))
	}

	for k, v := range expected {
		if result[k] != v {
			t.Errorf("Expected %s=%s, got %s=%s", k, v, k, result[k])
		}
	}
}

func TestParseEnvVarsWithInvalidLine(t *testing.T) {
	input := `VALID_VAR=value
invalid_var=value`

	svc := &ClaudeConfigService{}
	_, err := svc.ParseEnvVars(input)
	if err != ErrInvalidEnvVarFormat {
		t.Errorf("Expected ErrInvalidEnvVarFormat, got: %v", err)
	}
}

func TestParseEmptyEnvVars(t *testing.T) {
	svc := &ClaudeConfigService{}
	result, err := svc.ParseEnvVars("")
	if err != nil {
		t.Fatalf("ParseEnvVars failed: %v", err)
	}

	if len(result) != 0 {
		t.Errorf("Expected empty map, got %d items", len(result))
	}
}

func TestEnvVarValueWithEquals(t *testing.T) {
	// Value can contain = signs
	input := "CONNECTION_STRING=host=localhost;port=5432"

	svc := &ClaudeConfigService{}
	result, err := svc.ParseEnvVars(input)
	if err != nil {
		t.Fatalf("ParseEnvVars failed: %v", err)
	}

	expected := "host=localhost;port=5432"
	if result["CONNECTION_STRING"] != expected {
		t.Errorf("Expected value %q, got %q", expected, result["CONNECTION_STRING"])
	}
}
