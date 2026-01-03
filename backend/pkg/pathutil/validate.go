package pathutil

import (
	"errors"
	"path/filepath"
	"strings"
)

var (
	ErrPathTraversal     = errors.New("path traversal detected")
	ErrPathOutsideBase   = errors.New("path outside allowed directory")
	ErrInvalidPath       = errors.New("invalid path")
	ErrEmptyPath         = errors.New("empty path")
)

// ValidatePath validates and sanitizes a path to prevent directory traversal attacks
// It ensures the resulting path is within the base directory
func ValidatePath(basePath, requestedPath string) (string, error) {
	if requestedPath == "" {
		return "", ErrEmptyPath
	}

	// Clean the requested path
	cleanPath := filepath.Clean(requestedPath)

	// Check for path traversal attempts
	if strings.Contains(cleanPath, "..") {
		return "", ErrPathTraversal
	}

	// Check for absolute paths (not allowed)
	if filepath.IsAbs(cleanPath) {
		return "", ErrInvalidPath
	}

	// Build the full path
	fullPath := filepath.Join(basePath, cleanPath)

	// Clean the full path
	fullPath = filepath.Clean(fullPath)

	// Ensure the path is still within the base directory
	// Use filepath.Rel to check if fullPath is under basePath
	rel, err := filepath.Rel(basePath, fullPath)
	if err != nil {
		return "", ErrPathOutsideBase
	}

	// If the relative path starts with "..", it's outside the base
	if strings.HasPrefix(rel, "..") {
		return "", ErrPathOutsideBase
	}

	return fullPath, nil
}

// IsPathSafe checks if a path is safe (no traversal, within bounds)
func IsPathSafe(basePath, requestedPath string) bool {
	_, err := ValidatePath(basePath, requestedPath)
	return err == nil
}

// SanitizePath removes potentially dangerous characters from a path
func SanitizePath(path string) string {
	// Remove null bytes
	path = strings.ReplaceAll(path, "\x00", "")
	
	// Remove backslashes (normalize to forward slashes)
	path = strings.ReplaceAll(path, "\\", "/")
	
	// Remove double slashes
	for strings.Contains(path, "//") {
		path = strings.ReplaceAll(path, "//", "/")
	}
	
	// Trim leading/trailing slashes
	path = strings.Trim(path, "/")
	
	return path
}

// JoinSafePath safely joins paths and validates the result
func JoinSafePath(basePath string, parts ...string) (string, error) {
	// Sanitize each part
	sanitizedParts := make([]string, len(parts))
	for i, part := range parts {
		sanitizedParts[i] = SanitizePath(part)
	}
	
	// Join the parts
	requestedPath := filepath.Join(sanitizedParts...)
	
	// Validate the final path
	return ValidatePath(basePath, requestedPath)
}

// GetRelativePath returns the relative path from base to target
// Returns error if target is not under base
func GetRelativePath(basePath, targetPath string) (string, error) {
	// Clean both paths
	basePath = filepath.Clean(basePath)
	targetPath = filepath.Clean(targetPath)
	
	// Get relative path
	rel, err := filepath.Rel(basePath, targetPath)
	if err != nil {
		return "", err
	}
	
	// Check if it's outside base
	if strings.HasPrefix(rel, "..") {
		return "", ErrPathOutsideBase
	}
	
	return rel, nil
}
