package monitoring

import (
	"context"
	"fmt"
	"sync"

	"cc-platform/internal/models"
	"cc-platform/internal/terminal"

	"gorm.io/gorm"
)

// Manager manages monitoring sessions for all containers.
// It provides the central coordination point for PTY monitoring.
type Manager struct {
	db       *gorm.DB
	sessions map[uint]*MonitoringSession // containerID -> session
	mu       sync.RWMutex

	// Strategy engine for executing automation strategies
	strategyEngine StrategyEngine

	// Context for graceful shutdown
	ctx        context.Context
	cancelFunc context.CancelFunc
}

// StrategyEngine interface for strategy execution
type StrategyEngine interface {
	Execute(ctx context.Context, session *MonitoringSession) error
}

// NewManager creates a new monitoring manager.
func NewManager(db *gorm.DB) *Manager {
	ctx, cancel := context.WithCancel(context.Background())

	return &Manager{
		db:         db,
		sessions:   make(map[uint]*MonitoringSession),
		ctx:        ctx,
		cancelFunc: cancel,
	}
}

// SetStrategyEngine sets the strategy engine for automation.
func (m *Manager) SetStrategyEngine(engine StrategyEngine) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.strategyEngine = engine
}

// GetOrCreateSession gets an existing monitoring session or creates a new one.
func (m *Manager) GetOrCreateSession(containerID uint, dockerID string, ptySession *terminal.PTYSession) (*MonitoringSession, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Check for existing session
	if session, exists := m.sessions[containerID]; exists {
		// Update PTY session reference if changed
		if session.PTYSession != ptySession {
			session.PTYSession = ptySession
		}
		return session, nil
	}

	// Load or create config from database
	config, err := m.loadOrCreateConfig(containerID)
	if err != nil {
		return nil, fmt.Errorf("failed to load monitoring config: %w", err)
	}

	// Create new session
	session := NewMonitoringSession(containerID, dockerID, ptySession, config)

	// Set up silence threshold callback
	session.SetOnSilenceThreshold(m.onSilenceThreshold)

	m.sessions[containerID] = session

	return session, nil
}

// GetSession returns a monitoring session by container ID.
func (m *Manager) GetSession(containerID uint) *MonitoringSession {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.sessions[containerID]
}

// RemoveSession removes and closes a monitoring session.
func (m *Manager) RemoveSession(containerID uint) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if session, exists := m.sessions[containerID]; exists {
		session.Close()
		delete(m.sessions, containerID)
	}
}

// EnableMonitoring enables monitoring for a container.
func (m *Manager) EnableMonitoring(containerID uint) error {
	session := m.GetSession(containerID)
	if session == nil {
		return fmt.Errorf("monitoring session not found for container %d", containerID)
	}

	// Update database
	if err := m.db.Model(&models.MonitoringConfig{}).
		Where("container_id = ?", containerID).
		Update("enabled", true).Error; err != nil {
		return fmt.Errorf("failed to update monitoring config: %w", err)
	}

	session.Enable()
	return nil
}

// DisableMonitoring disables monitoring for a container.
func (m *Manager) DisableMonitoring(containerID uint) error {
	session := m.GetSession(containerID)
	if session == nil {
		return fmt.Errorf("monitoring session not found for container %d", containerID)
	}

	// Update database
	if err := m.db.Model(&models.MonitoringConfig{}).
		Where("container_id = ?", containerID).
		Update("enabled", false).Error; err != nil {
		return fmt.Errorf("failed to update monitoring config: %w", err)
	}

	session.Disable()
	return nil
}

// UpdateConfig updates the monitoring configuration for a container.
func (m *Manager) UpdateConfig(containerID uint, config *models.MonitoringConfig) error {
	// Validate threshold
	if !ValidateSilenceThreshold(config.SilenceThreshold) {
		return fmt.Errorf("invalid silence threshold: must be between 5 and 300 seconds")
	}

	// Update database
	if err := m.db.Save(config).Error; err != nil {
		return fmt.Errorf("failed to save monitoring config: %w", err)
	}

	// Update session if exists
	if session := m.GetSession(containerID); session != nil {
		session.UpdateConfig(config)
	}

	return nil
}

// GetStatus returns the monitoring status for a container.
func (m *Manager) GetStatus(containerID uint) (*MonitoringStatus, error) {
	session := m.GetSession(containerID)
	if session == nil {
		// Return default status if no session
		config, err := m.loadOrCreateConfig(containerID)
		if err != nil {
			return nil, err
		}
		return &MonitoringStatus{
			Enabled:   false,
			Threshold: config.SilenceThreshold,
			Strategy:  config.ActiveStrategy,
		}, nil
	}

	status := session.GetStatus()
	return &status, nil
}

// GetContextBuffer returns the context buffer content for a container.
func (m *Manager) GetContextBuffer(containerID uint) (string, error) {
	session := m.GetSession(containerID)
	if session == nil {
		return "", fmt.Errorf("monitoring session not found for container %d", containerID)
	}
	return session.GetContextBuffer(), nil
}

// OnPTYOutput should be called when PTY produces output.
// This is the hook that integrates monitoring with the PTY data flow.
func (m *Manager) OnPTYOutput(containerID uint, data []byte) {
	session := m.GetSession(containerID)
	if session == nil {
		return
	}
	session.OnOutput(data)
}

// BroadcastNotification sends a notification to all connected clients for a container.
// This is used for queue empty notifications and other events.
func (m *Manager) BroadcastNotification(containerID uint, notificationType string, message string) {
	session := m.GetSession(containerID)
	if session == nil {
		return
	}
	
	// Log the notification
	fmt.Printf("[Manager] Broadcasting notification for container %d: type=%s, message=%s\n", 
		containerID, notificationType, message)
	
	// The actual WebSocket broadcast is handled by the terminal service
	// This is a placeholder that can be extended to integrate with WebSocket
	session.SetLastNotification(notificationType, message)
}

// Close shuts down the monitoring manager and all sessions.
func (m *Manager) Close() {
	m.cancelFunc()

	m.mu.Lock()
	defer m.mu.Unlock()

	for id, session := range m.sessions {
		session.Close()
		delete(m.sessions, id)
	}
}

// loadOrCreateConfig loads config from database or creates default.
func (m *Manager) loadOrCreateConfig(containerID uint) (*models.MonitoringConfig, error) {
	var config models.MonitoringConfig

	err := m.db.Where("container_id = ?", containerID).First(&config).Error
	if err == gorm.ErrRecordNotFound {
		// Create default config
		config = models.MonitoringConfig{
			ContainerID:       containerID,
			Enabled:           false,
			SilenceThreshold:  30,
			ActiveStrategy:    models.StrategyWebhook,
			ContextBufferSize: 8192,
		}
		if err := m.db.Create(&config).Error; err != nil {
			return nil, err
		}
	} else if err != nil {
		return nil, err
	}

	return &config, nil
}

// onSilenceThreshold is called when a session's silence threshold is reached.
func (m *Manager) onSilenceThreshold(session *MonitoringSession) {
	m.mu.RLock()
	engine := m.strategyEngine
	m.mu.RUnlock()

	if engine == nil {
		return
	}

	// Execute strategy in background
	go func() {
		ctx, cancel := context.WithTimeout(m.ctx, session.GetThreshold())
		defer cancel()

		if err := engine.Execute(ctx, session); err != nil {
			fmt.Printf("Strategy execution failed for container %d: %v\n", session.ContainerID, err)
		}
	}()
}

// ListSessions returns all active monitoring sessions.
func (m *Manager) ListSessions() []MonitoringStatus {
	m.mu.RLock()
	defer m.mu.RUnlock()

	statuses := make([]MonitoringStatus, 0, len(m.sessions))
	for _, session := range m.sessions {
		statuses = append(statuses, session.GetStatus())
	}
	return statuses
}
