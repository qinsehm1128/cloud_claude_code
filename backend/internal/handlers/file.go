package handlers

import (
	"io"
	"log"
	"mime/multipart"
	"net/http"
	pathpkg "path"
	"strings"

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
	if strings.HasSuffix(strings.ToLower(filename), ".zip") {
		c.Header("Content-Type", "application/zip")
	} else {
		c.Header("Content-Type", "application/octet-stream")
	}

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

	if err := c.Request.ParseMultipartForm(32 << 20); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid multipart form"})
		return
	}

	form := c.Request.MultipartForm
	files := append([]*multipart.FileHeader{}, form.File["file"]...)
	files = append(files, form.File["files"]...)
	if len(files) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No file uploaded"})
		return
	}

	relativePaths := form.Value["relative_paths"]
	uploadedPaths := make([]string, 0, len(files))

	for index, header := range files {
		file, err := header.Open()
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to open uploaded file"})
			return
		}

		relativePath := header.Filename
		if index < len(relativePaths) && strings.TrimSpace(relativePaths[index]) != "" {
			relativePath = relativePaths[index]
		}
		fullPath := pathpkg.Join(destPath, strings.ReplaceAll(relativePath, "\\", "/"))

		err = h.fileService.UploadFile(c.Request.Context(), containerID, fullPath, file, header.Size)
		file.Close()
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

		uploadedPaths = append(uploadedPaths, fullPath)
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Files uploaded successfully",
		"count":   len(uploadedPaths),
		"paths":   uploadedPaths,
		"path":    destPath,
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
