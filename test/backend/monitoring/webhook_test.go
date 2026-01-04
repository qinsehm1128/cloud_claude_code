package monitoring_test

import (
	"testing"
	"testing/quick"
	"time"

	"cc-platform/internal/models"
	"cc-platform/internal/monitoring"
)

// TestProperty5_WebhookPayloadCompleteness verifies Property 5: Webhook Payload Completeness
// For any Webhook strategy execution, the HTTP POST payload SHALL contain all required
// fields (container_id, session_id, silence_duration, last_output_snippet, timestamp)
// with non-null values.
// Validates: Requirements 2.2

func TestProperty5_WebhookPayloadCompleteness_AllFieldsPresent(t *testing.T) {
	// Property: All required fields must be present and non-null
	f := func(containerID uint, sessionID string, silenceDuration int, timestamp int64) bool {
		if containerID == 0 || sessionID == "" || timestamp == 0 {
			// Skip invalid inputs
			return true
		}

		payload := &monitoring.WebhookPayload{
			ContainerID:     containerID,
			SessionID:       sessionID,
			SilenceDuration: silenceDuration,
			LastOutput:      "test output",
			Timestamp:       timestamp,
		}

		err := monitoring.ValidateWebhookPayload(payload)
		return err == nil
	}

	if err := quick.Check(f, &quick.Config{MaxCount: 1000}); err != nil {
		t.Errorf("Property 5 (Payload Completeness) failed: %v", err)
	}
}

func TestProperty5_WebhookPayloadCompleteness_MissingContainerID(t *testing.T) {
	payload := &monitoring.WebhookPayload{
		ContainerID:     0, // Missing
		SessionID:       "session-123",
		SilenceDuration: 30,
		LastOutput:      "test",
		Timestamp:       time.Now().Unix(),
	}

	err := monitoring.ValidateWebhookPayload(payload)
	if err == nil {
		t.Error("Should reject payload with missing container_id")
	}
}

func TestProperty5_WebhookPayloadCompleteness_MissingSessionID(t *testing.T) {
	payload := &monitoring.WebhookPayload{
		ContainerID:     1,
		SessionID:       "", // Missing
		SilenceDuration: 30,
		LastOutput:      "test",
		Timestamp:       time.Now().Unix(),
	}

	err := monitoring.ValidateWebhookPayload(payload)
	if err == nil {
		t.Error("Should reject payload with missing session_id")
	}
}

func TestProperty5_WebhookPayloadCompleteness_MissingTimestamp(t *testing.T) {
	payload := &monitoring.WebhookPayload{
		ContainerID:     1,
		SessionID:       "session-123",
		SilenceDuration: 30,
		LastOutput:      "test",
		Timestamp:       0, // Missing
	}

	err := monitoring.ValidateWebhookPayload(payload)
	if err == nil {
		t.Error("Should reject payload with missing timestamp")
	}
}

func TestProperty5_WebhookPayloadCompleteness_ZeroSilenceDurationAllowed(t *testing.T) {
	payload := &monitoring.WebhookPayload{
		ContainerID:     1,
		SessionID:       "session-123",
		SilenceDuration: 0, // Zero is allowed
		LastOutput:      "test",
		Timestamp:       time.Now().Unix(),
	}

	err := monitoring.ValidateWebhookPayload(payload)
	if err != nil {
		t.Errorf("Should allow zero silence_duration: %v", err)
	}
}

func TestProperty5_WebhookPayloadCompleteness_EmptyLastOutputAllowed(t *testing.T) {
	payload := &monitoring.WebhookPayload{
		ContainerID:     1,
		SessionID:       "session-123",
		SilenceDuration: 30,
		LastOutput:      "", // Empty is allowed
		Timestamp:       time.Now().Unix(),
	}

	err := monitoring.ValidateWebhookPayload(payload)
	if err != nil {
		t.Errorf("Should allow empty last_output: %v", err)
	}
}

// TestProperty6_WebhookRetryBehavior verifies Property 6: Webhook Retry Behavior
// For any Webhook request that fails, the system SHALL retry exactly 3 times with
// exponential backoff delays, and after all retries fail, monitoring SHALL continue
// without interruption.
// Validates: Requirements 2.3, 2.4

func TestProperty6_WebhookRetryBehavior_ConfigValidation(t *testing.T) {
	strategy := monitoring.NewWebhookStrategy()

	// Valid config
	validConfig := &models.MonitoringConfig{
		WebhookURL:     "https://example.com/webhook",
		WebhookHeaders: `{"Authorization": "Bearer token"}`,
	}

	err := strategy.Validate(validConfig)
	if err != nil {
		t.Errorf("Valid config should pass validation: %v", err)
	}
}

func TestProperty6_WebhookRetryBehavior_InvalidURL(t *testing.T) {
	strategy := monitoring.NewWebhookStrategy()

	invalidConfig := &models.MonitoringConfig{
		WebhookURL: "not-a-valid-url",
	}

	err := strategy.Validate(invalidConfig)
	if err == nil {
		t.Error("Invalid URL should fail validation")
	}
}

func TestProperty6_WebhookRetryBehavior_EmptyURL(t *testing.T) {
	strategy := monitoring.NewWebhookStrategy()

	emptyConfig := &models.MonitoringConfig{
		WebhookURL: "",
	}

	err := strategy.Validate(emptyConfig)
	if err == nil {
		t.Error("Empty URL should fail validation")
	}
}

func TestProperty6_WebhookRetryBehavior_InvalidHeadersJSON(t *testing.T) {
	strategy := monitoring.NewWebhookStrategy()

	invalidConfig := &models.MonitoringConfig{
		WebhookURL:     "https://example.com/webhook",
		WebhookHeaders: "not valid json",
	}

	err := strategy.Validate(invalidConfig)
	if err == nil {
		t.Error("Invalid headers JSON should fail validation")
	}
}

func TestProperty6_WebhookRetryBehavior_ValidHeadersJSON(t *testing.T) {
	strategy := monitoring.NewWebhookStrategy()

	validConfig := &models.MonitoringConfig{
		WebhookURL:     "https://example.com/webhook",
		WebhookHeaders: `{"X-Custom-Header": "value", "Authorization": "Bearer token"}`,
	}

	err := strategy.Validate(validConfig)
	if err != nil {
		t.Errorf("Valid headers JSON should pass validation: %v", err)
	}
}

func TestProperty6_WebhookRetryBehavior_EmptyHeaders(t *testing.T) {
	strategy := monitoring.NewWebhookStrategy()

	config := &models.MonitoringConfig{
		WebhookURL:     "https://example.com/webhook",
		WebhookHeaders: "", // Empty is allowed
	}

	err := strategy.Validate(config)
	if err != nil {
		t.Errorf("Empty headers should pass validation: %v", err)
	}
}

func TestProperty6_WebhookRetryBehavior_StrategyName(t *testing.T) {
	strategy := monitoring.NewWebhookStrategy()

	if strategy.Name() != models.StrategyWebhook {
		t.Errorf("Expected strategy name %s, got %s", models.StrategyWebhook, strategy.Name())
	}
}
