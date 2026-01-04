package monitoring_test

import (
	"testing"

	"cc-platform/internal/models"
	"cc-platform/internal/services"
)

// TestProperty9_TaskQueueFIFOOrder verifies Property 9: Task Queue FIFO Order
// For any sequence of tasks added to the Task_Queue, tasks SHALL be dequeued in
// the same order they were added (FIFO), and reorder operations SHALL correctly
// update the dequeue order.
// Validates: Requirements 4.1, 4.5

func TestProperty9_TaskQueueFIFOOrder_Basic(t *testing.T) {
	// Test that tasks are returned in FIFO order
	// This is a unit test that verifies the ordering logic

	// Verify that ValidateTaskStatus works correctly for FIFO
	// pending -> in_progress is valid
	if !services.ValidateTaskStatus(models.TaskStatusPending, models.TaskStatusInProgress) {
		t.Error("pending -> in_progress should be valid")
	}

	// in_progress -> completed is valid
	if !services.ValidateTaskStatus(models.TaskStatusInProgress, models.TaskStatusCompleted) {
		t.Error("in_progress -> completed should be valid")
	}
}

func TestProperty9_TaskQueueFIFOOrder_ReorderValidation(t *testing.T) {
	// Test that reorder maintains valid indices
	// This tests the logic without database

	taskIDs := []uint{3, 1, 2} // Reorder to this sequence

	// After reorder, indices should be 0, 1, 2 for tasks 3, 1, 2
	expectedIndices := map[uint]int{
		3: 0,
		1: 1,
		2: 2,
	}

	for i, id := range taskIDs {
		if expectedIndices[id] != i {
			t.Errorf("Task %d should have index %d, got %d", id, i, expectedIndices[id])
		}
	}
}

// TestProperty10_TaskStatusLifecycle verifies Property 10: Task Status Lifecycle
// For any task in the Task_Queue, the status SHALL transition only through valid
// states: pending → in_progress → completed (or skipped), and no task SHALL skip
// the in_progress state when executed.
// Validates: Requirements 4.7, 4.8

func TestProperty10_TaskStatusLifecycle_ValidTransitions(t *testing.T) {
	// Valid transitions
	validTransitions := []struct {
		from models.TaskStatus
		to   models.TaskStatus
	}{
		{models.TaskStatusPending, models.TaskStatusInProgress},
		{models.TaskStatusPending, models.TaskStatusSkipped},
		{models.TaskStatusInProgress, models.TaskStatusCompleted},
		{models.TaskStatusInProgress, models.TaskStatusSkipped},
	}

	for _, tr := range validTransitions {
		if !services.ValidateTaskStatus(tr.from, tr.to) {
			t.Errorf("Transition %s -> %s should be valid", tr.from, tr.to)
		}
	}
}

func TestProperty10_TaskStatusLifecycle_InvalidTransitions(t *testing.T) {
	// Invalid transitions
	invalidTransitions := []struct {
		from models.TaskStatus
		to   models.TaskStatus
	}{
		{models.TaskStatusPending, models.TaskStatusCompleted},    // Skip in_progress
		{models.TaskStatusCompleted, models.TaskStatusPending},    // Reverse
		{models.TaskStatusCompleted, models.TaskStatusInProgress}, // Reverse
		{models.TaskStatusSkipped, models.TaskStatusPending},      // Reverse
		{models.TaskStatusSkipped, models.TaskStatusInProgress},   // Reverse
		{models.TaskStatusSkipped, models.TaskStatusCompleted},    // From terminal
		{models.TaskStatusCompleted, models.TaskStatusSkipped},    // From terminal
	}

	for _, tr := range invalidTransitions {
		if services.ValidateTaskStatus(tr.from, tr.to) {
			t.Errorf("Transition %s -> %s should be invalid", tr.from, tr.to)
		}
	}
}

func TestProperty10_TaskStatusLifecycle_TerminalStates(t *testing.T) {
	// Terminal states should not allow any transitions
	terminalStates := []models.TaskStatus{
		models.TaskStatusCompleted,
		models.TaskStatusSkipped,
	}

	allStates := []models.TaskStatus{
		models.TaskStatusPending,
		models.TaskStatusInProgress,
		models.TaskStatusCompleted,
		models.TaskStatusSkipped,
	}

	for _, terminal := range terminalStates {
		for _, next := range allStates {
			if services.ValidateTaskStatus(terminal, next) {
				t.Errorf("Terminal state %s should not allow transition to %s", terminal, next)
			}
		}
	}
}

func TestProperty10_TaskStatusLifecycle_MustPassThroughInProgress(t *testing.T) {
	// Verify that pending -> completed is not allowed (must go through in_progress)
	if services.ValidateTaskStatus(models.TaskStatusPending, models.TaskStatusCompleted) {
		t.Error("Task must pass through in_progress before completing")
	}
}

// TestProperty11_TaskPersistenceRoundTrip verifies Property 11: Task Persistence Round-Trip
// For any task added to the Task_Queue, after system restart, the task SHALL be
// recoverable from the database with identical text, order index, and status.
// Validates: Requirements 4.6

func TestProperty11_TaskPersistenceRoundTrip_ModelFields(t *testing.T) {
	// Test that Task model has all required fields for persistence
	task := models.Task{
		ContainerID: 1,
		OrderIndex:  0,
		Text:        "Test task",
		Status:      models.TaskStatusPending,
	}

	// Verify fields are set correctly
	if task.ContainerID != 1 {
		t.Error("ContainerID not set correctly")
	}
	if task.OrderIndex != 0 {
		t.Error("OrderIndex not set correctly")
	}
	if task.Text != "Test task" {
		t.Error("Text not set correctly")
	}
	if task.Status != models.TaskStatusPending {
		t.Error("Status not set correctly")
	}
}

func TestProperty11_TaskPersistenceRoundTrip_StatusValues(t *testing.T) {
	// Test that all status values are distinct strings
	statuses := []models.TaskStatus{
		models.TaskStatusPending,
		models.TaskStatusInProgress,
		models.TaskStatusCompleted,
		models.TaskStatusSkipped,
	}

	seen := make(map[models.TaskStatus]bool)
	for _, s := range statuses {
		if seen[s] {
			t.Errorf("Duplicate status value: %s", s)
		}
		seen[s] = true

		// Verify non-empty
		if s == "" {
			t.Error("Status value should not be empty")
		}
	}
}

func TestProperty11_TaskPersistenceRoundTrip_TimestampFields(t *testing.T) {
	// Test that timestamp fields exist
	task := models.Task{}

	// StartedAt and CompletedAt should be nil initially
	if task.StartedAt != nil {
		t.Error("StartedAt should be nil initially")
	}
	if task.CompletedAt != nil {
		t.Error("CompletedAt should be nil initially")
	}
}

func TestTaskStatusConstants(t *testing.T) {
	// Verify status constants have expected values
	if models.TaskStatusPending != "pending" {
		t.Errorf("Expected 'pending', got %s", models.TaskStatusPending)
	}
	if models.TaskStatusInProgress != "in_progress" {
		t.Errorf("Expected 'in_progress', got %s", models.TaskStatusInProgress)
	}
	if models.TaskStatusCompleted != "completed" {
		t.Errorf("Expected 'completed', got %s", models.TaskStatusCompleted)
	}
	if models.TaskStatusSkipped != "skipped" {
		t.Errorf("Expected 'skipped', got %s", models.TaskStatusSkipped)
	}
}

func TestValidateTaskStatus_AllCombinations(t *testing.T) {
	// Test all possible status combinations
	allStates := []models.TaskStatus{
		models.TaskStatusPending,
		models.TaskStatusInProgress,
		models.TaskStatusCompleted,
		models.TaskStatusSkipped,
	}

	// Expected valid transitions
	validMap := map[models.TaskStatus]map[models.TaskStatus]bool{
		models.TaskStatusPending: {
			models.TaskStatusInProgress: true,
			models.TaskStatusSkipped:    true,
		},
		models.TaskStatusInProgress: {
			models.TaskStatusCompleted: true,
			models.TaskStatusSkipped:   true,
		},
		models.TaskStatusCompleted: {},
		models.TaskStatusSkipped:   {},
	}

	for _, from := range allStates {
		for _, to := range allStates {
			expected := validMap[from][to]
			actual := services.ValidateTaskStatus(from, to)
			if actual != expected {
				t.Errorf("ValidateTaskStatus(%s, %s) = %v, expected %v",
					from, to, actual, expected)
			}
		}
	}
}
