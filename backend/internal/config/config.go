package config

import (
	"bufio"
	"crypto/rand"
	"encoding/hex"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// Config holds all configuration for the application
type Config struct {
	Environment   string
	Port          int    // Server port
	DatabasePath  string
	JWTSecret     string
	EncryptionKey string
	AdminUsername string
	AdminPassword string
	DataDirectory string
	
	// Traefik settings
	AutoStartTraefik      bool
	TraefikHTTPPort       int  // 0 = auto-assign
	TraefikDashboardPort  int  // 0 = auto-assign
	TraefikPortRangeStart int
	TraefikPortRangeEnd   int
}

// Load loads configuration from environment variables
func Load() *Config {
	// Load .env file first
	envPath := loadEnvFile()
	if envPath != "" {
		log.Printf("Loaded configuration from: %s", envPath)
	}
	
	cfg := &Config{
		Environment:   getEnv("ENVIRONMENT", "development"),
		Port:          getEnvInt("PORT", 8080),
		DatabasePath:  getEnv("DATABASE_PATH", "./data/cc-platform.db"),
		JWTSecret:     getEnv("JWT_SECRET", ""),
		EncryptionKey: getEnv("ENCRYPTION_KEY", ""),
		AdminUsername: getEnv("ADMIN_USERNAME", ""),
		AdminPassword: getEnv("ADMIN_PASSWORD", ""),
		DataDirectory: getEnv("DATA_DIR", "./data"),
		
		// Traefik settings (0 means auto-assign)
		AutoStartTraefik:      getEnvBool("AUTO_START_TRAEFIK", false),
		TraefikHTTPPort:       getEnvInt("TRAEFIK_HTTP_PORT", 0),
		TraefikDashboardPort:  getEnvInt("TRAEFIK_DASHBOARD_PORT", 0),
		TraefikPortRangeStart: getEnvInt("TRAEFIK_PORT_RANGE_START", 30001),
		TraefikPortRangeEnd:   getEnvInt("TRAEFIK_PORT_RANGE_END", 30020),
	}

	// Generate JWT secret if not provided
	if cfg.JWTSecret == "" {
		cfg.JWTSecret = generateRandomString(32)
	}

	// Generate encryption key if not provided
	if cfg.EncryptionKey == "" {
		cfg.EncryptionKey = generateRandomString(32)
	}

	// Generate admin credentials if not provided
	if cfg.AdminUsername == "" {
		cfg.AdminUsername = "admin"
	}
	if cfg.AdminPassword == "" {
		cfg.AdminPassword = generateRandomString(16)
	}

	return cfg
}

// loadEnvFile loads environment variables from .env file
// Returns the path of the loaded file, or empty string if not found
func loadEnvFile() string {
	// Get current working directory
	cwd, _ := os.Getwd()
	
	// Try multiple locations for .env file
	locations := []string{
		filepath.Join(cwd, ".env"),
		filepath.Join(cwd, "../.env"),
		".env",
		"../.env",
		filepath.Join(getExecutableDir(), ".env"),
		filepath.Join(getExecutableDir(), "../.env"),
	}
	
	for _, path := range locations {
		absPath, err := filepath.Abs(path)
		if err != nil {
			continue
		}
		if _, err := os.Stat(absPath); err == nil {
			if err := loadEnvFromFile(absPath); err == nil {
				return absPath
			}
		}
	}
	return ""
}

// getExecutableDir returns the directory of the executable
func getExecutableDir() string {
	exe, err := os.Executable()
	if err != nil {
		return "."
	}
	return filepath.Dir(exe)
}

// loadEnvFromFile loads environment variables from a specific file
func loadEnvFromFile(path string) error {
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()
	
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		
		// Skip empty lines and comments
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		
		// Parse KEY=VALUE
		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			continue
		}
		
		key := strings.TrimSpace(parts[0])
		value := strings.TrimSpace(parts[1])
		
		// Remove quotes if present
		value = strings.Trim(value, `"'`)
		
		// Always set from .env file (override existing)
		os.Setenv(key, value)
	}
	
	return scanner.Err()
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvBool(key string, defaultValue bool) bool {
	if value := os.Getenv(key); value != "" {
		return strings.ToLower(value) == "true" || value == "1"
	}
	return defaultValue
}

func getEnvInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if i, err := strconv.Atoi(value); err == nil {
			return i
		}
	}
	return defaultValue
}

func generateRandomString(length int) string {
	bytes := make([]byte, length)
	if _, err := rand.Read(bytes); err != nil {
		panic(err)
	}
	return hex.EncodeToString(bytes)[:length]
}


// DataDir returns the data directory path
func (c *Config) DataDir() string {
	return c.DataDirectory
}
