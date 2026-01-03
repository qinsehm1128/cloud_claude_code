package terminal

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	// WebSocket message types
	MessageTypeInput  = "input"
	MessageTypeOutput = "output"
	MessageTypeResize = "resize"
	MessageTypeError  = "error"
	MessageTypePing   = "ping"
	MessageTypePong   = "pong"

	// WebSocket settings
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 8192
)

// TerminalMessage represents a WebSocket message
type TerminalMessage struct {
	Type  string `json:"type"`
	Data  string `json:"data,omitempty"`
	Cols  uint   `json:"cols,omitempty"`
	Rows  uint   `json:"rows,omitempty"`
	Error string `json:"error,omitempty"`
}

// TerminalService handles WebSocket terminal connections
type TerminalService struct {
	ptyManager *PTYManager
	clients    map[string]map[*websocket.Conn]bool // containerID -> connections
	mu         sync.RWMutex
}

// NewTerminalService creates a new terminal service
func NewTerminalService() (*TerminalService, error) {
	ptyManager, err := NewPTYManager()
	if err != nil {
		return nil, err
	}

	return &TerminalService{
		ptyManager: ptyManager,
		clients:    make(map[string]map[*websocket.Conn]bool),
	}, nil
}

// Close closes the terminal service
func (s *TerminalService) Close() error {
	return s.ptyManager.Close()
}

// HandleConnection handles a new WebSocket connection
func (s *TerminalService) HandleConnection(ctx context.Context, conn *websocket.Conn, containerID string) error {
	// Configure WebSocket
	conn.SetReadLimit(maxMessageSize)
	conn.SetReadDeadline(time.Now().Add(pongWait))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	// Create PTY session with default size
	session, err := s.ptyManager.CreateSession(ctx, containerID, 80, 24)
	if err != nil {
		s.sendError(conn, fmt.Sprintf("Failed to create terminal session: %v", err))
		return err
	}

	// Register client
	s.registerClient(containerID, conn)
	defer s.unregisterClient(containerID, conn)
	defer s.ptyManager.CloseSession(session.ExecID)

	// Start goroutines for reading/writing
	errChan := make(chan error, 2)

	// Read from PTY and send to WebSocket
	go func() {
		errChan <- s.readFromPTY(conn, session)
	}()

	// Read from WebSocket and write to PTY
	go func() {
		errChan <- s.readFromWebSocket(ctx, conn, session)
	}()

	// Start ping ticker
	go s.pingLoop(conn)

	// Wait for error or context cancellation
	select {
	case err := <-errChan:
		return err
	case <-ctx.Done():
		return ctx.Err()
	}
}

// readFromPTY reads from PTY and sends to WebSocket
func (s *TerminalService) readFromPTY(conn *websocket.Conn, session *PTYSession) error {
	buf := make([]byte, 4096)
	for {
		n, err := session.Read(buf)
		if err != nil {
			if err == io.EOF {
				return nil
			}
			return err
		}

		if n > 0 {
			msg := TerminalMessage{
				Type: MessageTypeOutput,
				Data: string(buf[:n]),
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
				if err := s.ptyManager.ResizeSession(ctx, session.ExecID, msg.Cols, msg.Rows); err != nil {
					s.sendError(conn, fmt.Sprintf("Failed to resize terminal: %v", err))
				}
			}

		case MessageTypePong:
			// Pong received, connection is alive
			continue
		}
	}
}

// pingLoop sends periodic ping messages
func (s *TerminalService) pingLoop(conn *websocket.Conn) {
	ticker := time.NewTicker(pingPeriod)
	defer ticker.Stop()

	for range ticker.C {
		conn.SetWriteDeadline(time.Now().Add(writeWait))
		if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
			return
		}
	}
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

// registerClient registers a WebSocket client for a container
func (s *TerminalService) registerClient(containerID string, conn *websocket.Conn) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.clients[containerID] == nil {
		s.clients[containerID] = make(map[*websocket.Conn]bool)
	}
	s.clients[containerID][conn] = true
}

// unregisterClient unregisters a WebSocket client
func (s *TerminalService) unregisterClient(containerID string, conn *websocket.Conn) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if clients, ok := s.clients[containerID]; ok {
		delete(clients, conn)
		if len(clients) == 0 {
			delete(s.clients, containerID)
		}
	}
}

// BroadcastToContainer sends a message to all clients connected to a container
func (s *TerminalService) BroadcastToContainer(containerID string, msg TerminalMessage) {
	s.mu.RLock()
	clients := s.clients[containerID]
	s.mu.RUnlock()

	data, err := json.Marshal(msg)
	if err != nil {
		return
	}

	for conn := range clients {
		conn.SetWriteDeadline(time.Now().Add(writeWait))
		if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
			s.unregisterClient(containerID, conn)
			conn.Close()
		}
	}
}

// GetConnectedClients returns the number of connected clients for a container
func (s *TerminalService) GetConnectedClients(containerID string) int {
	s.mu.RLock()
	defer s.mu.RUnlock()

	return len(s.clients[containerID])
}
