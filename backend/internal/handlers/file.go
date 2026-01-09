package handlers

import (
	"io"
	"log"
	"net/http"
	"path/filepath"

	"cc-platform/internal/services"

	"github.com/gin-gonic/gin"
)

// FileHandler handles file management endpoints
type FileHandler struct {
	fileService *services.FileService
}

// NewFileHandler creates a new FileHandler
func NewFileHandler(fileService *services.FileService) *FileHandler {
	return &FileHandler{
		fileService: fileService,
	}
}

// ListDirectory lists files in a directory
func (h *FileHandler) ListDirectory(c *gin.Context) {
	containerID, err := parseID(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid container ID"})
		return
	}

	path := c.Query("path")
	if path == "" {
		path = "/"
	}

	files, err := h.fileService.ListDirectory(c.Request.Context(), containerID, path)
	if err != nil {
		switch err {
		case services.ErrContainerNotFound:
			c.JSON(http.StatusNotFound, gin.H{"error": "Container not found"})
		case services.ErrContainerNotRunning:
			c.JSON(http.StatusBadRequest, gin.H{"error": "Container is not running"})
		case services.ErrPathTraversal:
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid path"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}

	c.JSON(http.StatusOK, files)
}

// DownloadFile downloads a file from a container
func (h *FileHandler) DownloadFile(c *gin.Context) {
	containerID, err := parseID(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid container ID"})
		return
	}

	path := c.Query("path")
	if path == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Path is required"})
		return
	}

	reader, filename, err := h.fileService.DownloadFile(c.Request.Context(), containerID, path)
	if err != nil {
		switch err {
		case services.ErrContainerNotFound:
			c.JSON(http.StatusNotFound, gin.H{"error": "Container not found"})
		case services.ErrContainerNotRunning:
			c.JSON(http.StatusBadRequest, gin.H{"error": "Container is not running"})
		case services.ErrPathTraversal:
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid path"})
		case services.ErrNotAFile:
			c.JSON(http.StatusBadRequest, gin.H{"error": "Path is a directory, not a file"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}
	defer reader.Close()

	// Set headers for file download
	c.Header("Content-Disposition", "attachment; filename="+filename)
	c.Header("Content-Type", "application/octet-stream")

	// Stream the file
	if _, err := io.Copy(c.Writer, reader); err != nil {
		// Log error but can't change response status as headers already sent
		log.Printf("Error streaming file download: %v", err)
	}
}

// UploadFile uploads a file to a container
func (h *FileHandler) UploadFile(c *gin.Context) {
	containerID, err := parseID(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid container ID"})
		return
	}

	// Get destination path
	destPath := c.PostForm("path")
	if destPath == "" {
		destPath = "/"
	}

	// Get uploaded file
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No file uploaded"})
		return
	}
	defer file.Close()

	// Build full destination path
	fullPath := filepath.Join(destPath, header.Filename)

	// Upload file
	err = h.fileService.UploadFile(c.Request.Context(), containerID, fullPath, file, header.Size)
	if err != nil {
		switch err {
		case services.ErrContainerNotFound:
			c.JSON(http.StatusNotFound, gin.H{"error": "Container not found"})
		case services.ErrContainerNotRunning:
			c.JSON(http.StatusBadRequest, gin.H{"error": "Container is not running"})
		case services.ErrPathTraversal:
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid path"})
		case services.ErrFileTooLarge:
			c.JSON(http.StatusBadRequest, gin.H{"error": "File exceeds maximum size limit (100MB)"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":  "File uploaded successfully",
		"filename": header.Filename,
		"path":     fullPath,
	})
}

// DeleteFile deletes a file or directory
func (h *FileHandler) DeleteFile(c *gin.Context) {
	containerID, err := parseID(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid container ID"})
		return
	}

	path := c.Query("path")
	if path == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Path is required"})
		return
	}

	err = h.fileService.DeleteFile(c.Request.Context(), containerID, path)
	if err != nil {
		switch err {
		case services.ErrContainerNotFound:
			c.JSON(http.StatusNotFound, gin.H{"error": "Container not found"})
		case services.ErrContainerNotRunning:
			c.JSON(http.StatusBadRequest, gin.H{"error": "Container is not running"})
		case services.ErrPathTraversal:
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid path"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "File deleted successfully"})
}

// CreateDirectory creates a directory
func (h *FileHandler) CreateDirectory(c *gin.Context) {
	containerID, err := parseID(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid container ID"})
		return
	}

	var req struct {
		Path string `json:"path" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Path is required"})
		return
	}

	err = h.fileService.CreateDirectory(c.Request.Context(), containerID, req.Path)
	if err != nil {
		switch err {
		case services.ErrContainerNotFound:
			c.JSON(http.StatusNotFound, gin.H{"error": "Container not found"})
		case services.ErrContainerNotRunning:
			c.JSON(http.StatusBadRequest, gin.H{"error": "Container is not running"})
		case services.ErrPathTraversal:
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid path"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Directory created successfully"})
}
