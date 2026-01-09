package services

import (
	"testing"
	"time"

	"cc-platform/internal/models"
)

// Property 7: Container Listing Completeness
// For any list of containers, each item in the response SHALL contain
// non-empty container ID, valid status, valid creation time, and associated repository information.

func TestContainerInfoHasRequiredFields(t *testing.T) {
	// Create a test container model
	now := time.Now()
	container := &models.Container{
		DockerID:    "abc123def456",
		Name:        "test-container",
		Status:      models.ContainerStatusRunning,
		GitRepoName: "test-repo",
		GitRepoURL:  "https://github.com/test/repo",
		StartedAt:   &now,
	}
	container.ID = 1
	container.CreatedAt = now

	// Convert to ContainerInfo
	info := ToContainerInfo(container)

	// Verify all required fields are present
	if info.ID == 0 {
		t.Error("ContainerInfo should have non-zero ID")
	}

	if info.DockerID == "" {
		t.Error("ContainerInfo should have non-empty DockerID")
	}

	if info.Name == "" {
		t.Error("ContainerInfo should have non-empty Name")
	}

	if info.Status == "" {
		t.Error("ContainerInfo should have non-empty Status")
	}

	// Validate status is one of the valid values
	validStatuses := map[string]bool{
		models.ContainerStatusCreated: true,
		models.ContainerStatusRunning: true,
		models.ContainerStatusStopped: true,
		models.ContainerStatusDeleted: true,
	}
	if !validStatuses[info.Status] {
		t.Errorf("ContainerInfo has invalid status: %s", info.Status)
	}

	if info.GitRepoName == "" && info.GitRepoURL == "" {
		t.Error("ContainerInfo should include repository information")
	}

	if info.CreatedAt.IsZero() {
		t.Error("ContainerInfo should have valid CreatedAt time")
	}
}

func TestContainerInfoStatusValues(t *testing.T) {
	testCases := []struct {
		status   string
		expected string
	}{
		{models.ContainerStatusCreated, "created"},
		{models.ContainerStatusRunning, "running"},
		{models.ContainerStatusStopped, "stopped"},
		{models.ContainerStatusDeleted, "deleted"},
	}

	for _, tc := range testCases {
		container := &models.Container{
			DockerID:    "test123",
			Name:        "test",
			Status:      tc.status,
			GitRepoName: "test-repo",
		}
		container.CreatedAt = time.Now()

		info := ToContainerInfo(container)
		if info.Status != tc.expected {
			t.Errorf("Expected status %s, got %s", tc.expected, info.Status)
		}
	}
}

func TestContainerInfoOptionalFields(t *testing.T) {
	now := time.Now()

	// Container with all optional fields
	containerWithOptional := &models.Container{
		DockerID:    "test123",
		Name:        "test",
		Status:      models.ContainerStatusRunning,
		StartedAt:   &now,
		StoppedAt:   &now,
		GitRepoName: "test-repo",
	}
	containerWithOptional.CreatedAt = now

	info := ToContainerInfo(containerWithOptional)
	if info.StartedAt == nil {
		t.Error("ContainerInfo should include StartedAt when present")
	}
	if info.StoppedAt == nil {
		t.Error("ContainerInfo should include StoppedAt when present")
	}

	// Container without optional fields
	containerWithoutOptional := &models.Container{
		DockerID:    "test456",
		Name:        "test2",
		Status:      models.ContainerStatusCreated,
		GitRepoName: "test-repo",
	}
	containerWithoutOptional.CreatedAt = now

	info2 := ToContainerInfo(containerWithoutOptional)
	if info2.StartedAt != nil {
		t.Error("ContainerInfo should not include StartedAt when not present")
	}
}
