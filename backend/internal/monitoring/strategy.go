package monitoring

import (
	"context"
	"fmt"
	"sync"
	"time"

	"cc-platform/internal/models"

	"gorm.io/gorm"
)

// Strategy defines the interface for automation strategies.
type Strategy interface {
	// Name returns the strategy identifier.
	Name() string
	// Execute runs the strategy logic.
	Execute(ctx context.Context, session *MonitoringSession) (*StrategyResult, error)
	// Validate checks if the configuration is valid for this strategy.
	Validate(config *models.MonitoringConfig) error
}

// StrategyResult contains the outcome of a strategy execution.
type StrategyResult struct {
	Action       string    `json:"action"`        // inject, skip, notify, complete, webhook_sent, queue_empty
	Command      string    `json:"command,omitempty"`
	TaskID       uint      `json:"task_id,omitempty"`
	Message      string    `json:"message,omitempty"`
	Success      bool      `json:"success"`
	ErrorMessage string    `json:"error_message,omitempty"`
	Timestamp    time.Time `json:"timestamp"`
}

// StrategyInfo provides metadata about a strategy.
type StrategyInfo struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Enabled     bool   `json:"enabled"`
}

// DefaultStrategyEngine implements the StrategyEngine interface.
type DefaultStrategyEngine struct {
	db         *gorm.DB
	strategies map[string]Strategy
	mu         sync.RWMutex
}

// NewStrategyEngine creates a new strategy engine.
func NewStrategyEngine(db *gorm.DB) *DefaultStrategyEngine {
	engine := &DefaultStrategyEngine{
		db:         db,
		strategies: make(map[string]Strategy),
	}

	// Register default strategies
	engine.RegisterStrategy(&WebhookStrategy{})
	engine.RegisterStrategy(&InjectionStrategy{})
	engine.RegisterStrategy(NewQueueStrategyAdapter())
	engine.RegisterStrategy(NewAIStrategyAdapter())

	return engine
}

// RegisterStrategy adds a strategy to the engine.
func (e *DefaultStrategyEngine) RegisterStrategy(strategy Strategy) error {
	e.mu.Lock()
	defer e.mu.Unlock()

	name := strategy.Name()
	if _, exists := e.strategies[name]; exists {
		return fmt.Errorf("strategy %s already registered", name)
	}

	e.strategies[name] = strategy
	return nil
}

// GetStrategy returns a strategy by name.
func (e *DefaultStrategyEngine) GetStrategy(name string) (Strategy, bool) {
	e.mu.RLock()
	defer e.mu.RUnlock()
	strategy, exists := e.strategies[name]
	return strategy, exists
}

// ListStrategies returns information about all registered strategies.
func (e *DefaultStrategyEngine) ListStrategies() []StrategyInfo {
	e.mu.RLock()
	defer e.mu.RUnlock()

	infos := make([]StrategyInfo, 0, len(e.strategies))
	for name := range e.strategies {
		infos = append(infos, StrategyInfo{
			Name:    name,
			Enabled: true,
		})
	}
	return infos
}

// Execute runs the appropriate strategy for the session.
func (e *DefaultStrategyEngine) Execute(ctx context.Context, session *MonitoringSession) error {
	if session == nil || session.Config == nil {
		return fmt.Errorf("invalid session or config")
	}

	strategyName := session.Config.ActiveStrategy
	strategy, exists := e.GetStrategy(strategyName)
	if !exists {
		return fmt.Errorf("strategy %s not found", strategyName)
	}

	// Execute strategy
	result, err := strategy.Execute(ctx, session)
	if err != nil {
		// Log failure
		e.logExecution(session, strategyName, &StrategyResult{
			Action:       "error",
			Success:      false,
			ErrorMessage: err.Error(),
			Timestamp:    time.Now(),
		})
		return err
	}

	// Log success
	e.logExecution(session, strategyName, result)

	// Update session with last action
	session.SetLastAction(&ActionSummary{
		Strategy:  strategyName,
		Action:    result.Action,
		Timestamp: result.Timestamp,
		Success:   result.Success,
	})

	return nil
}

// logExecution records the strategy execution to the database.
func (e *DefaultStrategyEngine) logExecution(session *MonitoringSession, strategyType string, result *StrategyResult) {
	logResult := models.AutomationResultSuccess
	if !result.Success {
		logResult = models.AutomationResultFailed
	}

	// Get session ID safely
	sessionID := ""
	if session.PTYSession != nil {
		sessionID = session.PTYSession.ID
	}

	log := &models.AutomationLog{
		ContainerID:    session.ContainerID,
		SessionID:      sessionID,
		StrategyType:   strategyType,
		ActionTaken:    result.Action,
		Command:        result.Command,
		ContextSnippet: session.GetLastOutput(500),
		Result:         logResult,
		ErrorMessage:   result.ErrorMessage,
	}

	if err := e.db.Create(log).Error; err != nil {
		fmt.Printf("Failed to log automation execution: %v\n", err)
	}
}

// ValidateConfig validates the configuration for a specific strategy.
func (e *DefaultStrategyEngine) ValidateConfig(strategyName string, config *models.MonitoringConfig) error {
	strategy, exists := e.GetStrategy(strategyName)
	if !exists {
		return fmt.Errorf("strategy %s not found", strategyName)
	}
	return strategy.Validate(config)
}

// InitializeQueueStrategy initializes the queue strategy with required dependencies.
func (e *DefaultStrategyEngine) InitializeQueueStrategy(taskService TaskQueueInterface, injectionHandler func(containerId uint, sessionId string, command string) error, notifyHandler func(containerId uint, message string)) error {
	strategy, exists := e.GetStrategy("queue")
	if !exists {
		return fmt.Errorf("queue strategy not registered")
	}

	adapter, ok := strategy.(*QueueStrategyAdapter)
	if !ok {
		return fmt.Errorf("queue strategy is not a QueueStrategyAdapter")
	}

	queueStrategy := NewQueueStrategy(taskService, injectionHandler, notifyHandler)
	adapter.SetQueueStrategy(queueStrategy)

	return nil
}

// GetQueueStrategyAdapter returns the queue strategy adapter for direct access.
func (e *DefaultStrategyEngine) GetQueueStrategyAdapter() (*QueueStrategyAdapter, error) {
	strategy, exists := e.GetStrategy("queue")
	if !exists {
		return nil, fmt.Errorf("queue strategy not registered")
	}

	adapter, ok := strategy.(*QueueStrategyAdapter)
	if !ok {
		return nil, fmt.Errorf("queue strategy is not a QueueStrategyAdapter")
	}

	return adapter, nil
}

// InitializeAIStrategy initializes the AI strategy with required dependencies.
func (e *DefaultStrategyEngine) InitializeAIStrategy(config AIClientConfig) error {
	strategy, exists := e.GetStrategy("ai")
	if !exists {
		return fmt.Errorf("AI strategy not registered")
	}

	adapter, ok := strategy.(*AIStrategyAdapter)
	if !ok {
		return fmt.Errorf("AI strategy is not an AIStrategyAdapter")
	}

	client := NewAIClient(config)
	aiStrategy := NewAIStrategy(client)
	adapter.SetAIStrategy(aiStrategy)

	return nil
}

// GetAIStrategyAdapter returns the AI strategy adapter for direct access.
func (e *DefaultStrategyEngine) GetAIStrategyAdapter() (*AIStrategyAdapter, error) {
	strategy, exists := e.GetStrategy("ai")
	if !exists {
		return nil, fmt.Errorf("AI strategy not registered")
	}

	adapter, ok := strategy.(*AIStrategyAdapter)
	if !ok {
		return nil, fmt.Errorf("AI strategy is not an AIStrategyAdapter")
	}

	return adapter, nil
}

// UpdateAIConfig updates the AI client configuration.
func (e *DefaultStrategyEngine) UpdateAIConfig(config AIClientConfig) error {
	adapter, err := e.GetAIStrategyAdapter()
	if err != nil {
		return err
	}

	if adapter.aiStrategy == nil || adapter.aiStrategy.client == nil {
		// Initialize if not already done
		return e.InitializeAIStrategy(config)
	}

	adapter.aiStrategy.client.UpdateConfig(config)
	return nil
}
