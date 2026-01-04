package monitoring

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	"cc-platform/internal/models"
)

// TaskQueueInterface defines the interface for task queue operations
// This avoids import cycles with the services package
type TaskQueueInterface interface {
	GetNextTask(containerID uint) (*models.Task, error)
	GetTasks(containerID uint) ([]models.Task, error)
	UpdateTaskStatus(taskID uint, status models.TaskStatus) error
	GetPendingTaskCount(containerID uint) (int64, error)
}

// StrategyContext holds context information for strategy execution
type StrategyContext struct {
	ContainerID   uint
	SessionID     string
	ContextBuffer string
	Config        *models.MonitoringConfig
}

// QueueStrategy implements the task queue strategy
// When silence is detected, it dequeues the next task and injects it into the PTY
type QueueStrategy struct {
	taskService      TaskQueueInterface
	injectionHandler func(containerId uint, sessionId string, command string) error
	notifyHandler    func(containerId uint, message string)
}

// NewQueueStrategy creates a new queue strategy
func NewQueueStrategy(
	taskService TaskQueueInterface,
	injectionHandler func(containerId uint, sessionId string, command string) error,
	notifyHandler func(containerId uint, message string),
) *QueueStrategy {
	return &QueueStrategy{
		taskService:      taskService,
		injectionHandler: injectionHandler,
		notifyHandler:    notifyHandler,
	}
}

// QueueStrategyConfig holds configuration for the queue strategy
type QueueStrategyConfig struct {
	UserPromptTemplate    string // Template for combining with task text
	QueueEmptyNotify      bool   // Whether to notify when queue is empty
	AutoAdvance           bool   // Whether to automatically advance to next task
	TaskCompletionMarker  string // Marker to detect task completion (optional)
}

// DefaultQueueStrategyConfig returns default configuration
func DefaultQueueStrategyConfig() QueueStrategyConfig {
	return QueueStrategyConfig{
		UserPromptTemplate:   "请继续执行以下任务:",
		QueueEmptyNotify:     true,
		AutoAdvance:          true,
		TaskCompletionMarker: "",
	}
}

// QueueStrategyResult represents the result of executing the queue strategy
type QueueStrategyResult struct {
	Success     bool
	TaskID      int
	TaskText    string
	Action      string // "injected", "queue_empty", "error"
	Error       error
	Timestamp   time.Time
}

// Execute executes the queue strategy
func (s *QueueStrategy) Execute(ctx *StrategyContext, config QueueStrategyConfig) QueueStrategyResult {
	result := QueueStrategyResult{
		Timestamp: time.Now(),
	}

	// Get the next pending task
	task, err := s.taskService.GetNextTask(ctx.ContainerID)
	if err != nil {
		result.Success = false
		result.Action = "error"
		result.Error = fmt.Errorf("failed to get next task: %w", err)
		log.Printf("[QueueStrategy] Error getting next task for container %d: %v", ctx.ContainerID, err)
		return result
	}

	// Check if queue is empty
	if task == nil {
		result.Success = true
		result.Action = "queue_empty"
		
		if config.QueueEmptyNotify && s.notifyHandler != nil {
			s.notifyHandler(ctx.ContainerID, "任务队列已空，所有任务已完成")
		}
		
		log.Printf("[QueueStrategy] Queue empty for container %d", ctx.ContainerID)
		return result
	}

	result.TaskID = int(task.ID)
	result.TaskText = task.Text

	// Build the injection command
	command := s.buildCommand(task.Text, config.UserPromptTemplate, ctx)

	// Update task status to running
	if err := s.taskService.UpdateTaskStatus(task.ID, models.TaskStatusInProgress); err != nil {
		log.Printf("[QueueStrategy] Warning: failed to update task status to running: %v", err)
	}

	// Inject the command
	if s.injectionHandler != nil {
		if err := s.injectionHandler(ctx.ContainerID, ctx.SessionID, command); err != nil {
			result.Success = false
			result.Action = "error"
			result.Error = fmt.Errorf("failed to inject task: %w", err)
			
			// Mark task as failed
			if updateErr := s.taskService.UpdateTaskStatus(task.ID, models.TaskStatusFailed); updateErr != nil {
				log.Printf("[QueueStrategy] Warning: failed to update task status to failed: %v", updateErr)
			}
			
			log.Printf("[QueueStrategy] Error injecting task %d for container %d: %v", task.ID, ctx.ContainerID, err)
			return result
		}
	}

	result.Success = true
	result.Action = "injected"
	
	log.Printf("[QueueStrategy] Successfully injected task %d for container %d: %s", task.ID, ctx.ContainerID, task.Text)
	return result
}

// buildCommand builds the injection command from template and task text
func (s *QueueStrategy) buildCommand(taskText string, template string, ctx *StrategyContext) string {
	var command string
	
	if template != "" {
		// Combine template with task text
		command = template + "\n" + taskText
	} else {
		command = taskText
	}

	// Expand placeholders
	command = strings.ReplaceAll(command, "{container_id}", fmt.Sprintf("%d", ctx.ContainerID))
	command = strings.ReplaceAll(command, "{session_id}", ctx.SessionID)
	command = strings.ReplaceAll(command, "{timestamp}", time.Now().Format(time.RFC3339))
	command = strings.ReplaceAll(command, "{task}", taskText)

	// Normalize newlines
	command = NormalizeNewline(command)

	return command
}

// MarkTaskCompleted marks the current running task as completed
func (s *QueueStrategy) MarkTaskCompleted(taskID uint) error {
	return s.taskService.UpdateTaskStatus(taskID, models.TaskStatusCompleted)
}

// MarkTaskFailed marks the current running task as failed
func (s *QueueStrategy) MarkTaskFailed(taskID uint) error {
	return s.taskService.UpdateTaskStatus(taskID, models.TaskStatusFailed)
}

// GetQueueStatus returns the current queue status
func (s *QueueStrategy) GetQueueStatus(containerID uint) (int, *models.Task, error) {
	tasks, err := s.taskService.GetTasks(containerID)
	if err != nil {
		return 0, nil, err
	}

	pendingCount := 0
	var currentTask *models.Task
	
	for i := range tasks {
		if tasks[i].Status == models.TaskStatusPending {
			pendingCount++
		}
		if tasks[i].Status == models.TaskStatusRunning {
			currentTask = &tasks[i]
		}
	}

	return pendingCount, currentTask, nil
}


// QueueStrategyAdapter adapts QueueStrategy to the Strategy interface
type QueueStrategyAdapter struct {
	queueStrategy *QueueStrategy
}

// NewQueueStrategyAdapter creates a new adapter
func NewQueueStrategyAdapter() *QueueStrategyAdapter {
	return &QueueStrategyAdapter{}
}

// Name returns the strategy identifier
func (a *QueueStrategyAdapter) Name() string {
	return "queue"
}

// Execute runs the queue strategy
func (a *QueueStrategyAdapter) Execute(ctx context.Context, session *MonitoringSession) (*StrategyResult, error) {
	if a.queueStrategy == nil {
		return &StrategyResult{
			Action:       "error",
			Success:      false,
			ErrorMessage: "queue strategy not initialized - please configure task queue service",
			Timestamp:    time.Now(),
		}, fmt.Errorf("queue strategy not initialized")
	}

	// Use PTYSessionID instead of PTYSession.ID to avoid nil pointer
	sessionID := session.PTYSessionID
	if sessionID == "" {
		sessionID = fmt.Sprintf("container-%d", session.ContainerID)
	}

	strategyCtx := &StrategyContext{
		ContainerID:   session.ContainerID,
		SessionID:     sessionID,
		ContextBuffer: session.GetLastOutput(4096),
		Config:        session.Config,
	}

	config := QueueStrategyConfig{
		UserPromptTemplate: session.Config.UserPromptTemplate,
		QueueEmptyNotify:   true,
		AutoAdvance:        true,
	}

	result := a.queueStrategy.Execute(strategyCtx, config)

	return &StrategyResult{
		Action:       result.Action,
		Command:      result.TaskText,
		TaskID:       uint(result.TaskID),
		Success:      result.Success,
		ErrorMessage: func() string {
			if result.Error != nil {
				return result.Error.Error()
			}
			return ""
		}(),
		Timestamp: result.Timestamp,
	}, result.Error
}

// Validate checks if the configuration is valid for queue strategy
func (a *QueueStrategyAdapter) Validate(config *models.MonitoringConfig) error {
	// Queue strategy doesn't require specific configuration
	return nil
}

// SetQueueStrategy sets the underlying queue strategy
func (a *QueueStrategyAdapter) SetQueueStrategy(qs *QueueStrategy) {
	a.queueStrategy = qs
}

// IsInitialized returns whether the queue strategy is initialized
func (a *QueueStrategyAdapter) IsInitialized() bool {
	return a.queueStrategy != nil
}
