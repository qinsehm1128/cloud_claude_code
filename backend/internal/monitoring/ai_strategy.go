package monitoring

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"cc-platform/internal/models"
)

// AIStrategy implements the AI-based automation strategy.
// It uses an LLM to analyze the PTY context and decide on actions.
type AIStrategy struct {
	client *AIClient
}

// NewAIStrategy creates a new AI strategy.
func NewAIStrategy(client *AIClient) *AIStrategy {
	return &AIStrategy{
		client: client,
	}
}

// AIAction represents the action decided by the AI.
type AIAction string

const (
	AIActionInjectCmd AIAction = "inject"   // Inject a command
	AIActionSkipCmd   AIAction = "skip"     // Skip this trigger, wait for more output
	AIActionNotifyCmd AIAction = "notify"   // Send notification only
	AIActionComplete  AIAction = "complete" // Mark task as complete
)

// AIDecision represents the structured response from the AI.
type AIDecision struct {
	Action  AIAction `json:"action"`
	Command string   `json:"command,omitempty"` // For inject action
	Message string   `json:"message,omitempty"` // For notify action or explanation
	Reason  string   `json:"reason,omitempty"`  // Explanation for the decision
}

// DefaultSystemPrompt is the default system prompt for the AI.
const DefaultSystemPrompt = `You are an automation assistant monitoring a terminal session. 
Your task is to analyze the terminal output and decide what action to take when the terminal has been silent.

You will receive the recent terminal output as context. Based on this, decide one of the following actions:
1. "inject" - Inject a command to continue the work (provide the command)
2. "skip" - Do nothing, the silence is expected (e.g., waiting for a long operation)
3. "notify" - Send a notification to the user (provide a message)
4. "complete" - The current task appears to be complete

Respond ONLY with a JSON object in this exact format:
{
  "action": "inject|skip|notify|complete",
  "command": "command to inject (only for inject action)",
  "message": "notification message (only for notify action)",
  "reason": "brief explanation of your decision"
}

Consider:
- If the output shows a prompt waiting for input, inject an appropriate command
- If the output shows an error, consider notifying the user
- If the output shows a long-running process, skip
- If the output shows completion messages, mark as complete`

// AIStrategyAdapter adapts AIStrategy to the Strategy interface.
type AIStrategyAdapter struct {
	aiStrategy    *AIStrategy
	defaultAction AIAction
}

// NewAIStrategyAdapter creates a new AI strategy adapter.
func NewAIStrategyAdapter() *AIStrategyAdapter {
	return &AIStrategyAdapter{
		defaultAction: AIActionSkipCmd,
	}
}

// Name returns the strategy identifier.
func (a *AIStrategyAdapter) Name() string {
	return "ai"
}

// Execute runs the AI strategy.
func (a *AIStrategyAdapter) Execute(ctx context.Context, session *MonitoringSession) (*StrategyResult, error) {
	if a.aiStrategy == nil || a.aiStrategy.client == nil {
		return a.executeFallback(session, "AI strategy not initialized")
	}

	if !a.aiStrategy.client.IsConfigured() {
		return a.executeFallback(session, "AI client not configured")
	}

	// Build context from session
	contextBuffer := session.GetLastOutput(4096)
	if contextBuffer == "" {
		return a.executeFallback(session, "no context available")
	}

	// Get system prompt
	systemPrompt := session.Config.AISystemPrompt
	if systemPrompt == "" {
		systemPrompt = DefaultSystemPrompt
	}

	// Build user prompt with context
	userPrompt := fmt.Sprintf("Terminal output (last %d characters):\n```\n%s\n```\n\nThe terminal has been silent for %d seconds. What action should be taken?",
		len(contextBuffer), contextBuffer, session.Config.SilenceThreshold)

	// Call AI
	temperature := session.Config.AITemperature
	if temperature <= 0 {
		temperature = 0.7
	}

	response, err := a.aiStrategy.client.Complete(ctx, systemPrompt, userPrompt, temperature)
	if err != nil {
		log.Printf("[AIStrategy] AI call failed: %v", err)
		return a.executeFallback(session, fmt.Sprintf("AI call failed: %v", err))
	}

	// Parse AI decision
	decision, err := parseAIDecision(response)
	if err != nil {
		log.Printf("[AIStrategy] Failed to parse AI response: %v", err)
		return a.executeFallback(session, fmt.Sprintf("failed to parse AI response: %v", err))
	}

	// Execute the decision
	return a.executeDecision(ctx, session, decision)
}

// Validate checks if the AI configuration is valid.
// Validation is lenient - empty endpoint/model is allowed (strategy will fallback on execute).
func (a *AIStrategyAdapter) Validate(config *models.MonitoringConfig) error {
	// Allow empty config - strategy will use fallback on execute
	return nil
}

// SetAIStrategy sets the underlying AI strategy.
func (a *AIStrategyAdapter) SetAIStrategy(strategy *AIStrategy) {
	a.aiStrategy = strategy
}

// SetDefaultAction sets the fallback action when AI fails.
func (a *AIStrategyAdapter) SetDefaultAction(action AIAction) {
	a.defaultAction = action
}

// IsInitialized returns whether the AI strategy is initialized.
func (a *AIStrategyAdapter) IsInitialized() bool {
	return a.aiStrategy != nil && a.aiStrategy.client != nil && a.aiStrategy.client.IsConfigured()
}

// executeFallback executes the default fallback action.
func (a *AIStrategyAdapter) executeFallback(session *MonitoringSession, reason string) (*StrategyResult, error) {
	log.Printf("[AIStrategy] Falling back to default action '%s': %s", a.defaultAction, reason)

	// Get configured default action
	defaultAction := AIAction(session.Config.AIDefaultAction)
	if defaultAction == "" {
		defaultAction = a.defaultAction
	}

	switch defaultAction {
	case AIActionSkipCmd:
		return &StrategyResult{
			Action:       "skip",
			Message:      fmt.Sprintf("AI fallback: %s", reason),
			Success:      true,
			Timestamp:    time.Now(),
		}, nil

	case AIActionNotifyCmd:
		return &StrategyResult{
			Action:       "notify",
			Message:      fmt.Sprintf("AI automation failed: %s", reason),
			Success:      true,
			Timestamp:    time.Now(),
		}, nil

	case AIActionInjectCmd:
		// Use configured injection command as fallback
		if session.Config.InjectionCommand != "" {
			command := NormalizeNewline(session.Config.InjectionCommand)
			if err := session.WriteToPTY([]byte(command)); err != nil {
				return &StrategyResult{
					Action:       "inject",
					Command:      command,
					Success:      false,
					ErrorMessage: err.Error(),
					Timestamp:    time.Now(),
				}, err
			}
			return &StrategyResult{
				Action:    "inject",
				Command:   command,
				Message:   fmt.Sprintf("AI fallback injection: %s", reason),
				Success:   true,
				Timestamp: time.Now(),
			}, nil
		}
		// No injection command configured, skip instead
		return &StrategyResult{
			Action:       "skip",
			Message:      fmt.Sprintf("AI fallback (no injection command): %s", reason),
			Success:      true,
			Timestamp:    time.Now(),
		}, nil

	default:
		return &StrategyResult{
			Action:       "skip",
			Message:      fmt.Sprintf("AI fallback: %s", reason),
			Success:      true,
			Timestamp:    time.Now(),
		}, nil
	}
}

// executeDecision executes the AI's decision.
func (a *AIStrategyAdapter) executeDecision(ctx context.Context, session *MonitoringSession, decision *AIDecision) (*StrategyResult, error) {
	switch decision.Action {
	case AIActionInjectCmd:
		if decision.Command == "" {
			return &StrategyResult{
				Action:       "skip",
				Message:      "AI decided to inject but provided no command",
				Success:      true,
				Timestamp:    time.Now(),
			}, nil
		}

		command := NormalizeNewline(decision.Command)
		if err := session.WriteToPTY([]byte(command)); err != nil {
			return &StrategyResult{
				Action:       "inject",
				Command:      command,
				Success:      false,
				ErrorMessage: err.Error(),
				Timestamp:    time.Now(),
			}, err
		}

		log.Printf("[AIStrategy] Injected command: %s (reason: %s)", decision.Command, decision.Reason)
		return &StrategyResult{
			Action:    "inject",
			Command:   command,
			Message:   decision.Reason,
			Success:   true,
			Timestamp: time.Now(),
		}, nil

	case AIActionSkipCmd:
		log.Printf("[AIStrategy] Skipping (reason: %s)", decision.Reason)
		return &StrategyResult{
			Action:    "skip",
			Message:   decision.Reason,
			Success:   true,
			Timestamp: time.Now(),
		}, nil

	case AIActionNotifyCmd:
		log.Printf("[AIStrategy] Notifying: %s (reason: %s)", decision.Message, decision.Reason)
		return &StrategyResult{
			Action:    "notify",
			Message:   decision.Message,
			Success:   true,
			Timestamp: time.Now(),
		}, nil

	case AIActionComplete:
		log.Printf("[AIStrategy] Marking complete (reason: %s)", decision.Reason)
		return &StrategyResult{
			Action:    "complete",
			Message:   decision.Reason,
			Success:   true,
			Timestamp: time.Now(),
		}, nil

	default:
		log.Printf("[AIStrategy] Unknown action '%s', skipping", decision.Action)
		return &StrategyResult{
			Action:    "skip",
			Message:   fmt.Sprintf("Unknown AI action: %s", decision.Action),
			Success:   true,
			Timestamp: time.Now(),
		}, nil
	}
}

// parseAIDecision parses the AI response into a structured decision.
func parseAIDecision(response string) (*AIDecision, error) {
	// Try to extract JSON from the response
	response = strings.TrimSpace(response)
	
	// Find JSON object in response
	startIdx := strings.Index(response, "{")
	endIdx := strings.LastIndex(response, "}")
	
	if startIdx == -1 || endIdx == -1 || endIdx <= startIdx {
		return nil, fmt.Errorf("no JSON object found in response")
	}
	
	jsonStr := response[startIdx : endIdx+1]
	
	var decision AIDecision
	if err := json.Unmarshal([]byte(jsonStr), &decision); err != nil {
		return nil, fmt.Errorf("failed to parse JSON: %w", err)
	}
	
	// Validate action
	switch decision.Action {
	case AIActionInjectCmd, AIActionSkipCmd, AIActionNotifyCmd, AIActionComplete:
		// Valid action
	default:
		// Try to normalize common variations
		actionLower := strings.ToLower(string(decision.Action))
		switch {
		case strings.Contains(actionLower, "inject"):
			decision.Action = AIActionInjectCmd
		case strings.Contains(actionLower, "skip"):
			decision.Action = AIActionSkipCmd
		case strings.Contains(actionLower, "notify"):
			decision.Action = AIActionNotifyCmd
		case strings.Contains(actionLower, "complete"):
			decision.Action = AIActionComplete
		default:
			return nil, fmt.Errorf("invalid action: %s", decision.Action)
		}
	}
	
	return &decision, nil
}
