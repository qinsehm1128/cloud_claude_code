package monitoring_test

import (
	"encoding/json"
	"net/url"
	"testing"
	"testing/quick"

	"cc-platform/internal/models"
	"cc-platform/internal/monitoring"
)

// TestProperty4_SilenceThresholdValidation verifies Property 4: Silence Threshold Validation
// For any silence threshold configuration value, the system SHALL accept values in the
// range [5, 300] seconds and reject values outside this range with a validation error.
// Validates: Requirements 1.7

func TestProperty4_SilenceThresholdValidation_ValidRange(t *testing.T) {
	// Test boundary values
	validValues := []int{5, 6, 30, 100, 299, 300}
	for _, v := range validValues {
		if !monitoring.ValidateSilenceThreshold(v) {
			t.Errorf("Threshold %d should be valid", v)
		}
	}
}

func TestProperty4_SilenceThresholdValidation_InvalidRange(t *testing.T) {
	// Test invalid values
	invalidValues := []int{-100, -1, 0, 1, 2, 3, 4, 301, 302, 500, 1000, 10000}
	for _, v := range invalidValues {
		if monitoring.ValidateSilenceThreshold(v) {
			t.Errorf("Threshold %d should be invalid", v)
		}
	}
}

func TestProperty4_SilenceThresholdValidation_QuickCheck(t *testing.T) {
	// Property: Validation matches expected range [5, 300]
	f := func(threshold int) bool {
		valid := monitoring.ValidateSilenceThreshold(threshold)
		expected := threshold >= 5 && threshold <= 300
		return valid == expected
	}

	if err := quick.Check(f, &quick.Config{MaxCount: 10000}); err != nil {
		t.Errorf("Property 4 (Threshold Validation) failed: %v", err)
	}
}

// TestProperty18_ConfigurationValidation verifies Property 18: Configuration Validation
// For any automation configuration update, the system SHALL validate: URL format for
// webhook endpoints, JSON format for headers, numeric range for thresholds, and reject
// invalid configurations with descriptive error messages.
// Validates: Requirements 7.5

func TestProperty18_ConfigurationValidation_WebhookURL(t *testing.T) {
	strategy := monitoring.NewWebhookStrategy()

	// Valid URLs
	validURLs := []string{
		"http://example.com/webhook",
		"https://example.com/webhook",
		"http://localhost:8080/api/webhook",
		"https://api.example.com/v1/notify",
	}

	for _, u := range validURLs {
		config := &models.MonitoringConfig{WebhookURL: u}
		if err := strategy.Validate(config); err != nil {
			t.Errorf("URL %s should be valid: %v", u, err)
		}
	}

	// Invalid URLs
	invalidURLs := []string{
		"",
		"not-a-url",
		"ftp://example.com",
		"://missing-scheme",
	}

	for _, u := range invalidURLs {
		config := &models.MonitoringConfig{WebhookURL: u}
		if err := strategy.Validate(config); err == nil {
			t.Errorf("URL %s should be invalid", u)
		}
	}
}

func TestProperty18_ConfigurationValidation_WebhookHeaders(t *testing.T) {
	strategy := monitoring.NewWebhookStrategy()

	// Valid headers JSON
	validHeaders := []string{
		"",
		"{}",
		`{"Authorization": "Bearer token"}`,
		`{"X-Custom": "value", "Another": "header"}`,
	}

	for _, h := range validHeaders {
		config := &models.MonitoringConfig{
			WebhookURL:     "https://example.com/webhook",
			WebhookHeaders: h,
		}
		if err := strategy.Validate(config); err != nil {
			t.Errorf("Headers %s should be valid: %v", h, err)
		}
	}

	// Invalid headers JSON
	invalidHeaders := []string{
		"not json",
		"{invalid}",
		"[1,2,3]", // Array instead of object
	}

	for _, h := range invalidHeaders {
		config := &models.MonitoringConfig{
			WebhookURL:     "https://example.com/webhook",
			WebhookHeaders: h,
		}
		if err := strategy.Validate(config); err == nil {
			t.Errorf("Headers %s should be invalid", h)
		}
	}
}

func TestProperty18_ConfigurationValidation_InjectionCommand(t *testing.T) {
	strategy := monitoring.NewInjectionStrategy()

	// Valid commands
	validCommands := []string{
		"echo hello",
		"ls -la",
		"cat /etc/passwd",
		"echo {container_id}",
	}

	for _, cmd := range validCommands {
		config := &models.MonitoringConfig{InjectionCommand: cmd}
		if err := strategy.Validate(config); err != nil {
			t.Errorf("Command %s should be valid: %v", cmd, err)
		}
	}

	// Invalid - empty command
	config := &models.MonitoringConfig{InjectionCommand: ""}
	if err := strategy.Validate(config); err == nil {
		t.Error("Empty command should be invalid")
	}
}

func TestProperty18_ConfigurationValidation_QuickCheck_URL(t *testing.T) {
	// Property: URL validation is consistent
	f := func(urlStr string) bool {
		strategy := monitoring.NewWebhookStrategy()
		config := &models.MonitoringConfig{WebhookURL: urlStr}

		err := strategy.Validate(config)

		// Check if URL is parseable
		_, parseErr := url.ParseRequestURI(urlStr)
		isValidURL := parseErr == nil && urlStr != ""

		// Validation should match URL validity
		if isValidURL {
			return err == nil
		}
		return err != nil
	}

	if err := quick.Check(f, &quick.Config{MaxCount: 500}); err != nil {
		t.Errorf("Property 18 (URL Validation) failed: %v", err)
	}
}

func TestProperty18_ConfigurationValidation_QuickCheck_JSON(t *testing.T) {
	// Property: JSON validation is consistent
	f := func(jsonStr string) bool {
		strategy := monitoring.NewWebhookStrategy()
		config := &models.MonitoringConfig{
			WebhookURL:     "https://example.com/webhook",
			WebhookHeaders: jsonStr,
		}

		err := strategy.Validate(config)

		// Empty string is valid
		if jsonStr == "" {
			return err == nil
		}

		// Check if JSON is valid object
		var obj map[string]string
		jsonErr := json.Unmarshal([]byte(jsonStr), &obj)
		isValidJSON := jsonErr == nil

		// Validation should match JSON validity
		if isValidJSON {
			return err == nil
		}
		return err != nil
	}

	if err := quick.Check(f, &quick.Config{MaxCount: 500}); err != nil {
		t.Errorf("Property 18 (JSON Validation) failed: %v", err)
	}
}

func TestProperty18_ConfigurationValidation_CombinedValidation(t *testing.T) {
	// Test that all validations work together
	strategy := monitoring.NewWebhookStrategy()

	// All valid
	validConfig := &models.MonitoringConfig{
		WebhookURL:       "https://example.com/webhook",
		WebhookHeaders:   `{"Authorization": "Bearer token"}`,
		SilenceThreshold: 30,
	}
	if err := strategy.Validate(validConfig); err != nil {
		t.Errorf("Valid config should pass: %v", err)
	}

	// Invalid URL
	invalidURLConfig := &models.MonitoringConfig{
		WebhookURL:       "invalid",
		WebhookHeaders:   `{"Authorization": "Bearer token"}`,
		SilenceThreshold: 30,
	}
	if err := strategy.Validate(invalidURLConfig); err == nil {
		t.Error("Invalid URL should fail validation")
	}

	// Invalid headers
	invalidHeadersConfig := &models.MonitoringConfig{
		WebhookURL:       "https://example.com/webhook",
		WebhookHeaders:   "not json",
		SilenceThreshold: 30,
	}
	if err := strategy.Validate(invalidHeadersConfig); err == nil {
		t.Error("Invalid headers should fail validation")
	}
}

func TestProperty18_ConfigurationValidation_ErrorMessages(t *testing.T) {
	strategy := monitoring.NewWebhookStrategy()

	// Empty URL should have descriptive error
	config := &models.MonitoringConfig{WebhookURL: ""}
	err := strategy.Validate(config)
	if err == nil {
		t.Error("Should return error for empty URL")
	}
	if err != nil && err.Error() == "" {
		t.Error("Error message should not be empty")
	}

	// Invalid JSON should have descriptive error
	config = &models.MonitoringConfig{
		WebhookURL:     "https://example.com",
		WebhookHeaders: "invalid json",
	}
	err = strategy.Validate(config)
	if err == nil {
		t.Error("Should return error for invalid JSON")
	}
	if err != nil && err.Error() == "" {
		t.Error("Error message should not be empty")
	}
}

func TestConfigValidation_StrategySpecific(t *testing.T) {
	// Webhook strategy requires URL
	webhookStrategy := monitoring.NewWebhookStrategy()
	webhookConfig := &models.MonitoringConfig{
		ActiveStrategy: models.StrategyWebhook,
		WebhookURL:     "",
	}
	if err := webhookStrategy.Validate(webhookConfig); err == nil {
		t.Error("Webhook strategy should require URL")
	}

	// Injection strategy requires command
	injectionStrategy := monitoring.NewInjectionStrategy()
	injectionConfig := &models.MonitoringConfig{
		ActiveStrategy:   models.StrategyInjection,
		InjectionCommand: "",
	}
	if err := injectionStrategy.Validate(injectionConfig); err == nil {
		t.Error("Injection strategy should require command")
	}
}
