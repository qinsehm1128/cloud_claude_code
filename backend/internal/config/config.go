package config

import (
	"crypto/rand"
	"encoding/hex"
	"os"
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
