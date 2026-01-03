package main

import (
	"log"
	"os"

	"cc-platform/internal/config"
	"cc-platform/internal/database"
	"cc-platform/internal/handlers"
	"cc-platform/internal/middleware"
	"cc-platform/internal/services"
	"cc-platform/internal/terminal"

	"github.com/gin-gonic/gin"
)

func main() {
	// Load configuration
	cfg := config.Load()

	// Initialize database
	db, err := database.Initialize(cfg.DatabasePath)
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}

	// Initialize services
	authService := services.NewAuthService(db, cfg)
	githubService := services.NewGitHubService(db, cfg)
	claudeConfigService := services.NewClaudeConfigService(db, cfg)
	
	containerService, err := services.NewContainerService(db, cfg, claudeConfigService, githubService)
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

	// Display generated credentials if applicable
	if cfg.AdminUsername != "" && cfg.AdminPassword != "" {
		log.Printf("Admin credentials - Username: %s, Password: %s", cfg.AdminUsername, cfg.AdminPassword)
	}

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
	repoHandler := handlers.NewRepositoryHandler(githubService)
	containerHandler := handlers.NewContainerHandler(containerService)
	fileHandler := handlers.NewFileHandler(fileService)
	terminalHandler := handlers.NewTerminalHandler(terminalService, containerService, authService)

	// Public routes
	router.POST("/api/auth/login", authHandler.Login)
	router.POST("/api/auth/logout", authHandler.Logout)

	// Protected routes
	protected := router.Group("/api")
	protected.Use(middleware.JWTAuth(authService))
	{
		// Auth routes
		protected.GET("/auth/verify", authHandler.Verify)
		
		// Settings routes
		protected.GET("/settings/github", settingsHandler.GetGitHubConfig)
		protected.POST("/settings/github", settingsHandler.SaveGitHubToken)
		protected.GET("/settings/claude", settingsHandler.GetClaudeConfig)
		protected.POST("/settings/claude", settingsHandler.SaveClaudeConfig)

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
		protected.POST("/containers/:id/start", containerHandler.StartContainer)
		protected.POST("/containers/:id/stop", containerHandler.StopContainer)
		protected.DELETE("/containers/:id", containerHandler.DeleteContainer)

		// File routes
		protected.GET("/files/:id/list", fileHandler.ListDirectory)
		protected.GET("/files/:id/download", fileHandler.DownloadFile)
		protected.POST("/files/:id/upload", fileHandler.UploadFile)
		protected.DELETE("/files/:id", fileHandler.DeleteFile)
		protected.POST("/files/:id/mkdir", fileHandler.CreateDirectory)

		// Terminal sessions route
		protected.GET("/terminals/:id/sessions", terminalHandler.GetSessions)
	}

	// WebSocket routes (with JWT query param auth)
	router.GET("/api/ws/terminal/:id", terminalHandler.HandleWebSocket)

	// Start server
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	
	log.Printf("Server starting on port %s", port)
	if err := router.Run(":" + port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
