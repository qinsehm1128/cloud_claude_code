package middleware

import (
	"net/http"
	"strings"

	"cc-platform/internal/services"

	"github.com/gin-gonic/gin"
)

// JWTAuth returns a middleware that validates JWT tokens
func JWTAuth(authService *services.AuthService) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization header required"})
			c.Abort()
			return
		}

		// Extract token from "Bearer <token>"
		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || parts[0] != "Bearer" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid authorization header format"})
			c.Abort()
			return
		}

		token := parts[1]
		claims, err := authService.VerifyToken(token)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or expired token"})
			c.Abort()
			return
		}

		// Store claims in context for later use
		c.Set("claims", claims)
		c.Set("username", claims.Username)

		c.Next()
	}
}

// FlexibleAuth returns a middleware that validates JWT tokens from multiple sources:
// 1. Authorization header (Bearer token)
// 2. Cookie (cc_token)
// 3. Query parameter (token)
// This is useful for browser-based access to proxied services like code-server
func FlexibleAuth(authService *services.AuthService) gin.HandlerFunc {
	return func(c *gin.Context) {
		var token string

		// Try Authorization header first
		authHeader := c.GetHeader("Authorization")
		if authHeader != "" {
			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) == 2 && parts[0] == "Bearer" {
				token = parts[1]
			}
		}

		// Try cookie if no header
		if token == "" {
			if cookieToken, err := c.Cookie("cc_token"); err == nil && cookieToken != "" {
				token = cookieToken
			}
		}

		// Try query parameter if no cookie
		if token == "" {
			token = c.Query("token")
		}

		// No token found
		if token == "" {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error": "Authentication required",
				"hint":  "Provide token via Authorization header, cc_token cookie, or token query parameter",
			})
			c.Abort()
			return
		}

		// Verify token
		claims, err := authService.VerifyToken(token)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or expired token"})
			c.Abort()
			return
		}

		// Store claims in context
		c.Set("claims", claims)
		c.Set("username", claims.Username)

		c.Next()
	}
}
