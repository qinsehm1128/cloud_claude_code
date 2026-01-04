package monitoring

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"

	"cc-platform/internal/models"
)

// WebhookPayload represents the data sent to webhook endpoints.
type WebhookPayload struct {
	ContainerID     uint   `json:"container_id"`
	SessionID       string `json:"session_id"`
	SilenceDuration int    `json:"silence_duration"` // Seconds
	LastOutput      string `json:"last_output_snippet"`
	Timestamp       int64  `json:"timestamp"`
}

// WebhookStrategy implements the webhook notification strategy.
type WebhookStrategy struct {
	httpClient *http.Client
}

// NewWebhookStrategy creates a new webhook strategy.
func NewWebhookStrategy() *WebhookStrategy {
	return &WebhookStrategy{
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// Name returns the strategy identifier.
func (s *WebhookStrategy) Name() string {
	return models.StrategyWebhook
}

// Execute sends a webhook notification.
func (s *WebhookStrategy) Execute(ctx context.Context, session *MonitoringSession) (*StrategyResult, error) {
	if session.Config.WebhookURL == "" {
		return &StrategyResult{
			Action:       "skip",
			Success:      false,
			ErrorMessage: "webhook URL not configured",
			Timestamp:    time.Now(),
		}, fmt.Errorf("webhook URL not configured")
	}

	// Build payload
	payload := WebhookPayload{
		ContainerID:     session.ContainerID,
		SessionID:       session.PTYSession.ID,
		SilenceDuration: int(session.GetSilenceDuration().Seconds()),
		LastOutput:      session.GetLastOutput(500),
		Timestamp:       time.Now().Unix(),
	}

	// Send with retry
	result, err := s.sendWithRetry(ctx, session.Config.WebhookURL, session.Config.WebhookHeaders, payload, 3)
	if err != nil {
		return &StrategyResult{
			Action:       "webhook_sent",
			Success:      false,
			ErrorMessage: err.Error(),
			Timestamp:    time.Now(),
		}, nil // Return nil error to not interrupt monitoring
	}

	return result, nil
}

// Validate checks if the webhook configuration is valid.
// Validation is lenient - empty URL is allowed (strategy will skip on execute).
// Only validates format if URL is provided.
func (s *WebhookStrategy) Validate(config *models.MonitoringConfig) error {
	// Allow empty URL - strategy will skip on execute
	if config.WebhookURL == "" {
		return nil
	}

	// Validate URL format only if provided
	_, err := url.ParseRequestURI(config.WebhookURL)
	if err != nil {
		return fmt.Errorf("invalid webhook URL: %w", err)
	}

	// Validate headers JSON if provided
	if config.WebhookHeaders != "" {
		var headers map[string]string
		if err := json.Unmarshal([]byte(config.WebhookHeaders), &headers); err != nil {
			return fmt.Errorf("invalid webhook headers JSON: %w", err)
		}
	}

	return nil
}

// sendWithRetry sends the webhook with exponential backoff retry.
func (s *WebhookStrategy) sendWithRetry(ctx context.Context, webhookURL string, headersJSON string, payload WebhookPayload, maxRetries int) (*StrategyResult, error) {
	var lastErr error

	// Parse custom headers
	var customHeaders map[string]string
	if headersJSON != "" {
		if err := json.Unmarshal([]byte(headersJSON), &customHeaders); err != nil {
			customHeaders = nil
		}
	}

	for attempt := 0; attempt < maxRetries; attempt++ {
		// Check context cancellation
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		default:
		}

		// Exponential backoff delay (except first attempt)
		if attempt > 0 {
			delay := time.Duration(1<<uint(attempt-1)) * time.Second // 1s, 2s, 4s
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(delay):
			}
		}

		// Send request
		err := s.sendRequest(ctx, webhookURL, customHeaders, payload)
		if err == nil {
			return &StrategyResult{
				Action:    "webhook_sent",
				Success:   true,
				Message:   fmt.Sprintf("Webhook sent successfully after %d attempt(s)", attempt+1),
				Timestamp: time.Now(),
			}, nil
		}

		lastErr = err
	}

	return nil, fmt.Errorf("webhook failed after %d retries: %w", maxRetries, lastErr)
}

// sendRequest sends a single HTTP POST request.
func (s *WebhookStrategy) sendRequest(ctx context.Context, webhookURL string, headers map[string]string, payload WebhookPayload) error {
	// Marshal payload
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal payload: %w", err)
	}

	// Create request
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, webhookURL, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	// Set default headers
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "PTY-Monitor/1.0")

	// Set custom headers
	for key, value := range headers {
		req.Header.Set(key, value)
	}

	// Send request
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	// Read response body for error messages
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))

	// Check status code
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("webhook returned status %d: %s", resp.StatusCode, string(respBody))
	}

	return nil
}

// ValidateWebhookPayload checks if a payload has all required fields.
func ValidateWebhookPayload(payload *WebhookPayload) error {
	if payload.ContainerID == 0 {
		return fmt.Errorf("container_id is required")
	}
	if payload.SessionID == "" {
		return fmt.Errorf("session_id is required")
	}
	if payload.Timestamp == 0 {
		return fmt.Errorf("timestamp is required")
	}
	// SilenceDuration can be 0
	// LastOutput can be empty
	return nil
}
