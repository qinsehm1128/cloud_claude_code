package middleware

import (
	"os"
	"strings"

	"github.com/gin-gonic/gin"
)

// getAllowedOrigins returns the list of allowed origins based on environment
func getAllowedOrigins() map[string]bool {
	// Default allowed origins for development
	allowed := map[string]bool{
		"http://localhost:3000":  true,
		"http://localhost:5173":  true,
		"http://127.0.0.1:3000":  true,
		"http://127.0.0.1:5173":  true,
	}

	// Add custom origins from environment variable (comma-separated)
	if customOrigins := os.Getenv("ALLOWED_ORIGINS"); customOrigins != "" {
		for _, origin := range strings.Split(customOrigins, ",") {
			origin = strings.TrimSpace(origin)
			if origin != "" {
				allowed[origin] = true
			}
		}
	}

	return allowed
}

// CORS returns a middleware that handles CORS with origin whitelist
func CORS() gin.HandlerFunc {
	allowedOrigins := getAllowedOrigins()

	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")

		// Check if origin is allowed
		if origin != "" && allowedOrigins[origin] {
			c.Header("Access-Control-Allow-Origin", origin)
			c.Header("Access-Control-Allow-Credentials", "true")
		}

		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Origin, Content-Type, Authorization")
		c.Header("Access-Control-Max-Age", "86400")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	}
}

// IsOriginAllowed checks if an origin is in the whitelist
func IsOriginAllowed(origin string) bool {
	return getAllowedOrigins()[origin]
}
