package database

import (
	"log"
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
		&models.ContainerPort{},
		&models.TerminalSession{},
		&models.TerminalHistory{},
		// PTY Automation Monitoring models
		&models.MonitoringConfig{},
		&models.Task{},
		&models.AutomationLog{},
		&models.GlobalAutomationConfig{},
		// Headless Card Mode models
		&models.HeadlessConversation{},
		&models.HeadlessTurn{},
		&models.HeadlessEvent{},
		// Multi-Configuration Profile models
		&models.GitHubToken{},
		&models.EnvVarsProfile{},
		&models.StartupCommandProfile{},
		// Claude Config Management models
		&models.ClaudeConfigTemplate{},
	); err != nil {
		return nil, err
	}

	// Run data migration for legacy configs
	if err := migrateConfigProfiles(db); err != nil {
		log.Printf("Warning: config profile migration failed: %v", err)
	}

	return db, nil
}

// migrateConfigProfiles migrates existing single configs to new multi-profile structure
func migrateConfigProfiles(db *gorm.DB) error {
	// Check if migration has already been done
	var migrationFlag models.GlobalAutomationConfig
	result := db.Where("key = ?", "config_profiles_migration_completed").First(&migrationFlag)
	if result.Error == nil && migrationFlag.Value == "true" {
		// Migration already completed
		return nil
	}

	log.Println("Starting config profiles migration...")

	// 1. Migrate GitHub token from Settings table
	var githubSetting models.Setting
	if err := db.Where("key = ?", "github_token").First(&githubSetting).Error; err == nil && githubSetting.Value != "" {
		// Check if we already have GitHub tokens
		var tokenCount int64
		db.Model(&models.GitHubToken{}).Count(&tokenCount)
		if tokenCount == 0 {
			token := &models.GitHubToken{
				Nickname:  "默认令牌",
				Remark:    "从旧配置迁移",
				Token:     githubSetting.Value, // Already encrypted
				IsDefault: true,
			}
			if err := db.Create(token).Error; err != nil {
				log.Printf("Failed to migrate GitHub token: %v", err)
			} else {
				log.Println("Migrated GitHub token successfully")
			}
		}
	}

	// 2. Migrate ClaudeConfig
	var claudeConfig models.ClaudeConfig
	if err := db.First(&claudeConfig).Error; err == nil {
		// Migrate env vars if present
		if claudeConfig.CustomEnvVars != "" {
			var envCount int64
			db.Model(&models.EnvVarsProfile{}).Count(&envCount)
			if envCount == 0 {
				envProfile := &models.EnvVarsProfile{
					Name:        "默认环境变量",
					Description: "从旧配置迁移",
					EnvVars:     claudeConfig.CustomEnvVars,
					IsDefault:   true,
				}
				if err := db.Create(envProfile).Error; err != nil {
					log.Printf("Failed to migrate env vars: %v", err)
				} else {
					log.Println("Migrated env vars profile successfully")
				}
			}
		}

		// Migrate startup command if present
		if claudeConfig.StartupCommand != "" {
			var cmdCount int64
			db.Model(&models.StartupCommandProfile{}).Count(&cmdCount)
			if cmdCount == 0 {
				cmdProfile := &models.StartupCommandProfile{
					Name:        "默认启动命令",
					Description: "从旧配置迁移",
					Command:     claudeConfig.StartupCommand,
					IsDefault:   true,
				}
				if err := db.Create(cmdProfile).Error; err != nil {
					log.Printf("Failed to migrate startup command: %v", err)
				} else {
					log.Println("Migrated startup command profile successfully")
				}
			}
		}
	}

	// Mark migration as completed
	db.Create(&models.GlobalAutomationConfig{
		Key:   "config_profiles_migration_completed",
		Value: "true",
	})

	log.Println("Config profiles migration completed")
	return nil
}
