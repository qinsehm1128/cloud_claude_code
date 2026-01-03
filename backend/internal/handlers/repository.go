package handlers

import (
	"net/http"
	"strconv"

	"cc-platform/internal/services"

	"github.com/gin-gonic/gin"
)

// RepositoryHandler handles repository endpoints
type RepositoryHandler struct {
	githubService *services.GitHubService
}

// NewRepositoryHandler creates a new RepositoryHandler
func NewRepositoryHandler(githubService *services.GitHubService) *RepositoryHandler {
	return &RepositoryHandler{
		githubService: githubService,
	}
}

// ListRemoteRepositories lists repositories from GitHub
func (h *RepositoryHandler) ListRemoteRepositories(c *gin.Context) {
	repos, err := h.githubService.ListRemoteRepositories()
	if err != nil {
		if err == services.ErrGitHubTokenNotConfigured {
			c.JSON(http.StatusBadRequest, gin.H{"error": "GitHub token not configured"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, repos)
}

// CloneRepoRequest represents the request to clone a repository
type CloneRepoRequest struct {
	URL  string `json:"url" binding:"required"`
	Name string `json:"name" binding:"required"`
}

// CloneRepository clones a repository from GitHub
func (h *RepositoryHandler) CloneRepository(c *gin.Context) {
	var req CloneRepoRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	repo, err := h.githubService.CloneRepository(req.URL, req.Name)
	if err != nil {
		if err == services.ErrGitHubTokenNotConfigured {
			c.JSON(http.StatusBadRequest, gin.H{"error": "GitHub token not configured"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, repo)
}

// ListLocalRepositories lists cloned repositories
func (h *RepositoryHandler) ListLocalRepositories(c *gin.Context) {
	repos, err := h.githubService.ListLocalRepositories()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list repositories"})
		return
	}

	c.JSON(http.StatusOK, repos)
}

// GetRepo gets a repository by ID
func (h *RepositoryHandler) GetRepo(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid repository ID"})
		return
	}

	repo, err := h.githubService.GetRepository(uint(id))
	if err != nil {
		if err == services.ErrRepositoryNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Repository not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get repository"})
		return
	}

	c.JSON(http.StatusOK, repo)
}

// DeleteRepository deletes a cloned repository
func (h *RepositoryHandler) DeleteRepository(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid repository ID"})
		return
	}

	if err := h.githubService.DeleteRepository(uint(id)); err != nil {
		if err == services.ErrRepositoryNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Repository not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete repository"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Repository deleted successfully"})
}
