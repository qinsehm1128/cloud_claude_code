package handlers

import (
	"net/http"

	"cc-platform/internal/services"

	"github.com/gin-gonic/gin"
)

// PortHandler handles container port management
type PortHandler struct {
	portService *services.PortService
}

// NewPortHandler creates a new PortHandler
func NewPortHandler(portService *services.PortService) *PortHandler {
	return &PortHandler{
		portService: portService,
	}
}

// AddPortRequest represents the request to add a port
type AddPortRequest struct {
	Port     int    `json:"port" binding:"required,min=1,max=65535"`
	Name     string `json:"name"`
	Protocol string `json:"protocol"`
}

// ListPorts lists all ports for a container
func (h *PortHandler) ListPorts(c *gin.Context) {
	id, err := parseID(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid container ID"})
		return
	}

	ports, err := h.portService.ListPorts(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list ports"})
		return
	}

	c.JSON(http.StatusOK, ports)
}

// AddPort adds a port mapping to a container
func (h *PortHandler) AddPort(c *gin.Context) {
	id, err := parseID(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid container ID"})
		return
	}

	var req AddPortRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	protocol := req.Protocol
	if protocol == "" {
		protocol = "http"
	}

	port, err := h.portService.AddPort(id, req.Port, req.Name, protocol, false)
	if err != nil {
		if err == services.ErrPortAlreadyExists {
			c.JSON(http.StatusConflict, gin.H{"error": "Port already exists"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, port)
}

// RemovePort removes a port mapping from a container
func (h *PortHandler) RemovePort(c *gin.Context) {
	id, err := parseID(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid container ID"})
		return
	}

	portStr := c.Param("port")
	port, err := parseID(portStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid port"})
		return
	}

	if err := h.portService.RemovePort(id, int(port)); err != nil {
		if err == services.ErrPortNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Port not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Port removed"})
}

// ListAllPorts lists all exposed ports across all containers
func (h *PortHandler) ListAllPorts(c *gin.Context) {
	ports, err := h.portService.ListAllPorts()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list ports"})
		return
	}

	c.JSON(http.StatusOK, ports)
}
