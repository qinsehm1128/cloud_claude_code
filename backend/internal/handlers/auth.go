package handlers

import (
	"net/http"
	"os"

	"cc-platform/internal/services"

	"github.com/gin-gonic/gin"
)

const (
	// Cookie name for JWT token
	TokenCookieName = "cc_token"
	// Cookie max age in seconds (24 hours)
	TokenCookieMaxAge = 86400
)

// AuthHandler handles authentication endpoints
type AuthHandler struct {
	authService *services.AuthService
}

// NewAuthHandler creates a new AuthHandler
func NewAuthHandler(authService *services.AuthService) *AuthHandler {
	return &AuthHandler{
		authService: authService,
	}
}

// LoginRequest represents the login request body
type LoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

// LoginResponse represents the login response
type LoginResponse struct {
	Message string `json:"message"`
}

// isSecureRequest checks if the request should use secure cookies
// It considers both the environment and the actual request protocol
func isSecureRequest(c *gin.Context) bool {
	// In development mode, never use secure cookies
	if os.Getenv("ENVIRONMENT") != "production" {
		return false
	}

	// Check if request came over HTTPS (directly or via proxy)
	// X-Forwarded-Proto is set by reverse proxies (nginx, etc.)
	if proto := c.GetHeader("X-Forwarded-Proto"); proto == "https" {
		return true
	}

	// Check the actual request scheme
	if c.Request.TLS != nil {
		return true
	}

	// In production but not HTTPS, still don't set Secure flag
	// This allows HTTP deployments to work (not recommended but functional)
	return false
}

// Login handles user login
func (h *AuthHandler) Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	token, err := h.authService.Login(req.Username, req.Password)
	if err != nil {
		if err == services.ErrInvalidCredentials {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Internal server error"})
		return
	}

	// Set httpOnly cookie with the token
	// Secure flag is set based on actual request protocol
	secure := isSecureRequest(c)
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(
		TokenCookieName,    // name
		token,              // value
		TokenCookieMaxAge,  // maxAge (24 hours)
		"/",                // path
		"",                 // domain (empty = current domain)
		secure,             // secure (HTTPS only when actually using HTTPS)
		true,               // httpOnly (not accessible via JavaScript)
	)

	c.JSON(http.StatusOK, LoginResponse{Message: "Login successful"})
}

// Logout handles user logout
func (h *AuthHandler) Logout(c *gin.Context) {
	// Clear the cookie by setting maxAge to -1
	c.SetCookie(
		TokenCookieName,
		"",
		-1,
		"/",
		"",
		isSecureRequest(c),
		true,
	)
	c.JSON(http.StatusOK, gin.H{"message": "Logged out successfully"})
}

// Verify verifies the current token
func (h *AuthHandler) Verify(c *gin.Context) {
	username, exists := c.Get("username")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Not authenticated"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"valid":    true,
		"username": username,
	})
}
