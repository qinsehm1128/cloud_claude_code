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

	// Set up PTY output callback for monitoring
	// This ensures monitoring receives PTY output even without WebSocket clients
	if terminalService != nil {
		terminalService.SetPTYOutputCallback(func(containerID uint, ptySessionID string, data []byte) {
			service.OnPTYOutput(containerID, ptySessionID, data)
		})
		
		// Set up session created callback to update monitoring with PTY session
		terminalService.SetSessionCreatedCallback(func(containerID uint, dockerID string, ptySession *terminal.PTYSession) {
			service.OnPTYSessionCreated(containerID, dockerID, ptySession)
		})
	}

	// Restore enabled monitoring sessions for running containers
	service.restoreEnabledSessions()

	return service
}

// restoreEnabledSessions restores monitoring sessions for containers that have monitoring enabled.
func (s *MonitoringService) restoreEnabledSessions() {
	// Find all enabled monitoring configs
	var configs []models.MonitoringConfig
	if err := s.db.Where("enabled = ?", true).Find(&configs).Error; err != nil {
		fmt.Printf("[MonitoringService] Failed to load enabled configs: %v\n", err)
		return
	}

	for _, config := range configs {
		// Check if container exists and is running
		var container models.Container
		if err := s.db.First(&container, config.ContainerID).Error; err != nil {
			continue
		}

		if container.Status != models.ContainerStatusRunning {
			continue
		}

		// Create monitoring session
		session, err := s.manager.GetOrCreateSession(config.ContainerID, container.DockerID, nil)
		if err != nil {
			fmt.Printf("[MonitoringService] Failed to restore session for container %d: %v\n", config.ContainerID, err)
			continue
		}

		// Update config
		session.UpdateConfig(&config)

		// Try to find an active PTY session
		if s.terminalService != nil {
			ptySessions := s.terminalService.GetSessionsForContainer(container.DockerID)
			if len(ptySessions) > 0 {
				ptyManager := s.terminalService.GetPTYManager()
				if ptyManager != nil {
					for _, info := range ptySessions {
						if ptySession, exists := ptyManager.GetSession(info.ID); exists && ptySession.IsRunning() {
							session.PTYSession = ptySession
							session.SetWriteToPTY(func(data []byte) error {
								_, err := ptySession.Write(data)
								return err
							})
							break
						}
					}
				}
			}
		}

		// Enable monitoring
		session.Enable()
		fmt.Printf("[MonitoringService] Restored monitoring for container %d (%s)\n", config.ContainerID, container.Name)
	}
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

	// Ensure session exists - create if needed
	session := s.manager.GetSession(containerID)
	if session == nil {
		// Look up container to get Docker ID
		var container models.Container
		if err := s.db.First(&container, containerID).Error; err != nil {
			return fmt.Errorf("failed to get container: %w", err)
		}
		
		// Create session without PTYSession - it will receive output via callback
		session, err = s.manager.GetOrCreateSession(containerID, container.DockerID, nil)
		if err != nil {
			return fmt.Errorf("failed to create monitoring session: %w", err)
		}
		
		// Update config in session
		session.UpdateConfig(config)
		
		// Try to find an active PTY session for this container and set up write function
		if s.terminalService != nil {
			ptySessions := s.terminalService.GetSessionsForContainer(container.DockerID)
			if len(ptySessions) > 0 {
				// Use the first active session for writing
				// The PTY manager will handle finding the right session
				ptyManager := s.terminalService.GetPTYManager()
				if ptyManager != nil {
					for _, info := range ptySessions {
						if ptySession, exists := ptyManager.GetSession(info.ID); exists && ptySession.IsRunning() {
							session.PTYSession = ptySession
							session.SetWriteToPTY(func(data []byte) error {
								_, err := ptySession.Write(data)
								return err
							})
							break
						}
					}
				}
			}
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
// This is called from the PTY data flow via the callback.
// It automatically ensures a monitoring session exists for the container.
func (s *MonitoringService) OnPTYOutput(containerID uint, ptySessionID string, data []byte) {
	// Get session by PTY session ID
	session := s.manager.GetSessionByPTY(ptySessionID)
	if session == nil {
		// Session doesn't exist yet - we need to look up the Docker ID
		// This happens when PTY output arrives before explicit session initialization
		// For now, just forward to manager which will handle it if session exists
		return
	}
	
	s.manager.OnPTYOutput(containerID, ptySessionID, data)
}

// OnPTYSessionCreated is called when a new PTY session is created.
// It creates a monitoring session for this specific PTY session.
func (s *MonitoringService) OnPTYSessionCreated(containerID uint, dockerID string, ptySession *terminal.PTYSession) {
	// Get the PTY session ID
	ptySessionID := ptySession.ID
	
	// Get or create monitoring session for this specific PTY
	session, err := s.manager.GetOrCreateSessionForPTY(containerID, dockerID, ptySessionID, ptySession)
	if err != nil {
		fmt.Printf("[MonitoringService] Failed to get/create session for PTY %s (container %d): %v\n", ptySessionID, containerID, err)
		return
	}

	// Set up write function
	session.SetWriteToPTY(func(data []byte) error {
		_, err := ptySession.Write(data)
		return err
	})

	// Load config and enable if configured
	config, err := s.GetConfig(containerID)
	if err != nil {
		fmt.Printf("[MonitoringService] Failed to get config for container %d: %v\n", containerID, err)
		return
	}

	if config.Enabled && !session.IsEnabled() {
		session.Enable()
		fmt.Printf("[MonitoringService] Auto-enabled monitoring for PTY %s (container %d)\n", ptySessionID, containerID)
	}
}

// InitializeSession initializes a monitoring session for a container.
// This is called when a PTY session is created (e.g., via WebSocket connection).
func (s *MonitoringService) InitializeSession(containerID uint, dockerID string, ptySession *terminal.PTYSession) error {
	session, err := s.manager.GetOrCreateSession(containerID, dockerID, ptySession)
	if err != nil {
		return fmt.Errorf("failed to initialize monitoring session: %w", err)
	}

	// Set up write function if PTY session is provided
	if ptySession != nil {
		session.SetWriteToPTY(func(data []byte) error {
			_, err := ptySession.Write(data)
			return err
		})
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
