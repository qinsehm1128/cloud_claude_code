package terminal

import (
	"context"
	"fmt"
	"io"
	"sync"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/client"
)

// PTYManager manages PTY sessions for containers
type PTYManager struct {
	dockerClient *client.Client
	sessions     map[string]*PTYSession
	mu           sync.RWMutex
}

// PTYSession represents an active PTY session
type PTYSession struct {
	ContainerID string
	ExecID      string
	Conn        *HijackedConn
	Width       uint
	Height      uint
}

// HijackedConn wraps the Docker hijacked connection
type HijackedConn struct {
	Conn   io.ReadWriteCloser
	Reader io.Reader
}

// NewPTYManager creates a new PTY manager
func NewPTYManager() (*PTYManager, error) {
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return nil, fmt.Errorf("failed to create Docker client: %w", err)
	}

	return &PTYManager{
		dockerClient: cli,
		sessions:     make(map[string]*PTYSession),
	}, nil
}

// Close closes the PTY manager
func (m *PTYManager) Close() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	for _, session := range m.sessions {
		if session.Conn != nil {
			session.Conn.Conn.Close()
		}
	}

	return m.dockerClient.Close()
}

// CreateSession creates a new PTY session for a container
func (m *PTYManager) CreateSession(ctx context.Context, containerID string, cols, rows uint) (*PTYSession, error) {
	// Create exec instance with PTY
	execConfig := types.ExecConfig{
		Cmd:          []string{"/bin/bash"},
		AttachStdin:  true,
		AttachStdout: true,
		AttachStderr: true,
		Tty:          true,
		Env:          []string{"TERM=xterm-256color"},
	}

	execResp, err := m.dockerClient.ContainerExecCreate(ctx, containerID, execConfig)
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
		// Non-fatal error, log and continue
		fmt.Printf("Warning: failed to resize PTY: %v\n", err)
	}

	session := &PTYSession{
		ContainerID: containerID,
		ExecID:      execResp.ID,
		Conn: &HijackedConn{
			Conn:   attachResp.Conn,
			Reader: attachResp.Reader,
		},
		Width:  cols,
		Height: rows,
	}

	// Store session
	m.mu.Lock()
	m.sessions[execResp.ID] = session
	m.mu.Unlock()

	return session, nil
}

// ResizeSession resizes a PTY session
func (m *PTYManager) ResizeSession(ctx context.Context, execID string, cols, rows uint) error {
	m.mu.RLock()
	session, exists := m.sessions[execID]
	m.mu.RUnlock()

	if !exists {
		return fmt.Errorf("session not found: %s", execID)
	}

	if err := m.dockerClient.ContainerExecResize(ctx, execID, container.ResizeOptions{
		Width:  cols,
		Height: rows,
	}); err != nil {
		return fmt.Errorf("failed to resize PTY: %w", err)
	}

	m.mu.Lock()
	session.Width = cols
	session.Height = rows
	m.mu.Unlock()

	return nil
}

// CloseSession closes a PTY session
func (m *PTYManager) CloseSession(execID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	session, exists := m.sessions[execID]
	if !exists {
		return nil
	}

	if session.Conn != nil {
		session.Conn.Conn.Close()
	}

	delete(m.sessions, execID)
	return nil
}

// GetSession returns a PTY session by exec ID
func (m *PTYManager) GetSession(execID string) (*PTYSession, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	session, exists := m.sessions[execID]
	return session, exists
}

// Write writes data to the PTY session
func (s *PTYSession) Write(data []byte) (int, error) {
	if s.Conn == nil {
		return 0, fmt.Errorf("connection closed")
	}
	return s.Conn.Conn.Write(data)
}

// Read reads data from the PTY session
func (s *PTYSession) Read(buf []byte) (int, error) {
	if s.Conn == nil {
		return 0, fmt.Errorf("connection closed")
	}
	return s.Conn.Reader.Read(buf)
}
