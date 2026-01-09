package monitoring

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"
)

// CleanupManager handles resource cleanup for monitoring sessions.
type CleanupManager struct {
	manager        *Manager
	webhookURL     string
	cleanupTimeout time.Duration
	mu             sync.Mutex
}

// NewCleanupManager creates a new cleanup manager.
func NewCleanupManager(manager *Manager) *CleanupManager {
	return &CleanupManager{
		manager:        manager,
		cleanupTimeout: 30 * time.Second,
	}
}

// SetWebhookURL sets the webhook URL for crash notifications.
func (c *CleanupManager) SetWebhookURL(url string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.webhookURL = url
}

// CleanupSession performs full cleanup of a monitoring session.
// This includes:
// - Stopping the silence timer
// - Canceling any pending AI requests
// - Clearing the context buffer
// - Removing the session from the manager
func (c *CleanupManager) CleanupSession(containerID uint, reason string) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	session := c.manager.GetSession(containerID)
	if session == nil {
		return fmt.Errorf("session not found for container %d", containerID)
	}

	log.Printf("[CleanupManager] Cleaning up session for container %d (reason: %s)", containerID, reason)

	// 1. Stop the silence timer
	session.Disable()

	// 2. Cancel the session context (cancels any pending AI requests)
	session.cancelFunc()

	// 3. Clear the context buffer
	session.bufferMu.Lock()
	session.contextBuffer.Clear()
	session.bufferMu.Unlock()

	// 4. Close all subscriber channels
	session.subMu.Lock()
	for id, ch := range session.subscribers {
		close(ch)
		delete(session.subscribers, id)
	}
	session.subMu.Unlock()

	// 5. Remove from manager
	c.manager.RemoveSession(containerID)

	log.Printf("[CleanupManager] Session cleanup complete for container %d", containerID)
	return nil
}

// CleanupAllSessions cleans up all active monitoring sessions.
func (c *CleanupManager) CleanupAllSessions(reason string) {
	sessions := c.manager.ListSessions()
	
	for _, status := range sessions {
		if err := c.CleanupSession(status.ContainerID, reason); err != nil {
			log.Printf("[CleanupManager] Error cleaning up session %d: %v", status.ContainerID, err)
		}
	}
}

// NotifyContainerCrash sends a webhook notification when a container crashes.
func (c *CleanupManager) NotifyContainerCrash(containerID uint, dockerID string, reason string) error {
	c.mu.Lock()
	webhookURL := c.webhookURL
	c.mu.Unlock()

	if webhookURL == "" {
		log.Printf("[CleanupManager] No webhook URL configured for crash notification")
		return nil
	}

	// Build payload
	payload := WebhookPayload{
		ContainerID:     containerID,
		SessionID:       dockerID,
		SilenceDuration: 0,
		LastOutput:      reason,
		Timestamp:       time.Now().Unix(),
	}

	// Send webhook using the webhook strategy
	strategy := NewWebhookStrategy()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	result, err := strategy.sendWithRetry(ctx, webhookURL, "", payload, 3)
	if err != nil {
		log.Printf("[CleanupManager] Failed to send crash notification: %v", err)
		return err
	}

	if result != nil && result.Success {
		log.Printf("[CleanupManager] Crash notification sent for container %d", containerID)
	}
	return nil
}

// SessionCleanupInfo contains information about a cleaned up session.
type SessionCleanupInfo struct {
	ContainerID uint      `json:"container_id"`
	DockerID    string    `json:"docker_id"`
	Reason      string    `json:"reason"`
	CleanedAt   time.Time `json:"cleaned_at"`
}

// CleanupResult contains the result of a cleanup operation.
type CleanupResult struct {
	Success      bool                 `json:"success"`
	SessionsInfo []SessionCleanupInfo `json:"sessions_info"`
	Errors       []string             `json:"errors,omitempty"`
}

// CleanupWithNotification performs cleanup and sends crash notification if needed.
func (c *CleanupManager) CleanupWithNotification(containerID uint, dockerID string, reason string, isCrash bool) (*CleanupResult, error) {
	result := &CleanupResult{
		Success:      true,
		SessionsInfo: make([]SessionCleanupInfo, 0),
		Errors:       make([]string, 0),
	}

	// Perform cleanup
	if err := c.CleanupSession(containerID, reason); err != nil {
		result.Errors = append(result.Errors, err.Error())
		// Don't fail completely, continue with notification
	} else {
		result.SessionsInfo = append(result.SessionsInfo, SessionCleanupInfo{
			ContainerID: containerID,
			DockerID:    dockerID,
			Reason:      reason,
			CleanedAt:   time.Now(),
		})
	}

	// Send crash notification if applicable
	if isCrash {
		if err := c.NotifyContainerCrash(containerID, dockerID, reason); err != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("notification failed: %v", err))
		}
	}

	result.Success = len(result.Errors) == 0
	return result, nil
}

// GracefulShutdown performs graceful shutdown of all monitoring resources.
func (c *CleanupManager) GracefulShutdown(timeout time.Duration) error {
	log.Println("[CleanupManager] Starting graceful shutdown...")

	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	done := make(chan struct{})

	go func() {
		c.CleanupAllSessions("graceful_shutdown")
		close(done)
	}()

	select {
	case <-done:
		log.Println("[CleanupManager] Graceful shutdown complete")
		return nil
	case <-ctx.Done():
		log.Println("[CleanupManager] Graceful shutdown timed out")
		return ctx.Err()
	}
}

// IsSessionActive checks if a session is still active.
func (c *CleanupManager) IsSessionActive(containerID uint) bool {
	session := c.manager.GetSession(containerID)
	return session != nil
}

// GetActiveSessionCount returns the number of active sessions.
func (c *CleanupManager) GetActiveSessionCount() int {
	return len(c.manager.ListSessions())
}
