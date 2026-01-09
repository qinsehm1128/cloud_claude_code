package middleware

import (
	"net/http"
	"strings"

	"cc-platform/internal/services"

	"github.com/gin-gonic/gin"
)

const (
	// Cookie name for JWT token
	TokenCookieName = "cc_token"
)

// JWTAuth returns a middleware that validates JWT tokens from Cookie or Authorization header
func JWTAuth(authService *services.AuthService) gin.HandlerFunc {
	return func(c *gin.Context) {
		var token string

		// Try Cookie first (preferred for httpOnly security)
		if cookieToken, err := c.Cookie(TokenCookieName); err == nil && cookieToken != "" {
			token = cookieToken
		}

		// Fallback to Authorization header
		if token == "" {
			authHeader := c.GetHeader("Authorization")
			if authHeader != "" {
				parts := strings.SplitN(authHeader, " ", 2)
				if len(parts) == 2 && parts[0] == "Bearer" {
					token = parts[1]
				}
			}
		}

		if token == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authentication required"})
			c.Abort()
			return
		}

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
// 1. Cookie (cc_token) - preferred for security
// 2. Authorization header (Bearer token)
// 3. Query parameter (token) - for WebSocket connections
// This is useful for browser-based access to proxied services like code-server
func FlexibleAuth(authService *services.AuthService) gin.HandlerFunc {
	return func(c *gin.Context) {
		var token string

		// Try Cookie first (preferred for httpOnly security)
		if cookieToken, err := c.Cookie(TokenCookieName); err == nil && cookieToken != "" {
			token = cookieToken
		}

		// Try Authorization header
		if token == "" {
			authHeader := c.GetHeader("Authorization")
			if authHeader != "" {
				parts := strings.SplitN(authHeader, " ", 2)
				if len(parts) == 2 && parts[0] == "Bearer" {
					token = parts[1]
				}
			}
		}

		// Try query parameter (for WebSocket)
		if token == "" {
			token = c.Query("token")
		}

		// No token found
		if token == "" {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error": "Authentication required",
				"hint":  "Please login first",
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
