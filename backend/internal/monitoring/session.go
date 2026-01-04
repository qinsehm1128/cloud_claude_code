package monitoring

import (
	"context"
	"fmt"
	"sync"
	"time"

	"cc-platform/internal/models"
	"cc-platform/internal/terminal"
)

// MonitoringStatus represents the current monitoring state for WebSocket broadcast
type MonitoringStatus struct {
	ContainerID     uint           `json:"container_id"`
	Enabled         bool           `json:"enabled"`
	SilenceDuration int            `json:"silence_duration"` // Seconds since last output
	Threshold       int            `json:"threshold"`        // Configured threshold in seconds
	Strategy        string         `json:"strategy"`         // Active strategy name
	QueueSize       int            `json:"queue_size"`       // Number of pending tasks
	CurrentTask     *TaskSummary   `json:"current_task,omitempty"`
	LastAction      *ActionSummary `json:"last_action,omitempty"`
}

// TaskSummary provides a brief view of a task
type TaskSummary struct {
	ID     uint   `json:"id"`
	Text   string `json:"text"`
	Status string `json:"status"`
}

// ActionSummary provides a brief view of the last automation action
type ActionSummary struct {
	Strategy  string    `json:"strategy"`
	Action    string    `json:"action"`
	Timestamp time.Time `json:"timestamp"`
	Success   bool      `json:"success"`
}

// MonitoringSession represents an active monitoring session for a container.
// It tracks silence duration, manages the context buffer, and triggers strategies.
type MonitoringSession struct {
	ContainerID uint
	DockerID    string
	PTYSession  *terminal.PTYSession // Optional - may be nil if no active PTY
	Config      *models.MonitoringConfig

	// Write function for injecting commands (set by manager)
	writeToPTY func(data []byte) error

	// State
	enabled         bool
	silenceDuration time.Duration
	lastOutputTime  time.Time
	lastAction      *ActionSummary
	lastNotification *NotificationInfo

	// Silence timer
	silenceTimer *time.Timer
	timerMu      sync.Mutex

	// Context buffer for storing recent PTY output
	contextBuffer *RingBuffer
	bufferMu      sync.RWMutex

	// Cancellation context for cleanup
	ctx        context.Context
	cancelFunc context.CancelFunc

	// Client subscribers for status updates
	subscribers map[string]chan MonitoringStatus
	subMu       sync.RWMutex

	// Strategy trigger callback
	onSilenceThreshold func(session *MonitoringSession)

	// General mutex for state changes
	stateMu sync.RWMutex
}

// NotificationInfo holds information about the last notification
type NotificationInfo struct {
	Type      string    `json:"type"`
	Message   string    `json:"message"`
	Timestamp time.Time `json:"timestamp"`
}

// NewMonitoringSession creates a new monitoring session for a container.
func NewMonitoringSession(containerID uint, dockerID string, ptySession *terminal.PTYSession, config *models.MonitoringConfig) *MonitoringSession {
	ctx, cancel := context.WithCancel(context.Background())

	bufferSize := config.ContextBufferSize
	if bufferSize <= 0 {
		bufferSize = 8192 // Default 8KB
	}

	session := &MonitoringSession{
		ContainerID:    containerID,
		DockerID:       dockerID,
		PTYSession:     ptySession,
		Config:         config,
		enabled:        false,
		lastOutputTime: time.Now(),
		contextBuffer:  NewRingBuffer(bufferSize),
		ctx:            ctx,
		cancelFunc:     cancel,
		subscribers:    make(map[string]chan MonitoringStatus),
	}

	return session
}

// Enable starts monitoring for this session.
func (s *MonitoringSession) Enable() {
	s.stateMu.Lock()
	defer s.stateMu.Unlock()

	if s.enabled {
		return
	}

	s.enabled = true
	s.lastOutputTime = time.Now()
	s.silenceDuration = 0
	s.startTimer()
	s.broadcastStatus()
}

// Disable stops monitoring for this session.
func (s *MonitoringSession) Disable() {
	s.stateMu.Lock()
	defer s.stateMu.Unlock()

	if !s.enabled {
		return
	}

	s.enabled = false
	s.stopTimer()
	s.broadcastStatus()
}

// IsEnabled returns whether monitoring is currently enabled.
func (s *MonitoringSession) IsEnabled() bool {
	s.stateMu.RLock()
	defer s.stateMu.RUnlock()
	return s.enabled
}

// OnOutput should be called when PTY produces output.
// It resets the silence timer and updates the context buffer.
func (s *MonitoringSession) OnOutput(data []byte) {
	s.stateMu.Lock()
	defer s.stateMu.Unlock()

	// Update context buffer
	s.bufferMu.Lock()
	s.contextBuffer.Write(data)
	s.bufferMu.Unlock()

	// Reset silence tracking
	s.lastOutputTime = time.Now()
	s.silenceDuration = 0

	// Reset timer if enabled
	if s.enabled {
		s.resetTimer()
	}
}

// GetContextBuffer returns the current context buffer content.
func (s *MonitoringSession) GetContextBuffer() string {
	s.bufferMu.RLock()
	defer s.bufferMu.RUnlock()
	return s.contextBuffer.String()
}

// GetLastOutput returns the last n bytes from the context buffer.
func (s *MonitoringSession) GetLastOutput(n int) string {
	s.bufferMu.RLock()
	defer s.bufferMu.RUnlock()
	return string(s.contextBuffer.GetLast(n))
}

// GetStatus returns the current monitoring status.
func (s *MonitoringSession) GetStatus() MonitoringStatus {
	s.stateMu.RLock()
	defer s.stateMu.RUnlock()

	silenceSecs := int(time.Since(s.lastOutputTime).Seconds())
	if !s.enabled {
		silenceSecs = 0
	}

	return MonitoringStatus{
		ContainerID:     s.ContainerID,
		Enabled:         s.enabled,
		SilenceDuration: silenceSecs,
		Threshold:       s.Config.SilenceThreshold,
		Strategy:        s.Config.ActiveStrategy,
		LastAction:      s.lastAction,
	}
}

// UpdateConfig updates the monitoring configuration.
func (s *MonitoringSession) UpdateConfig(config *models.MonitoringConfig) {
	s.stateMu.Lock()
	defer s.stateMu.Unlock()

	s.Config = config

	// Update buffer size if changed
	if config.ContextBufferSize > 0 && config.ContextBufferSize != s.contextBuffer.Cap() {
		s.bufferMu.Lock()
		oldContent := s.contextBuffer.Read()
		s.contextBuffer = NewRingBuffer(config.ContextBufferSize)
		s.contextBuffer.Write(oldContent)
		s.bufferMu.Unlock()
	}

	// Restart timer with new threshold if enabled
	if s.enabled {
		s.resetTimer()
	}

	s.broadcastStatus()
}

// SetOnSilenceThreshold sets the callback for when silence threshold is reached.
func (s *MonitoringSession) SetOnSilenceThreshold(callback func(session *MonitoringSession)) {
	s.stateMu.Lock()
	defer s.stateMu.Unlock()
	s.onSilenceThreshold = callback
}

// SetLastAction records the last automation action taken.
func (s *MonitoringSession) SetLastAction(action *ActionSummary) {
	s.stateMu.Lock()
	defer s.stateMu.Unlock()
	s.lastAction = action
	s.broadcastStatus()
}

// Subscribe adds a subscriber for status updates.
func (s *MonitoringSession) Subscribe(clientID string) chan MonitoringStatus {
	s.subMu.Lock()
	defer s.subMu.Unlock()

	ch := make(chan MonitoringStatus, 10)
	s.subscribers[clientID] = ch

	// Send current status immediately
	go func() {
		select {
		case ch <- s.GetStatus():
		default:
		}
	}()

	return ch
}

// Unsubscribe removes a subscriber.
func (s *MonitoringSession) Unsubscribe(clientID string) {
	s.subMu.Lock()
	defer s.subMu.Unlock()

	if ch, ok := s.subscribers[clientID]; ok {
		close(ch)
		delete(s.subscribers, clientID)
	}
}

// Close cleans up all resources associated with this session.
func (s *MonitoringSession) Close() {
	s.stateMu.Lock()
	s.enabled = false
	s.stopTimer()
	s.stateMu.Unlock()

	// Cancel context
	s.cancelFunc()

	// Close all subscriber channels
	s.subMu.Lock()
	for id, ch := range s.subscribers {
		close(ch)
		delete(s.subscribers, id)
	}
	s.subMu.Unlock()

	// Clear buffer
	s.bufferMu.Lock()
	s.contextBuffer.Clear()
	s.bufferMu.Unlock()
}

// Context returns the session's context for cancellation.
func (s *MonitoringSession) Context() context.Context {
	return s.ctx
}

// WriteToPTY writes data to the PTY session.
func (s *MonitoringSession) WriteToPTY(data []byte) error {
	// Try the custom write function first (set by manager)
	if s.writeToPTY != nil {
		return s.writeToPTY(data)
	}
	// Fall back to PTYSession if available
	if s.PTYSession == nil {
		return fmt.Errorf("no PTY session or write function available")
	}
	_, err := s.PTYSession.Write(data)
	return err
}

// SetWriteToPTY sets the function used to write to PTY.
func (s *MonitoringSession) SetWriteToPTY(fn func(data []byte) error) {
	s.stateMu.Lock()
	defer s.stateMu.Unlock()
	s.writeToPTY = fn
}

// SetLastNotification records the last notification sent.
func (s *MonitoringSession) SetLastNotification(notificationType string, message string) {
	s.stateMu.Lock()
	defer s.stateMu.Unlock()
	s.lastNotification = &NotificationInfo{
		Type:      notificationType,
		Message:   message,
		Timestamp: time.Now(),
	}
}

// GetLastNotification returns the last notification info.
func (s *MonitoringSession) GetLastNotification() *NotificationInfo {
	s.stateMu.RLock()
	defer s.stateMu.RUnlock()
	return s.lastNotification
}

// broadcastStatus sends current status to all subscribers.
func (s *MonitoringSession) broadcastStatus() {
	status := MonitoringStatus{
		ContainerID:     s.ContainerID,
		Enabled:         s.enabled,
		SilenceDuration: int(s.silenceDuration.Seconds()),
		Threshold:       s.Config.SilenceThreshold,
		Strategy:        s.Config.ActiveStrategy,
		LastAction:      s.lastAction,
	}

	s.subMu.RLock()
	defer s.subMu.RUnlock()

	for _, ch := range s.subscribers {
		select {
		case ch <- status:
		default:
			// Channel full, skip
		}
	}
}
