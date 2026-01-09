package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"cc-platform/internal/services"

	"github.com/gin-gonic/gin"
)

// ConfigProfileHandler handles configuration profile endpoints
type ConfigProfileHandler struct {
	service *services.ConfigProfileService
}

// NewConfigProfileHandler creates a new ConfigProfileHandler
func NewConfigProfileHandler(service *services.ConfigProfileService) *ConfigProfileHandler {
	return &ConfigProfileHandler{
		service: service,
	}
}

// RegisterRoutes registers all config profile routes
func (h *ConfigProfileHandler) RegisterRoutes(rg *gin.RouterGroup) {
	// GitHub Tokens
	tokens := rg.Group("/github-tokens")
	{
		tokens.GET("", h.ListGitHubTokens)
		tokens.POST("", h.CreateGitHubToken)
		tokens.PUT("/:id", h.UpdateGitHubToken)
		tokens.DELETE("/:id", h.DeleteGitHubToken)
		tokens.PUT("/:id/default", h.SetDefaultGitHubToken)
	}

	// Env Profiles
	envProfiles := rg.Group("/env-profiles")
	{
		envProfiles.GET("", h.ListEnvProfiles)
		envProfiles.POST("", h.CreateEnvProfile)
		envProfiles.PUT("/:id", h.UpdateEnvProfile)
		envProfiles.DELETE("/:id", h.DeleteEnvProfile)
		envProfiles.PUT("/:id/default", h.SetDefaultEnvProfile)
	}

	// Command Profiles
	cmdProfiles := rg.Group("/command-profiles")
	{
		cmdProfiles.GET("", h.ListCommandProfiles)
		cmdProfiles.POST("", h.CreateCommandProfile)
		cmdProfiles.PUT("/:id", h.UpdateCommandProfile)
		cmdProfiles.DELETE("/:id", h.DeleteCommandProfile)
		cmdProfiles.PUT("/:id/default", h.SetDefaultCommandProfile)
	}
}

// ==================== GitHub Token Handlers ====================

// ListGitHubTokens returns all GitHub tokens
func (h *ConfigProfileHandler) ListGitHubTokens(c *gin.Context) {
	tokens, err := h.service.ListGitHubTokens()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list tokens"})
		return
	}
	c.JSON(http.StatusOK, tokens)
}

// CreateGitHubToken creates a new GitHub token
func (h *ConfigProfileHandler) CreateGitHubToken(c *gin.Context) {
	var input services.CreateGitHubTokenInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body: " + err.Error()})
		return
	}

	token, err := h.service.CreateGitHubToken(input)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create token: " + err.Error()})
		return
	}

	c.JSON(http.StatusCreated, token)
}

// UpdateGitHubToken updates a GitHub token
func (h *ConfigProfileHandler) UpdateGitHubToken(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	var input services.UpdateGitHubTokenInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	if err := h.service.UpdateGitHubToken(uint(id), input); err != nil {
		if err == services.ErrTokenNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Token not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Token updated successfully"})
}

// DeleteGitHubToken deletes a GitHub token
func (h *ConfigProfileHandler) DeleteGitHubToken(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	if err := h.service.DeleteGitHubToken(uint(id)); err != nil {
		if err == services.ErrTokenNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Token not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Token deleted successfully"})
}

// SetDefaultGitHubToken sets a token as default
func (h *ConfigProfileHandler) SetDefaultGitHubToken(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	if err := h.service.SetDefaultGitHubToken(uint(id)); err != nil {
		if err == services.ErrTokenNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Token not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to set default token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Default token set successfully"})
}

// ==================== Env Profile Handlers ====================

// ListEnvProfiles returns all environment variable profiles
func (h *ConfigProfileHandler) ListEnvProfiles(c *gin.Context) {
	profiles, err := h.service.ListEnvProfiles()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list profiles"})
		return
	}
	c.JSON(http.StatusOK, profiles)
}

// CreateEnvProfile creates a new environment variables profile
func (h *ConfigProfileHandler) CreateEnvProfile(c *gin.Context) {
	var input services.CreateEnvProfileInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body: " + err.Error()})
		return
	}

	profile, err := h.service.CreateEnvProfile(input)
	if err != nil {
		if err == services.ErrInvalidEnvVars || strings.HasPrefix(err.Error(), "invalid variable name:") {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create profile: " + err.Error()})
		return
	}

	c.JSON(http.StatusCreated, profile)
}

// UpdateEnvProfile updates an environment variables profile
func (h *ConfigProfileHandler) UpdateEnvProfile(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	var input services.UpdateEnvProfileInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	if err := h.service.UpdateEnvProfile(uint(id), input); err != nil {
		if err == services.ErrProfileNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Profile not found"})
			return
		}
		if err == services.ErrInvalidEnvVars || strings.HasPrefix(err.Error(), "invalid variable name:") {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update profile"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Profile updated successfully"})
}

// DeleteEnvProfile deletes an environment variables profile
func (h *ConfigProfileHandler) DeleteEnvProfile(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	if err := h.service.DeleteEnvProfile(uint(id)); err != nil {
		if err == services.ErrProfileNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Profile not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete profile"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Profile deleted successfully"})
}

// SetDefaultEnvProfile sets a profile as default
func (h *ConfigProfileHandler) SetDefaultEnvProfile(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	if err := h.service.SetDefaultEnvProfile(uint(id)); err != nil {
		if err == services.ErrProfileNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Profile not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to set default profile"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Default profile set successfully"})
}

// ==================== Command Profile Handlers ====================

// ListCommandProfiles returns all startup command profiles
func (h *ConfigProfileHandler) ListCommandProfiles(c *gin.Context) {
	profiles, err := h.service.ListCommandProfiles()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list profiles"})
		return
	}
	c.JSON(http.StatusOK, profiles)
}

// CreateCommandProfile creates a new startup command profile
func (h *ConfigProfileHandler) CreateCommandProfile(c *gin.Context) {
	var input services.CreateCommandProfileInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body: " + err.Error()})
		return
	}

	profile, err := h.service.CreateCommandProfile(input)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create profile: " + err.Error()})
		return
	}

	c.JSON(http.StatusCreated, profile)
}

// UpdateCommandProfile updates a startup command profile
func (h *ConfigProfileHandler) UpdateCommandProfile(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	var input services.UpdateCommandProfileInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	if err := h.service.UpdateCommandProfile(uint(id), input); err != nil {
		if err == services.ErrProfileNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Profile not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update profile"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Profile updated successfully"})
}

// DeleteCommandProfile deletes a startup command profile
func (h *ConfigProfileHandler) DeleteCommandProfile(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	if err := h.service.DeleteCommandProfile(uint(id)); err != nil {
		if err == services.ErrProfileNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Profile not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete profile"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Profile deleted successfully"})
}

// SetDefaultCommandProfile sets a profile as default
func (h *ConfigProfileHandler) SetDefaultCommandProfile(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	if err := h.service.SetDefaultCommandProfile(uint(id)); err != nil {
		if err == services.ErrProfileNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Profile not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to set default profile"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Default profile set successfully"})
}
