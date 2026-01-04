package terminal

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"gorm.io/gorm"
)

const (
	// WebSocket message types
	MessageTypeInput   = "input"
	MessageTypeOutput  = "output"
	MessageTypeResize  = "resize"
	MessageTypeError   = "error"
	MessageTypePing    = "ping"
	MessageTypePong    = "pong"
	MessageTypeHistory = "history"
	MessageTypeHistoryStart = "history_start"
	MessageTypeHistoryEnd   = "history_end"
	MessageTypeSession = "session"
	MessageTypeClose   = "close" // Client requests to close session permanently

	// WebSocket settings
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 8192
	
	// History chunk size for sending
	historyChunkSize = 64 * 1024 // 64KB per message
)

// TerminalMessage represents a WebSocket message
type TerminalMessage struct {
	Type      string `json:"type"`
	Data      string `json:"data,omitempty"`
	Cols      uint   `json:"cols,omitempty"`
	Rows      uint   `json:"rows,omitempty"`
	Error     string `json:"error,omitempty"`
	SessionID string `json:"session_id,omitempty"`
	TotalSize int64  `json:"total_size,omitempty"` // Total history size for progress
	ChunkIndex int   `json:"chunk_index,omitempty"` // Current chunk index
	TotalChunks int  `json:"total_chunks,omitempty"` // Total number of chunks
}

// TerminalService handles WebSocket terminal connections
type TerminalService struct {
	ptyManager *PTYManager
	mu         sync.RWMutex
}

// NewTerminalService creates a new terminal service
func NewTerminalService(db *gorm.DB) (*TerminalService, error) {
	ptyManager, err := NewPTYManager(db)
	if err != nil {
		return nil, err
	}

	return &TerminalService{
		ptyManager: ptyManager,
	}, nil
}

// Close closes the terminal service
func (s *TerminalService) Close() error {
	return s.ptyManager.Close()
}

// HandleConnection handles a new WebSocket connection
func (s *TerminalService) HandleConnection(ctx context.Context, conn *websocket.Conn, dockerID string, containerID uint, sessionID string) error {
	// Configure WebSocket
	conn.SetReadLimit(maxMessageSize)
	conn.SetReadDeadline(time.Now().Add(pongWait))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	// Default terminal size
	cols := uint(80)
	rows := uint(24)

	// Get or create PTY session
	session, isExisting, err := s.ptyManager.GetOrCreateSession(ctx, dockerID, containerID, sessionID, cols, rows)
	if err != nil {
		s.sendError(conn, fmt.Sprintf("Failed to create terminal session: %v", err))
		return err
	}

	// Generate unique client ID
	clientID := uuid.New().String()

	// Send session ID to client
	s.sendMessage(conn, TerminalMessage{
		Type:      MessageTypeSession,
		SessionID: session.ID,
	})

	// If reconnecting to existing session, send history in chunks
	if isExisting {
		go s.sendHistoryInChunks(conn, session)
	}

	// Register as client to receive output
	outputChan := session.AddClient(clientID)
	defer session.RemoveClient(clientID)

	// Create done channel
	done := make(chan struct{})
	defer close(done)

	// Start goroutines
	errChan := make(chan error, 2)

	// Read from session output channel and send to WebSocket
	go func() {
		errChan <- s.forwardOutputToWebSocket(conn, outputChan, done)
	}()

	// Read from WebSocket and write to PTY
	go func() {
		errChan <- s.readFromWebSocket(ctx, conn, session)
	}()

	// Start ping ticker
	go s.pingLoop(conn, done)

	// Wait for error or context cancellation
	select {
	case err := <-errChan:
		return err
	case <-ctx.Done():
		return ctx.Err()
	}
}


// sendHistoryInChunks sends history data in chunks for large histories
// Uses adaptive flow control instead of fixed delays
func (s *TerminalService) sendHistoryInChunks(conn *websocket.Conn, session *PTYSession) {
	history := session.GetHistory()
	if len(history) == 0 {
		return
	}
	
	totalSize := int64(len(history))
	totalChunks := (len(history) + historyChunkSize - 1) / historyChunkSize
	
	// Send history start message
	s.sendMessage(conn, TerminalMessage{
		Type:        MessageTypeHistoryStart,
		TotalSize:   totalSize,
		TotalChunks: totalChunks,
	})
	
	// Send history in chunks with adaptive flow control
	// For small histories (< 5 chunks), send without delay
	// For larger histories, use minimal delay only when needed
	const fastChunkThreshold = 5
	
	for i := 0; i < len(history); i += historyChunkSize {
		end := i + historyChunkSize
		if end > len(history) {
			end = len(history)
		}
		
		chunkIndex := i / historyChunkSize
		
		// Set write deadline for each chunk
		conn.SetWriteDeadline(time.Now().Add(writeWait))
		
		err := conn.WriteJSON(TerminalMessage{
			Type:        MessageTypeHistory,
			Data:        string(history[i:end]),
			ChunkIndex:  chunkIndex,
			TotalChunks: totalChunks,
		})
		
		if err != nil {
			// Client disconnected or write failed, stop sending
			return
		}
		
		// Only add minimal delay for large histories to prevent buffer overflow
		// Skip delay for small histories or last few chunks
		if totalChunks > fastChunkThreshold && chunkIndex < totalChunks-fastChunkThreshold {
			// Use runtime.Gosched() to yield to other goroutines instead of fixed sleep
			// This provides natural flow control without artificial delays
			time.Sleep(1 * time.Millisecond)
		}
	}
	
	// Send history end message
	s.sendMessage(conn, TerminalMessage{
		Type: MessageTypeHistoryEnd,
	})
}

// forwardOutputToWebSocket forwards PTY output to WebSocket
func (s *TerminalService) forwardOutputToWebSocket(conn *websocket.Conn, outputChan chan []byte, done chan struct{}) error {
	for {
		select {
		case <-done:
			return nil
		case data, ok := <-outputChan:
			if !ok {
				return nil
			}
			msg := TerminalMessage{
				Type: MessageTypeOutput,
				Data: string(data),
			}
			conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := conn.WriteJSON(msg); err != nil {
				return err
			}
		}
	}
}

// readFromWebSocket reads from WebSocket and writes to PTY
func (s *TerminalService) readFromWebSocket(ctx context.Context, conn *websocket.Conn, session *PTYSession) error {
	for {
		var msg TerminalMessage
		if err := conn.ReadJSON(&msg); err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				return err
			}
			return nil
		}

		switch msg.Type {
		case MessageTypeInput:
			if _, err := session.Write([]byte(msg.Data)); err != nil {
				return err
			}

		case MessageTypeResize:
			if msg.Cols > 0 && msg.Rows > 0 {
				if err := s.ptyManager.ResizeSession(ctx, session.ID, msg.Cols, msg.Rows); err != nil {
					s.sendError(conn, fmt.Sprintf("Failed to resize terminal: %v", err))
				}
			}

		case MessageTypeClose:
			// Client requested to close session permanently
			if msg.SessionID != "" {
				s.ptyManager.CloseSession(msg.SessionID)
				fmt.Printf("Session %s closed by client request\n", msg.SessionID)
			}
			return nil

		case MessageTypePong:
			continue
		}
	}
}

// pingLoop sends periodic ping messages
func (s *TerminalService) pingLoop(conn *websocket.Conn, done chan struct{}) {
	ticker := time.NewTicker(pingPeriod)
	defer ticker.Stop()

	for {
		select {
		case <-done:
			return
		case <-ticker.C:
			conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// sendMessage sends a message to the WebSocket
func (s *TerminalService) sendMessage(conn *websocket.Conn, msg TerminalMessage) {
	conn.SetWriteDeadline(time.Now().Add(writeWait))
	conn.WriteJSON(msg)
}

// sendError sends an error message to the WebSocket
func (s *TerminalService) sendError(conn *websocket.Conn, errMsg string) {
	msg := TerminalMessage{
		Type:  MessageTypeError,
		Error: errMsg,
	}
	conn.SetWriteDeadline(time.Now().Add(writeWait))
	conn.WriteJSON(msg)
}

// GetSessionsForContainer returns all active sessions for a container
func (s *TerminalService) GetSessionsForContainer(containerID string) []SessionInfo {
	sessions := s.ptyManager.ListSessionsForContainer(containerID)
	infos := make([]SessionInfo, len(sessions))
	for i, session := range sessions {
		infos[i] = session.GetInfo()
	}
	return infos
}

// CloseSession closes a specific session
func (s *TerminalService) CloseSession(sessionID string) error {
	return s.ptyManager.CloseSession(sessionID)
}

// CloseSessionsForContainer closes all terminal sessions for a container
func (s *TerminalService) CloseSessionsForContainer(containerID uint) int {
	return s.ptyManager.CloseSessionsForContainer(containerID)
}

// CloseSessionsForDockerID closes all terminal sessions for a Docker container
func (s *TerminalService) CloseSessionsForDockerID(dockerID string) int {
	return s.ptyManager.CloseSessionsForDockerID(dockerID)
}
