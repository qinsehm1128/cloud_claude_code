package handlers

import (
	"net/http"
	"strconv"

	"cc-platform/internal/models"
	"cc-platform/internal/services"

	"github.com/gin-gonic/gin"
)

// TaskQueueHandler handles task queue HTTP requests.
type TaskQueueHandler struct {
	taskService *services.TaskQueueService
}

// NewTaskQueueHandler creates a new task queue handler.
func NewTaskQueueHandler(taskService *services.TaskQueueService) *TaskQueueHandler {
	return &TaskQueueHandler{
		taskService: taskService,
	}
}

// GetTasks returns all tasks for a container.
// GET /api/tasks/:containerId
func (h *TaskQueueHandler) GetTasks(c *gin.Context) {
	containerID, err := strconv.ParseUint(c.Param("containerId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid container ID"})
		return
	}

	tasks, err := h.taskService.GetTasks(uint(containerID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, tasks)
}

// AddTask adds a new task to the queue.
// POST /api/tasks/:containerId
func (h *TaskQueueHandler) AddTask(c *gin.Context) {
	containerID, err := strconv.ParseUint(c.Param("containerId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid container ID"})
		return
	}

	var req struct {
		Text string `json:"text" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "text is required"})
		return
	}

	task, err := h.taskService.AddTask(uint(containerID), req.Text)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, task)
}

// UpdateTask updates a task.
// PUT /api/tasks/:containerId/:taskId
func (h *TaskQueueHandler) UpdateTask(c *gin.Context) {
	_, err := strconv.ParseUint(c.Param("containerId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid container ID"})
		return
	}

	taskID, err := strconv.ParseUint(c.Param("taskId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid task ID"})
		return
	}

	var req struct {
		Text   string            `json:"text,omitempty"`
		Status models.TaskStatus `json:"status,omitempty"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	// Update text if provided
	if req.Text != "" {
		if err := h.taskService.UpdateTask(uint(taskID), req.Text); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	// Update status if provided
	if req.Status != "" {
		// Get current task to validate transition
		task, err := h.taskService.GetTask(uint(taskID))
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}

		if !services.ValidateTaskStatus(task.Status, req.Status) {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "invalid status transition",
				"from":  task.Status,
				"to":    req.Status,
			})
			return
		}

		if err := h.taskService.UpdateTaskStatus(uint(taskID), req.Status); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "task updated"})
}

// DeleteTask removes a task from the queue.
// DELETE /api/tasks/:containerId/:taskId
func (h *TaskQueueHandler) DeleteTask(c *gin.Context) {
	containerID, err := strconv.ParseUint(c.Param("containerId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid container ID"})
		return
	}

	taskID, err := strconv.ParseUint(c.Param("taskId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid task ID"})
		return
	}

	if err := h.taskService.RemoveTask(uint(containerID), uint(taskID)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "task deleted"})
}

// ReorderTasks reorders tasks in the queue.
// POST /api/tasks/:containerId/reorder
func (h *TaskQueueHandler) ReorderTasks(c *gin.Context) {
	containerID, err := strconv.ParseUint(c.Param("containerId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid container ID"})
		return
	}

	var req struct {
		TaskIDs []uint `json:"task_ids" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "task_ids is required"})
		return
	}

	if err := h.taskService.ReorderTasks(uint(containerID), req.TaskIDs); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "tasks reordered"})
}

// ClearTasks removes all tasks for a container.
// DELETE /api/tasks/:containerId/clear
func (h *TaskQueueHandler) ClearTasks(c *gin.Context) {
	containerID, err := strconv.ParseUint(c.Param("containerId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid container ID"})
		return
	}

	if err := h.taskService.ClearTasks(uint(containerID)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "tasks cleared"})
}

// ClearCompletedTasks removes completed tasks for a container.
// DELETE /api/tasks/:containerId/clear-completed
func (h *TaskQueueHandler) ClearCompletedTasks(c *gin.Context) {
	containerID, err := strconv.ParseUint(c.Param("containerId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid container ID"})
		return
	}

	if err := h.taskService.ClearCompletedTasks(uint(containerID)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "completed tasks cleared"})
}

// GetTaskCount returns the task count for a container.
// GET /api/tasks/:containerId/count
func (h *TaskQueueHandler) GetTaskCount(c *gin.Context) {
	containerID, err := strconv.ParseUint(c.Param("containerId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid container ID"})
		return
	}

	total, err := h.taskService.GetTaskCount(uint(containerID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	pending, err := h.taskService.GetPendingTaskCount(uint(containerID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"total":   total,
		"pending": pending,
	})
}

// RegisterRoutes registers task queue routes with the router.
func (h *TaskQueueHandler) RegisterRoutes(router *gin.RouterGroup) {
	tasks := router.Group("/tasks")
	{
		tasks.GET("/:containerId", h.GetTasks)
		tasks.POST("/:containerId", h.AddTask)
		tasks.PUT("/:containerId/:taskId", h.UpdateTask)
		tasks.DELETE("/:containerId/:taskId", h.DeleteTask)
		tasks.POST("/:containerId/reorder", h.ReorderTasks)
		tasks.DELETE("/:containerId/clear", h.ClearTasks)
		tasks.DELETE("/:containerId/clear-completed", h.ClearCompletedTasks)
		tasks.GET("/:containerId/count", h.GetTaskCount)
	}
}
