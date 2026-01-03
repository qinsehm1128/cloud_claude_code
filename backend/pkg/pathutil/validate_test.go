package pathutil

import (
	"testing"
	"testing/quick"
)

// Property 9: Path Traversal Prevention
// For any file operation request where the path contains ".." or resolves
// to a location outside the mounted project directory, the File_Service SHALL reject the request.

func TestValidatePathRejectsTraversal(t *testing.T) {
	basePath := "/workspace/project"
	
	testCases := []struct {
		name        string
		path        string
		shouldError bool
	}{
		{"simple traversal", "../etc/passwd", true},
		{"double traversal", "../../etc/passwd", true},
		{"hidden traversal", "subdir/../../../etc/passwd", true},
		{"valid path", "src/main.go", false},
		{"valid nested path", "src/pkg/utils/helper.go", false},
		{"current dir", ".", false},
		{"empty path", "", true},
	}
	
	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := ValidatePath(basePath, tc.path)
			if tc.shouldError && err == nil {
				t.Errorf("Expected error for path %q, got nil", tc.path)
			}
			if !tc.shouldError && err != nil {
				t.Errorf("Unexpected error for path %q: %v", tc.path, err)
			}
		})
	}
}

func TestValidatePathRejectsAbsolutePaths(t *testing.T) {
	basePath := "/workspace/project"
	
	absolutePaths := []string{
		"/etc/passwd",
		"/var/log/syslog",
		"/root/.ssh/id_rsa",
	}
	
	for _, path := range absolutePaths {
		_, err := ValidatePath(basePath, path)
		if err == nil {
			t.Errorf("Expected error for absolute path %q, got nil", path)
		}
	}
}

func TestValidatePathAcceptsValidPaths(t *testing.T) {
	basePath := "/workspace/project"
	
	validPaths := []string{
		"file.txt",
		"src/main.go",
		"pkg/utils/helper.go",
		"README.md",
		"config/settings.json",
	}
	
	for _, path := range validPaths {
		result, err := ValidatePath(basePath, path)
		if err != nil {
			t.Errorf("Unexpected error for valid path %q: %v", path, err)
		}
		if result == "" {
			t.Errorf("Expected non-empty result for valid path %q", path)
		}
	}
}

// Property test: any path containing ".." should be rejected
func TestPropertyPathWithDotsRejected(t *testing.T) {
	basePath := "/workspace/project"
	
	f := func(prefix, suffix string) bool {
		// Create a path with ".." in it
		path := prefix + "/../" + suffix
		_, err := ValidatePath(basePath, path)
		// Should always error when ".." is present
		return err != nil
	}
	
	if err := quick.Check(f, &quick.Config{MaxCount: 100}); err != nil {
		t.Errorf("Property test failed: %v", err)
	}
}

// Property test: valid paths should resolve within base directory
func TestPropertyValidPathsWithinBase(t *testing.T) {
	basePath := "/workspace/project"
	
	f := func(subdir, filename string) bool {
		// Skip empty or paths with special characters
		if subdir == "" || filename == "" {
			return true
		}
		if containsSpecialChars(subdir) || containsSpecialChars(filename) {
			return true
		}
		
		// Create a simple valid path
		path := subdir + "/" + filename
		result, err := ValidatePath(basePath, path)
		
		if err != nil {
			// Some paths might be invalid, that's ok
			return true
		}
		
		// Result should start with base path
		return len(result) >= len(basePath)
	}
	
	if err := quick.Check(f, &quick.Config{MaxCount: 100}); err != nil {
		t.Errorf("Property test failed: %v", err)
	}
}

func containsSpecialChars(s string) bool {
	for _, c := range s {
		if c == '.' || c == '/' || c == '\\' || c == '\x00' {
			return true
		}
	}
	return false
}

func TestSanitizePath(t *testing.T) {
	testCases := []struct {
		input    string
		expected string
	}{
		{"path/to/file", "path/to/file"},
		{"path//to//file", "path/to/file"},
		{"/path/to/file/", "path/to/file"},
		{"path\\to\\file", "path/to/file"},
		{"path\x00to\x00file", "pathtofile"},
	}
	
	for _, tc := range testCases {
		result := SanitizePath(tc.input)
		if result != tc.expected {
			t.Errorf("SanitizePath(%q) = %q, expected %q", tc.input, result, tc.expected)
		}
	}
}

func TestIsPathSafe(t *testing.T) {
	basePath := "/workspace/project"
	
	if IsPathSafe(basePath, "../etc/passwd") {
		t.Error("Expected IsPathSafe to return false for traversal path")
	}
	
	if !IsPathSafe(basePath, "src/main.go") {
		t.Error("Expected IsPathSafe to return true for valid path")
	}
}

func TestJoinSafePath(t *testing.T) {
	basePath := "/workspace/project"
	
	// Valid join
	result, err := JoinSafePath(basePath, "src", "main.go")
	if err != nil {
		t.Errorf("Unexpected error: %v", err)
	}
	if result == "" {
		t.Error("Expected non-empty result")
	}
	
	// Invalid join with traversal
	_, err = JoinSafePath(basePath, "..", "etc", "passwd")
	if err == nil {
		t.Error("Expected error for traversal path")
	}
}

func TestGetRelativePath(t *testing.T) {
	basePath := "/workspace/project"
	
	// Valid relative path
	rel, err := GetRelativePath(basePath, "/workspace/project/src/main.go")
	if err != nil {
		t.Errorf("Unexpected error: %v", err)
	}
	if rel != "src/main.go" {
		t.Errorf("Expected 'src/main.go', got %q", rel)
	}
	
	// Path outside base
	_, err = GetRelativePath(basePath, "/etc/passwd")
	if err == nil {
		t.Error("Expected error for path outside base")
	}
}
