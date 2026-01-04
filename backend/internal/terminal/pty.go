package terminal

import (
	"context"
	"fmt"
	"io"
	"sync"
	"time"

	"cc-platform/internal/models"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/client"
	"gorm.io/gorm"
)

const (
	// Session timeout when no clients connected (30 minutes)
	SessionTimeout = 30 * time.Minute
)

// PTYOutputCallback is called when PTY produces output
type PTYOutputCallback func(containerID uint, data []byte)

// PTYSessionCreatedCallback is called when a new PTY session is created
type PTYSessionCreatedCallback func(containerID uint, dockerID string, session *PTYSession)

// PTYManager manages PTY sessions for containers
type PTYManager struct {
	db             *gorm.DB
	dockerClient   *client.Client
	historyManager *HistoryManager
	sessions       map[string]*PTYSession // sessionID -> session
	mu             sync.RWMutex
	
	// Callback for monitoring integration
	onPTYOutput PTYOutputCallback
	
	// Callback for session creation
	onSessionCreated PTYSessionCreatedCallback
}

// PTYSession represents an active PTY session that persists across WebSocket reconnections
type PTYSession struct {
	ID          string
	ContainerID string
	DockerID    string
	ExecID      string
	Conn        *HijackedConn
	Width       uint
	Height      uint
	
	// History manager reference
	historyManager *HistoryManager
	
	// PTY manager reference for callbacks
	ptyManager *PTYManager
	
	// Container database ID for monitoring
	containerDBID uint
	
	// Output channel for broadcasting to connected clients
	outputChan  chan []byte
	
	// Client management
	clients     map[string]chan []byte // clientID -> output channel
	clientsMu   sync.RWMutex
	
	// Session state
	running     bool
	runningMu   sync.RWMutex
	lastActive  time.Time
	createdAt   time.Time
	
	// Context for cleanup
	ctx         context.Context
	cancel      context.CancelFunc
}

// HijackedConn wraps the Docker hijacked connection
type HijackedConn struct {
	Conn   io.ReadWriteCloser
	Reader io.Reader
}

// NewPTYManager creates a new PTY manager
func NewPTYManager(db *gorm.DB) (*PTYManager, error) {
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return nil, fmt.Errorf("failed to create Docker client: %w", err)
	}

	manager := &PTYManager{
		db:             db,
		dockerClient:   cli,
		historyManager: NewHistoryManager(db),
		sessions:       make(map[string]*PTYSession),
	}

	// Restore active sessions from database
	manager.restoreSessions()

	// Start cleanup goroutine
	go manager.cleanupLoop()

	return manager, nil
}

// SetPTYOutputCallback sets the callback for PTY output (used by monitoring)
func (m *PTYManager) SetPTYOutputCallback(callback PTYOutputCallback) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.onPTYOutput = callback
}

// GetPTYOutputCallback returns the current PTY output callback
func (m *PTYManager) GetPTYOutputCallback() PTYOutputCallback {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.onPTYOutput
}

// SetSessionCreatedCallback sets the callback for PTY session creation
func (m *PTYManager) SetSessionCreatedCallback(callback PTYSessionCreatedCallback) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.onSessionCreated = callback
}

// GetSessionCreatedCallback returns the current session created callback
func (m *PTYManager) GetSessionCreatedCallback() PTYSessionCreatedCallback {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.onSessionCreated
}

// restoreSessions restores session metadata from database (not the actual PTY connections)
func (m *PTYManager) restoreSessions() {
	var sessions []models.TerminalSession
	m.db.Where("active = ?", true).Find(&sessions)
	
	// Mark all as inactive since PTY connections are lost on restart
	for _, s := range sessions {
		m.db.Model(&s).Update("active", false)
	}
}

// cleanupLoop periodically cleans up inactive sessions
func (m *PTYManager) cleanupLoop() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		m.cleanupInactiveSessions()
	}
}

// cleanupInactiveSessions removes sessions that have been inactive too long
func (m *PTYManager) cleanupInactiveSessions() {
	m.mu.Lock()
	defer m.mu.Unlock()

	now := time.Now()
	for id, session := range m.sessions {
		session.clientsMu.RLock()
		clientCount := len(session.clients)
		session.clientsMu.RUnlock()

		// Only cleanup if no clients and session has been inactive
		if clientCount == 0 && now.Sub(session.lastActive) > SessionTimeout {
			// Flush history before closing
			m.historyManager.FlushSession(id)
			session.Close()
			delete(m.sessions, id)
			
			// Update database
			m.db.Model(&models.TerminalSession{}).
				Where("session_id = ?", id).
				Update("active", false)
			
			fmt.Printf("Cleaned up inactive session: %s\n", id)
		}
	}
}

// Close closes the PTY manager
func (m *PTYManager) Close() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Close history manager (flushes all buffers)
	m.historyManager.Close()

	for id, session := range m.sessions {
		session.Close()
		m.db.Model(&models.TerminalSession{}).
			Where("session_id = ?", id).
			Update("active", false)
	}

	return m.dockerClient.Close()
}


// CreateSession creates a new PTY session for a container
func (m *PTYManager) CreateSession(ctx context.Context, dockerID string, containerID uint, cols, rows uint) (*PTYSession, error) {
	// Create exec instance with PTY
	execConfig := types.ExecConfig{
		Cmd:          []string{"/bin/bash"},
		AttachStdin:  true,
		AttachStdout: true,
		AttachStderr: true,
		Tty:          true,
		Env:          []string{"TERM=xterm-256color"},
	}

	execResp, err := m.dockerClient.ContainerExecCreate(ctx, dockerID, execConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create exec: %w", err)
	}

	// Attach to exec instance
	attachResp, err := m.dockerClient.ContainerExecAttach(ctx, execResp.ID, types.ExecStartCheck{
		Tty: true,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to attach to exec: %w", err)
	}

	// Resize PTY
	if err := m.dockerClient.ContainerExecResize(ctx, execResp.ID, container.ResizeOptions{
		Width:  cols,
		Height: rows,
	}); err != nil {
		fmt.Printf("Warning: failed to resize PTY: %v\n", err)
	}

	sessionCtx, cancel := context.WithCancel(context.Background())
	
	session := &PTYSession{
		ID:             execResp.ID,
		ContainerID:   fmt.Sprintf("%d", containerID),
		DockerID:      dockerID,
		ExecID:        execResp.ID,
		Conn: &HijackedConn{
			Conn:   attachResp.Conn,
			Reader: attachResp.Reader,
		},
		Width:          cols,
		Height:         rows,
		historyManager: m.historyManager,
		ptyManager:     m,
		containerDBID:  containerID,
		outputChan:     make(chan []byte, 100),
		clients:        make(map[string]chan []byte),
		running:        true,
		lastActive:     time.Now(),
		createdAt:      time.Now(),
		ctx:            sessionCtx,
		cancel:         cancel,
	}

	// Store session in memory
	m.mu.Lock()
	m.sessions[execResp.ID] = session
	m.mu.Unlock()

	// Save session to database
	dbSession := &models.TerminalSession{
		SessionID:   execResp.ID,
		ContainerID: containerID,
		DockerID:    dockerID,
		ExecID:      execResp.ID,
		Width:       cols,
		Height:      rows,
		Active:      true,
		LastActive:  time.Now(),
	}
	m.db.Create(dbSession)

	// Start reading from PTY in background
	go session.readLoop()

	// Notify monitoring service about new session
	if callback := m.GetSessionCreatedCallback(); callback != nil {
		callback(containerID, dockerID, session)
	}

	return session, nil
}

// GetOrCreateSession gets an existing session or creates a new one
func (m *PTYManager) GetOrCreateSession(ctx context.Context, dockerID string, containerID uint, sessionID string, cols, rows uint) (*PTYSession, bool, error) {
	// Try to get existing session
	if sessionID != "" {
		m.mu.RLock()
		session, exists := m.sessions[sessionID]
		m.mu.RUnlock()
		
		if exists && session.DockerID == dockerID && session.IsRunning() {
			session.lastActive = time.Now()
			// Update database
			m.db.Model(&models.TerminalSession{}).
				Where("session_id = ?", sessionID).
				Update("last_active", time.Now())
			return session, true, nil // existing session
		}
	}

	// Create new session
	session, err := m.CreateSession(ctx, dockerID, containerID, cols, rows)
	if err != nil {
		return nil, false, err
	}
	return session, false, nil
}

// GetSession returns a PTY session by ID
func (m *PTYManager) GetSession(sessionID string) (*PTYSession, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	session, exists := m.sessions[sessionID]
	return session, exists
}

// ListSessionsForContainer returns all sessions for a container
func (m *PTYManager) ListSessionsForContainer(dockerID string) []*PTYSession {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var sessions []*PTYSession
	for _, session := range m.sessions {
		if session.DockerID == dockerID && session.IsRunning() {
			sessions = append(sessions, session)
		}
	}
	return sessions
}

// ResizeSession resizes a PTY session
func (m *PTYManager) ResizeSession(ctx context.Context, sessionID string, cols, rows uint) error {
	m.mu.RLock()
	session, exists := m.sessions[sessionID]
	m.mu.RUnlock()

	if !exists {
		return fmt.Errorf("session not found: %s", sessionID)
	}

	if err := m.dockerClient.ContainerExecResize(ctx, sessionID, container.ResizeOptions{
		Width:  cols,
		Height: rows,
	}); err != nil {
		return fmt.Errorf("failed to resize PTY: %w", err)
	}

	session.Width = cols
	session.Height = rows
	session.lastActive = time.Now()

	// Update database
	m.db.Model(&models.TerminalSession{}).
		Where("session_id = ?", sessionID).
		Updates(map[string]interface{}{
			"width":       cols,
			"height":      rows,
			"last_active": time.Now(),
		})

	return nil
}

// CloseSession closes a PTY session
func (m *PTYManager) CloseSession(sessionID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	session, exists := m.sessions[sessionID]
	if !exists {
		return nil
	}

	// Flush history
	m.historyManager.FlushSession(sessionID)
	
	session.Close()
	delete(m.sessions, sessionID)
	
	// Update database
	m.db.Model(&models.TerminalSession{}).
		Where("session_id = ?", sessionID).
		Update("active", false)
	
	return nil
}

// GetHistoryManager returns the history manager
func (m *PTYManager) GetHistoryManager() *HistoryManager {
	return m.historyManager
}


// PTYSession methods

// readLoop continuously reads from PTY and broadcasts to clients
func (s *PTYSession) readLoop() {
	buf := make([]byte, 4096)
	for {
		select {
		case <-s.ctx.Done():
			return
		default:
			n, err := s.Conn.Reader.Read(buf)
			if err != nil {
				if err != io.EOF {
					fmt.Printf("PTY read error: %v\n", err)
				}
				s.setRunning(false)
				return
			}

			if n > 0 {
				data := make([]byte, n)
				copy(data, buf[:n])

				// Save to history manager
				s.historyManager.Write(s.ID, data)
				s.lastActive = time.Now()

				// Call monitoring callback (independent of WebSocket clients)
				if s.ptyManager != nil {
					if callback := s.ptyManager.GetPTYOutputCallback(); callback != nil {
						callback(s.containerDBID, data)
					}
				}

				// Broadcast to all connected clients
				s.broadcastToClients(data)
			}
		}
	}
}

// broadcastToClients sends data to all connected clients
func (s *PTYSession) broadcastToClients(data []byte) {
	s.clientsMu.RLock()
	defer s.clientsMu.RUnlock()

	for _, ch := range s.clients {
		select {
		case ch <- data:
		default:
			// Channel full, skip
		}
	}
}

// AddClient adds a client to receive output
func (s *PTYSession) AddClient(clientID string) chan []byte {
	s.clientsMu.Lock()
	defer s.clientsMu.Unlock()

	ch := make(chan []byte, 100)
	s.clients[clientID] = ch
	s.lastActive = time.Now()
	return ch
}

// RemoveClient removes a client
func (s *PTYSession) RemoveClient(clientID string) {
	s.clientsMu.Lock()
	defer s.clientsMu.Unlock()

	if ch, ok := s.clients[clientID]; ok {
		close(ch)
		delete(s.clients, clientID)
	}
	s.lastActive = time.Now()
}

// GetHistory returns the terminal history (from database + buffer)
func (s *PTYSession) GetHistory() []byte {
	history, err := s.historyManager.GetHistory(s.ID)
	if err != nil {
		fmt.Printf("Failed to get history: %v\n", err)
		return nil
	}
	return history
}

// GetHistorySize returns the size of history
func (s *PTYSession) GetHistorySize() int64 {
	return s.historyManager.GetHistorySize(s.ID)
}

// Write writes data to the PTY session
func (s *PTYSession) Write(data []byte) (int, error) {
	if s.Conn == nil {
		return 0, fmt.Errorf("connection closed")
	}
	s.lastActive = time.Now()
	return s.Conn.Conn.Write(data)
}

// IsRunning returns whether the session is still running
func (s *PTYSession) IsRunning() bool {
	s.runningMu.RLock()
	defer s.runningMu.RUnlock()
	return s.running
}

// setRunning sets the running state
func (s *PTYSession) setRunning(running bool) {
	s.runningMu.Lock()
	defer s.runningMu.Unlock()
	s.running = running
}

// GetClientCount returns the number of connected clients
func (s *PTYSession) GetClientCount() int {
	s.clientsMu.RLock()
	defer s.clientsMu.RUnlock()
	return len(s.clients)
}

// Close closes the PTY session
func (s *PTYSession) Close() {
	s.setRunning(false)
	s.cancel()

	// Close all client channels
	s.clientsMu.Lock()
	for id, ch := range s.clients {
		close(ch)
		delete(s.clients, id)
	}
	s.clientsMu.Unlock()

	// Close connection
	if s.Conn != nil {
		s.Conn.Conn.Close()
	}
}

// SessionInfo returns information about the session
type SessionInfo struct {
	ID          string    `json:"id"`
	ContainerID string    `json:"container_id"`
	Width       uint      `json:"width"`
	Height      uint      `json:"height"`
	ClientCount int       `json:"client_count"`
	CreatedAt   time.Time `json:"created_at"`
	LastActive  time.Time `json:"last_active"`
	Running     bool      `json:"running"`
}

// GetInfo returns session information
func (s *PTYSession) GetInfo() SessionInfo {
	return SessionInfo{
		ID:          s.ID,
		ContainerID: s.ContainerID,
		Width:       s.Width,
		Height:      s.Height,
		ClientCount: s.GetClientCount(),
		CreatedAt:   s.createdAt,
		LastActive:  s.lastActive,
		Running:     s.IsRunning(),
	}
}

// CloseSessionsForContainer closes all PTY sessions for a specific container
func (m *PTYManager) CloseSessionsForContainer(containerID uint) int {
	m.mu.Lock()
	defer m.mu.Unlock()

	containerIDStr := fmt.Sprintf("%d", containerID)
	closedCount := 0

	for id, session := range m.sessions {
		if session.ContainerID == containerIDStr {
			// Flush history
			m.historyManager.FlushSession(id)
			session.Close()
			delete(m.sessions, id)
			closedCount++
		}
	}

	// Update database - mark all sessions for this container as inactive
	m.db.Model(&models.TerminalSession{}).
		Where("container_id = ?", containerID).
		Update("active", false)

	return closedCount
}

// CloseSessionsForDockerID closes all PTY sessions for a specific Docker container ID
func (m *PTYManager) CloseSessionsForDockerID(dockerID string) int {
	m.mu.Lock()
	defer m.mu.Unlock()

	closedCount := 0

	for id, session := range m.sessions {
		if session.DockerID == dockerID {
			// Flush history
			m.historyManager.FlushSession(id)
			session.Close()
			delete(m.sessions, id)
			closedCount++
		}
	}

	// Update database
	m.db.Model(&models.TerminalSession{}).
		Where("docker_id = ?", dockerID).
		Update("active", false)

	return closedCount
}
