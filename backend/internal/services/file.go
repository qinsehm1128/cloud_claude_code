package services

import (
	"archive/tar"
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"cc-platform/internal/models"
	"cc-platform/pkg/pathutil"

	"github.com/docker/docker/api/types"
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

	// Use stat and find for more reliable parsing
	// First check if path exists and is a directory
	checkCmd := []string{"sh", "-c", fmt.Sprintf("test -d '%s' && echo 'DIR' || echo 'NOTDIR'", safePath)}
	checkOutput, err := s.execInContainer(ctx, cont.DockerID, checkCmd)
	if err != nil {
		return nil, fmt.Errorf("failed to check path: %w", err)
	}
	
	checkOutput = strings.TrimSpace(stripControlChars(checkOutput))
	if checkOutput != "DIR" {
		return nil, fmt.Errorf("path is not a directory: %s", safePath)
	}

	// Use find with stat for reliable file listing
	cmd := []string{"sh", "-c", fmt.Sprintf(
		`find '%s' -maxdepth 1 -mindepth 1 -printf '%%y|%%s|%%T@|%%f\n' 2>/dev/null | sort`,
		safePath,
	)}
	output, err := s.execInContainer(ctx, cont.DockerID, cmd)
	if err != nil {
		// Fallback to ls if find doesn't support -printf
		return s.listDirectoryFallback(ctx, cont.DockerID, safePath)
	}

	return s.parseFindOutput(output, safePath)
}

// listDirectoryFallback uses ls as fallback
func (s *FileService) listDirectoryFallback(ctx context.Context, dockerID, safePath string) ([]FileInfo, error) {
	cmd := []string{"sh", "-c", fmt.Sprintf(
		`ls -la '%s' | tail -n +2`,
		safePath,
	)}
	output, err := s.execInContainer(ctx, dockerID, cmd)
	if err != nil {
		return nil, fmt.Errorf("failed to list directory: %w", err)
	}

	return s.parseLsOutput(output, safePath)
}

// parseFindOutput parses the output of find -printf command
func (s *FileService) parseFindOutput(output, basePath string) ([]FileInfo, error) {
	var files []FileInfo
	output = stripControlChars(output)
	lines := strings.Split(output, "\n")

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		// Format: type|size|timestamp|name
		parts := strings.SplitN(line, "|", 4)
		if len(parts) != 4 {
			continue
		}

		fileType := parts[0]
		sizeStr := parts[1]
		timestampStr := parts[2]
		name := parts[3]

		// Skip . and ..
		if name == "." || name == ".." {
			continue
		}

		// Parse size
		var size int64
		fmt.Sscanf(sizeStr, "%d", &size)

		// Parse timestamp (Unix timestamp with decimal)
		var modTime time.Time
		if ts, err := strconv.ParseFloat(timestampStr, 64); err == nil {
			modTime = time.Unix(int64(ts), 0)
		}

		// Determine if directory (d = directory, f = file, l = link, etc.)
		isDir := fileType == "d"

		files = append(files, FileInfo{
			Name:         name,
			Path:         filepath.Join(basePath, name),
			Size:         size,
			IsDirectory:  isDir,
			ModifiedTime: modTime,
			Permissions:  fileType,
		})
	}

	return files, nil
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
	err = s.dockerClient.CopyToContainer(ctx, cont.DockerID, destDir, tarBuf, types.CopyToContainerOptions{})
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
	execConfig := types.ExecConfig{
		Cmd:          cmd,
		AttachStdout: true,
		AttachStderr: true,
	}

	execID, err := s.dockerClient.ContainerExecCreate(ctx, dockerID, execConfig)
	if err != nil {
		return "", err
	}

	resp, err := s.dockerClient.ContainerExecAttach(ctx, execID.ID, types.ExecStartCheck{})
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
	output = stripControlChars(output)
	lines := strings.Split(output, "\n")

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "total") {
			continue
		}

		// Parse ls -la output format:
		// drwxr-xr-x 2 user group 4096 2024-01-01T12:00:00 filename
		// or: drwxr-xr-x 2 user group 4096 Jan  1 12:00 filename
		parts := strings.Fields(line)
		if len(parts) < 6 {
			continue
		}

		permissions := parts[0]
		
		// Find the filename - it's everything after the date/time
		// Try to find where the filename starts
		var name string
		var size int64
		var modTime time.Time

		// Parse size (usually 5th field)
		if len(parts) >= 5 {
			fmt.Sscanf(parts[4], "%d", &size)
		}

		// The filename is typically the last part(s)
		// Handle different ls output formats
		if len(parts) >= 9 {
			// Format: perms links user group size month day time filename
			name = strings.Join(parts[8:], " ")
			// Try to parse date
			dateStr := fmt.Sprintf("%s %s %s", parts[5], parts[6], parts[7])
			modTime, _ = time.Parse("Jan 2 15:04", dateStr)
			if modTime.Year() == 0 {
				modTime = modTime.AddDate(time.Now().Year(), 0, 0)
			}
		} else if len(parts) >= 7 {
			// Format with ISO date: perms links user group size date filename
			name = strings.Join(parts[6:], " ")
			modTime, _ = time.Parse("2006-01-02T15:04:05", parts[5])
		} else if len(parts) >= 6 {
			name = strings.Join(parts[5:], " ")
		}

		// Skip . and ..
		if name == "." || name == ".." || name == "" {
			continue
		}

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

// stripControlChars removes ANSI control characters and Docker mux header bytes
func stripControlChars(s string) string {
	// Remove Docker stream mux header (first 8 bytes per frame)
	// and ANSI escape sequences
	var result strings.Builder
	i := 0
	for i < len(s) {
		// Skip Docker mux header bytes (0x01 or 0x02 followed by 7 bytes)
		if i+8 <= len(s) && (s[i] == 0x01 || s[i] == 0x02) {
			// Check if this looks like a mux header
			if s[i+1] == 0x00 && s[i+2] == 0x00 && s[i+3] == 0x00 {
				i += 8
				continue
			}
		}
		
		// Skip ANSI escape sequences
		if i+1 < len(s) && s[i] == 0x1b && s[i+1] == '[' {
			// Find end of escape sequence
			j := i + 2
			for j < len(s) && !((s[j] >= 'A' && s[j] <= 'Z') || (s[j] >= 'a' && s[j] <= 'z')) {
				j++
			}
			if j < len(s) {
				i = j + 1
				continue
			}
		}
		
		// Skip other control characters except newline and tab
		if s[i] < 32 && s[i] != '\n' && s[i] != '\t' {
			i++
			continue
		}
		
		result.WriteByte(s[i])
		i++
	}
	return result.String()
}
