package monitoring

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// AIClient provides OpenAI-compatible API access for AI strategy.
type AIClient struct {
	endpoint   string
	apiKey     string
	model      string
	timeout    time.Duration
	httpClient *http.Client
}

// AIClientConfig holds configuration for the AI client.
type AIClientConfig struct {
	Endpoint string
	APIKey   string
	Model    string
	Timeout  int // seconds
}

// NewAIClient creates a new AI client with the given configuration.
func NewAIClient(config AIClientConfig) *AIClient {
	timeout := time.Duration(config.Timeout) * time.Second
	if timeout <= 0 {
		timeout = 30 * time.Second
	}

	return &AIClient{
		endpoint: config.Endpoint,
		apiKey:   config.APIKey,
		model:    config.Model,
		timeout:  timeout,
		httpClient: &http.Client{
			Timeout: timeout,
		},
	}
}

// ChatMessage represents a message in the chat completion request.
type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// ChatCompletionRequest represents the request body for chat completion.
type ChatCompletionRequest struct {
	Model       string        `json:"model"`
	Messages    []ChatMessage `json:"messages"`
	Temperature float64       `json:"temperature,omitempty"`
	MaxTokens   int           `json:"max_tokens,omitempty"`
}

// ChatCompletionResponse represents the response from chat completion.
type ChatCompletionResponse struct {
	ID      string `json:"id"`
	Object  string `json:"object"`
	Created int64  `json:"created"`
	Model   string `json:"model"`
	Choices []struct {
		Index   int `json:"index"`
		Message struct {
			Role    string `json:"role"`
			Content string `json:"content"`
		} `json:"message"`
		FinishReason string `json:"finish_reason"`
	} `json:"choices"`
	Usage struct {
		PromptTokens     int `json:"prompt_tokens"`
		CompletionTokens int `json:"completion_tokens"`
		TotalTokens      int `json:"total_tokens"`
	} `json:"usage"`
	Error *struct {
		Message string `json:"message"`
		Type    string `json:"type"`
		Code    string `json:"code"`
	} `json:"error,omitempty"`
}

// Complete sends a chat completion request and returns the response.
func (c *AIClient) Complete(ctx context.Context, systemPrompt string, userPrompt string, temperature float64) (string, error) {
	if c.endpoint == "" {
		return "", fmt.Errorf("AI endpoint not configured")
	}

	messages := []ChatMessage{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: userPrompt},
	}

	reqBody := ChatCompletionRequest{
		Model:       c.model,
		Messages:    messages,
		Temperature: temperature,
		MaxTokens:   1024,
	}

	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("failed to marshal request: %w", err)
	}

	// Build request
	endpoint := c.endpoint
	if endpoint[len(endpoint)-1] != '/' {
		endpoint += "/"
	}
	endpoint += "chat/completions"

	req, err := http.NewRequestWithContext(ctx, "POST", endpoint, bytes.NewReader(jsonBody))
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	if c.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.apiKey)
	}

	// Send request
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	// Read response
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response: %w", err)
	}

	// Parse response
	var chatResp ChatCompletionResponse
	if err := json.Unmarshal(body, &chatResp); err != nil {
		return "", fmt.Errorf("failed to parse response: %w", err)
	}

	// Check for API error
	if chatResp.Error != nil {
		return "", fmt.Errorf("API error: %s", chatResp.Error.Message)
	}

	// Check for valid response
	if len(chatResp.Choices) == 0 {
		return "", fmt.Errorf("no response choices returned")
	}

	return chatResp.Choices[0].Message.Content, nil
}

// UpdateConfig updates the client configuration.
func (c *AIClient) UpdateConfig(config AIClientConfig) {
	c.endpoint = config.Endpoint
	c.apiKey = config.APIKey
	c.model = config.Model
	
	timeout := time.Duration(config.Timeout) * time.Second
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	c.timeout = timeout
	c.httpClient.Timeout = timeout
}

// IsConfigured returns whether the AI client is properly configured.
func (c *AIClient) IsConfigured() bool {
	return c.endpoint != "" && c.model != ""
}

// GetModel returns the configured model name.
func (c *AIClient) GetModel() string {
	return c.model
}

// GetEndpoint returns the configured endpoint.
func (c *AIClient) GetEndpoint() string {
	return c.endpoint
}
