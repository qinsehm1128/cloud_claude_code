package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	"cc-platform/internal/config"
	"cc-platform/internal/models"
	"cc-platform/pkg/crypto"

	"gorm.io/gorm"
)

var (
	ErrGitHubTokenNotConfigured = errors.New("GitHub token not configured")
	ErrRepositoryNotFound       = errors.New("repository not found")
	ErrCloneFailed              = errors.New("clone failed")
)

// GitHubService handles GitHub operations
type GitHubService struct {
	db     *gorm.DB
	config *config.Config
}

// NewGitHubService creates a new GitHubService
func NewGitHubService(db *gorm.DB, cfg *config.Config) *GitHubService {
	return &GitHubService{
		db:     db,
		config: cfg,
	}
}

// GitHubRepo represents a GitHub repository from API
type GitHubRepo struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	FullName    string `json:"full_name"`
	Description string `json:"description"`
	CloneURL    string `json:"clone_url"`
	HTMLURL     string `json:"html_url"`
	Private     bool   `json:"private"`
	Size        int64  `json:"size"`
}

// SaveToken saves the GitHub token (encrypted)
func (s *GitHubService) SaveToken(token string) error {
	encryptedToken, err := crypto.Encrypt(token, []byte(s.config.EncryptionKey))
	if err != nil {
		return err
	}

	setting := models.Setting{
		Key:         "github_token",
		Value:       encryptedToken,
		Description: "GitHub Personal Access Token",
	}

	// Upsert the setting
	return s.db.Where("key = ?", "github_token").
		Assign(models.Setting{Value: encryptedToken}).
		FirstOrCreate(&setting).Error
}

// GetToken retrieves and decrypts the GitHub token
func (s *GitHubService) GetToken() (string, error) {
	var setting models.Setting
	if err := s.db.Where("key = ?", "github_token").First(&setting).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return "", ErrGitHubTokenNotConfigured
		}
		return "", err
	}

	return crypto.Decrypt(setting.Value, []byte(s.config.EncryptionKey))
}

// HasToken checks if a GitHub token is configured
func (s *GitHubService) HasToken() bool {
	var setting models.Setting
	err := s.db.Where("key = ?", "github_token").First(&setting).Error
	return err == nil && setting.Value != ""
}

// ListRemoteRepositories fetches repositories from GitHub API
func (s *GitHubService) ListRemoteRepositories() ([]GitHubRepo, error) {
	token, err := s.GetToken()
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "GET", "https://api.github.com/user/repos?per_page=100&sort=updated", nil)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/vnd.github.v3+json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("GitHub API error: %s - %s", resp.Status, string(body))
	}

	var repos []GitHubRepo
	if err := json.NewDecoder(resp.Body).Decode(&repos); err != nil {
		return nil, err
	}

	return repos, nil
}

// CloneRepository clones a repository to local storage
func (s *GitHubService) CloneRepository(repoURL, repoName string) (*models.Repository, error) {
	token, err := s.GetToken()
	if err != nil {
		return nil, err
	}

	// Create repos directory if not exists
	reposDir := filepath.Join(s.config.DataDir(), "repos")
	if err := os.MkdirAll(reposDir, 0755); err != nil {
		return nil, err
	}

	localPath := filepath.Join(reposDir, repoName)

	// Check if already exists
	if _, err := os.Stat(localPath); err == nil {
		return nil, fmt.Errorf("repository already exists at %s", localPath)
	}

	// Clone with token authentication
	authURL := fmt.Sprintf("https://%s@%s", token, repoURL[8:]) // Remove "https://"
	
	cmd := exec.Command("git", "clone", authURL, localPath)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("%w: %s", ErrCloneFailed, string(output))
	}

	// Get directory size
	size, _ := getDirSize(localPath)

	// Save to database
	repo := &models.Repository{
		Name:      repoName,
		URL:       repoURL,
		LocalPath: localPath,
		Size:      size,
		ClonedAt:  time.Now(),
	}

	if err := s.db.Create(repo).Error; err != nil {
		// Cleanup on failure
		os.RemoveAll(localPath)
		return nil, err
	}

	return repo, nil
}

// ListLocalRepositories returns all cloned repositories
func (s *GitHubService) ListLocalRepositories() ([]models.Repository, error) {
	var repos []models.Repository
	if err := s.db.Find(&repos).Error; err != nil {
		return nil, err
	}
	return repos, nil
}

// GetRepository returns a repository by ID
func (s *GitHubService) GetRepository(id uint) (*models.Repository, error) {
	var repo models.Repository
	if err := s.db.First(&repo, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrRepositoryNotFound
		}
		return nil, err
	}
	return &repo, nil
}

// DeleteRepository removes a cloned repository
func (s *GitHubService) DeleteRepository(id uint) error {
	repo, err := s.GetRepository(id)
	if err != nil {
		return err
	}

	// Remove from filesystem
	if err := os.RemoveAll(repo.LocalPath); err != nil {
		return err
	}

	// Remove from database
	return s.db.Delete(&models.Repository{}, id).Error
}

// getDirSize calculates the total size of a directory
func getDirSize(path string) (int64, error) {
	var size int64
	err := filepath.Walk(path, func(_ string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if !info.IsDir() {
			size += info.Size()
		}
		return nil
	})
	return size, err
}
