package handlers

import (
	"net"
	"net/http"
	"strings"

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

// Docker internal network ranges
var dockerNetworks = []string{
	"172.16.0.0/12",  // Docker default bridge network
	"192.168.0.0/16", // Docker custom networks
	"10.0.0.0/8",     // Docker swarm overlay networks
}

// isDockerInternalIP checks if the IP is from Docker internal network
func isDockerInternalIP(ipStr string) bool {
	// Handle IPv6 mapped IPv4 addresses
	if strings.HasPrefix(ipStr, "::ffff:") {
		ipStr = strings.TrimPrefix(ipStr, "::ffff:")
	}
	
	ip := net.ParseIP(ipStr)
	if ip == nil {
		return false
	}
	
	for _, cidr := range dockerNetworks {
		_, network, err := net.ParseCIDR(cidr)
		if err != nil {
			continue
		}
		if network.Contains(ip) {
			return true
		}
	}
	
	// Also allow localhost for development
	if ip.IsLoopback() {
		return true
	}
	
	return false
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
	// Get container ID from URL - can be either database ID (numeric) or Docker ID (hex string)
	containerIDStr := c.Param("id")
	
	var container *models.Container
	var containerID uint
	var err error

	// Try to parse as numeric database ID first
	containerID, err = parseID(containerIDStr)
	if err == nil {
		// It's a numeric ID, look up by database ID
		container, err = h.containerService.GetContainer(containerID)
		if err != nil {
			if err == services.ErrContainerNotFound {
				c.JSON(http.StatusNotFound, gin.H{"error": "Container not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get container"})
			return
		}
	} else {
		// It's not a numeric ID, try to look up by Docker ID
		container, err = h.containerService.GetContainerByDockerID(containerIDStr)
		if err != nil {
			if err == services.ErrContainerNotFound {
				c.JSON(http.StatusNotFound, gin.H{"error": "Container not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get container"})
			return
		}
		containerID = container.ID
	}

	if container.Status != models.ContainerStatusRunning {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Container is not running"})
		return
	}

	// Check if request is from internal Docker network (container-to-host communication)
	// These requests come from VS Code extension running inside containers
	clientIP := c.ClientIP()
	isInternalRequest := isDockerInternalIP(clientIP)

	// Authenticate via multiple sources:
	// 1. Internal Docker network - skip auth for container-internal requests
	// 2. Cookie (cc_token) - automatically sent with WebSocket for same-origin
	// 3. Query parameter (token) - fallback for cross-origin or explicit token
	
	if !isInternalRequest {
		var token string

		// Try cookie first (httpOnly cookie is sent automatically with WebSocket)
		if cookieToken, err := c.Cookie(middleware.TokenCookieName); err == nil && cookieToken != "" {
			token = cookieToken
		}

		// Fallback to query parameter
		if token == "" {
			token = c.Query("token")
		}

		if token == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Missing authentication token"})
			return
		}

		_, err = h.authService.VerifyToken(token)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid authentication token"})
			return
		}
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
