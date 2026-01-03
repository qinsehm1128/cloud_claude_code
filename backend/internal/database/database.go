package database

import (
	"os"
	"path/filepath"

	"cc-platform/internal/models"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// Initialize creates and configures the database connection
func Initialize(dbPath string) (*gorm.DB, error) {
	// Ensure directory exists
	dir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, err
	}

	// Open database connection
	db, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
	})
	if err != nil {
		return nil, err
	}

	// Auto migrate models
	if err := db.AutoMigrate(
		&models.User{},
		&models.Setting{},
		&models.Repository{},
		&models.Container{},
		&models.ClaudeConfig{},
		&models.ContainerLog{},
		&models.TerminalSession{},
		&models.TerminalHistory{},
	); err != nil {
		return nil, err
	}

	return db, nil
}
