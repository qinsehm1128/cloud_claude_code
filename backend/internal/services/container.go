package services

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"time"

	"cc-platform/internal/config"
	"cc-platform/internal/docker"
	"cc-platform/internal/models"

	"gorm.io/gorm"
)

var (
	ErrContainerNotFound     = errors.New("container not found")
	ErrContainerAlreadyExists = errors.New("container already exists")
	ErrNoAPIKeyConfigured    = errors.New("Claude API key not configured")
)

// ContainerService handles container operations
type ContainerService struct {
	db            *gorm.DB
	config        *config.Config
	dockerClient  *docker.Client
	claudeService *ClaudeConfigService
}

// NewContainerService creates a new ContainerService
func NewContainerService(db *gorm.DB, cfg *config.Config, claudeService *ClaudeConfigService) (*ContainerService, error) {
	dockerClient, err := docker.NewClient()
	if err != nil {
		return nil, err
	}

	return &ContainerService{
		db:            db,
		config:        cfg,
		dockerClient:  dockerClient,
		claudeService: claudeService,
	}, nil
}

// Close closes the container service
func (s *ContainerService) Close() error {
	return s.dockerClient.Close()
}

// CreateContainerInput represents input for creating a container
type CreateContainerInput struct {
	Name         string `json:"name"`
	RepositoryID uint   `json:"repository_id"`
}

// CreateContainer creates a new container for a repository
func (s *ContainerService) CreateContainer(ctx context.Context, input CreateContainerInput) (*models.Container, error) {
	// Check if Claude API key is configured
	if !s.claudeService.HasAPIKey() {
		return nil, ErrNoAPIKeyConfigured
	}

	// Get repository
	var repo models.Repository
	if err := s.db.First(&repo, input.RepositoryID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrRepositoryNotFound
		}
		return nil, err
	}

	// Get environment variables from Claude config
	envVars, err := s.claudeService.GetContainerEnvVars()
	if err != nil {
		return nil, err
	}

	// Convert env vars map to slice
	envSlice := make([]string, 0, len(envVars))
	for k, v := range envVars {
		envSlice = append(envSlice, fmt.Sprintf("%s=%s", k, v))
	}

	// Get security config
	securityConfig := docker.DefaultSecurityConfig()

	// Create container config
	containerConfig := &docker.ContainerConfig{
		Name:        input.Name,
		EnvVars:     envSlice,
		Binds:       []string{fmt.Sprintf("%s:/workspace:rw", repo.LocalPath)},
		SecurityOpt: securityConfig.SecurityOpt,
		CapDrop:     securityConfig.CapDrop,
		CapAdd:      securityConfig.CapAdd,
		Resources:   securityConfig.Resources,
		NetworkMode: securityConfig.NetworkMode,
	}

	// Create Docker container
	dockerID, err := s.dockerClient.CreateContainer(ctx, containerConfig)
	if err != nil {
		return nil, err
	}

	// Save to database
	container := &models.Container{
		DockerID:     dockerID,
		Name:         input.Name,
		Status:       models.ContainerStatusCreated,
		RepositoryID: input.RepositoryID,
	}

	if err := s.db.Create(container).Error; err != nil {
		// Cleanup Docker container on DB error
		s.dockerClient.RemoveContainer(ctx, dockerID, true)
		return nil, err
	}

	return container, nil
}

// StartContainer starts a container
func (s *ContainerService) StartContainer(ctx context.Context, id uint) error {
	container, err := s.GetContainer(id)
	if err != nil {
		return err
	}

	if err := s.dockerClient.StartContainer(ctx, container.DockerID); err != nil {
		return err
	}

	// Update status
	now := time.Now()
	return s.db.Model(container).Updates(map[string]interface{}{
		"status":     models.ContainerStatusRunning,
		"started_at": &now,
	}).Error
}

// StopContainer stops a container
func (s *ContainerService) StopContainer(ctx context.Context, id uint) error {
	container, err := s.GetContainer(id)
	if err != nil {
		return err
	}

	timeout := 30
	if err := s.dockerClient.StopContainer(ctx, container.DockerID, &timeout); err != nil {
		return err
	}

	// Update status
	now := time.Now()
	return s.db.Model(container).Updates(map[string]interface{}{
		"status":     models.ContainerStatusStopped,
		"stopped_at": &now,
	}).Error
}

// DeleteContainer deletes a container
func (s *ContainerService) DeleteContainer(ctx context.Context, id uint) error {
	container, err := s.GetContainer(id)
	if err != nil {
		return err
	}

	// Remove Docker container
	if err := s.dockerClient.RemoveContainer(ctx, container.DockerID, true); err != nil {
		// Log but continue with DB deletion
		fmt.Printf("Warning: failed to remove Docker container: %v\n", err)
	}

	// Remove from database
	return s.db.Delete(&models.Container{}, id).Error
}

// GetContainer gets a container by ID
func (s *ContainerService) GetContainer(id uint) (*models.Container, error) {
	var container models.Container
	if err := s.db.Preload("Repository").First(&container, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrContainerNotFound
		}
		return nil, err
	}
	return &container, nil
}

// GetContainerByDockerID gets a container by Docker ID
func (s *ContainerService) GetContainerByDockerID(dockerID string) (*models.Container, error) {
	var container models.Container
	if err := s.db.Where("docker_id = ?", dockerID).Preload("Repository").First(&container).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrContainerNotFound
		}
		return nil, err
	}
	return &container, nil
}

// ListContainers lists all containers
func (s *ContainerService) ListContainers() ([]models.Container, error) {
	var containers []models.Container
	if err := s.db.Preload("Repository").Find(&containers).Error; err != nil {
		return nil, err
	}
	return containers, nil
}

// SyncContainerStatus syncs container status with Docker
func (s *ContainerService) SyncContainerStatus(ctx context.Context) error {
	containers, err := s.ListContainers()
	if err != nil {
		return err
	}

	for _, container := range containers {
		status, err := s.dockerClient.GetContainerStatus(ctx, container.DockerID)
		if err != nil {
			// Container might not exist in Docker
			status = models.ContainerStatusDeleted
		}

		// Map Docker status to our status
		var newStatus string
		switch status {
		case "running":
			newStatus = models.ContainerStatusRunning
		case "exited", "dead":
			newStatus = models.ContainerStatusStopped
		case "created":
			newStatus = models.ContainerStatusCreated
		default:
			newStatus = models.ContainerStatusStopped
		}

		if container.Status != newStatus {
			s.db.Model(&container).Update("status", newStatus)
		}
	}

	return nil
}

// ExecInContainer executes a command in a container
func (s *ContainerService) ExecInContainer(ctx context.Context, id uint, cmd []string) (string, error) {
	container, err := s.GetContainer(id)
	if err != nil {
		return "", err
	}

	return s.dockerClient.ExecInContainer(ctx, container.DockerID, cmd)
}

// GetStartupCommand returns the startup command for Claude Code
func (s *ContainerService) GetStartupCommand() string {
	return s.claudeService.GetStartupCommand()
}

// EnsureBaseImage ensures the base image exists
func (s *ContainerService) EnsureBaseImage(ctx context.Context) error {
	if s.dockerClient.BaseImageExists(ctx) {
		return nil
	}

	// Build base image
	dockerfilePath := filepath.Join(s.config.DataDir(), "..", "docker", "Dockerfile.base")
	return s.dockerClient.BuildBaseImage(ctx, dockerfilePath)
}

// ContainerInfo represents container information for API response
type ContainerInfo struct {
	ID           uint       `json:"id"`
	DockerID     string     `json:"docker_id"`
	Name         string     `json:"name"`
	Status       string     `json:"status"`
	Repository   string     `json:"repository"`
	RepositoryID uint       `json:"repository_id"`
	CreatedAt    time.Time  `json:"created_at"`
	StartedAt    *time.Time `json:"started_at,omitempty"`
	StoppedAt    *time.Time `json:"stopped_at,omitempty"`
}

// ToContainerInfo converts a Container model to ContainerInfo
func ToContainerInfo(c *models.Container) ContainerInfo {
	return ContainerInfo{
		ID:           c.ID,
		DockerID:     c.DockerID,
		Name:         c.Name,
		Status:       c.Status,
		Repository:   c.Repository.Name,
		RepositoryID: c.RepositoryID,
		CreatedAt:    c.CreatedAt,
		StartedAt:    c.StartedAt,
		StoppedAt:    c.StoppedAt,
	}
}
