package handlers

import (
	"fmt"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strconv"
	"strings"

	"cc-platform/internal/models"
	"cc-platform/internal/services"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ProxyHandler handles proxy requests to container services
type ProxyHandler struct {
	containerService *services.ContainerService
	portService      *services.PortService
}

// NewProxyHandler creates a new ProxyHandler
func NewProxyHandler(containerService *services.ContainerService, db *gorm.DB) *ProxyHandler {
	return &ProxyHandler{
		containerService: containerService,
		portService:      services.NewPortService(db),
	}
}

// ProxyRequest proxies HTTP requests to container services
// Routes directly to container IP via Docker network (traefik-net or bridge)
func (h *ProxyHandler) ProxyRequest(c *gin.Context) {
	// Get container ID and port from path
	idStr := c.Param("id")
	portStr := c.Param("port")
	
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid container ID"})
		return
	}
	
	containerPort, err := strconv.Atoi(portStr)
	if err != nil || containerPort <= 0 || containerPort > 65535 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid port"})
		return
	}
	
	// Get container to verify it exists
	container, err := h.containerService.GetContainer(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": fmt.Sprintf("Container not found: %v", err)})
		return
	}
	
	// Get container IP (prefers traefik-net, falls back to bridge)
	containerIP, err := h.containerService.GetContainerIP(c.Request.Context(), container.ID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": fmt.Sprintf("Container not running: %v", err)})
		return
	}
	
	h.proxyToContainer(c, container, containerIP, containerPort, idStr, portStr)
}

// proxyToContainer proxies requests directly to container IP
func (h *ProxyHandler) proxyToContainer(c *gin.Context, container *models.Container, containerIP string, port int, idStr, portStr string) {
	targetURL := fmt.Sprintf("http://%s:%d", containerIP, port)
	target, err := url.Parse(targetURL)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse target URL"})
		return
	}
	
	// Base path for this proxy
	basePath := fmt.Sprintf("/api/proxy/%s/%s", idStr, portStr)
	
	proxy := httputil.NewSingleHostReverseProxy(target)
	
	originalDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		originalDirector(req)
		
		// Get the remaining path after /proxy/:id/:port
		path := c.Param("path")
		if path == "" {
			path = "/"
		}
		if !strings.HasPrefix(path, "/") {
			path = "/" + path
		}
		req.URL.Path = path
		req.URL.RawQuery = c.Request.URL.RawQuery
		
		// Set headers for proper proxying
		req.Header.Set("X-Forwarded-Host", c.Request.Host)
		req.Header.Set("X-Forwarded-Proto", "http")
		req.Header.Set("X-Real-IP", c.ClientIP())
		req.Header.Set("X-Forwarded-For", c.ClientIP())
		req.Host = target.Host
	}
	
	// Modify the response to rewrite redirects
	proxy.ModifyResponse = func(resp *http.Response) error {
		if location := resp.Header.Get("Location"); location != "" {
			locURL, err := url.Parse(location)
			if err == nil {
				// If it's a relative path or same host, prepend our base path
				if locURL.Host == "" || locURL.Host == target.Host {
					newPath := locURL.Path
					// Don't double-prefix
					if !strings.HasPrefix(newPath, basePath) && !strings.HasPrefix(newPath, "/api/proxy/") {
						locURL.Path = basePath + newPath
					}
					resp.Header.Set("Location", locURL.String())
				}
			}
		}
		return nil
	}
	
	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		c.JSON(http.StatusBadGateway, gin.H{
			"error": fmt.Sprintf("Proxy error: %v", err),
			"hint":  "Make sure the service is running on the specified port inside the container",
		})
	}
	
	proxy.ServeHTTP(c.Writer, c.Request)
}

// ProxyWebSocket proxies WebSocket connections to container services
func (h *ProxyHandler) ProxyWebSocket(c *gin.Context) {
	h.ProxyRequest(c)
}
