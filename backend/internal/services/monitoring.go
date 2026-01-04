package services

import (
	"fmt"

	"cc-platform/internal/models"
	"cc-platform/internal/monitoring"
	"cc-platform/internal/terminal"

	"gorm.io/gorm"
)

// MonitoringService provides high-level monitoring operations.
type MonitoringService struct {
	db              *gorm.DB
	manager         *monitoring.Manager
	strategyEngine  *monitoring.DefaultStrategyEngine
	terminalService *terminal.TerminalService
	taskService     *TaskQueueService
}

// NewMonitoringService creates a new monitoring service.
func NewMonitoringService(db *gorm.DB, terminalService *terminal.TerminalService) *MonitoringService {
	manager := monitoring.NewManager(db)
	strategyEngine := monitoring.NewStrategyEngine(db)
	taskService := NewTaskQueueService(db)

	// Connect strategy engine to manager
	manager.SetStrategyEngine(strategyEngine)

	service := &MonitoringService{
		db:              db,
		manager:         manager,
		strategyEngine:  strategyEngine,
		terminalService: terminalService,
		taskService:     taskService,
	}

	// Initialize queue strategy with task service
	service.initializeQueueStrategy()

	return service
}

// initializeQueueStrategy sets up the queue strategy with required dependencies.
func (s *MonitoringService) initializeQueueStrategy() {
	// Create injection handler that writes to PTY
	injectionHandler := func(containerID uint, sessionID string, command string) error {
		// Use the injection strategy's write function
		session := s.manager.GetSession(containerID)
		if session == nil {
			return fmt.Errorf("no monitoring session for container %d", containerID)
		}
		return session.WriteToPTY([]byte(command + "\n"))
	}

	// Create notify handler for queue empty notifications
	notifyHandler := func(containerID uint, message string) {
		// Broadcast notification via WebSocket
		s.manager.BroadcastNotification(containerID, "queue_empty", message)
	}

	// Initialize the queue strategy
	if err := s.strategyEngine.InitializeQueueStrategy(s.taskService, injectionHandler, notifyHandler); err != nil {
		fmt.Printf("Warning: failed to initialize queue strategy: %v\n", err)
	}
}

// InitializeAIStrategy initializes the AI strategy with the given configuration.
func (s *MonitoringService) InitializeAIStrategy(endpoint, apiKey, model string, timeout int) error {
	config := monitoring.AIClientConfig{
		Endpoint: endpoint,
		APIKey:   apiKey,
		Model:    model,
		Timeout:  timeout,
	}
	return s.strategyEngine.InitializeAIStrategy(config)
}

// UpdateAIConfig updates the AI strategy configuration.
func (s *MonitoringService) UpdateAIConfig(endpoint, apiKey, model string, timeout int) error {
	config := monitoring.AIClientConfig{
		Endpoint: endpoint,
		APIKey:   apiKey,
		Model:    model,
		Timeout:  timeout,
	}
	return s.strategyEngine.UpdateAIConfig(config)
}

// EnableMonitoring enables monitoring for a container.
func (s *MonitoringService) EnableMonitoring(containerID uint, config *models.MonitoringConfig) error {
	// Validate threshold
	if !monitoring.ValidateSilenceThreshold(config.SilenceThreshold) {
		return fmt.Errorf("invalid silence threshold: must be between 5 and 300 seconds")
	}

	// Validate strategy-specific config
	if err := s.strategyEngine.ValidateConfig(config.ActiveStrategy, config); err != nil {
		return fmt.Errorf("invalid strategy config: %w", err)
	}

	// Update config in database
	config.ContainerID = containerID
	config.Enabled = true

	var existingConfig models.MonitoringConfig
	err := s.db.Where("container_id = ?", containerID).First(&existingConfig).Error
	if err == gorm.ErrRecordNotFound {
		if err := s.db.Create(config).Error; err != nil {
			return fmt.Errorf("failed to create monitoring config: %w", err)
		}
	} else if err != nil {
		return fmt.Errorf("failed to query monitoring config: %w", err)
	} else {
		config.ID = existingConfig.ID
		if err := s.db.Save(config).Error; err != nil {
			return fmt.Errorf("failed to update monitoring config: %w", err)
		}
	}

	// Enable in manager
	return s.manager.EnableMonitoring(containerID)
}

// DisableMonitoring disables monitoring for a container.
func (s *MonitoringService) DisableMonitoring(containerID uint) error {
	// Update database
	if err := s.db.Model(&models.MonitoringConfig{}).
		Where("container_id = ?", containerID).
		Update("enabled", false).Error; err != nil {
		return fmt.Errorf("failed to update monitoring config: %w", err)
	}

	// Disable in manager
	return s.manager.DisableMonitoring(containerID)
}

// GetStatus returns the monitoring status for a container.
func (s *MonitoringService) GetStatus(containerID uint) (*monitoring.MonitoringStatus, error) {
	return s.manager.GetStatus(containerID)
}

// UpdateConfig updates the monitoring configuration.
func (s *MonitoringService) UpdateConfig(containerID uint, config *models.MonitoringConfig) error {
	// Validate threshold
	if !monitoring.ValidateSilenceThreshold(config.SilenceThreshold) {
		return fmt.Errorf("invalid silence threshold: must be between 5 and 300 seconds")
	}

	// Validate strategy-specific config
	if err := s.strategyEngine.ValidateConfig(config.ActiveStrategy, config); err != nil {
		return fmt.Errorf("invalid strategy config: %w", err)
	}

	config.ContainerID = containerID
	return s.manager.UpdateConfig(containerID, config)
}

// GetContextBuffer returns the context buffer content.
func (s *MonitoringService) GetContextBuffer(containerID uint) (string, error) {
	return s.manager.GetContextBuffer(containerID)
}

// GetConfig returns the monitoring configuration for a container.
func (s *MonitoringService) GetConfig(containerID uint) (*models.MonitoringConfig, error) {
	var config models.MonitoringConfig
	err := s.db.Where("container_id = ?", containerID).First(&config).Error
	if err == gorm.ErrRecordNotFound {
		// Return default config
		return &models.MonitoringConfig{
			ContainerID:       containerID,
			Enabled:           false,
			SilenceThreshold:  30,
			ActiveStrategy:    models.StrategyWebhook,
			ContextBufferSize: 8192,
		}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get monitoring config: %w", err)
	}
	return &config, nil
}

// GetManager returns the monitoring manager for direct access.
func (s *MonitoringService) GetManager() *monitoring.Manager {
	return s.manager
}

// GetStrategyEngine returns the strategy engine.
func (s *MonitoringService) GetStrategyEngine() *monitoring.DefaultStrategyEngine {
	return s.strategyEngine
}

// ListStrategies returns available strategies.
func (s *MonitoringService) ListStrategies() []monitoring.StrategyInfo {
	return s.strategyEngine.ListStrategies()
}

// Close shuts down the monitoring service.
func (s *MonitoringService) Close() {
	s.manager.Close()
}

// OnPTYOutput forwards PTY output to the monitoring manager.
// This should be called from the PTY data flow.
func (s *MonitoringService) OnPTYOutput(containerID uint, data []byte) {
	s.manager.OnPTYOutput(containerID, data)
}

// InitializeSession initializes a monitoring session for a container.
func (s *MonitoringService) InitializeSession(containerID uint, dockerID string, ptySession *terminal.PTYSession) error {
	_, err := s.manager.GetOrCreateSession(containerID, dockerID, ptySession)
	if err != nil {
		return fmt.Errorf("failed to initialize monitoring session: %w", err)
	}

	// Load config and enable if configured
	config, err := s.GetConfig(containerID)
	if err != nil {
		return err
	}

	if config.Enabled {
		return s.manager.EnableMonitoring(containerID)
	}

	return nil
}

// CleanupSession removes a monitoring session.
func (s *MonitoringService) CleanupSession(containerID uint) {
	s.manager.RemoveSession(containerID)
}
