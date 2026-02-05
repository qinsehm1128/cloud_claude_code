package handlers

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"cc-platform/internal/services"
	"cc-platform/internal/terminal"

	"github.com/gin-gonic/gin"
)

// ContainerHandler handles container endpoints
type ContainerHandler struct {
	containerService     *services.ContainerService
	terminalService      *terminal.TerminalService
	configProfileService *services.ConfigProfileService
}

// NewContainerHandler creates a new ContainerHandler
func NewContainerHandler(containerService *services.ContainerService, terminalService *terminal.TerminalService, configProfileService *services.ConfigProfileService) *ContainerHandler {
	return &ContainerHandler{
		containerService:     containerService,
		terminalService:      terminalService,
		configProfileService: configProfileService,
	}
}

// PortMappingRequest represents a port mapping in the request
type PortMappingRequest struct {
	ContainerPort int `json:"container_port"`
	HostPort      int `json:"host_port"`
}

// ProxyConfigRequest represents Traefik proxy configuration in the request
type ProxyConfigRequest struct {
	Enabled     bool   `json:"enabled"`                // Enable Traefik proxy
	Domain      string `json:"domain,omitempty"`       // Subdomain for domain-based access
	Port        int    `json:"port,omitempty"`         // Direct port access (9001-9010)
	ServicePort int    `json:"service_port,omitempty"` // Container internal service port
}

// CreateContainerRequest represents the request to create a container
type CreateContainerRequest struct {
	Name             string               `json:"name" binding:"required"`
	GitRepoURL       string               `json:"git_repo_url,omitempty"`       // GitHub repo URL (optional when SkipGitRepo=true)
	GitRepoName      string               `json:"git_repo_name,omitempty"`
	SkipClaudeInit   bool                 `json:"skip_claude_init,omitempty"`   // Skip Claude Code initialization
	MemoryLimit      int64                `json:"memory_limit,omitempty"`       // Memory limit in MB (0 = default 2048MB)
	CPULimit         float64              `json:"cpu_limit,omitempty"`          // CPU limit in cores (0 = default 1)
	PortMappings     []PortMappingRequest `json:"port_mappings,omitempty"`      // Legacy port mappings
	Proxy            ProxyConfigRequest   `json:"proxy,omitempty"`              // Traefik proxy configuration
	EnableCodeServer bool                 `json:"enable_code_server,omitempty"` // Enable code-server (Web VS Code)
	// Configuration profile references (nil/0 = use default)
	GitHubTokenID           *uint `json:"github_token_id,omitempty"`
	EnvVarsProfileID        *uint `json:"env_vars_profile_id,omitempty"`
	StartupCommandProfileID *uint `json:"startup_command_profile_id,omitempty"`
	// Claude Config Template selections
	SelectedClaudeMD *uint  `json:"selected_claude_md,omitempty"` // Single CLAUDE.MD template ID (optional)
	SelectedSkills   []uint `json:"selected_skills,omitempty"`    // Multiple Skill template IDs (optional)
	SelectedMCPs     []uint `json:"selected_mcps,omitempty"`      // Multiple MCP template IDs (optional)
	SelectedCommands []uint `json:"selected_commands,omitempty"`  // Multiple Command template IDs (optional)
	// Container creation options
	SkipGitRepo    bool `json:"skip_git_repo,omitempty"`    // Allow creating container without GitHub repository
	EnableYoloMode bool `json:"enable_yolo_mode,omitempty"` // Enable YOLO mode (--dangerously-skip-permissions)
	RunAsRoot      bool `json:"run_as_root,omitempty"`      // Run container as root user (default: false)
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

	// Convert port mappings
	portMappings := make([]services.PortMapping, len(req.PortMappings))
	for i, pm := range req.PortMappings {
		portMappings[i] = services.PortMapping{
			ContainerPort: pm.ContainerPort,
			HostPort:      pm.HostPort,
		}
	}

	input := services.CreateContainerInput{
		Name:                    req.Name,
		GitRepoURL:              req.GitRepoURL,
		GitRepoName:             req.GitRepoName,
		SkipClaudeInit:          req.SkipClaudeInit,
		MemoryLimit:             req.MemoryLimit,
		CPULimit:                req.CPULimit,
		PortMappings:            portMappings,
		EnableCodeServer:        req.EnableCodeServer,
		GitHubTokenID:           req.GitHubTokenID,
		EnvVarsProfileID:        req.EnvVarsProfileID,
		StartupCommandProfileID: req.StartupCommandProfileID,
		Proxy: services.ProxyConfig{
			Enabled:     req.Proxy.Enabled,
			Domain:      req.Proxy.Domain,
			Port:        req.Proxy.Port,
			ServicePort: req.Proxy.ServicePort,
		},
		// Claude Config Template selections
		SelectedClaudeMD: req.SelectedClaudeMD,
		SelectedSkills:   req.SelectedSkills,
		SelectedMCPs:     req.SelectedMCPs,
		SelectedCommands: req.SelectedCommands,
		// Container creation options
		SkipGitRepo:    req.SkipGitRepo,
		EnableYoloMode: req.EnableYoloMode,
		RunAsRoot:      req.RunAsRoot,
	}

	container, err := h.containerService.CreateContainer(c.Request.Context(), input)
	if err != nil {
		switch err {
		case services.ErrNoGitHubTokenConfigured:
			c.JSON(http.StatusBadRequest, gin.H{"error": "GitHub token not configured. Please configure it in Settings."})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"container": services.ToContainerInfo(container),
		"message":   "Container created and initialization started",
	})
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

// StartContainer starts a container (only if initialized)
func (h *ContainerHandler) StartContainer(c *gin.Context) {
	id, err := parseID(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid container ID"})
		return
	}

	if err := h.containerService.StartContainer(c.Request.Context(), id); err != nil {
		switch err {
		case services.ErrContainerNotFound:
			c.JSON(http.StatusNotFound, gin.H{"error": "Container not found"})
		case services.ErrContainerNotReady:
			c.JSON(http.StatusBadRequest, gin.H{"error": "Container initialization not complete. Please wait for initialization to finish."})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
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

	// Close active terminal sessions for this container first
	// This helps speed up container stop by closing PTY connections
	if h.terminalService != nil {
		closedSessions := h.terminalService.CloseSessionsForContainer(id)
		if closedSessions > 0 {
			// Log closed sessions count (optional)
			_ = closedSessions
		}
	}

	// Use a background context with timeout for Docker stop operation
	// Docker stop can take time if processes don't respond to SIGTERM
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	// Run stop operation in goroutine and return early if it takes too long
	errChan := make(chan error, 1)
	go func() {
		errChan <- h.containerService.StopContainer(ctx, id)
	}()

	// Wait for stop to complete or timeout after 10 seconds for HTTP response
	// The actual Docker stop will continue in background
	select {
	case err := <-errChan:
		if err != nil {
			if err == services.ErrContainerNotFound {
				c.JSON(http.StatusNotFound, gin.H{"error": "Container not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "Container stopped successfully"})
	case <-time.After(10 * time.Second):
		// Return success early - the stop operation will continue in background
		c.JSON(http.StatusAccepted, gin.H{"message": "Container stop initiated, please refresh to check status"})
	}
}

// DeleteContainer deletes a container
func (h *ContainerHandler) DeleteContainer(c *gin.Context) {
	id, err := parseID(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid container ID"})
		return
	}

	// Close active terminal sessions for this container first
	// This ensures monitoring sessions are also cleaned up
	if h.terminalService != nil {
		h.terminalService.CloseSessionsForContainer(id)
	}

	// Use a background context with timeout for Docker delete operation
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	// Run delete operation in goroutine and return early if it takes too long
	errChan := make(chan error, 1)
	go func() {
		errChan <- h.containerService.DeleteContainer(ctx, id)
	}()

	// Wait for delete to complete or timeout after 10 seconds for HTTP response
	select {
	case err := <-errChan:
		if err != nil {
			if err == services.ErrContainerNotFound {
				c.JSON(http.StatusNotFound, gin.H{"error": "Container not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "Container deleted successfully"})
	case <-time.After(10 * time.Second):
		// Return success early - the delete operation will continue in background
		c.JSON(http.StatusAccepted, gin.H{"message": "Container delete initiated, please refresh to check status"})
	}
}

// GetContainerStatus gets the current status of a container (for polling)
func (h *ContainerHandler) GetContainerStatus(c *gin.Context) {
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

	c.JSON(http.StatusOK, gin.H{
		"status":       container.Status,
		"init_status":  container.InitStatus,
		"init_message": container.InitMessage,
	})
}

// GetContainerLogs gets logs for a container
func (h *ContainerHandler) GetContainerLogs(c *gin.Context) {
	id, err := parseID(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid container ID"})
		return
	}

	// Get limit from query param, default 100
	limit := 100
	if limitStr := c.Query("limit"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			limit = l
		}
	}

	logs, err := h.containerService.GetContainerLogs(id, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get logs"})
		return
	}

	c.JSON(http.StatusOK, logs)
}

// ListDockerContainers lists all Docker containers (including orphaned ones)
func (h *ContainerHandler) ListDockerContainers(c *gin.Context) {
	containers, err := h.containerService.ListDockerContainers(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, containers)
}

// StopDockerContainer stops a Docker container by ID
func (h *ContainerHandler) StopDockerContainer(c *gin.Context) {
	dockerID := c.Param("dockerId")
	if dockerID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Docker container ID required"})
		return
	}

	if err := h.containerService.StopDockerContainer(c.Request.Context(), dockerID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Container stopped"})
}

// RemoveDockerContainer removes a Docker container by ID
func (h *ContainerHandler) RemoveDockerContainer(c *gin.Context) {
	dockerID := c.Param("dockerId")
	if dockerID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Docker container ID required"})
		return
	}

	if err := h.containerService.RemoveDockerContainer(c.Request.Context(), dockerID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Container removed"})
}

// parseID parses a string ID to uint
func parseID(idStr string) (uint, error) {
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		return 0, err
	}
	return uint(id), nil
}

// GetContainerApiConfig gets the API configuration for a container
// This returns the API URL and Token based on the container's env vars profile
func (h *ContainerHandler) GetContainerApiConfig(c *gin.Context) {
	id, err := parseID(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid container ID"})
		return
	}

	if h.configProfileService == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Config profile service not available"})
		return
	}

	apiConfig, err := h.configProfileService.GetApiConfigByContainerID(id)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, apiConfig)
}
