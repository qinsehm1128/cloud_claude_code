package config

import (
	"bufio"
	"crypto/rand"
	"encoding/hex"
	"os"
	"path/filepath"
	"strings"
)

// Config holds all configuration for the application
type Config struct {
	Environment   string
	DatabasePath  string
	JWTSecret     string
	EncryptionKey string
	AdminUsername string
	AdminPassword string
	DataDirectory string
}

// Load loads configuration from environment variables
func Load() *Config {
	// Load .env file first
	loadEnvFile()
	
	cfg := &Config{
		Environment:   getEnv("ENVIRONMENT", "development"),
		DatabasePath:  getEnv("DATABASE_PATH", "./data/cc-platform.db"),
		JWTSecret:     getEnv("JWT_SECRET", ""),
		EncryptionKey: getEnv("ENCRYPTION_KEY", ""),
		AdminUsername: getEnv("ADMIN_USERNAME", ""),
		AdminPassword: getEnv("ADMIN_PASSWORD", ""),
		DataDirectory: getEnv("DATA_DIR", "./data"),
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
func loadEnvFile() {
	// Try multiple locations for .env file
	locations := []string{
		".env",
		"../.env",
		filepath.Join(getExecutableDir(), ".env"),
		filepath.Join(getExecutableDir(), "../.env"),
	}
	
	for _, path := range locations {
		if err := loadEnvFromFile(path); err == nil {
			return
		}
	}
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
		
		// Only set if not already set in environment
		if os.Getenv(key) == "" {
			os.Setenv(key, value)
		}
	}
	
	return scanner.Err()
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
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
