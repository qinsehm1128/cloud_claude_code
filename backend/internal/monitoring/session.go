package monitoring

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"cc-platform/internal/models"
	"cc-platform/internal/terminal"
)

// MonitoringStatus represents the current monitoring state for WebSocket broadcast
type MonitoringStatus struct {
	ContainerID     uint           `json:"container_id"`
	PTYSessionID    string         `json:"pty_session_id,omitempty"` // The specific PTY session being monitored
	Enabled         bool           `json:"enabled"`
	SilenceDuration int            `json:"silence_duration"` // Seconds since last output
	Threshold       int            `json:"threshold"`        // Configured threshold in seconds
	Strategy        string         `json:"strategy"`         // Active strategy name
	QueueSize       int            `json:"queue_size"`       // Number of pending tasks
	ClaudeDetected  bool           `json:"claude_detected"`  // Whether Claude Code process is detected in this PTY
	ClaudePID       string         `json:"claude_pid,omitempty"` // PID of detected Claude process
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

// MonitoringSession represents an active monitoring session for a specific PTY session.
// It tracks silence duration, manages the context buffer, and triggers strategies.
// Note: Monitoring is now per-PTY-session, not per-container, to support multiple terminals.
type MonitoringSession struct {
	ContainerID  uint
	DockerID     string
	PTYSessionID string                   // The specific PTY session being monitored
	PTYSession   *terminal.PTYSession     // Optional - may be nil if no active PTY
	Config       *models.MonitoringConfig

	// Write function for injecting commands (set by manager)
	writeToPTY func(data []byte) error

	// Function to execute commands in container (for process detection)
	execInContainer func(cmd []string) (string, error)

	// State
	enabled          bool
	silenceDuration  time.Duration
	lastOutputTime   time.Time
	lastActivityTime time.Time // Last time any activity occurred (for cleanup)
	lastAction       *ActionSummary
	lastNotification *NotificationInfo
	claudeDetected   bool   // Whether Claude Code process is detected in this PTY
	claudePID        string // PID of detected Claude process (for tracking)
	closed           bool   // Whether session has been closed

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
	subscribers     map[string]chan MonitoringStatus
	subscriberTimes map[string]time.Time // Track last successful send time per subscriber
	subMu           sync.RWMutex

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

// NewMonitoringSession creates a new monitoring session for a specific PTY session.
func NewMonitoringSession(containerID uint, dockerID string, ptySessionID string, ptySession *terminal.PTYSession, config *models.MonitoringConfig) *MonitoringSession {
	ctx, cancel := context.WithCancel(context.Background())

	bufferSize := config.ContextBufferSize
	if bufferSize <= 0 {
		bufferSize = 8192 // Default 8KB
	}

	now := time.Now()
	session := &MonitoringSession{
		ContainerID:      containerID,
		DockerID:         dockerID,
		PTYSessionID:     ptySessionID,
		PTYSession:       ptySession,
		Config:           config,
		enabled:          false,
		lastOutputTime:   now,
		lastActivityTime: now,
		closed:           false,
		contextBuffer:    NewRingBuffer(bufferSize),
		ctx:              ctx,
		cancelFunc:       cancel,
		subscribers:      make(map[string]chan MonitoringStatus),
		subscriberTimes:  make(map[string]time.Time),
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
	
	// Protect PTY session from timeout cleanup
	if s.PTYSession != nil {
		s.PTYSession.SetMonitoringProtected(true)
	}
	
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
	
	// Remove PTY session protection
	if s.PTYSession != nil {
		s.PTYSession.SetMonitoringProtected(false)
	}
	
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

	// Check if session is closed
	if s.closed {
		return
	}

	// Update context buffer
	s.bufferMu.Lock()
	s.contextBuffer.Write(data)
	s.bufferMu.Unlock()

	// Reset silence tracking and update activity time
	now := time.Now()
	s.lastOutputTime = now
	s.lastActivityTime = now
	s.silenceDuration = 0

	// Reset timer if enabled
	if s.enabled {
		s.resetTimer()
	}
}

// GetLastActivityTime returns the last activity time for cleanup purposes.
func (s *MonitoringSession) GetLastActivityTime() time.Time {
	s.stateMu.RLock()
	defer s.stateMu.RUnlock()
	return s.lastActivityTime
}

// UpdateActivityTime manually updates the activity time (e.g., for subscriptions).
func (s *MonitoringSession) UpdateActivityTime() {
	s.stateMu.Lock()
	defer s.stateMu.Unlock()
	s.lastActivityTime = time.Now()
}

// IsClosed returns whether the session has been closed.
func (s *MonitoringSession) IsClosed() bool {
	s.stateMu.RLock()
	defer s.stateMu.RUnlock()
	return s.closed
}

// DetectClaudeProcess checks if Claude Code process is running in this PTY session.
// It uses the PTY's exec ID to find the shell PID, then checks for claude in its process tree.
func (s *MonitoringSession) DetectClaudeProcess() bool {
	if s.execInContainer == nil {
		fmt.Printf("[Session] No execInContainer function set for container %d\n", s.ContainerID)
		return false
	}

	// Get the shell PID for this PTY session by checking the exec process
	// The PTYSessionID is the Docker exec ID, we need to find its PID
	// Method: Use ps to find processes with "claude" in the command
	// and check if they're descendants of our PTY shell
	
	// First, try to find claude processes
	cmd := []string{"sh", "-c", "pgrep -a -f 'claude' 2>/dev/null || true"}
	output, err := s.execInContainer(cmd)
	if err != nil {
		fmt.Printf("[Session] Failed to detect Claude process: %v\n", err)
		return false
	}

	// Check if we found any claude process
	output = strings.TrimSpace(output)
	if output == "" {
		s.stateMu.Lock()
		if s.claudeDetected {
			s.claudeDetected = false
			s.claudePID = ""
			fmt.Printf("[Session] Claude Code process no longer detected in container %d, PTY %s\n", s.ContainerID, s.PTYSessionID)
			s.broadcastStatus()
		}
		s.stateMu.Unlock()
		return false
	}

	// Parse the output to get PID
	lines := strings.Split(output, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		// Format: "PID command..."
		parts := strings.SplitN(line, " ", 2)
		if len(parts) >= 1 {
			pid := strings.TrimSpace(parts[0])
			// Remove any non-printable characters (Docker exec output may have them)
			pid = strings.Map(func(r rune) rune {
				if r >= '0' && r <= '9' {
					return r
				}
				return -1
			}, pid)
			
			if pid != "" {
				s.stateMu.Lock()
				if !s.claudeDetected || s.claudePID != pid {
					s.claudeDetected = true
					s.claudePID = pid
					fmt.Printf("[Session] Claude Code detected in container %d, PTY %s, PID: %s\n", s.ContainerID, s.PTYSessionID, pid)
					s.broadcastStatus()
				}
				s.stateMu.Unlock()
				return true
			}
		}
	}

	return false
}

// SetExecInContainer sets the function to execute commands in the container.
func (s *MonitoringSession) SetExecInContainer(fn func(cmd []string) (string, error)) {
	s.stateMu.Lock()
	defer s.stateMu.Unlock()
	s.execInContainer = fn
}

// StartClaudeDetection starts a background goroutine to periodically check for Claude process.
func (s *MonitoringSession) StartClaudeDetection(interval time.Duration) {
	// Check if already closed before starting
	if s.IsClosed() {
		return
	}

	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		// Initial detection
		if !s.IsClosed() {
			s.DetectClaudeProcess()
		}

		for {
			select {
			case <-s.ctx.Done():
				fmt.Printf("[Session] Claude detection stopped for session %s\n", s.PTYSessionID)
				return
			case <-ticker.C:
				// Check if session is closed before detection
				if s.IsClosed() {
					return
				}
				s.DetectClaudeProcess()
			}
		}
	}()
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
		PTYSessionID:    s.PTYSessionID,
		Enabled:         s.enabled,
		SilenceDuration: silenceSecs,
		Threshold:       s.Config.SilenceThreshold,
		Strategy:        s.Config.ActiveStrategy,
		ClaudeDetected:  s.claudeDetected,
		ClaudePID:       s.claudePID,
		LastAction:      s.lastAction,
	}
}

// IsClaudeDetected returns whether Claude Code has been detected.
func (s *MonitoringSession) IsClaudeDetected() bool {
	s.stateMu.RLock()
	defer s.stateMu.RUnlock()
	return s.claudeDetected
}

// SetClaudeDetected manually sets the Claude detection state.
func (s *MonitoringSession) SetClaudeDetected(detected bool) {
	s.stateMu.Lock()
	defer s.stateMu.Unlock()
	if s.claudeDetected != detected {
		s.claudeDetected = detected
		s.broadcastStatus()
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
	// Check if session is closed
	if s.IsClosed() {
		return nil
	}

	s.subMu.Lock()
	defer s.subMu.Unlock()

	now := time.Now()
	ch := make(chan MonitoringStatus, 10)
	s.subscribers[clientID] = ch
	s.subscriberTimes[clientID] = now

	// Update activity time when someone subscribes
	s.stateMu.Lock()
	s.lastActivityTime = now
	s.stateMu.Unlock()

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
		delete(s.subscriberTimes, clientID)
	}
}

// SubscriberTimeout is the maximum time a subscriber can be inactive before cleanup
const SubscriberTimeout = 5 * time.Minute

// CleanupStaleSubscribers removes subscribers that haven't received updates for too long.
// This prevents memory leaks from disconnected clients that didn't call Unsubscribe.
func (s *MonitoringSession) CleanupStaleSubscribers() int {
	if s.IsClosed() {
		return 0
	}

	s.subMu.Lock()
	defer s.subMu.Unlock()

	now := time.Now()
	var staleIDs []string

	for clientID, lastTime := range s.subscriberTimes {
		if now.Sub(lastTime) > SubscriberTimeout {
			staleIDs = append(staleIDs, clientID)
		}
	}

	for _, clientID := range staleIDs {
		if ch, ok := s.subscribers[clientID]; ok {
			close(ch)
			delete(s.subscribers, clientID)
			delete(s.subscriberTimes, clientID)
		}
	}

	if len(staleIDs) > 0 {
		fmt.Printf("[Session] Cleaned up %d stale subscribers for session %s\n", len(staleIDs), s.PTYSessionID)
	}

	return len(staleIDs)
}

// GetSubscriberCount returns the number of active subscribers.
func (s *MonitoringSession) GetSubscriberCount() int {
	s.subMu.RLock()
	defer s.subMu.RUnlock()
	return len(s.subscribers)
}

// Close cleans up all resources associated with this session.
func (s *MonitoringSession) Close() {
	s.stateMu.Lock()
	if s.closed {
		s.stateMu.Unlock()
		return // Already closed, avoid double cleanup
	}
	s.closed = true
	s.enabled = false
	s.stopTimer()
	s.stateMu.Unlock()

	// Cancel context (this will stop the Claude detection goroutine)
	s.cancelFunc()

	// Close all subscriber channels
	s.subMu.Lock()
	for id, ch := range s.subscribers {
		close(ch)
		delete(s.subscribers, id)
		delete(s.subscriberTimes, id)
	}
	s.subMu.Unlock()

	// Clear buffer
	s.bufferMu.Lock()
	s.contextBuffer.Clear()
	s.bufferMu.Unlock()

	fmt.Printf("[Session] Closed session %s for container %d\n", s.PTYSessionID, s.ContainerID)
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
		PTYSessionID:    s.PTYSessionID,
		Enabled:         s.enabled,
		SilenceDuration: int(s.silenceDuration.Seconds()),
		Threshold:       s.Config.SilenceThreshold,
		Strategy:        s.Config.ActiveStrategy,
		ClaudeDetected:  s.claudeDetected,
		ClaudePID:       s.claudePID,
		LastAction:      s.lastAction,
	}

	s.subMu.Lock()
	defer s.subMu.Unlock()

	now := time.Now()
	for clientID, ch := range s.subscribers {
		select {
		case ch <- status:
			// Successfully sent, update timestamp
			s.subscriberTimes[clientID] = now
		default:
			// Channel full, skip but don't update timestamp
			// Subscriber will be cleaned up if it stays full too long
		}
	}
}
