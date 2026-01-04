package services

import (
	"fmt"
	"time"

	"cc-platform/internal/models"

	"gorm.io/gorm"
)

// TaskQueueService manages task queues for containers.
type TaskQueueService struct {
	db *gorm.DB
}

// NewTaskQueueService creates a new task queue service.
func NewTaskQueueService(db *gorm.DB) *TaskQueueService {
	return &TaskQueueService{db: db}
}

// AddTask adds a new task to the queue.
func (s *TaskQueueService) AddTask(containerID uint, text string) (*models.Task, error) {
	if text == "" {
		return nil, fmt.Errorf("task text cannot be empty")
	}

	// Get the next order index
	var maxIndex int
	s.db.Model(&models.Task{}).
		Where("container_id = ?", containerID).
		Select("COALESCE(MAX(order_index), -1)").
		Scan(&maxIndex)

	task := &models.Task{
		ContainerID: containerID,
		OrderIndex:  maxIndex + 1,
		Text:        text,
		Status:      models.TaskStatusPending,
	}

	if err := s.db.Create(task).Error; err != nil {
		return nil, fmt.Errorf("failed to create task: %w", err)
	}

	return task, nil
}

// RemoveTask removes a task from the queue.
func (s *TaskQueueService) RemoveTask(containerID uint, taskID uint) error {
	result := s.db.Where("id = ? AND container_id = ?", taskID, containerID).Delete(&models.Task{})
	if result.Error != nil {
		return fmt.Errorf("failed to delete task: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return fmt.Errorf("task not found")
	}
	return nil
}

// GetTasks returns all tasks for a container ordered by index.
func (s *TaskQueueService) GetTasks(containerID uint) ([]models.Task, error) {
	var tasks []models.Task
	err := s.db.Where("container_id = ?", containerID).
		Order("order_index ASC").
		Find(&tasks).Error
	if err != nil {
		return nil, fmt.Errorf("failed to get tasks: %w", err)
	}
	return tasks, nil
}

// GetNextTask returns the next pending task in the queue.
func (s *TaskQueueService) GetNextTask(containerID uint) (*models.Task, error) {
	var task models.Task
	err := s.db.Where("container_id = ? AND status = ?", containerID, models.TaskStatusPending).
		Order("order_index ASC").
		First(&task).Error
	if err == gorm.ErrRecordNotFound {
		return nil, nil // No pending tasks
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get next task: %w", err)
	}
	return &task, nil
}

// GetCurrentTask returns the currently in-progress task.
func (s *TaskQueueService) GetCurrentTask(containerID uint) (*models.Task, error) {
	var task models.Task
	err := s.db.Where("container_id = ? AND status IN ?", containerID, 
		[]models.TaskStatus{models.TaskStatusInProgress, models.TaskStatusRunning}).
		First(&task).Error
	if err == gorm.ErrRecordNotFound {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get current task: %w", err)
	}
	return &task, nil
}

// UpdateTaskStatus updates the status of a task.
func (s *TaskQueueService) UpdateTaskStatus(taskID uint, status models.TaskStatus) error {
	updates := map[string]interface{}{
		"status": status,
	}

	// Set timestamps based on status
	now := time.Now()
	switch status {
	case models.TaskStatusInProgress:
		updates["started_at"] = now
	case models.TaskStatusCompleted, models.TaskStatusSkipped:
		updates["completed_at"] = now
	}

	result := s.db.Model(&models.Task{}).Where("id = ?", taskID).Updates(updates)
	if result.Error != nil {
		return fmt.Errorf("failed to update task status: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return fmt.Errorf("task not found")
	}
	return nil
}

// ReorderTasks reorders tasks based on the provided task IDs.
func (s *TaskQueueService) ReorderTasks(containerID uint, taskIDs []uint) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		for i, taskID := range taskIDs {
			result := tx.Model(&models.Task{}).
				Where("id = ? AND container_id = ?", taskID, containerID).
				Update("order_index", i)
			if result.Error != nil {
				return fmt.Errorf("failed to update task order: %w", result.Error)
			}
		}
		return nil
	})
}

// ClearTasks removes all tasks for a container.
func (s *TaskQueueService) ClearTasks(containerID uint) error {
	result := s.db.Where("container_id = ?", containerID).Delete(&models.Task{})
	if result.Error != nil {
		return fmt.Errorf("failed to clear tasks: %w", result.Error)
	}
	return nil
}

// ClearCompletedTasks removes all completed tasks for a container.
func (s *TaskQueueService) ClearCompletedTasks(containerID uint) error {
	result := s.db.Where("container_id = ? AND status IN ?", containerID,
		[]models.TaskStatus{models.TaskStatusCompleted, models.TaskStatusSkipped}).
		Delete(&models.Task{})
	if result.Error != nil {
		return fmt.Errorf("failed to clear completed tasks: %w", result.Error)
	}
	return nil
}

// GetTaskCount returns the number of tasks for a container.
func (s *TaskQueueService) GetTaskCount(containerID uint) (int64, error) {
	var count int64
	err := s.db.Model(&models.Task{}).Where("container_id = ?", containerID).Count(&count).Error
	if err != nil {
		return 0, fmt.Errorf("failed to count tasks: %w", err)
	}
	return count, nil
}

// GetPendingTaskCount returns the number of pending tasks.
func (s *TaskQueueService) GetPendingTaskCount(containerID uint) (int64, error) {
	var count int64
	err := s.db.Model(&models.Task{}).
		Where("container_id = ? AND status = ?", containerID, models.TaskStatusPending).
		Count(&count).Error
	if err != nil {
		return 0, fmt.Errorf("failed to count pending tasks: %w", err)
	}
	return count, nil
}

// MarkCurrentTaskCompleted marks the current in-progress task as completed.
func (s *TaskQueueService) MarkCurrentTaskCompleted(containerID uint) error {
	task, err := s.GetCurrentTask(containerID)
	if err != nil {
		return err
	}
	if task == nil {
		return nil // No current task
	}
	return s.UpdateTaskStatus(task.ID, models.TaskStatusCompleted)
}

// GetTask returns a specific task by ID.
func (s *TaskQueueService) GetTask(taskID uint) (*models.Task, error) {
	var task models.Task
	err := s.db.First(&task, taskID).Error
	if err == gorm.ErrRecordNotFound {
		return nil, fmt.Errorf("task not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get task: %w", err)
	}
	return &task, nil
}

// UpdateTask updates a task's text.
func (s *TaskQueueService) UpdateTask(taskID uint, text string) error {
	if text == "" {
		return fmt.Errorf("task text cannot be empty")
	}

	result := s.db.Model(&models.Task{}).Where("id = ?", taskID).Update("text", text)
	if result.Error != nil {
		return fmt.Errorf("failed to update task: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return fmt.Errorf("task not found")
	}
	return nil
}

// ValidateTaskStatus checks if a status transition is valid.
func ValidateTaskStatus(current, next models.TaskStatus) bool {
	validTransitions := map[models.TaskStatus][]models.TaskStatus{
		models.TaskStatusPending:    {models.TaskStatusInProgress, models.TaskStatusRunning, models.TaskStatusSkipped},
		models.TaskStatusInProgress: {models.TaskStatusCompleted, models.TaskStatusSkipped, models.TaskStatusFailed},
		models.TaskStatusRunning:    {models.TaskStatusCompleted, models.TaskStatusSkipped, models.TaskStatusFailed},
		models.TaskStatusCompleted:  {}, // Terminal state
		models.TaskStatusSkipped:    {}, // Terminal state
		models.TaskStatusFailed:     {models.TaskStatusPending}, // Can retry failed tasks
	}

	allowed, exists := validTransitions[current]
	if !exists {
		return false
	}

	for _, s := range allowed {
		if s == next {
			return true
		}
	}
	return false
}
