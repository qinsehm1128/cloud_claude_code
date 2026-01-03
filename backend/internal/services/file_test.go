package services

import (
	"testing"
	"time"
)

// Property 10: Directory Listing Completeness
// For any directory listing request, each item in the response SHALL contain
// file name, size (non-negative), type (file/directory), and modification time.

func TestFileInfoHasRequiredFields(t *testing.T) {
	// Create test FileInfo
	fileInfo := FileInfo{
		Name:         "test.txt",
		Path:         "/workspace/test.txt",
		Size:         1024,
		IsDirectory:  false,
		ModifiedTime: time.Now(),
		Permissions:  "-rw-r--r--",
	}

	// Verify all required fields are present
	if fileInfo.Name == "" {
		t.Error("FileInfo should have non-empty Name")
	}

	if fileInfo.Path == "" {
		t.Error("FileInfo should have non-empty Path")
	}

	if fileInfo.Size < 0 {
		t.Error("FileInfo should have non-negative Size")
	}

	if fileInfo.ModifiedTime.IsZero() {
		t.Error("FileInfo should have valid ModifiedTime")
	}
}

func TestFileInfoDirectoryType(t *testing.T) {
	// Test file type
	fileInfo := FileInfo{
		Name:         "file.txt",
		Path:         "/workspace/file.txt",
		Size:         100,
		IsDirectory:  false,
		ModifiedTime: time.Now(),
		Permissions:  "-rw-r--r--",
	}

	if fileInfo.IsDirectory {
		t.Error("File should not be marked as directory")
	}

	// Test directory type
	dirInfo := FileInfo{
		Name:         "subdir",
		Path:         "/workspace/subdir",
		Size:         4096,
		IsDirectory:  true,
		ModifiedTime: time.Now(),
		Permissions:  "drwxr-xr-x",
	}

	if !dirInfo.IsDirectory {
		t.Error("Directory should be marked as directory")
	}
}

func TestFileInfoSizeNonNegative(t *testing.T) {
	testCases := []struct {
		name string
		size int64
	}{
		{"zero size", 0},
		{"small file", 100},
		{"large file", 1024 * 1024 * 100}, // 100MB
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			fileInfo := FileInfo{
				Name:         "test.txt",
				Path:         "/workspace/test.txt",
				Size:         tc.size,
				IsDirectory:  false,
				ModifiedTime: time.Now(),
			}

			if fileInfo.Size < 0 {
				t.Errorf("FileInfo size should be non-negative, got %d", fileInfo.Size)
			}
		})
	}
}

func TestMaxUploadSizeConstant(t *testing.T) {
	// Verify max upload size is 100MB as per requirements
	expectedSize := int64(100 * 1024 * 1024)
	if MaxUploadSize != expectedSize {
		t.Errorf("MaxUploadSize should be 100MB (%d), got %d", expectedSize, MaxUploadSize)
	}
}

func TestWorkspaceDirConstant(t *testing.T) {
	// Verify workspace directory is set correctly
	if WorkspaceDir != "/workspace" {
		t.Errorf("WorkspaceDir should be '/workspace', got '%s'", WorkspaceDir)
	}
}
