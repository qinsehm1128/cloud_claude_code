package handlers

import (
	"net/http"
	"strconv"
	"time"

	"cc-platform/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// AutomationLogsHandler handles automation log API requests.
type AutomationLogsHandler struct {
	db *gorm.DB
}

// NewAutomationLogsHandler creates a new automation logs handler.
func NewAutomationLogsHandler(db *gorm.DB) *AutomationLogsHandler {
	return &AutomationLogsHandler{db: db}
}

// LogsResponse represents the response for listing logs.
type LogsResponse struct {
	Logs       []models.AutomationLog `json:"logs"`
	Total      int64                  `json:"total"`
	Page       int                    `json:"page"`
	PageSize   int                    `json:"page_size"`
	TotalPages int                    `json:"total_pages"`
}

// ListLogs returns automation logs with filtering and pagination.
// GET /api/logs/automation
// Query params:
// - container_id: filter by container ID
// - strategy: filter by strategy type
// - result: filter by result (success, failed, skipped)
// - from: filter logs from this timestamp (Unix)
// - to: filter logs until this timestamp (Unix)
// - page: page number (default 1)
// - page_size: items per page (default 20, max 100)
func (h *AutomationLogsHandler) ListLogs(c *gin.Context) {
	// Parse query parameters
	containerIDStr := c.Query("container_id")
	strategy := c.Query("strategy")
	result := c.Query("result")
	fromStr := c.Query("from")
	toStr := c.Query("to")
	pageStr := c.DefaultQuery("page", "1")
	pageSizeStr := c.DefaultQuery("page_size", "20")

	// Parse pagination
	page, err := strconv.Atoi(pageStr)
	if err != nil || page < 1 {
		page = 1
	}

	pageSize, err := strconv.Atoi(pageSizeStr)
	if err != nil || pageSize < 1 {
		pageSize = 20
	}
	if pageSize > 100 {
		pageSize = 100
	}

	// Build query
	query := h.db.Model(&models.AutomationLog{})

	// Apply filters
	if containerIDStr != "" {
		containerID, err := strconv.ParseUint(containerIDStr, 10, 64)
		if err == nil {
			query = query.Where("container_id = ?", containerID)
		}
	}

	if strategy != "" {
		query = query.Where("strategy_type = ?", strategy)
	}

	if result != "" {
		query = query.Where("result = ?", result)
	}

	if fromStr != "" {
		fromTimestamp, err := strconv.ParseInt(fromStr, 10, 64)
		if err == nil {
			fromTime := time.Unix(fromTimestamp, 0)
			query = query.Where("created_at >= ?", fromTime)
		}
	}

	if toStr != "" {
		toTimestamp, err := strconv.ParseInt(toStr, 10, 64)
		if err == nil {
			toTime := time.Unix(toTimestamp, 0)
			query = query.Where("created_at <= ?", toTime)
		}
	}

	// Get total count
	var total int64
	if err := query.Count(&total).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to count logs"})
		return
	}

	// Calculate pagination
	offset := (page - 1) * pageSize
	totalPages := int((total + int64(pageSize) - 1) / int64(pageSize))

	// Get logs
	var logs []models.AutomationLog
	if err := query.Order("created_at DESC").Offset(offset).Limit(pageSize).Find(&logs).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch logs"})
		return
	}

	c.JSON(http.StatusOK, LogsResponse{
		Logs:       logs,
		Total:      total,
		Page:       page,
		PageSize:   pageSize,
		TotalPages: totalPages,
	})
}

// GetLog returns a single automation log by ID.
// GET /api/logs/automation/:id
func (h *AutomationLogsHandler) GetLog(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid log ID"})
		return
	}

	var log models.AutomationLog
	if err := h.db.First(&log, id).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Log not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch log"})
		return
	}

	c.JSON(http.StatusOK, log)
}

// GetLogsByContainer returns logs for a specific container.
// GET /api/logs/automation/container/:containerId
func (h *AutomationLogsHandler) GetLogsByContainer(c *gin.Context) {
	containerIDStr := c.Param("containerId")
	containerID, err := strconv.ParseUint(containerIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid container ID"})
		return
	}

	limitStr := c.DefaultQuery("limit", "50")
	limit, err := strconv.Atoi(limitStr)
	if err != nil || limit < 1 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}

	var logs []models.AutomationLog
	if err := h.db.Where("container_id = ?", containerID).
		Order("created_at DESC").
		Limit(limit).
		Find(&logs).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch logs"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"logs":  logs,
		"count": len(logs),
	})
}

// GetLogStats returns statistics about automation logs.
// GET /api/logs/automation/stats
func (h *AutomationLogsHandler) GetLogStats(c *gin.Context) {
	containerIDStr := c.Query("container_id")

	type StrategyStats struct {
		StrategyType string `json:"strategy_type"`
		Count        int64  `json:"count"`
		SuccessCount int64  `json:"success_count"`
		FailedCount  int64  `json:"failed_count"`
	}

	query := h.db.Model(&models.AutomationLog{})
	if containerIDStr != "" {
		containerID, err := strconv.ParseUint(containerIDStr, 10, 64)
		if err == nil {
			query = query.Where("container_id = ?", containerID)
		}
	}

	// Get total count
	var totalCount int64
	query.Count(&totalCount)

	// Get counts by strategy
	var strategyStats []StrategyStats
	h.db.Model(&models.AutomationLog{}).
		Select("strategy_type, COUNT(*) as count, "+
			"SUM(CASE WHEN result = 'success' THEN 1 ELSE 0 END) as success_count, "+
			"SUM(CASE WHEN result = 'failed' THEN 1 ELSE 0 END) as failed_count").
		Group("strategy_type").
		Scan(&strategyStats)

	// Get recent activity (last 24 hours)
	var recentCount int64
	h.db.Model(&models.AutomationLog{}).
		Where("created_at >= ?", time.Now().Add(-24*time.Hour)).
		Count(&recentCount)

	c.JSON(http.StatusOK, gin.H{
		"total_count":     totalCount,
		"recent_count":    recentCount,
		"strategy_stats":  strategyStats,
	})
}

// DeleteOldLogs deletes logs older than the specified number of days.
// DELETE /api/logs/automation/cleanup
func (h *AutomationLogsHandler) DeleteOldLogs(c *gin.Context) {
	daysStr := c.DefaultQuery("days", "30")
	days, err := strconv.Atoi(daysStr)
	if err != nil || days < 1 {
		days = 30
	}

	cutoff := time.Now().AddDate(0, 0, -days)

	result := h.db.Where("created_at < ?", cutoff).Delete(&models.AutomationLog{})
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete logs"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"deleted_count": result.RowsAffected,
		"cutoff_date":   cutoff.Format(time.RFC3339),
	})
}

// ExportLogs exports logs as JSON.
// GET /api/logs/automation/export
func (h *AutomationLogsHandler) ExportLogs(c *gin.Context) {
	containerIDStr := c.Query("container_id")
	fromStr := c.Query("from")
	toStr := c.Query("to")

	query := h.db.Model(&models.AutomationLog{})

	if containerIDStr != "" {
		containerID, err := strconv.ParseUint(containerIDStr, 10, 64)
		if err == nil {
			query = query.Where("container_id = ?", containerID)
		}
	}

	if fromStr != "" {
		fromTimestamp, err := strconv.ParseInt(fromStr, 10, 64)
		if err == nil {
			fromTime := time.Unix(fromTimestamp, 0)
			query = query.Where("created_at >= ?", fromTime)
		}
	}

	if toStr != "" {
		toTimestamp, err := strconv.ParseInt(toStr, 10, 64)
		if err == nil {
			toTime := time.Unix(toTimestamp, 0)
			query = query.Where("created_at <= ?", toTime)
		}
	}

	var logs []models.AutomationLog
	if err := query.Order("created_at DESC").Limit(10000).Find(&logs).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to export logs"})
		return
	}

	// Set headers for file download
	c.Header("Content-Disposition", "attachment; filename=automation_logs.json")
	c.Header("Content-Type", "application/json")

	c.JSON(http.StatusOK, gin.H{
		"exported_at": time.Now().Format(time.RFC3339),
		"count":       len(logs),
		"logs":        logs,
	})
}
