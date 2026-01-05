package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"regexp"
	"strings"
	"sync"
	"time"

	"cc-platform/internal/config"
	"cc-platform/internal/docker"
	"cc-platform/internal/models"

	"gorm.io/gorm"
)

var (
	ErrContainerNotFound       = errors.New("container not found")
	ErrContainerAlreadyExists  = errors.New("container already exists")
	ErrNoGitHubTokenConfigured = errors.New("GitHub token not configured")
	ErrContainerNotReady       = errors.New("container initialization not complete")
	ErrInvalidContainerName    = errors.New("invalid container name")
	ErrInvalidCPULimit         = errors.New("invalid CPU limit")
	ErrInvalidMemoryLimit      = errors.New("invalid memory limit")
)

// Container name validation - allows Unicode characters including Chinese
// Must start with alphanumeric or Unicode letter, followed by alphanumeric, Unicode, underscores, dots, or hyphens
var containerNameRegex = regexp.MustCompile(`^[\p{L}\p{N}][\p{L}\p{N}_.-]*$`)

// validateContainerName validates the container name
func validateContainerName(name string) error {
	if len(name) < 1 || len(name) > 63 {
		return fmt.Errorf("%w: name must be 1-63 characters", ErrInvalidContainerName)
	}
	if !containerNameRegex.MatchString(name) {
		return fmt.Errorf("%w: name can only contain letters (including Unicode), numbers, underscores, dots, and hyphens", ErrInvalidContainerName)
	}
	return nil
}

// validateResourceLimits validates CPU and memory limits
func validateResourceLimits(cpuLimit float64, memoryLimit int64) error {
	if cpuLimit < 0 || cpuLimit > 64 {
		return fmt.Errorf("%w: must be between 0 and 64 cores", ErrInvalidCPULimit)
	}
	if memoryLimit < 0 || memoryLimit > 128*1024 { // Max 128GB
		return fmt.Errorf("%w: must be between 0 and 131072 MB", ErrInvalidMemoryLimit)
	}
	return nil
}

// ContainerService handles container operations
type ContainerService struct {
	db            *gorm.DB
	config        *config.Config
	dockerClient  *docker.Client
	claudeService *ClaudeConfigService
	githubService *GitHubService
	initTasks     sync.Map // map[uint]context.CancelFunc
	
	// Goroutine lifecycle management
	wg     sync.WaitGroup
	ctx    context.Context
	cancel context.CancelFunc
}

// NewContainerService creates a new ContainerService
func NewContainerService(db *gorm.DB, cfg *config.Config, claudeService *ClaudeConfigService, githubService *GitHubService) (*ContainerService, error) {
	dockerClient, err := docker.NewClient()
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithCancel(context.Background())

	return &ContainerService{
		db:            db,
		config:        cfg,
		dockerClient:  dockerClient,
		claudeService: claudeService,
		githubService: githubService,
		ctx:           ctx,
		cancel:        cancel,
	}, nil
}

// Close closes the container service and waits for all goroutines to finish
func (s *ContainerService) Close() error {
	// Cancel all running goroutines
	s.cancel()
	
	// Cancel all init tasks
	s.initTasks.Range(func(key, value interface{}) bool {
		if cancel, ok := value.(context.CancelFunc); ok {
			cancel()
		}
		return true
	})
	
	// Wait for all goroutines to finish (with timeout)
	done := make(chan struct{})
	go func() {
		s.wg.Wait()
		close(done)
	}()
	
	select {
	case <-done:
		// All goroutines finished
	case <-time.After(10 * time.Second):
		log.Println("Warning: timeout waiting for container service goroutines to finish")
	}
	
	return s.dockerClient.Close()
}

// PortMapping represents a port mapping configuration
type PortMapping struct {
	ContainerPort int `json:"container_port"`
	HostPort      int `json:"host_port"`
}

// ProxyConfig represents Traefik proxy configuration
type ProxyConfig struct {
	Enabled     bool   `json:"enabled"`                // Enable Traefik proxy
	Domain      string `json:"domain,omitempty"`       // Subdomain for domain-based access
	Port        int    `json:"port,omitempty"`         // Direct port access (9001-9010)
	ServicePort int    `json:"service_port,omitempty"` // Container internal service port
}

// CreateContainerInput represents input for creating a container
type CreateContainerInput struct {
	Name             string        `json:"name" binding:"required"`
	GitRepoURL       string        `json:"git_repo_url" binding:"required"` // GitHub repo URL
	GitRepoName      string        `json:"git_repo_name,omitempty"`         // Optional: repo name, extracted from URL if not provided
	SkipClaudeInit   bool          `json:"skip_claude_init,omitempty"`      // Skip Claude Code initialization
	MemoryLimit      int64         `json:"memory_limit,omitempty"`          // Memory limit in MB (0 = default 2048MB)
	CPULimit         float64       `json:"cpu_limit,omitempty"`             // CPU limit in cores (0 = default 1)
	PortMappings     []PortMapping `json:"port_mappings,omitempty"`         // Legacy port mappings
	EnableCodeServer bool          `json:"enable_code_server,omitempty"`    // Enable code-server (Web VS Code)
	Proxy          ProxyConfig   `json:"proxy,omitempty"`                 // Traefik proxy configuration
}

// CreateContainer creates a new container and automatically starts initialization
func (s *ContainerService) CreateContainer(ctx context.Context, input CreateContainerInput) (*models.Container, error) {
	// Validate container name
	if err := validateContainerName(input.Name); err != nil {
		return nil, err
	}

	// Validate resource limits
	if err := validateResourceLimits(input.CPULimit, input.MemoryLimit); err != nil {
		return nil, err
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

	// Get environment variables from config
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

	// Apply custom resource limits if provided
	if input.MemoryLimit > 0 {
		memoryBytes := input.MemoryLimit * 1024 * 1024 // Convert MB to bytes
		securityConfig.Resources.Memory = memoryBytes
		securityConfig.Resources.MemorySwap = memoryBytes // No swap
	}
	if input.CPULimit > 0 {
		// CPUQuota is in microseconds per CPUPeriod (100000)
		// So 1 CPU = 100000, 0.5 CPU = 50000, 2 CPU = 200000
		securityConfig.Resources.CPUQuota = int64(input.CPULimit * 100000)
	}

	// Build port bindings (legacy direct port mapping)
	portBindings := make(map[string]string)
	for _, pm := range input.PortMappings {
		containerPort := fmt.Sprintf("%d/tcp", pm.ContainerPort)
		hostPort := fmt.Sprintf("%d", pm.HostPort)
		portBindings[containerPort] = hostPort
	}

	// code-server access method depends on configuration:
	// 1. If CODE_SERVER_BASE_DOMAIN is set: use subdomain routing via Traefik
	// 2. Otherwise: use direct port mapping
	codeServerHostPort := 0
	codeServerDomain := ""
	useSubdomainRouting := s.config.CodeServerBaseDomain != "" && input.EnableCodeServer
	
	if input.EnableCodeServer {
		if useSubdomainRouting {
			// Subdomain routing: {container-name}.{base-domain}
			codeServerDomain = fmt.Sprintf("%s.%s", input.Name, s.config.CodeServerBaseDomain)
			log.Printf("code-server subdomain routing: %s -> container:%d", codeServerDomain, CodeServerInternalPort)
		} else {
			// Direct port mapping fallback
			for port := 18443; port <= 18543; port++ {
				if isPortFree(port) {
					codeServerHostPort = port
					break
				}
			}
			if codeServerHostPort > 0 {
				portBindings[fmt.Sprintf("%d/tcp", CodeServerInternalPort)] = fmt.Sprintf("%d", codeServerHostPort)
				log.Printf("code-server port mapping: container:%d -> host:%d", CodeServerInternalPort, codeServerHostPort)
			} else {
				log.Printf("Warning: could not find free port for code-server")
			}
		}
	}

	// Build Traefik labels
	labels := make(map[string]string)
	
	// Connect to traefik-net if proxy or subdomain routing is enabled
	useTraefikNet := input.Proxy.Enabled || useSubdomainRouting
	
	// Add code-server subdomain routing labels
	if useSubdomainRouting {
		codeServiceName := fmt.Sprintf("cc-%s-code", input.Name)
		labels["traefik.enable"] = "true"
		
		// Router for code-server subdomain
		codeRouterName := fmt.Sprintf("%s-code", input.Name)
		labels[fmt.Sprintf("traefik.http.routers.%s.rule", codeRouterName)] = fmt.Sprintf("Host(`%s`)", codeServerDomain)
		labels[fmt.Sprintf("traefik.http.routers.%s.entrypoints", codeRouterName)] = "web"
		labels[fmt.Sprintf("traefik.http.routers.%s.service", codeRouterName)] = codeServiceName
		
		// Service configuration - point to code-server port
		labels[fmt.Sprintf("traefik.http.services.%s.loadbalancer.server.port", codeServiceName)] = fmt.Sprintf("%d", CodeServerInternalPort)
	}
	
	// Add user-defined proxy labels if enabled
	if input.Proxy.Enabled && input.Proxy.ServicePort > 0 {
		serviceName := fmt.Sprintf("cc-%s", input.Name)
		labels["traefik.enable"] = "true"
		
		// Domain-based routing (via Nginx -> Traefik:8080)
		if input.Proxy.Domain != "" {
			routerName := fmt.Sprintf("%s-domain", serviceName)
			labels[fmt.Sprintf("traefik.http.routers.%s.rule", routerName)] = fmt.Sprintf("Host(`%s`)", input.Proxy.Domain)
			labels[fmt.Sprintf("traefik.http.routers.%s.entrypoints", routerName)] = "web"
			labels[fmt.Sprintf("traefik.http.routers.%s.service", routerName)] = serviceName
		}
		
		// Direct port access (IP:port)
		if input.Proxy.Port >= 30001 && input.Proxy.Port <= 30020 {
			routerName := fmt.Sprintf("%s-direct", serviceName)
			entrypoint := fmt.Sprintf("direct-%d", input.Proxy.Port)
			labels[fmt.Sprintf("traefik.http.routers.%s.rule", routerName)] = "PathPrefix(`/`)"
			labels[fmt.Sprintf("traefik.http.routers.%s.entrypoints", routerName)] = entrypoint
			labels[fmt.Sprintf("traefik.http.routers.%s.service", routerName)] = serviceName
		}
		
		// Service configuration - point to container's internal port
		labels[fmt.Sprintf("traefik.http.services.%s.loadbalancer.server.port", serviceName)] = fmt.Sprintf("%d", input.Proxy.ServicePort)
	}

	// Create container config - no volume mounts, project will be cloned inside
	containerConfig := &docker.ContainerConfig{
		Name:          input.Name,
		EnvVars:       envSlice,
		Binds:         []string{}, // No external mounts
		SecurityOpt:   securityConfig.SecurityOpt,
		CapDrop:       securityConfig.CapDrop,
		CapAdd:        securityConfig.CapAdd,
		Resources:     securityConfig.Resources,
		NetworkMode:   "bridge", // Need network for cloning
		PortBindings:  portBindings,
		Labels:        labels,
		UseTraefikNet: useTraefikNet,
		UseCodeServer: input.EnableCodeServer,
	}

	// Create Docker container
	dockerID, err := s.dockerClient.CreateContainer(ctx, containerConfig)
	if err != nil {
		return nil, err
	}

	// Serialize port mappings to JSON for storage
	portMappingsJSON := ""
	if len(input.PortMappings) > 0 {
		jsonBytes, err := json.Marshal(input.PortMappings)
		if err != nil {
			log.Printf("Warning: failed to marshal port mappings: %v", err)
		} else {
			portMappingsJSON = string(jsonBytes)
		}
	}

	// Calculate actual memory and CPU values for storage
	memoryLimit := input.MemoryLimit
	if memoryLimit == 0 {
		memoryLimit = 2048 // Default 2GB
	}
	cpuLimit := input.CPULimit
	if cpuLimit == 0 {
		cpuLimit = 1.0 // Default 1 core
	}

	// Save to database
	dbContainer := &models.Container{
		DockerID:         dockerID,
		Name:             input.Name,
		Status:           models.ContainerStatusCreated,
		InitStatus:       models.InitStatusPending,
		GitRepoURL:       input.GitRepoURL,
		GitRepoName:      repoName,
		WorkDir:          fmt.Sprintf("/workspace/%s", repoName),
		SkipClaudeInit:   input.SkipClaudeInit,
		MemoryLimit:      memoryLimit * 1024 * 1024, // Store in bytes
		CPULimit:         cpuLimit,
		ExposedPorts:     portMappingsJSON,
		ProxyEnabled:     input.Proxy.Enabled,
		ProxyDomain:      input.Proxy.Domain,
		ProxyPort:        input.Proxy.Port,
		ServicePort:      input.Proxy.ServicePort,
		EnableCodeServer: input.EnableCodeServer,
		CodeServerPort:   CodeServerInternalPort, // Store container internal port (8443)
		CodeServerDomain: codeServerDomain,       // Subdomain for code-server (e.g., "mycontainer.code.example.com")
	}

	if err := s.db.Create(dbContainer).Error; err != nil {
		// Cleanup Docker container on DB error
		s.dockerClient.RemoveContainer(ctx, dockerID, true)
		return nil, err
	}

	// Add initial log
	s.addLog(dbContainer.ID, models.LogLevelInfo, models.LogStageStartup, fmt.Sprintf("Container created for repository: %s", input.GitRepoURL))
	if len(input.PortMappings) > 0 {
		portInfo := make([]string, len(input.PortMappings))
		for i, pm := range input.PortMappings {
			portInfo[i] = fmt.Sprintf("%d->%d", pm.ContainerPort, pm.HostPort)
		}
		s.addLog(dbContainer.ID, models.LogLevelInfo, models.LogStageStartup, fmt.Sprintf("Port mappings: %s", strings.Join(portInfo, ", ")))
	}
	if input.Proxy.Enabled {
		proxyInfo := fmt.Sprintf("Proxy enabled: service port %d", input.Proxy.ServicePort)
		if input.Proxy.Domain != "" {
			proxyInfo += fmt.Sprintf(", domain: %s", input.Proxy.Domain)
		}
		if input.Proxy.Port > 0 {
			proxyInfo += fmt.Sprintf(", direct port: %d", input.Proxy.Port)
		}
		s.addLog(dbContainer.ID, models.LogLevelInfo, models.LogStageStartup, proxyInfo)
	}
	s.addLog(dbContainer.ID, models.LogLevelInfo, models.LogStageStartup, fmt.Sprintf("Resources: Memory=%dMB, CPU=%.1f cores", memoryLimit, cpuLimit))

	// Log code-server if enabled
	if input.EnableCodeServer {
		if useSubdomainRouting {
			// Add code-server port to ports table (using internal port for subdomain routing)
			portService := NewPortService(s.db)
			portService.AddPort(dbContainer.ID, CodeServerInternalPort, "VS Code", "http", true)
			s.addLog(dbContainer.ID, models.LogLevelInfo, models.LogStageStartup, 
				fmt.Sprintf("code-server: http://%s (subdomain routing via Traefik)", codeServerDomain))
		} else if codeServerHostPort > 0 {
			// Add code-server port to ports table
			portService := NewPortService(s.db)
			portService.AddPort(dbContainer.ID, codeServerHostPort, "VS Code", "http", true)
			s.addLog(dbContainer.ID, models.LogLevelInfo, models.LogStageStartup, 
				fmt.Sprintf("code-server: http://server-ip:%d", codeServerHostPort))
		} else {
			s.addLog(dbContainer.ID, models.LogLevelWarn, models.LogStageStartup, 
				"code-server enabled but no free port available")
		}
	}

	// Auto-start the container and begin initialization
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		select {
		case <-s.ctx.Done():
			log.Printf("Container %d auto-start cancelled: service shutting down", dbContainer.ID)
			return
		default:
		}
		if err := s.startAndInitialize(dbContainer.ID); err != nil {
			log.Printf("Failed to auto-start container %d: %v", dbContainer.ID, err)
		}
	}()

	return dbContainer, nil
}

// startAndInitialize starts the container and runs initialization
func (s *ContainerService) startAndInitialize(containerID uint) error {
	ctx := context.Background()
	
	container, err := s.GetContainer(containerID)
	if err != nil {
		return err
	}

	// Log startup
	s.addLog(containerID, models.LogLevelInfo, models.LogStageStartup, "Starting container...")

	// Start the container
	if err := s.dockerClient.StartContainer(ctx, container.DockerID); err != nil {
		s.addLog(containerID, models.LogLevelError, models.LogStageStartup, fmt.Sprintf("Failed to start container: %v", err))
		s.updateInitStatus(containerID, models.InitStatusFailed, fmt.Sprintf("Failed to start: %v", err))
		return err
	}

	s.addLog(containerID, models.LogLevelInfo, models.LogStageStartup, "Container started successfully")

	// Update status
	now := time.Now()
	if err := s.db.Model(container).Updates(map[string]interface{}{
		"status":     models.ContainerStatusRunning,
		"started_at": &now,
	}).Error; err != nil {
		return err
	}

	// Run initialization
	s.runInitialization(containerID)
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
		s.addLog(containerID, models.LogLevelError, models.LogStageInit, fmt.Sprintf("Failed to get container: %v", err))
		log.Printf("Init error: failed to get container %d: %v", containerID, err)
		return
	}

	// Step 1: Clone repository
	s.addLog(containerID, models.LogLevelInfo, models.LogStageClone, fmt.Sprintf("Cloning repository: %s", container.GitRepoURL))
	s.updateInitStatus(containerID, models.InitStatusCloning, "Cloning repository...")
	
	if err := s.cloneRepository(ctx, container); err != nil {
		s.addLog(containerID, models.LogLevelError, models.LogStageClone, fmt.Sprintf("Clone failed: %v", err))
		s.updateInitStatus(containerID, models.InitStatusFailed, fmt.Sprintf("Clone failed: %v", err))
		return
	}
	s.addLog(containerID, models.LogLevelInfo, models.LogStageClone, "Repository cloned successfully")

	// Step 2: Run Claude Code initialization (if not skipped)
	if !container.SkipClaudeInit {
		s.addLog(containerID, models.LogLevelInfo, models.LogStageInit, "Starting Claude Code initialization...")
		s.updateInitStatus(containerID, models.InitStatusInitializing, "Initializing project environment...")
		
		if err := s.runClaudeInit(ctx, container); err != nil {
			s.addLog(containerID, models.LogLevelError, models.LogStageInit, fmt.Sprintf("Initialization failed: %v", err))
			s.updateInitStatus(containerID, models.InitStatusFailed, fmt.Sprintf("Initialization failed: %v", err))
			return
		}
	} else {
		s.addLog(containerID, models.LogLevelInfo, models.LogStageInit, "Skipping Claude Code initialization (user requested)")
	}

	// Step 3: Start code-server if enabled
	if container.EnableCodeServer {
		s.addLog(containerID, models.LogLevelInfo, models.LogStageInit, "Starting code-server...")
		if err := s.StartCodeServer(ctx, containerID); err != nil {
			s.addLog(containerID, models.LogLevelWarn, models.LogStageInit, fmt.Sprintf("code-server failed to start: %v", err))
			// Don't fail initialization if code-server fails
		} else {
			s.addLog(containerID, models.LogLevelInfo, models.LogStageInit, 
				fmt.Sprintf("code-server started on container port %d", container.CodeServerPort))
		}
	}

	// Success
	now := time.Now()
	s.db.Model(&models.Container{}).Where("id = ?", containerID).Updates(map[string]interface{}{
		"init_status":    models.InitStatusReady,
		"init_message":   "Environment ready",
		"initialized_at": &now,
	})

	s.addLog(containerID, models.LogLevelInfo, models.LogStageReady, "Container initialization completed successfully. Environment is ready!")
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

// addLog adds a log entry for a container
func (s *ContainerService) addLog(containerID uint, level, stage, message string) {
	logEntry := &models.ContainerLog{
		ContainerID: containerID,
		Level:       level,
		Stage:       stage,
		Message:     message,
	}
	if err := s.db.Create(logEntry).Error; err != nil {
		log.Printf("Failed to save log for container %d: %v", containerID, err)
	}
}

// GetContainerLogs retrieves logs for a container
func (s *ContainerService) GetContainerLogs(containerID uint, limit int) ([]models.ContainerLog, error) {
	var logs []models.ContainerLog
	query := s.db.Where("container_id = ?", containerID).Order("created_at DESC")
	if limit > 0 {
		query = query.Limit(limit)
	}
	if err := query.Find(&logs).Error; err != nil {
		return nil, err
	}
	return logs, nil
}

// StartContainer starts a container (only if already initialized or restarting)
func (s *ContainerService) StartContainer(ctx context.Context, id uint) error {
	container, err := s.GetContainer(id)
	if err != nil {
		return err
	}

	// Only allow starting if initialization is complete
	if container.InitStatus != models.InitStatusReady {
		return ErrContainerNotReady
	}

	// Add log for restart
	s.addLog(id, models.LogLevelInfo, models.LogStageStartup, "Restarting container...")

	if err := s.dockerClient.StartContainer(ctx, container.DockerID); err != nil {
		s.addLog(id, models.LogLevelError, models.LogStageStartup, fmt.Sprintf("Failed to restart: %v", err))
		return err
	}

	s.addLog(id, models.LogLevelInfo, models.LogStageStartup, "Container restarted successfully")

	// Update status
	now := time.Now()
	if err := s.db.Model(container).Updates(map[string]interface{}{
		"status":     models.ContainerStatusRunning,
		"started_at": &now,
	}).Error; err != nil {
		return err
	}

	// Start code-server if enabled (runs in background)
	if container.EnableCodeServer {
		s.wg.Add(1)
		go func() {
			defer s.wg.Done()
			
			// Wait a moment for container to fully start, but check for shutdown
			select {
			case <-s.ctx.Done():
				log.Printf("code-server start cancelled for container %d: service shutting down", id)
				return
			case <-time.After(2 * time.Second):
			}
			
			startCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			
			if err := s.StartCodeServer(startCtx, id); err != nil {
				s.addLog(id, models.LogLevelWarn, models.LogStageStartup, fmt.Sprintf("Failed to start code-server: %v", err))
			} else {
				s.addLog(id, models.LogLevelInfo, models.LogStageStartup, "code-server started")
				
				// Re-add port record for code-server
				portService := NewPortService(s.db)
				// Use subdomain routing port (internal) or host port
				port := CodeServerInternalPort
				if container.CodeServerDomain == "" && container.CodeServerPort > 0 {
					port = container.CodeServerPort
				}
				portService.AddPort(id, port, "VS Code", "http", true)
			}
		}()
	}

	return nil
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

	s.addLog(id, models.LogLevelInfo, models.LogStageStartup, "Stopping container...")

	timeout := 30
	if err := s.dockerClient.StopContainer(ctx, container.DockerID, &timeout); err != nil {
		s.addLog(id, models.LogLevelError, models.LogStageStartup, fmt.Sprintf("Failed to stop: %v", err))
		return err
	}

	s.addLog(id, models.LogLevelInfo, models.LogStageStartup, "Container stopped")

	// Clean up terminal sessions from database
	s.db.Model(&models.TerminalSession{}).
		Where("container_id = ?", id).
		Update("active", false)

	// Remove port records (will be re-added on restart, use Unscoped for hard delete)
	s.db.Unscoped().Where("container_id = ?", id).Delete(&models.ContainerPort{})

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

	// Clean up related resources
	// Delete port records (use Unscoped for hard delete since we use raw table query)
	s.db.Unscoped().Where("container_id = ?", id).Delete(&models.ContainerPort{})
	
	// Delete terminal sessions
	s.db.Unscoped().Where("container_id = ?", id).Delete(&models.TerminalSession{})
	
	// Delete terminal history
	s.db.Where("session_id IN (SELECT session_id FROM terminal_sessions WHERE container_id = ?)", id).
		Delete(&models.TerminalHistory{})
	
	// Delete container logs
	s.db.Where("container_id = ?", id).Delete(&models.ContainerLog{})

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
// Supports both full (64 char) and short (12 char) Docker IDs
func (s *ContainerService) GetContainerByDockerID(dockerID string) (*models.Container, error) {
	var container models.Container
	
	// For short Docker IDs (12+ chars), use prefix match directly
	// For full IDs (64 chars), try exact match
	if len(dockerID) >= 64 {
		// Full Docker ID - exact match
		if err := s.db.Where("docker_id = ?", dockerID).First(&container).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil, ErrContainerNotFound
			}
			return nil, err
		}
		return &container, nil
	}
	
	// Short Docker ID (12+ chars) - use prefix match
	if len(dockerID) >= 12 {
		if err := s.db.Where("docker_id LIKE ?", dockerID+"%").First(&container).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil, ErrContainerNotFound
			}
			return nil, err
		}
		return &container, nil
	}
	
	return nil, ErrContainerNotFound
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
	ID               uint       `json:"id"`
	DockerID         string     `json:"docker_id"`
	Name             string     `json:"name"`
	Status           string     `json:"status"`
	InitStatus       string     `json:"init_status"`
	InitMessage      string     `json:"init_message,omitempty"`
	GitRepoURL       string     `json:"git_repo_url,omitempty"`
	GitRepoName      string     `json:"git_repo_name,omitempty"`
	WorkDir          string     `json:"work_dir,omitempty"`
	MemoryLimit      int64      `json:"memory_limit,omitempty"`
	CPULimit         float64    `json:"cpu_limit,omitempty"`
	ExposedPorts     string     `json:"exposed_ports,omitempty"`
	ProxyEnabled     bool       `json:"proxy_enabled"`
	ProxyDomain      string     `json:"proxy_domain,omitempty"`
	ProxyPort        int        `json:"proxy_port,omitempty"`
	ServicePort      int        `json:"service_port,omitempty"`
	EnableCodeServer bool       `json:"enable_code_server"`
	CodeServerPort   int        `json:"code_server_port,omitempty"`
	CodeServerDomain string     `json:"code_server_domain,omitempty"`
	CreatedAt        time.Time  `json:"created_at"`
	StartedAt        *time.Time `json:"started_at,omitempty"`
	StoppedAt        *time.Time `json:"stopped_at,omitempty"`
	InitializedAt    *time.Time `json:"initialized_at,omitempty"`
}

// ToContainerInfo converts a Container model to ContainerInfo
func ToContainerInfo(c *models.Container) ContainerInfo {
	return ContainerInfo{
		ID:               c.ID,
		DockerID:         c.DockerID,
		Name:             c.Name,
		Status:           c.Status,
		InitStatus:       c.InitStatus,
		InitMessage:      c.InitMessage,
		GitRepoURL:       c.GitRepoURL,
		GitRepoName:      c.GitRepoName,
		WorkDir:          c.WorkDir,
		MemoryLimit:      c.MemoryLimit,
		CPULimit:         c.CPULimit,
		ExposedPorts:     c.ExposedPorts,
		ProxyEnabled:     c.ProxyEnabled,
		ProxyDomain:      c.ProxyDomain,
		ProxyPort:        c.ProxyPort,
		ServicePort:      c.ServicePort,
		EnableCodeServer: c.EnableCodeServer,
		CodeServerPort:   c.CodeServerPort,
		CodeServerDomain: c.CodeServerDomain,
		CreatedAt:        c.CreatedAt,
		StartedAt:        c.StartedAt,
		StoppedAt:        c.StoppedAt,
		InitializedAt:    c.InitializedAt,
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

// GetContainerIP gets the IP address of a container
func (s *ContainerService) GetContainerIP(ctx context.Context, id uint) (string, error) {
	container, err := s.GetContainer(id)
	if err != nil {
		return "", err
	}
	
	return s.dockerClient.GetContainerIP(ctx, container.DockerID)
}

// CodeServerInternalPort is the fixed port code-server listens on inside the container
const CodeServerInternalPort = 8443

// StartCodeServer starts code-server in the container
func (s *ContainerService) StartCodeServer(ctx context.Context, containerID uint) error {
	container, err := s.GetContainer(containerID)
	if err != nil {
		return err
	}
	
	if !container.EnableCodeServer {
		return nil
	}
	
	// Always use the fixed internal port (8443), not the host port stored in DB
	// The host port mapping is handled by Docker port bindings
	cmd := []string{
		"bash", "-c",
		fmt.Sprintf("nohup code-server --bind-addr 0.0.0.0:%d --auth none %s > /tmp/code-server.log 2>&1 &",
			CodeServerInternalPort, container.WorkDir),
	}
	
	_, err = s.dockerClient.ExecInContainer(ctx, container.DockerID, cmd)
	if err != nil {
		s.addLog(containerID, models.LogLevelError, models.LogStageInit, fmt.Sprintf("Failed to start code-server: %v", err))
		return err
	}
	
	s.addLog(containerID, models.LogLevelInfo, models.LogStageInit, fmt.Sprintf("code-server started on container port %d", CodeServerInternalPort))
	return nil
}

// DockerContainerInfo represents a Docker container for API response
type DockerContainerInfo struct {
	ID        string   `json:"id"`
	Name      string   `json:"name"`
	Image     string   `json:"image"`
	Status    string   `json:"status"`
	State     string   `json:"state"`
	Created   int64    `json:"created"`
	Ports     []string `json:"ports"`
	IsManaged bool     `json:"is_managed"` // true if managed by this platform
}

// ListDockerContainers lists all Docker containers
func (s *ContainerService) ListDockerContainers(ctx context.Context) ([]DockerContainerInfo, error) {
	containers, err := s.dockerClient.ListContainers(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to list Docker containers: %w", err)
	}

	// Get managed container IDs from database
	managedIDs := make(map[string]bool)
	dbContainers, _ := s.ListContainers()
	for _, c := range dbContainers {
		managedIDs[c.DockerID] = true
	}

	result := make([]DockerContainerInfo, 0, len(containers))
	for _, c := range containers {
		// Format ports
		ports := make([]string, 0)
		for _, p := range c.Ports {
			if p.PublicPort > 0 {
				ports = append(ports, fmt.Sprintf("%d:%d/%s", p.PublicPort, p.PrivatePort, p.Type))
			} else {
				ports = append(ports, fmt.Sprintf("%d/%s", p.PrivatePort, p.Type))
			}
		}

		// Get container name (remove leading /)
		name := ""
		if len(c.Names) > 0 {
			name = strings.TrimPrefix(c.Names[0], "/")
		}

		result = append(result, DockerContainerInfo{
			ID:        c.ID[:12], // Short ID
			Name:      name,
			Image:     c.Image,
			Status:    c.Status,
			State:     c.State,
			Created:   c.Created,
			Ports:     ports,
			IsManaged: managedIDs[c.ID],
		})
	}

	return result, nil
}

// StopDockerContainer stops a Docker container by ID
func (s *ContainerService) StopDockerContainer(ctx context.Context, dockerID string) error {
	timeout := 30
	return s.dockerClient.StopContainer(ctx, dockerID, &timeout)
}

// RemoveDockerContainer removes a Docker container by ID
func (s *ContainerService) RemoveDockerContainer(ctx context.Context, dockerID string) error {
	// Also remove from database if it exists
	var container models.Container
	if err := s.db.Where("docker_id LIKE ?", dockerID+"%").First(&container).Error; err == nil {
		s.db.Delete(&container)
	}
	return s.dockerClient.RemoveContainer(ctx, dockerID, true)
}
