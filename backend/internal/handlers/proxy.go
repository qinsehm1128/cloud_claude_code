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
	traefikService   *services.TraefikService
}

// NewProxyHandler creates a new ProxyHandler
func NewProxyHandler(containerService *services.ContainerService, db *gorm.DB, traefikService *services.TraefikService) *ProxyHandler {
	return &ProxyHandler{
		containerService: containerService,
		portService:      services.NewPortService(db),
		traefikService:   traefikService,
	}
}

// ProxyRequest proxies HTTP requests to container services through Traefik
// The port parameter is the container internal port (e.g., 8443 for code-server)
// Requests are routed through Traefik which handles the container networking
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
	
	// Get container to verify it exists and is running
	container, err := h.containerService.GetContainer(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": fmt.Sprintf("Container not found: %v", err)})
		return
	}
	
	// Check if this is the code-server port - route through Traefik
	if containerPort == services.CodeServerInternalPort && container.EnableCodeServer {
		h.proxyThroughTraefik(c, container, idStr, portStr)
		return
	}
	
	// For other ports, try direct container IP access (legacy behavior)
	h.proxyDirectToContainer(c, container, containerPort, idStr, portStr)
}

// proxyThroughTraefik routes requests through Traefik for code-server
func (h *ProxyHandler) proxyThroughTraefik(c *gin.Context, container *models.Container, idStr, portStr string) {
	// Get Traefik HTTP port
	traefikPort := h.traefikService.HTTPPort
	if traefikPort == 0 {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Traefik is not running"})
		return
	}
	
	// Build target URL - proxy through Traefik
	// Traefik routes /code/{container-name}/* to the container's code-server
	targetURL := fmt.Sprintf("http://127.0.0.1:%d", traefikPort)
	target, err := url.Parse(targetURL)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse target URL"})
		return
	}
	
	// Base path for this proxy (what the client sees)
	basePath := fmt.Sprintf("/api/proxy/%s/%s", idStr, portStr)
	// Traefik path (what Traefik expects)
	traefikPath := fmt.Sprintf("/code/%s", container.Name)
	
	// Create reverse proxy
	proxy := httputil.NewSingleHostReverseProxy(target)
	
	// Modify the request
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
		
		// Route through Traefik's path: /code/{container-name}{path}
		req.URL.Path = traefikPath + path
		req.URL.RawQuery = c.Request.URL.RawQuery
		
		// Set headers for proper proxying
		req.Header.Set("X-Forwarded-Host", c.Request.Host)
		req.Header.Set("X-Forwarded-Proto", "http")
		req.Header.Set("X-Real-IP", c.ClientIP())
		req.Header.Set("X-Forwarded-For", c.ClientIP())
		req.Header.Set("X-Forwarded-Prefix", basePath)
		req.Host = target.Host
	}
	
	// Modify the response to rewrite redirects
	proxy.ModifyResponse = func(resp *http.Response) error {
		if location := resp.Header.Get("Location"); location != "" {
			locURL, err := url.Parse(location)
			if err == nil {
				// Rewrite Traefik paths back to our proxy paths
				if strings.HasPrefix(locURL.Path, traefikPath) {
					locURL.Path = basePath + strings.TrimPrefix(locURL.Path, traefikPath)
					resp.Header.Set("Location", locURL.String())
				} else if locURL.Host == "" || locURL.Host == target.Host {
					// Relative redirect
					if !strings.HasPrefix(locURL.Path, basePath) {
						locURL.Path = basePath + locURL.Path
					}
					resp.Header.Set("Location", locURL.String())
				}
			}
		}
		return nil
	}
	
	// Handle errors
	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		c.JSON(http.StatusBadGateway, gin.H{
			"error": fmt.Sprintf("Proxy error: %v", err),
			"hint":  "Make sure Traefik is running and the container is connected to traefik-net",
		})
	}
	
	proxy.ServeHTTP(c.Writer, c.Request)
}

// proxyDirectToContainer routes requests directly to container IP (legacy)
func (h *ProxyHandler) proxyDirectToContainer(c *gin.Context, container *models.Container, port int, idStr, portStr string) {
	// Get container IP
	containerIP, err := h.containerService.GetContainerIP(c.Request.Context(), container.ID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": fmt.Sprintf("Container not running: %v", err)})
		return
	}
	
	targetURL := fmt.Sprintf("http://%s:%d", containerIP, port)
	target, err := url.Parse(targetURL)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse target URL"})
		return
	}
	
	basePath := fmt.Sprintf("/api/proxy/%s/%s", idStr, portStr)
	
	proxy := httputil.NewSingleHostReverseProxy(target)
	
	originalDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		originalDirector(req)
		
		path := c.Param("path")
		if path == "" {
			path = "/"
		}
		if !strings.HasPrefix(path, "/") {
			path = "/" + path
		}
		req.URL.Path = path
		req.URL.RawQuery = c.Request.URL.RawQuery
		
		req.Header.Set("X-Forwarded-Host", c.Request.Host)
		req.Header.Set("X-Forwarded-Proto", "http")
		req.Header.Set("X-Real-IP", c.ClientIP())
		req.Header.Set("X-Forwarded-For", c.ClientIP())
		req.Header.Set("X-Forwarded-Prefix", basePath)
		req.Host = target.Host
	}
	
	proxy.ModifyResponse = func(resp *http.Response) error {
		if location := resp.Header.Get("Location"); location != "" {
			locURL, err := url.Parse(location)
			if err == nil {
				if locURL.Host == "" || locURL.Host == target.Host {
					if !strings.HasPrefix(locURL.Path, basePath) {
						locURL.Path = basePath + locURL.Path
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
