package services

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"cc-platform/internal/config"
	"cc-platform/internal/docker"
	"cc-platform/internal/models"

	"gorm.io/gorm"
)

var (
	ErrContainerNotFound      = errors.New("container not found")
	ErrContainerAlreadyExists = errors.New("container already exists")
	ErrNoAPIKeyConfigured     = errors.New("Claude API key not configured")
	ErrNoGitHubTokenConfigured = errors.New("GitHub token not configured")
)

// ContainerService handles container operations
type ContainerService struct {
	db            *gorm.DB
	config        *config.Config
	dockerClient  *docker.Client
	claudeService *ClaudeConfigService
	githubService *GitHubService
	initTasks     sync.Map // map[uint]context.CancelFunc
}

// NewContainerService creates a new ContainerService
func NewContainerService(db *gorm.DB, cfg *config.Config, claudeService *ClaudeConfigService, githubService *GitHubService) (*ContainerService, error) {
	dockerClient, err := docker.NewClient()
	if err != nil {
		return nil, err
	}

	return &ContainerService{
		db:            db,
		config:        cfg,
		dockerClient:  dockerClient,
		claudeService: claudeService,
		githubService: githubService,
	}, nil
}

// Close closes the container service
func (s *ContainerService) Close() error {
	return s.dockerClient.Close()
}

// CreateContainerInput represents input for creating a container
type CreateContainerInput struct {
	Name       string `json:"name" binding:"required"`
	GitRepoURL string `json:"git_repo_url" binding:"required"` // GitHub repo URL
	GitRepoName string `json:"git_repo_name,omitempty"`        // Optional: repo name, extracted from URL if not provided
}

// CreateContainer creates a new container and starts initialization
func (s *ContainerService) CreateContainer(ctx context.Context, input CreateContainerInput) (*models.Container, error) {
	// Check if Claude API key is configured
	if !s.claudeService.HasAPIKey() {
		return nil, ErrNoAPIKeyConfigured
	}

	// Check if GitHub token is configured
	if !s.githubService.HasToken() {
		return nil, ErrNoGitHubTokenConfigured
	}

	// Extract repo name from URL if not provided
	repoName := input.GitRepoName
	if repoName == "" {
		repoName = extractRepoName(input.GitRepoURL)
	}

	// Get environment variables from Claude config
	envVars, err := s.claudeService.GetContainerEnvVars()
	if err != nil {
		return nil, err
	}

	// Add GitHub token to env vars for cloning
	githubToken, err := s.githubService.GetToken()
	if err != nil {
		return nil, err
	}
	envVars["GITHUB_TOKEN"] = githubToken

	// Convert env vars map to slice
	envSlice := make([]string, 0, len(envVars))
	for k, v := range envVars {
		envSlice = append(envSlice, fmt.Sprintf("%s=%s", k, v))
	}

	// Get security config
	securityConfig := docker.DefaultSecurityConfig()

	// Create container config - no volume mounts, project will be cloned inside
	containerConfig := &docker.ContainerConfig{
		Name:        input.Name,
		EnvVars:     envSlice,
		Binds:       []string{}, // No external mounts
		SecurityOpt: securityConfig.SecurityOpt,
		CapDrop:     securityConfig.CapDrop,
		CapAdd:      securityConfig.CapAdd,
		Resources:   securityConfig.Resources,
		NetworkMode: "bridge", // Need network for cloning
	}

	// Create Docker container
	dockerID, err := s.dockerClient.CreateContainer(ctx, containerConfig)
	if err != nil {
		return nil, err
	}

	// Save to database
	container := &models.Container{
		DockerID:    dockerID,
		Name:        input.Name,
		Status:      models.ContainerStatusCreated,
		InitStatus:  models.InitStatusPending,
		GitRepoURL:  input.GitRepoURL,
		GitRepoName: repoName,
		WorkDir:     fmt.Sprintf("/workspace/%s", repoName),
	}

	if err := s.db.Create(container).Error; err != nil {
		// Cleanup Docker container on DB error
		s.dockerClient.RemoveContainer(ctx, dockerID, true)
		return nil, err
	}

	return container, nil
}

// StartContainerWithInit starts a container and begins initialization
func (s *ContainerService) StartContainerWithInit(ctx context.Context, id uint) error {
	container, err := s.GetContainer(id)
	if err != nil {
		return err
	}

	// Start the container
	if err := s.dockerClient.StartContainer(ctx, container.DockerID); err != nil {
		return err
	}

	// Update status
	now := time.Now()
	if err := s.db.Model(container).Updates(map[string]interface{}{
		"status":     models.ContainerStatusRunning,
		"started_at": &now,
	}).Error; err != nil {
		return err
	}

	// Start initialization in background
	go s.runInitialization(container.ID)

	return nil
}

// runInitialization runs the container initialization process in background
func (s *ContainerService) runInitialization(containerID uint) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()

	// Store cancel function for potential cancellation
	s.initTasks.Store(containerID, cancel)
	defer s.initTasks.Delete(containerID)

	container, err := s.GetContainer(containerID)
	if err != nil {
		log.Printf("Init error: failed to get container %d: %v", containerID, err)
		return
	}

	// Step 1: Clone repository
	s.updateInitStatus(containerID, models.InitStatusCloning, "Cloning repository...")
	
	if err := s.cloneRepository(ctx, container); err != nil {
		s.updateInitStatus(containerID, models.InitStatusFailed, fmt.Sprintf("Clone failed: %v", err))
		return
	}

	// Step 2: Run Claude Code initialization
	s.updateInitStatus(containerID, models.InitStatusInitializing, "Initializing project environment...")
	
	if err := s.runClaudeInit(ctx, container); err != nil {
		s.updateInitStatus(containerID, models.InitStatusFailed, fmt.Sprintf("Initialization failed: %v", err))
		return
	}

	// Success
	now := time.Now()
	s.db.Model(&models.Container{}).Where("id = ?", containerID).Updates(map[string]interface{}{
		"init_status":    models.InitStatusReady,
		"init_message":   "Environment ready",
		"initialized_at": &now,
	})

	log.Printf("Container %d initialization completed successfully", containerID)
}

// cloneRepository clones the GitHub repository inside the container
func (s *ContainerService) cloneRepository(ctx context.Context, container *models.Container) error {
	// Get GitHub token
	token, err := s.githubService.GetToken()
	if err != nil {
		return err
	}

	// Build clone URL with token
	cloneURL := container.GitRepoURL
	if strings.HasPrefix(cloneURL, "https://") {
		cloneURL = strings.Replace(cloneURL, "https://", fmt.Sprintf("https://%s@", token), 1)
	}

	// Clone command
	cloneCmd := []string{
		"bash", "-c",
		fmt.Sprintf("cd /workspace && git clone %s %s", cloneURL, container.GitRepoName),
	}

	output, err := s.dockerClient.ExecInContainer(ctx, container.DockerID, cloneCmd)
	if err != nil {
		return fmt.Errorf("git clone failed: %v, output: %s", err, output)
	}

	log.Printf("Clone output for container %d: %s", container.ID, output)
	return nil
}

// runClaudeInit runs Claude Code to initialize the project environment
func (s *ContainerService) runClaudeInit(ctx context.Context, container *models.Container) error {
	// Generate system prompt for environment setup
	systemPrompt := s.generateSystemPrompt()
	
	// Generate initial prompt
	initPrompt := s.generateInitPrompt(container.GitRepoName)

	// Create system prompt file in container
	createPromptCmd := []string{
		"bash", "-c",
		fmt.Sprintf(`cat > /tmp/system_prompt.txt << 'SYSPROMPTEOF'
%s
SYSPROMPTEOF`, systemPrompt),
	}
	
	if _, err := s.dockerClient.ExecInContainer(ctx, container.DockerID, createPromptCmd); err != nil {
		return fmt.Errorf("failed to create system prompt file: %v", err)
	}

	// Run Claude Code in non-interactive mode
	claudeCmd := []string{
		"bash", "-c",
		fmt.Sprintf(`cd %s && claude --dangerously-skip-permissions --system-prompt-file /tmp/system_prompt.txt -p "%s"`,
			container.WorkDir, initPrompt),
	}

	output, err := s.dockerClient.ExecInContainer(ctx, container.DockerID, claudeCmd)
	if err != nil {
		return fmt.Errorf("claude init failed: %v, output: %s", err, output)
	}

	log.Printf("Claude init output for container %d: %s", container.ID, output)
	return nil
}

// generateSystemPrompt generates the system prompt for Claude Code
func (s *ContainerService) generateSystemPrompt() string {
	return `You are an expert development environment setup assistant. Your task is to analyze the project structure and automatically set up the complete development environment.

## Your Responsibilities:
1. Analyze the project structure (package.json, requirements.txt, go.mod, Cargo.toml, pom.xml, etc.)
2. Identify the programming language(s) and framework(s) used
3. Install all required dependencies
4. Set up any necessary configuration files
5. Ensure the project can be built and run

## Guidelines:
- Always check for existing lock files (package-lock.json, yarn.lock, poetry.lock, etc.)
- Use the appropriate package manager for the project
- Handle multiple languages if the project is polyglot
- Set up environment variables if .env.example exists
- Run any necessary build steps
- Verify the setup by attempting a build or test run

## Output:
- Provide clear status updates as you work
- Report any errors encountered and how you resolved them
- Confirm when the environment is ready`
}

// generateInitPrompt generates the initial prompt for project setup
func (s *ContainerService) generateInitPrompt(repoName string) string {
	return fmt.Sprintf(`Please analyze the project "%s" and set up the complete development environment. 

Steps to follow:
1. First, list the project structure to understand what we're working with
2. Identify the project type and required dependencies
3. Install all dependencies using the appropriate package manager
4. Set up any configuration files needed
5. Verify the setup is complete

Please proceed with the setup and report the status when done.`, repoName)
}

// updateInitStatus updates the initialization status
func (s *ContainerService) updateInitStatus(containerID uint, status, message string) {
	s.db.Model(&models.Container{}).Where("id = ?", containerID).Updates(map[string]interface{}{
		"init_status":  status,
		"init_message": message,
	})
	log.Printf("Container %d init status: %s - %s", containerID, status, message)
}

// StartContainer starts a container (without initialization)
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

	// Cancel any running initialization
	if cancel, ok := s.initTasks.Load(id); ok {
		cancel.(context.CancelFunc)()
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

	// Cancel any running initialization
	if cancel, ok := s.initTasks.Load(id); ok {
		cancel.(context.CancelFunc)()
	}

	// Remove Docker container
	if err := s.dockerClient.RemoveContainer(ctx, container.DockerID, true); err != nil {
		log.Printf("Warning: failed to remove Docker container: %v", err)
	}

	// Remove from database
	return s.db.Delete(&models.Container{}, id).Error
}

// GetContainer gets a container by ID
func (s *ContainerService) GetContainer(id uint) (*models.Container, error) {
	var container models.Container
	if err := s.db.First(&container, id).Error; err != nil {
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
	if err := s.db.Where("docker_id = ?", dockerID).First(&container).Error; err != nil {
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
	if err := s.db.Find(&containers).Error; err != nil {
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
			status = models.ContainerStatusDeleted
		}

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

// ContainerInfo represents container information for API response
type ContainerInfo struct {
	ID            uint       `json:"id"`
	DockerID      string     `json:"docker_id"`
	Name          string     `json:"name"`
	Status        string     `json:"status"`
	InitStatus    string     `json:"init_status"`
	InitMessage   string     `json:"init_message,omitempty"`
	GitRepoURL    string     `json:"git_repo_url,omitempty"`
	GitRepoName   string     `json:"git_repo_name,omitempty"`
	WorkDir       string     `json:"work_dir,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
	StartedAt     *time.Time `json:"started_at,omitempty"`
	StoppedAt     *time.Time `json:"stopped_at,omitempty"`
	InitializedAt *time.Time `json:"initialized_at,omitempty"`
}

// ToContainerInfo converts a Container model to ContainerInfo
func ToContainerInfo(c *models.Container) ContainerInfo {
	return ContainerInfo{
		ID:            c.ID,
		DockerID:      c.DockerID,
		Name:          c.Name,
		Status:        c.Status,
		InitStatus:    c.InitStatus,
		InitMessage:   c.InitMessage,
		GitRepoURL:    c.GitRepoURL,
		GitRepoName:   c.GitRepoName,
		WorkDir:       c.WorkDir,
		CreatedAt:     c.CreatedAt,
		StartedAt:     c.StartedAt,
		StoppedAt:     c.StoppedAt,
		InitializedAt: c.InitializedAt,
	}
}

// extractRepoName extracts repository name from GitHub URL
func extractRepoName(url string) string {
	// Remove .git suffix if present
	url = strings.TrimSuffix(url, ".git")
	
	// Get the last part of the URL
	parts := strings.Split(url, "/")
	if len(parts) > 0 {
		return parts[len(parts)-1]
	}
	return "project"
}
