package monitoring

import (
	"context"
	"fmt"
	"log"
	"sync"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/events"
	"github.com/docker/docker/client"
)

// DockerEventListener listens for Docker container events and triggers cleanup.
type DockerEventListener struct {
	dockerClient *client.Client
	manager      *Manager
	ctx          context.Context
	cancelFunc   context.CancelFunc
	wg           sync.WaitGroup
	running      bool
	closed       bool // Whether Close has been called
	mu           sync.Mutex
}

// NewDockerEventListener creates a new Docker event listener.
func NewDockerEventListener(manager *Manager) (*DockerEventListener, error) {
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return nil, fmt.Errorf("failed to create Docker client: %w", err)
	}

	ctx, cancel := context.WithCancel(context.Background())

	return &DockerEventListener{
		dockerClient: cli,
		manager:      manager,
		ctx:          ctx,
		cancelFunc:   cancel,
	}, nil
}

// Start begins listening for Docker events.
func (l *DockerEventListener) Start() error {
	l.mu.Lock()
	if l.closed {
		l.mu.Unlock()
		return fmt.Errorf("listener has been closed")
	}
	if l.running {
		l.mu.Unlock()
		return nil
	}
	l.running = true
	l.mu.Unlock()

	l.wg.Add(1)
	go l.listen()

	log.Println("[DockerEventListener] Started listening for Docker events")
	return nil
}

// Stop stops listening for Docker events.
func (l *DockerEventListener) Stop() {
	l.mu.Lock()
	if l.closed {
		l.mu.Unlock()
		return
	}
	wasRunning := l.running
	l.running = false
	l.closed = true
	l.mu.Unlock()

	// Cancel context to stop the listener goroutine
	l.cancelFunc()

	// Wait for listener goroutine if it was running
	if wasRunning {
		l.wg.Wait()
	}

	// Always close the Docker client
	if l.dockerClient != nil {
		l.dockerClient.Close()
		l.dockerClient = nil
	}

	log.Println("[DockerEventListener] Stopped and cleaned up Docker event listener")
}

// Close is an alias for Stop to implement io.Closer interface.
func (l *DockerEventListener) Close() error {
	l.Stop()
	return nil
}

// IsRunning returns whether the listener is currently running.
func (l *DockerEventListener) IsRunning() bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.running && !l.closed
}

// listen is the main event loop.
func (l *DockerEventListener) listen() {
	defer l.wg.Done()

	eventChan, errChan := l.dockerClient.Events(l.ctx, types.EventsOptions{})

	for {
		select {
		case <-l.ctx.Done():
			return

		case err := <-errChan:
			if err != nil && l.ctx.Err() == nil {
				log.Printf("[DockerEventListener] Error receiving events: %v", err)
			}
			return

		case event := <-eventChan:
			l.handleEvent(event)
		}
	}
}

// handleEvent processes a Docker event.
func (l *DockerEventListener) handleEvent(event events.Message) {
	// Only handle container events
	if event.Type != events.ContainerEventType {
		return
	}

	containerID := event.Actor.ID
	containerName := event.Actor.Attributes["name"]

	switch event.Action {
	case "die":
		log.Printf("[DockerEventListener] Container died: %s (%s)", containerName, containerID[:12])
		l.onContainerDie(containerID, containerName)

	case "destroy":
		log.Printf("[DockerEventListener] Container destroyed: %s (%s)", containerName, containerID[:12])
		l.onContainerDestroy(containerID, containerName)

	case "stop":
		log.Printf("[DockerEventListener] Container stopped: %s (%s)", containerName, containerID[:12])
		l.onContainerStop(containerID, containerName)
	}
}

// onContainerDie handles container die events.
func (l *DockerEventListener) onContainerDie(dockerID string, name string) {
	// Find and cleanup monitoring session by Docker ID
	l.cleanupByDockerID(dockerID, "container_died")
}

// onContainerDestroy handles container destroy events.
func (l *DockerEventListener) onContainerDestroy(dockerID string, name string) {
	// Find and cleanup monitoring session by Docker ID
	l.cleanupByDockerID(dockerID, "container_destroyed")
}

// onContainerStop handles container stop events.
func (l *DockerEventListener) onContainerStop(dockerID string, name string) {
	// Find and cleanup monitoring session by Docker ID
	l.cleanupByDockerID(dockerID, "container_stopped")
}

// cleanupByDockerID finds and cleans up a monitoring session by Docker ID.
func (l *DockerEventListener) cleanupByDockerID(dockerID string, reason string) {
	// Get all sessions and find the one matching this Docker ID
	sessions := l.manager.ListSessions()
	
	for _, status := range sessions {
		session := l.manager.GetSession(status.ContainerID)
		if session != nil && session.DockerID == dockerID {
			log.Printf("[DockerEventListener] Cleaning up monitoring session for container %d (reason: %s)", 
				status.ContainerID, reason)
			
			// Trigger cleanup
			l.manager.RemoveSession(status.ContainerID)
			
			// Notify about container event
			l.manager.BroadcastNotification(status.ContainerID, reason, 
				fmt.Sprintf("Container event: %s", reason))
			
			return
		}
	}
}

// MonitoringStatus needs ContainerID field for this to work
// This is already defined in session.go, but we need to ensure it has ContainerID
// The ListSessions method returns MonitoringStatus which should include ContainerID
