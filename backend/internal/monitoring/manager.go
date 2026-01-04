package monitoring

import (
	"context"
	"fmt"
	"sync"
	"time"

	"cc-platform/internal/models"
	"cc-platform/internal/terminal"

	"gorm.io/gorm"
)

// Manager manages monitoring sessions for all PTY sessions.
// It provides the central coordination point for PTY monitoring.
// Note: Monitoring is now per-PTY-session, not per-container.
type Manager struct {
	db       *gorm.DB
	sessions map[string]*MonitoringSession // ptySessionID -> session
	mu       sync.RWMutex

	// Docker client for executing commands in containers
	execInContainer func(dockerID string, cmd []string) (string, error)

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
		sessions:   make(map[string]*MonitoringSession),
		ctx:        ctx,
		cancelFunc: cancel,
	}
}

// SetExecInContainer sets the function to execute commands in containers.
func (m *Manager) SetExecInContainer(fn func(dockerID string, cmd []string) (string, error)) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.execInContainer = fn
}

// SetStrategyEngine sets the strategy engine for automation.
func (m *Manager) SetStrategyEngine(engine StrategyEngine) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.strategyEngine = engine
}

// GetOrCreateSessionForPTY gets an existing monitoring session or creates a new one for a specific PTY session.
func (m *Manager) GetOrCreateSessionForPTY(containerID uint, dockerID string, ptySessionID string, ptySession *terminal.PTYSession) (*MonitoringSession, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Check for existing session by PTY session ID
	if session, exists := m.sessions[ptySessionID]; exists {
		// Update PTY session reference if provided and changed
		if ptySession != nil && session.PTYSession != ptySession {
			session.PTYSession = ptySession
		}
		return session, nil
	}

	// Load or create config from database (config is still per-container)
	config, err := m.loadOrCreateConfig(containerID)
	if err != nil {
		return nil, fmt.Errorf("failed to load monitoring config: %w", err)
	}

	// Create new session for this PTY
	session := NewMonitoringSession(containerID, dockerID, ptySessionID, ptySession, config)

	// Set up silence threshold callback
	session.SetOnSilenceThreshold(m.onSilenceThreshold)

	// Set up exec function for Claude detection
	if m.execInContainer != nil {
		session.SetExecInContainer(func(cmd []string) (string, error) {
			return m.execInContainer(dockerID, cmd)
		})
	}

	m.sessions[ptySessionID] = session

	// Start Claude detection with 5 second interval
	session.StartClaudeDetection(5 * time.Second)

	return session, nil
}

// GetOrCreateSession gets an existing monitoring session or creates a new one.
// Deprecated: Use GetOrCreateSessionForPTY instead for PTY-specific monitoring.
// This method is kept for backward compatibility and uses container ID as session key.
func (m *Manager) GetOrCreateSession(containerID uint, dockerID string, ptySession *terminal.PTYSession) (*MonitoringSession, error) {
	// Use container ID as PTY session ID for backward compatibility
	ptySessionID := fmt.Sprintf("container-%d", containerID)
	return m.GetOrCreateSessionForPTY(containerID, dockerID, ptySessionID, ptySession)
}

// EnsureSessionForPTY ensures a monitoring session exists for a specific PTY session.
func (m *Manager) EnsureSessionForPTY(containerID uint, dockerID string, ptySessionID string) (*MonitoringSession, error) {
	m.mu.RLock()
	session, exists := m.sessions[ptySessionID]
	m.mu.RUnlock()

	if exists {
		return session, nil
	}

	// Create session without PTYSession - it will receive output via callback
	return m.GetOrCreateSessionForPTY(containerID, dockerID, ptySessionID, nil)
}

// EnsureSession ensures a monitoring session exists for a container.
// Deprecated: Use EnsureSessionForPTY instead.
func (m *Manager) EnsureSession(containerID uint, dockerID string) (*MonitoringSession, error) {
	ptySessionID := fmt.Sprintf("container-%d", containerID)
	return m.EnsureSessionForPTY(containerID, dockerID, ptySessionID)
}

// GetSessionByPTY returns a monitoring session by PTY session ID.
func (m *Manager) GetSessionByPTY(ptySessionID string) *MonitoringSession {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.sessions[ptySessionID]
}

// GetSession returns a monitoring session by container ID.
// Note: This returns the first session found for the container.
// For multi-terminal support, use GetSessionByPTY instead.
func (m *Manager) GetSession(containerID uint) *MonitoringSession {
	m.mu.RLock()
	defer m.mu.RUnlock()
	
	// Find first session for this container
	for _, session := range m.sessions {
		if session.ContainerID == containerID {
			return session
		}
	}
	return nil
}

// GetSessionsForContainer returns all monitoring sessions for a container.
func (m *Manager) GetSessionsForContainer(containerID uint) []*MonitoringSession {
	m.mu.RLock()
	defer m.mu.RUnlock()
	
	var sessions []*MonitoringSession
	for _, session := range m.sessions {
		if session.ContainerID == containerID {
			sessions = append(sessions, session)
		}
	}
	return sessions
}

// RemoveSessionByPTY removes and closes a monitoring session by PTY session ID.
func (m *Manager) RemoveSessionByPTY(ptySessionID string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if session, exists := m.sessions[ptySessionID]; exists {
		session.Close()
		delete(m.sessions, ptySessionID)
	}
}

// RemoveSession removes and closes a monitoring session.
// Note: This removes all sessions for the container.
func (m *Manager) RemoveSession(containerID uint) {
	m.mu.Lock()
	defer m.mu.Unlock()

	for id, session := range m.sessions {
		if session.ContainerID == containerID {
			session.Close()
			delete(m.sessions, id)
		}
	}
}

// EnableMonitoringForPTY enables monitoring for a specific PTY session.
func (m *Manager) EnableMonitoringForPTY(ptySessionID string) error {
	session := m.GetSessionByPTY(ptySessionID)
	if session == nil {
		return fmt.Errorf("monitoring session not found for PTY %s", ptySessionID)
	}

	// Update database (config is per-container)
	if err := m.db.Model(&models.MonitoringConfig{}).
		Where("container_id = ?", session.ContainerID).
		Update("enabled", true).Error; err != nil {
		return fmt.Errorf("failed to update monitoring config: %w", err)
	}

	session.Enable()
	fmt.Printf("[Manager] Monitoring enabled for PTY %s (container %d)\n", ptySessionID, session.ContainerID)
	return nil
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
	fmt.Printf("[Manager] Monitoring enabled for container %d\n", containerID)
	return nil
}

// DisableMonitoringForPTY disables monitoring for a specific PTY session.
func (m *Manager) DisableMonitoringForPTY(ptySessionID string) error {
	session := m.GetSessionByPTY(ptySessionID)
	if session == nil {
		return fmt.Errorf("monitoring session not found for PTY %s", ptySessionID)
	}

	// Update database
	if err := m.db.Model(&models.MonitoringConfig{}).
		Where("container_id = ?", session.ContainerID).
		Update("enabled", false).Error; err != nil {
		return fmt.Errorf("failed to update monitoring config: %w", err)
	}

	session.Disable()
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

	// Update all sessions for this container
	for _, session := range m.GetSessionsForContainer(containerID) {
		session.UpdateConfig(config)
	}

	return nil
}

// GetStatus returns the monitoring status for a container.
// Note: Returns status of the first session found for the container.
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

// GetStatusByPTY returns the monitoring status for a specific PTY session.
func (m *Manager) GetStatusByPTY(ptySessionID string) (*MonitoringStatus, error) {
	session := m.GetSessionByPTY(ptySessionID)
	if session == nil {
		return nil, fmt.Errorf("monitoring session not found for PTY %s", ptySessionID)
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
// ptySessionID is the specific PTY session that produced the output.
func (m *Manager) OnPTYOutput(containerID uint, ptySessionID string, data []byte) {
	session := m.GetSessionByPTY(ptySessionID)
	if session == nil {
		return
	}
	session.OnOutput(data)
}

// OnPTYOutputLegacy is the legacy method for backward compatibility.
// Deprecated: Use OnPTYOutput with ptySessionID instead.
func (m *Manager) OnPTYOutputLegacy(containerID uint, data []byte) {
	session := m.GetSession(containerID)
	if session == nil {
		return
	}
	session.OnOutput(data)
}

// BroadcastNotification sends a notification to all connected clients for a container.
// This is used for queue empty notifications and other events.
func (m *Manager) BroadcastNotification(containerID uint, notificationType string, message string) {
	sessions := m.GetSessionsForContainer(containerID)
	if len(sessions) == 0 {
		return
	}
	
	// Log the notification
	fmt.Printf("[Manager] Broadcasting notification for container %d: type=%s, message=%s\n", 
		containerID, notificationType, message)
	
	// Notify all sessions for this container
	for _, session := range sessions {
		session.SetLastNotification(notificationType, message)
	}
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

	// Only execute if Claude is detected in this PTY session
	if !session.IsClaudeDetected() {
		fmt.Printf("[Manager] Skipping strategy execution for PTY %s: Claude not detected\n", session.PTYSessionID)
		return
	}

	// Execute strategy in background
	go func() {
		ctx, cancel := context.WithTimeout(m.ctx, session.GetThreshold())
		defer cancel()

		if err := engine.Execute(ctx, session); err != nil {
			fmt.Printf("Strategy execution failed for PTY %s (container %d): %v\n", session.PTYSessionID, session.ContainerID, err)
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
