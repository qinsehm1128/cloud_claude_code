package handlers

import (
	"net/http"

	"cc-platform/internal/middleware"
	"cc-platform/internal/models"
	"cc-platform/internal/services"
	"cc-platform/internal/terminal"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		// Use the same origin whitelist as CORS middleware
		return middleware.IsOriginAllowed(origin)
	},
}

// TerminalHandler handles terminal WebSocket endpoints
type TerminalHandler struct {
	terminalService  *terminal.TerminalService
	containerService *services.ContainerService
	authService      *services.AuthService
}

// NewTerminalHandler creates a new TerminalHandler
func NewTerminalHandler(
	terminalService *terminal.TerminalService,
	containerService *services.ContainerService,
	authService *services.AuthService,
) *TerminalHandler {
	return &TerminalHandler{
		terminalService:  terminalService,
		containerService: containerService,
		authService:      authService,
	}
}

// HandleWebSocket handles WebSocket terminal connections
func (h *TerminalHandler) HandleWebSocket(c *gin.Context) {
	// Get container ID from URL
	containerIDStr := c.Param("id")
	containerID, err := parseID(containerIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid container ID"})
		return
	}

	// Verify container exists and is running
	container, err := h.containerService.GetContainer(containerID)
	if err != nil {
		if err == services.ErrContainerNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Container not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get container"})
		return
	}

	if container.Status != models.ContainerStatusRunning {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Container is not running"})
		return
	}

	// Authenticate via query parameter (for WebSocket)
	// Note: In production, consider using WebSocket subprotocol for token
	token := c.Query("token")
	if token == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Missing authentication token"})
		return
	}

	_, err = h.authService.VerifyToken(token)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid authentication token"})
		return
	}

	// Get optional session ID for reconnection
	sessionID := c.Query("session")

	// Upgrade to WebSocket
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to upgrade connection"})
		return
	}
	defer conn.Close()

	// Handle the terminal connection with session support
	if err := h.terminalService.HandleConnection(c.Request.Context(), conn, container.DockerID, containerID, sessionID); err != nil {
		// Connection closed, log error if needed
		return
	}
}

// GetSessions returns active terminal sessions for a container
func (h *TerminalHandler) GetSessions(c *gin.Context) {
	containerIDStr := c.Param("id")
	containerID, err := parseID(containerIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid container ID"})
		return
	}

	container, err := h.containerService.GetContainer(containerID)
	if err != nil {
		if err == services.ErrContainerNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Container not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get container"})
		return
	}

	sessions := h.terminalService.GetSessionsForContainer(container.DockerID)
	c.JSON(http.StatusOK, sessions)
}
