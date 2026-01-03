package handlers

import (
	"fmt"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strconv"
	"strings"

	"cc-platform/internal/services"

	"github.com/gin-gonic/gin"
)

// ProxyHandler handles proxy requests to container services
type ProxyHandler struct {
	containerService *services.ContainerService
}

// NewProxyHandler creates a new ProxyHandler
func NewProxyHandler(containerService *services.ContainerService) *ProxyHandler {
	return &ProxyHandler{
		containerService: containerService,
	}
}

// ProxyRequest proxies HTTP requests to container services
func (h *ProxyHandler) ProxyRequest(c *gin.Context) {
	// Get container ID and port from path
	idStr := c.Param("id")
	portStr := c.Param("port")
	
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid container ID"})
		return
	}
	
	port, err := strconv.Atoi(portStr)
	if err != nil || port <= 0 || port > 65535 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid port"})
		return
	}
	
	// Get container IP
	containerIP, err := h.containerService.GetContainerIP(c.Request.Context(), uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": fmt.Sprintf("Container not found or not running: %v", err)})
		return
	}
	
	// Build target URL
	targetURL := fmt.Sprintf("http://%s:%d", containerIP, port)
	target, err := url.Parse(targetURL)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse target URL"})
		return
	}
	
	// Create reverse proxy
	proxy := httputil.NewSingleHostReverseProxy(target)
	
	// Modify the request
	originalDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		originalDirector(req)
		
		// Get the remaining path after /proxy/:id/:port
		// The path param contains everything after /proxy/:id/:port
		path := c.Param("path")
		if path == "" {
			path = "/"
		}
		if !strings.HasPrefix(path, "/") {
			path = "/" + path
		}
		req.URL.Path = path
		req.URL.RawQuery = c.Request.URL.RawQuery
		
		// Set headers
		req.Header.Set("X-Forwarded-Host", req.Host)
		req.Header.Set("X-Forwarded-Proto", "http")
		req.Host = target.Host
	}
	
	// Handle errors
	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		c.JSON(http.StatusBadGateway, gin.H{
			"error": fmt.Sprintf("Proxy error: %v", err),
			"hint":  "Make sure the service is running on the specified port inside the container",
		})
	}
	
	// Serve the request
	proxy.ServeHTTP(c.Writer, c.Request)
}

// ProxyWebSocket proxies WebSocket connections to container services
func (h *ProxyHandler) ProxyWebSocket(c *gin.Context) {
	// WebSocket proxy is handled by the same method
	// The httputil.ReverseProxy handles WebSocket upgrade automatically
	h.ProxyRequest(c)
}
