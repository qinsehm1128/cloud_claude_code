package main

import (
	"log"
	"os"

	"cc-platform/internal/config"
	"cc-platform/internal/database"
	"cc-platform/internal/handlers"
	"cc-platform/internal/middleware"
	"cc-platform/internal/services"

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

	// Public routes
	authHandler := handlers.NewAuthHandler(authService)
	router.POST("/api/auth/login", authHandler.Login)
	router.POST("/api/auth/logout", authHandler.Logout)

	// Protected routes
	protected := router.Group("/api")
	protected.Use(middleware.JWTAuth(authService))
	{
		protected.GET("/auth/verify", authHandler.Verify)
		
		// Settings routes will be added here
		// Repository routes will be added here
		// Container routes will be added here
		// File routes will be added here
	}

	// WebSocket routes (with JWT query param auth)
	// ws := router.Group("/api/ws")
	// ws.GET("/terminal/:containerId", terminalHandler.HandleWebSocket)

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
