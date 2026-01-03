package services

import (
	"archive/tar"
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"cc-platform/internal/models"
	"cc-platform/pkg/pathutil"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/client"
	"gorm.io/gorm"
)

const (
	MaxUploadSize = 100 * 1024 * 1024 // 100MB
	WorkspaceDir  = "/workspace"
)

var (
	ErrFileTooLarge      = errors.New("file exceeds maximum size limit (100MB)")
	ErrPathTraversal     = errors.New("path traversal detected")
	ErrFileNotFound      = errors.New("file not found")
	ErrNotAFile          = errors.New("path is not a file")
	ErrNotADirectory     = errors.New("path is not a directory")
	ErrContainerNotRunning = errors.New("container is not running")
)

// FileInfo represents file information
type FileInfo struct {
	Name         string    `json:"name"`
	Path         string    `json:"path"`
	Size         int64     `json:"size"`
	IsDirectory  bool      `json:"is_directory"`
	ModifiedTime time.Time `json:"modified_time"`
	Permissions  string    `json:"permissions"`
}

// FileService handles file operations in containers
type FileService struct {
	db           *gorm.DB
	dockerClient *client.Client
}

// NewFileService creates a new FileService
func NewFileService(db *gorm.DB) (*FileService, error) {
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return nil, fmt.Errorf("failed to create Docker client: %w", err)
	}

	return &FileService{
		db:           db,
		dockerClient: cli,
	}, nil
}

// Close closes the file service
func (s *FileService) Close() error {
	return s.dockerClient.Close()
}

// ListDirectory lists files in a directory inside a container
func (s *FileService) ListDirectory(ctx context.Context, containerID uint, path string) ([]FileInfo, error) {
	// Get container
	cont, err := s.getRunningContainer(containerID)
	if err != nil {
		return nil, err
	}

	// Validate and sanitize path
	safePath, err := s.validatePath(path)
	if err != nil {
		return nil, err
	}

	// Execute ls command in container
	cmd := []string{"ls", "-la", "--time-style=+%Y-%m-%dT%H:%M:%S", safePath}
	output, err := s.execInContainer(ctx, cont.DockerID, cmd)
	if err != nil {
		return nil, fmt.Errorf("failed to list directory: %w", err)
	}

	// Parse ls output
	return s.parseLsOutput(output, safePath)
}

// UploadFile uploads a file to a container
func (s *FileService) UploadFile(ctx context.Context, containerID uint, path string, content io.Reader, size int64) error {
	// Check file size
	if size > MaxUploadSize {
		return ErrFileTooLarge
	}

	// Get container
	cont, err := s.getRunningContainer(containerID)
	if err != nil {
		return err
	}

	// Validate and sanitize path
	safePath, err := s.validatePath(path)
	if err != nil {
		return err
	}

	// Read content
	data, err := io.ReadAll(io.LimitReader(content, MaxUploadSize+1))
	if err != nil {
		return fmt.Errorf("failed to read content: %w", err)
	}
	if int64(len(data)) > MaxUploadSize {
		return ErrFileTooLarge
	}

	// Create tar archive
	tarBuf := new(bytes.Buffer)
	tw := tar.NewWriter(tarBuf)

	filename := filepath.Base(safePath)
	header := &tar.Header{
		Name: filename,
		Mode: 0644,
		Size: int64(len(data)),
	}

	if err := tw.WriteHeader(header); err != nil {
		return fmt.Errorf("failed to write tar header: %w", err)
	}

	if _, err := tw.Write(data); err != nil {
		return fmt.Errorf("failed to write tar content: %w", err)
	}

	if err := tw.Close(); err != nil {
		return fmt.Errorf("failed to close tar writer: %w", err)
	}

	// Copy to container
	destDir := filepath.Dir(safePath)
	err = s.dockerClient.CopyToContainer(ctx, cont.DockerID, destDir, tarBuf, container.CopyToContainerOptions{})
	if err != nil {
		return fmt.Errorf("failed to copy to container: %w", err)
	}

	return nil
}

// DownloadFile downloads a file from a container
func (s *FileService) DownloadFile(ctx context.Context, containerID uint, path string) (io.ReadCloser, string, error) {
	// Get container
	cont, err := s.getRunningContainer(containerID)
	if err != nil {
		return nil, "", err
	}

	// Validate and sanitize path
	safePath, err := s.validatePath(path)
	if err != nil {
		return nil, "", err
	}

	// Copy from container
	reader, stat, err := s.dockerClient.CopyFromContainer(ctx, cont.DockerID, safePath)
	if err != nil {
		return nil, "", fmt.Errorf("failed to copy from container: %w", err)
	}

	// Check if it's a directory
	if stat.Mode.IsDir() {
		reader.Close()
		return nil, "", ErrNotAFile
	}

	// Extract file from tar
	tr := tar.NewReader(reader)
	_, err = tr.Next()
	if err != nil {
		reader.Close()
		return nil, "", fmt.Errorf("failed to read tar: %w", err)
	}

	filename := filepath.Base(safePath)
	return &tarFileReader{reader: reader, tarReader: tr}, filename, nil
}

// tarFileReader wraps tar reader to implement io.ReadCloser
type tarFileReader struct {
	reader    io.ReadCloser
	tarReader *tar.Reader
}

func (r *tarFileReader) Read(p []byte) (int, error) {
	return r.tarReader.Read(p)
}

func (r *tarFileReader) Close() error {
	return r.reader.Close()
}

// DeleteFile deletes a file or directory in a container
func (s *FileService) DeleteFile(ctx context.Context, containerID uint, path string) error {
	// Get container
	cont, err := s.getRunningContainer(containerID)
	if err != nil {
		return err
	}

	// Validate and sanitize path
	safePath, err := s.validatePath(path)
	if err != nil {
		return err
	}

	// Execute rm command
	cmd := []string{"rm", "-rf", safePath}
	_, err = s.execInContainer(ctx, cont.DockerID, cmd)
	if err != nil {
		return fmt.Errorf("failed to delete file: %w", err)
	}

	return nil
}

// CreateDirectory creates a directory in a container
func (s *FileService) CreateDirectory(ctx context.Context, containerID uint, path string) error {
	// Get container
	cont, err := s.getRunningContainer(containerID)
	if err != nil {
		return err
	}

	// Validate and sanitize path
	safePath, err := s.validatePath(path)
	if err != nil {
		return err
	}

	// Execute mkdir command
	cmd := []string{"mkdir", "-p", safePath}
	_, err = s.execInContainer(ctx, cont.DockerID, cmd)
	if err != nil {
		return fmt.Errorf("failed to create directory: %w", err)
	}

	return nil
}

// getRunningContainer gets a container and verifies it's running
func (s *FileService) getRunningContainer(containerID uint) (*models.Container, error) {
	var cont models.Container
	if err := s.db.First(&cont, containerID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrContainerNotFound
		}
		return nil, err
	}

	if cont.Status != models.ContainerStatusRunning {
		return nil, ErrContainerNotRunning
	}

	return &cont, nil
}

// validatePath validates and sanitizes a path
func (s *FileService) validatePath(path string) (string, error) {
	// Sanitize the path
	path = pathutil.SanitizePath(path)
	
	// If empty, use workspace root
	if path == "" || path == "." {
		return WorkspaceDir, nil
	}

	// Validate path doesn't escape workspace
	fullPath, err := pathutil.ValidatePath(WorkspaceDir, path)
	if err != nil {
		return "", ErrPathTraversal
	}

	return fullPath, nil
}

// execInContainer executes a command in a container
func (s *FileService) execInContainer(ctx context.Context, dockerID string, cmd []string) (string, error) {
	execConfig := container.ExecOptions{
		Cmd:          cmd,
		AttachStdout: true,
		AttachStderr: true,
	}

	execID, err := s.dockerClient.ContainerExecCreate(ctx, dockerID, execConfig)
	if err != nil {
		return "", err
	}

	resp, err := s.dockerClient.ContainerExecAttach(ctx, execID.ID, container.ExecStartOptions{})
	if err != nil {
		return "", err
	}
	defer resp.Close()

	output, err := io.ReadAll(resp.Reader)
	if err != nil {
		return "", err
	}

	return string(output), nil
}

// parseLsOutput parses the output of ls -la command
func (s *FileService) parseLsOutput(output, basePath string) ([]FileInfo, error) {
	var files []FileInfo
	lines := strings.Split(output, "\n")

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "total") {
			continue
		}

		// Parse ls -la output format:
		// drwxr-xr-x 2 user group 4096 2024-01-01T12:00:00 filename
		parts := strings.Fields(line)
		if len(parts) < 6 {
			continue
		}

		permissions := parts[0]
		sizeStr := parts[4]
		timeStr := parts[5]
		name := strings.Join(parts[6:], " ")

		// Skip . and ..
		if name == "." || name == ".." {
			continue
		}

		// Parse size
		var size int64
		fmt.Sscanf(sizeStr, "%d", &size)

		// Parse time
		modTime, _ := time.Parse("2006-01-02T15:04:05", timeStr)

		// Determine if directory
		isDir := strings.HasPrefix(permissions, "d")

		files = append(files, FileInfo{
			Name:         name,
			Path:         filepath.Join(basePath, name),
			Size:         size,
			IsDirectory:  isDir,
			ModifiedTime: modTime,
			Permissions:  permissions,
		})
	}

	return files, nil
}
