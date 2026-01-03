package handlers

import (
	"net/http"

	"cc-platform/internal/services"

	"github.com/gin-gonic/gin"
)

// SettingsHandler handles settings endpoints
type SettingsHandler struct {
	githubService *services.GitHubService
	claudeService *services.ClaudeConfigService
}

// NewSettingsHandler creates a new SettingsHandler
func NewSettingsHandler(githubService *services.GitHubService, claudeService *services.ClaudeConfigService) *SettingsHandler {
	return &SettingsHandler{
		githubService: githubService,
		claudeService: claudeService,
	}
}

// GitHubTokenRequest represents the request to save GitHub token
type GitHubTokenRequest struct {
	Token string `json:"token" binding:"required"`
}

// GitHubTokenResponse represents the response for GitHub token status
type GitHubTokenResponse struct {
	Configured bool `json:"configured"`
}

// GetGitHubConfig returns GitHub configuration status
func (h *SettingsHandler) GetGitHubConfig(c *gin.Context) {
	configured := h.githubService.HasToken()
	c.JSON(http.StatusOK, GitHubTokenResponse{Configured: configured})
}

// SaveGitHubToken saves GitHub token
func (h *SettingsHandler) SaveGitHubToken(c *gin.Context) {
	var req GitHubTokenRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	if err := h.githubService.SaveToken(req.Token); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "GitHub token saved successfully"})
}

// ClaudeConfigRequest represents the request to save Claude configuration
type ClaudeConfigRequest struct {
	CustomEnvVars  string `json:"custom_env_vars"`
	StartupCommand string `json:"startup_command"`
}

// GetClaudeConfig returns Claude Code configuration
func (h *SettingsHandler) GetClaudeConfig(c *gin.Context) {
	config, err := h.claudeService.GetConfig()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get configuration"})
		return
	}

	c.JSON(http.StatusOK, config)
}

// SaveClaudeConfig saves Claude Code configuration
func (h *SettingsHandler) SaveClaudeConfig(c *gin.Context) {
	var req ClaudeConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	input := services.ClaudeConfigInput{
		CustomEnvVars:  req.CustomEnvVars,
		StartupCommand: req.StartupCommand,
	}

	if err := h.claudeService.SaveConfig(input); err != nil {
		if err == services.ErrInvalidEnvVarFormat {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid environment variable format. Use VAR_NAME=value format."})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save configuration"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Claude configuration saved successfully"})
}

// ValidateEnvVarsRequest represents the request to validate env vars
type ValidateEnvVarsRequest struct {
	EnvVars string `json:"env_vars" binding:"required"`
}

// ValidateEnvVars validates environment variable format
func (h *SettingsHandler) ValidateEnvVars(c *gin.Context) {
	var req ValidateEnvVarsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	_, err := h.claudeService.ParseEnvVars(req.EnvVars)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"valid": false,
			"error": "Invalid format. Use VAR_NAME=value format (one per line). VAR_NAME must match [A-Z_][A-Z0-9_]*",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{"valid": true})
}
