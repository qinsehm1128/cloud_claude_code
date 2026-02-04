package handlers

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"cc-platform/internal/models"
	"cc-platform/internal/services"

	"github.com/gin-gonic/gin"
)

// ConfigTemplateHandler handles Claude config template endpoints
type ConfigTemplateHandler struct {
	service services.ConfigTemplateService
}

// NewConfigTemplateHandler creates a new ConfigTemplateHandler
func NewConfigTemplateHandler(service services.ConfigTemplateService) *ConfigTemplateHandler {
	return &ConfigTemplateHandler{
		service: service,
	}
}

// RegisterRoutes registers all config template routes
func (h *ConfigTemplateHandler) RegisterRoutes(rg *gin.RouterGroup) {
	configs := rg.Group("/claude-configs")
	{
		configs.POST("", h.CreateTemplate)
		configs.GET("", h.ListTemplates)
		configs.GET("/:id", h.GetTemplate)
		configs.PUT("/:id", h.UpdateTemplate)
		configs.DELETE("/:id", h.DeleteTemplate)
	}
}

// CreateTemplate creates a new config template
// POST /api/claude-configs
func (h *ConfigTemplateHandler) CreateTemplate(c *gin.Context) {
	var input services.CreateConfigTemplateInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body: " + err.Error()})
		return
	}

	template, err := h.service.Create(input)
	if err != nil {
		// Handle specific error types
		if errors.Is(err, services.ErrInvalidConfigType) {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if errors.Is(err, services.ErrDuplicateTemplateName) || strings.Contains(err.Error(), "already exists") {
			c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
			return
		}
		// Validation errors (MCP JSON, etc.)
		if strings.Contains(err.Error(), "invalid MCP configuration") ||
			strings.Contains(err.Error(), "invalid frontmatter") ||
			strings.Contains(err.Error(), "content cannot be empty") {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create template: " + err.Error()})
		return
	}

	c.JSON(http.StatusCreated, template)
}

// ListTemplates returns all config templates, optionally filtered by type
// GET /api/claude-configs?type=SKILL
func (h *ConfigTemplateHandler) ListTemplates(c *gin.Context) {
	var configType *models.ConfigType

	// Check for type query parameter
	typeParam := c.Query("type")
	if typeParam != "" {
		ct := models.ConfigType(typeParam)
		if !ct.IsValid() {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid config_type, must be one of: CLAUDE_MD, SKILL, MCP, COMMAND"})
			return
		}
		configType = &ct
	}

	templates, err := h.service.List(configType)
	if err != nil {
		if errors.Is(err, services.ErrInvalidConfigType) {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list templates"})
		return
	}

	c.JSON(http.StatusOK, templates)
}

// GetTemplate returns a single config template by ID
// GET /api/claude-configs/:id
func (h *ConfigTemplateHandler) GetTemplate(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	template, err := h.service.GetByID(uint(id))
	if err != nil {
		if errors.Is(err, services.ErrTemplateNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "template not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get template"})
		return
	}

	c.JSON(http.StatusOK, template)
}

// UpdateTemplate updates an existing config template
// PUT /api/claude-configs/:id
func (h *ConfigTemplateHandler) UpdateTemplate(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	var input services.UpdateConfigTemplateInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body: " + err.Error()})
		return
	}

	template, err := h.service.Update(uint(id), input)
	if err != nil {
		if errors.Is(err, services.ErrTemplateNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "template not found"})
			return
		}
		if errors.Is(err, services.ErrDuplicateTemplateName) || strings.Contains(err.Error(), "already exists") {
			c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
			return
		}
		// Validation errors
		if strings.Contains(err.Error(), "invalid MCP configuration") ||
			strings.Contains(err.Error(), "invalid frontmatter") ||
			strings.Contains(err.Error(), "content cannot be empty") {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update template"})
		return
	}

	c.JSON(http.StatusOK, template)
}

// DeleteTemplate deletes a config template by ID
// DELETE /api/claude-configs/:id
func (h *ConfigTemplateHandler) DeleteTemplate(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	if err := h.service.Delete(uint(id)); err != nil {
		if errors.Is(err, services.ErrTemplateNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "template not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete template"})
		return
	}

	c.JSON(http.StatusNoContent, nil)
}
