package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"cc-platform/internal/config"
	"cc-platform/internal/database"
	"cc-platform/internal/docker"
	"cc-platform/internal/handlers"
	"cc-platform/internal/headless"
	"cc-platform/internal/middleware"
	"cc-platform/internal/mode"
	"cc-platform/internal/monitoring"
	"cc-platform/internal/services"
	"cc-platform/internal/terminal"

	"github.com/gin-gonic/gin"
)

func main() {
	// Load configuration
	cfg := config.Load()

	// Initialize Traefik service (needed for proxy routing)
	var traefikService *services.TraefikService
	if cfg.AutoStartTraefik {
		var err error
		traefikService, err = services.NewTraefikService(cfg)
		if err != nil {
			log.Printf("Warning: Failed to initialize Traefik service: %v", err)
		} else {
			defer traefikService.Close()
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
			if err := traefikService.EnsureTraefik(ctx); err != nil {
				log.Printf("Warning: Failed to ensure Traefik is running: %v", err)
			} else if traefikService.HTTPPort > 0 {
				log.Printf("Traefik HTTP port: %d", traefikService.HTTPPort)
				log.Printf("Traefik Dashboard: http://localhost:%d/dashboard/", traefikService.DashboardPort)
				log.Printf("Traefik direct ports: %d-%d", cfg.TraefikPortRangeStart, cfg.TraefikPortRangeEnd)
			}
			cancel()
		}
	}

	// Initialize database
	db, err := database.Initialize(cfg.DatabasePath)
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}

	// Initialize services
	authService, err := services.NewAuthService(db, cfg)
	if err != nil {
		log.Fatalf("Failed to initialize auth service: %v", err)
	}
	
	githubService := services.NewGitHubService(db, cfg)
	claudeConfigService := services.NewClaudeConfigService(db, cfg)
	configProfileService := services.NewConfigProfileService(db, cfg)
	configTemplateService := services.NewConfigTemplateService(db)
	portService := services.NewPortService(db)

	// Start port cleanup routine (every 5 minutes)
	cleanupCtx, cleanupCancel := context.WithCancel(context.Background())
	defer cleanupCancel()
	portService.StartCleanupRoutine(cleanupCtx, 5*time.Minute)

	// Create ConfigInjectionService for injecting Claude configs into containers
	// Note: We need to create a docker client for the injection service
	// The ContainerService will create its own docker client internally
	configInjectionService := services.NewConfigInjectionServiceWithNewClient(configTemplateService)

	containerService, err := services.NewContainerService(db, cfg, claudeConfigService, githubService, configProfileService, configInjectionService)
	if err != nil {
		log.Fatalf("Failed to initialize container service: %v", err)
	}
	defer containerService.Close()

	fileService, err := services.NewFileService(db)
	if err != nil {
		log.Fatalf("Failed to initialize file service: %v", err)
	}
	defer fileService.Close()

	terminalService, err := terminal.NewTerminalService(db)
	if err != nil {
		log.Fatalf("Failed to initialize terminal service: %v", err)
	}
	defer terminalService.Close()

	// Initialize monitoring service
	monitoringService := services.NewMonitoringService(db, terminalService)
	defer monitoringService.Close()

	// Initialize Docker event listener for container lifecycle events
	dockerEventListener, err := monitoring.NewDockerEventListener(monitoringService.GetManager())
	if err != nil {
		log.Printf("Warning: Failed to initialize Docker event listener: %v", err)
	} else {
		if err := dockerEventListener.Start(); err != nil {
			log.Printf("Warning: Failed to start Docker event listener: %v", err)
		} else {
			defer dockerEventListener.Close()
		}
	}

	// Initialize cleanup manager for graceful shutdown
	cleanupManager := monitoring.NewCleanupManager(monitoringService.GetManager())

	// Initialize Headless manager
	headlessManager := headless.NewHeadlessManager(db, monitoringService.GetManager())
	defer headlessManager.Close()

	// Initialize Mode manager
	modeManager := mode.NewModeManager(terminalService, headlessManager, monitoringService.GetManager())

	// Log startup info (without sensitive credentials)
	log.Printf("Admin user: %s (password configured via .env)", cfg.AdminUsername)

	// Setup Gin router
	if cfg.Environment == "production" {
		gin.SetMode(gin.ReleaseMode)
	}
	
	router := gin.Default()

	// CORS middleware
	router.Use(middleware.CORS())

	// Initialize handlers
	authHandler := handlers.NewAuthHandler(authService)
	settingsHandler := handlers.NewSettingsHandler(githubService, claudeConfigService)
	configProfileHandler := handlers.NewConfigProfileHandler(configProfileService)
	configTemplateHandler := handlers.NewConfigTemplateHandler(configTemplateService)
	repoHandler := handlers.NewRepositoryHandler(githubService, configProfileService)
	containerHandler := handlers.NewContainerHandler(containerService, terminalService, configProfileService)
	fileHandler := handlers.NewFileHandler(fileService)
	terminalHandler := handlers.NewTerminalHandler(terminalService, containerService, authService)
	portHandler := handlers.NewPortHandler(portService)
	proxyHandler := handlers.NewProxyHandler(containerService, db)
	automationLogsHandler := handlers.NewAutomationLogsHandler(db)
	monitoringHandler := handlers.NewMonitoringHandler(monitoringService)
	taskQueueHandler := handlers.NewTaskQueueHandler(services.NewTaskQueueService(db))
	headlessHandler := handlers.NewHeadlessHandler(headlessManager, modeManager, containerService, authService)

	// Initialize CLI tool service for Gemini→Codex workflow
	cliToolDockerClient, err := docker.NewClient()
	if err != nil {
		log.Printf("Warning: Failed to create Docker client for CLI tool service: %v", err)
	}
	var cliToolHandler *handlers.CLIToolHandler
	if cliToolDockerClient != nil {
		cliToolService := services.NewCLIToolService(cliToolDockerClient)
		cliToolHandler = handlers.NewCLIToolHandler(cliToolService)
	}

	// Health check endpoint (for Docker healthcheck / load balancers)
	router.GET("/api/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	// Public routes (with rate limiting for login)
	router.POST("/api/auth/login", middleware.LoginRateLimit(), authHandler.Login)
	router.POST("/api/auth/logout", authHandler.Logout)

	// Protected routes
	protected := router.Group("/api")
	protected.Use(middleware.JWTAuth(authService))
	{
		// Auth routes
		protected.GET("/auth/verify", authHandler.Verify)
		
		// Settings routes (legacy)
		protected.GET("/settings/github", settingsHandler.GetGitHubConfig)
		protected.POST("/settings/github", settingsHandler.SaveGitHubToken)
		protected.GET("/settings/claude", settingsHandler.GetClaudeConfig)
		protected.POST("/settings/claude", settingsHandler.SaveClaudeConfig)

		// Config profile routes (new multi-config)
		configProfileHandler.RegisterRoutes(protected.Group("/settings"))

		// Claude config template routes
		configTemplateHandler.RegisterRoutes(protected)

		// Repository routes
		protected.GET("/repos/remote", repoHandler.ListRemoteRepositories)
		protected.POST("/repos/clone", repoHandler.CloneRepository)
		protected.GET("/repos/local", repoHandler.ListLocalRepositories)
		protected.DELETE("/repos/:id", repoHandler.DeleteRepository)

		// Container routes
		protected.GET("/containers", containerHandler.ListContainers)
		protected.POST("/containers", containerHandler.CreateContainer)
		protected.GET("/containers/:id", containerHandler.GetContainer)
		protected.GET("/containers/:id/status", containerHandler.GetContainerStatus)
		protected.GET("/containers/:id/logs", containerHandler.GetContainerLogs)
		protected.GET("/containers/:id/api-config", containerHandler.GetContainerApiConfig)
		protected.GET("/containers/:id/models", containerHandler.GetContainerModels)
		protected.POST("/containers/:id/start", containerHandler.StartContainer)
		protected.POST("/containers/:id/stop", containerHandler.StopContainer)
		protected.POST("/containers/:id/inject-configs", containerHandler.InjectConfigs)
		protected.DELETE("/containers/:id", containerHandler.DeleteContainer)

		// Docker container management (all containers including orphaned)
		protected.GET("/docker/containers", containerHandler.ListDockerContainers)
		protected.POST("/docker/containers/:dockerId/stop", containerHandler.StopDockerContainer)
		protected.DELETE("/docker/containers/:dockerId", containerHandler.RemoveDockerContainer)

		// Port management routes
		protected.GET("/containers/:id/ports", portHandler.ListPorts)
		protected.POST("/containers/:id/ports", portHandler.AddPort)
		protected.DELETE("/containers/:id/ports/:port", portHandler.RemovePort)
		protected.GET("/ports", portHandler.ListAllPorts)

		// File routes
		protected.GET("/files/:id/list", fileHandler.ListDirectory)
		protected.GET("/files/:id/download", fileHandler.DownloadFile)
		protected.POST("/files/:id/upload", fileHandler.UploadFile)
		protected.DELETE("/files/:id", fileHandler.DeleteFile)
		protected.POST("/files/:id/mkdir", fileHandler.CreateDirectory)

		// Terminal sessions route
		protected.GET("/terminals/:id/sessions", terminalHandler.GetSessions)

		// Automation logs routes
		protected.GET("/logs/automation", automationLogsHandler.ListLogs)
		protected.GET("/logs/automation/stats", automationLogsHandler.GetLogStats)
		protected.GET("/logs/automation/export", automationLogsHandler.ExportLogs)
		protected.DELETE("/logs/automation/cleanup", automationLogsHandler.DeleteOldLogs)
		protected.GET("/logs/automation/:id", automationLogsHandler.GetLog)
		protected.GET("/logs/automation/container/:containerId", automationLogsHandler.GetLogsByContainer)

		// Monitoring routes
		monitoringHandler.RegisterRoutes(protected)

		// Task queue routes
		taskQueueHandler.RegisterRoutes(protected)

		// Headless conversation routes
		protected.GET("/containers/:id/headless/conversations", headlessHandler.ListConversations)
		protected.GET("/containers/:id/headless/conversations/:conversationId", headlessHandler.GetConversation)
		protected.DELETE("/containers/:id/headless/conversations/:conversationId", headlessHandler.DeleteConversation)
		protected.GET("/containers/:id/headless/conversations/:conversationId/turns", headlessHandler.GetConversationTurns)

		// CLI tool workflow routes
		if cliToolHandler != nil {
			cliTools := protected.Group("/cli-tools")
			cliTools.POST("/sequential", cliToolHandler.HandleSequentialWorkflow)
			cliTools.POST("/analyze", cliToolHandler.HandleGeminiAnalysis)
		}
	}

	// WebSocket routes (with JWT query param auth)
	router.GET("/api/ws/terminal/:id", terminalHandler.HandleWebSocket)
	router.GET("/api/ws/headless/:containerId", headlessHandler.HandleHeadlessWebSocket)
	router.GET("/api/ws/headless/conversation/:conversationId", headlessHandler.HandleConversationWebSocket)

	// Proxy routes (with flexible auth - supports header, cookie, or query param)
	proxyGroup := router.Group("/api/proxy")
	proxyGroup.Use(middleware.FlexibleAuth(authService))
	{
		proxyGroup.Any("/:id/:port", proxyHandler.ProxyRequest)
		proxyGroup.Any("/:id/:port/*path", proxyHandler.ProxyRequest)
	}

	// Start server with graceful shutdown
	port := cfg.Port
	
	srv := &http.Server{
		Addr:    fmt.Sprintf("0.0.0.0:%d", port),
		Handler: router,
	}

	// Start server in goroutine
	go func() {
		log.Printf("Server starting on 0.0.0.0:%d", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Failed to start server: %v", err)
		}
	}()

	// Wait for interrupt signal for graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down server...")

	// Graceful shutdown with timeout
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer shutdownCancel()

	// Cleanup monitoring sessions
	if err := cleanupManager.GracefulShutdown(10 * time.Second); err != nil {
		log.Printf("Warning: Monitoring cleanup error: %v", err)
	}

	// Shutdown HTTP server
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("Server forced to shutdown: %v", err)
	}

	log.Println("Server exited")
}
