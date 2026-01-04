package handlers

import (
	"net/http"
	"strconv"

	"cc-platform/internal/models"
	"cc-platform/internal/services"

	"github.com/gin-gonic/gin"
)

// MonitoringHandler handles monitoring-related HTTP requests.
type MonitoringHandler struct {
	monitoringService *services.MonitoringService
}

// NewMonitoringHandler creates a new monitoring handler.
func NewMonitoringHandler(monitoringService *services.MonitoringService) *MonitoringHandler {
	return &MonitoringHandler{
		monitoringService: monitoringService,
	}
}

// GetStatus returns the monitoring status for a container.
// GET /api/monitoring/:containerId/status
func (h *MonitoringHandler) GetStatus(c *gin.Context) {
	containerID, err := strconv.ParseUint(c.Param("containerId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid container ID"})
		return
	}

	status, err := h.monitoringService.GetStatus(uint(containerID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, status)
}

// EnableMonitoring enables monitoring for a container.
// POST /api/monitoring/:containerId/enable
func (h *MonitoringHandler) EnableMonitoring(c *gin.Context) {
	containerID, err := strconv.ParseUint(c.Param("containerId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid container ID"})
		return
	}

	var config models.MonitoringConfig
	if err := c.ShouldBindJSON(&config); err != nil {
		// Use default config if not provided
		config = models.MonitoringConfig{
			SilenceThreshold:  30,
			ActiveStrategy:    models.StrategyWebhook,
			ContextBufferSize: 8192,
		}
	}

	if err := h.monitoringService.EnableMonitoring(uint(containerID), &config); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "monitoring enabled"})
}

// DisableMonitoring disables monitoring for a container.
// POST /api/monitoring/:containerId/disable
func (h *MonitoringHandler) DisableMonitoring(c *gin.Context) {
	containerID, err := strconv.ParseUint(c.Param("containerId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid container ID"})
		return
	}

	if err := h.monitoringService.DisableMonitoring(uint(containerID)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "monitoring disabled"})
}

// UpdateConfig updates the monitoring configuration.
// PUT /api/monitoring/:containerId/config
func (h *MonitoringHandler) UpdateConfig(c *gin.Context) {
	containerID, err := strconv.ParseUint(c.Param("containerId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid container ID"})
		return
	}

	var config models.MonitoringConfig
	if err := c.ShouldBindJSON(&config); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	if err := h.monitoringService.UpdateConfig(uint(containerID), &config); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "configuration updated"})
}

// GetConfig returns the monitoring configuration.
// GET /api/monitoring/:containerId/config
func (h *MonitoringHandler) GetConfig(c *gin.Context) {
	containerID, err := strconv.ParseUint(c.Param("containerId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid container ID"})
		return
	}

	config, err := h.monitoringService.GetConfig(uint(containerID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, config)
}

// GetContextBuffer returns the context buffer content.
// GET /api/monitoring/:containerId/context
func (h *MonitoringHandler) GetContextBuffer(c *gin.Context) {
	containerID, err := strconv.ParseUint(c.Param("containerId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid container ID"})
		return
	}

	buffer, err := h.monitoringService.GetContextBuffer(uint(containerID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"context": buffer})
}

// ListStrategies returns available automation strategies.
// GET /api/monitoring/strategies
func (h *MonitoringHandler) ListStrategies(c *gin.Context) {
	strategies := h.monitoringService.ListStrategies()
	c.JSON(http.StatusOK, strategies)
}

// RegisterRoutes registers monitoring routes with the router.
func (h *MonitoringHandler) RegisterRoutes(router *gin.RouterGroup) {
	monitoring := router.Group("/monitoring")
	{
		monitoring.GET("/strategies", h.ListStrategies)
		monitoring.GET("/:containerId/status", h.GetStatus)
		monitoring.POST("/:containerId/enable", h.EnableMonitoring)
		monitoring.POST("/:containerId/disable", h.DisableMonitoring)
		monitoring.GET("/:containerId/config", h.GetConfig)
		monitoring.PUT("/:containerId/config", h.UpdateConfig)
		monitoring.GET("/:containerId/context", h.GetContextBuffer)
	}
}
