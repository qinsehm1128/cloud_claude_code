package handlers

import (
	"net/http"
	"strconv"

	"cc-platform/internal/services"

	"github.com/gin-gonic/gin"
)

// ContainerHandler handles container endpoints
type ContainerHandler struct {
	containerService *services.ContainerService
}

// NewContainerHandler creates a new ContainerHandler
func NewContainerHandler(containerService *services.ContainerService) *ContainerHandler {
	return &ContainerHandler{
		containerService: containerService,
	}
}

// CreateContainerRequest represents the request to create a container
type CreateContainerRequest struct {
	Name         string `json:"name" binding:"required"`
	RepositoryID uint   `json:"repository_id" binding:"required"`
}

// ListContainers lists all containers
func (h *ContainerHandler) ListContainers(c *gin.Context) {
	containers, err := h.containerService.ListContainers()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list containers"})
		return
	}

	// Convert to ContainerInfo
	result := make([]services.ContainerInfo, len(containers))
	for i, container := range containers {
		result[i] = services.ToContainerInfo(&container)
	}

	c.JSON(http.StatusOK, result)
}

// CreateContainer creates a new container
func (h *ContainerHandler) CreateContainer(c *gin.Context) {
	var req CreateContainerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	input := services.CreateContainerInput{
		Name:         req.Name,
		RepositoryID: req.RepositoryID,
	}

	container, err := h.containerService.CreateContainer(c.Request.Context(), input)
	if err != nil {
		switch err {
		case services.ErrNoAPIKeyConfigured:
			c.JSON(http.StatusBadRequest, gin.H{"error": "Claude API key not configured"})
		case services.ErrRepositoryNotFound:
			c.JSON(http.StatusNotFound, gin.H{"error": "Repository not found"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}

	c.JSON(http.StatusCreated, services.ToContainerInfo(container))
}

// GetContainer gets a container by ID
func (h *ContainerHandler) GetContainer(c *gin.Context) {
	id, err := parseID(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid container ID"})
		return
	}

	container, err := h.containerService.GetContainer(id)
	if err != nil {
		if err == services.ErrContainerNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Container not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get container"})
		return
	}

	c.JSON(http.StatusOK, services.ToContainerInfo(container))
}

// StartContainer starts a container
func (h *ContainerHandler) StartContainer(c *gin.Context) {
	id, err := parseID(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid container ID"})
		return
	}

	if err := h.containerService.StartContainer(c.Request.Context(), id); err != nil {
		if err == services.ErrContainerNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Container not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Container started successfully"})
}

// StopContainer stops a container
func (h *ContainerHandler) StopContainer(c *gin.Context) {
	id, err := parseID(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid container ID"})
		return
	}

	if err := h.containerService.StopContainer(c.Request.Context(), id); err != nil {
		if err == services.ErrContainerNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Container not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Container stopped successfully"})
}

// DeleteContainer deletes a container
func (h *ContainerHandler) DeleteContainer(c *gin.Context) {
	id, err := parseID(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid container ID"})
		return
	}

	if err := h.containerService.DeleteContainer(c.Request.Context(), id); err != nil {
		if err == services.ErrContainerNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Container not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Container deleted successfully"})
}

// parseID parses a string ID to uint
func parseID(idStr string) (uint, error) {
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		return 0, err
	}
	return uint(id), nil
}
