package services

import (
	"context"
	"errors"
	"log"
	"time"

	"cc-platform/internal/constants"
	"cc-platform/internal/models"

	"gorm.io/gorm"
)

var (
	ErrPortAlreadyExists = errors.New("port already exists for this container")
	ErrPortNotFound      = errors.New("port not found")
)

// PortService handles container port operations
type PortService struct {
	db *gorm.DB
}

// NewPortService creates a new PortService
func NewPortService(db *gorm.DB) *PortService {
	return &PortService{db: db}
}

// PortInfo represents port information with container details
type PortInfo struct {
	ID               uint   `json:"id"`
	ContainerID      uint   `json:"container_id"`
	ContainerName    string `json:"container_name"`
	Port             int    `json:"port"`
	Name             string `json:"name"`
	Protocol         string `json:"protocol"`
	AutoCreated      bool   `json:"auto_created"`
	ProxyURL         string `json:"proxy_url"`
	CodeServerDomain string `json:"code_server_domain,omitempty"` // Subdomain for code-server access
}

// ListPorts lists all ports for a container
func (s *PortService) ListPorts(containerID uint) ([]models.ContainerPort, error) {
	var ports []models.ContainerPort
	if err := s.db.Where("container_id = ?", containerID).Find(&ports).Error; err != nil {
		return nil, err
	}
	return ports, nil
}

// AddPort adds a port mapping to a container
func (s *PortService) AddPort(containerID uint, port int, name, protocol string, autoCreated bool) (*models.ContainerPort, error) {
	// Check if port already exists
	var existing models.ContainerPort
	if err := s.db.Where("container_id = ? AND port = ?", containerID, port).First(&existing).Error; err == nil {
		return nil, ErrPortAlreadyExists
	}

	// Create new port mapping
	containerPort := &models.ContainerPort{
		ContainerID: containerID,
		Port:        port,
		Name:        name,
		Protocol:    protocol,
		AutoCreated: autoCreated,
	}

	if err := s.db.Create(containerPort).Error; err != nil {
		return nil, err
	}

	return containerPort, nil
}

// RemovePort removes a port mapping from a container
func (s *PortService) RemovePort(containerID uint, port int) error {
	result := s.db.Where("container_id = ? AND port = ?", containerID, port).Delete(&models.ContainerPort{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrPortNotFound
	}
	return nil
}

// RemoveAllPorts removes all port mappings for a container
func (s *PortService) RemoveAllPorts(containerID uint) error {
	return s.db.Where("container_id = ?", containerID).Delete(&models.ContainerPort{}).Error
}

// PortWithContainerInfo is used for JOIN query results
type PortWithContainerInfo struct {
	ID               uint   `gorm:"column:id"`
	ContainerID      uint   `gorm:"column:container_id"`
	Port             int    `gorm:"column:port"`
	Name             string `gorm:"column:name"`
	Protocol         string `gorm:"column:protocol"`
	AutoCreated      bool   `gorm:"column:auto_created"`
	ContainerName    string `gorm:"column:container_name"`
	CodeServerDomain string `gorm:"column:code_server_domain"`
}

// ListAllPorts lists all exposed ports across all containers using JOIN query
func (s *PortService) ListAllPorts() ([]PortInfo, error) {
	var results []PortWithContainerInfo

	// Use JOIN to avoid N+1 query
	// Note: Must filter out soft-deleted records since we use Table() which bypasses GORM's auto-filter
	err := s.db.Table("container_ports").
		Select("container_ports.id, container_ports.container_id, container_ports.port, container_ports.name, container_ports.protocol, container_ports.auto_created, containers.name as container_name, containers.code_server_domain").
		Joins("LEFT JOIN containers ON container_ports.container_id = containers.id").
		Where("container_ports.deleted_at IS NULL").
		Find(&results).Error

	if err != nil {
		return nil, err
	}

	// Convert to PortInfo
	portInfos := make([]PortInfo, len(results))
	for i, r := range results {
		portInfos[i] = PortInfo{
			ID:               r.ID,
			ContainerID:      r.ContainerID,
			ContainerName:    r.ContainerName,
			Port:             r.Port,
			Name:             r.Name,
			Protocol:         r.Protocol,
			AutoCreated:      r.AutoCreated,
			ProxyURL:         "",
			CodeServerDomain: r.CodeServerDomain,
		}
	}

	return portInfos, nil
}

// GetPort gets a specific port mapping
func (s *PortService) GetPort(containerID uint, port int) (*models.ContainerPort, error) {
	var containerPort models.ContainerPort
	if err := s.db.Where("container_id = ? AND port = ?", containerID, port).First(&containerPort).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrPortNotFound
		}
		return nil, err
	}
	return &containerPort, nil
}

// CleanupOrphanedPorts removes ports for containers that no longer exist
func (s *PortService) CleanupOrphanedPorts() (int, error) {
	// Use subquery to find orphaned ports
	result := s.db.Exec(`
		DELETE FROM container_ports 
		WHERE container_id NOT IN (SELECT id FROM containers)
	`)

	if result.Error != nil {
		return 0, result.Error
	}

	return int(result.RowsAffected), nil
}

// StartCleanupRoutine starts a background routine to periodically clean up orphaned ports
func (s *PortService) StartCleanupRoutine(ctx context.Context, interval time.Duration) {
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		// Run cleanup immediately on start
		if count, err := s.CleanupOrphanedPorts(); err != nil {
			log.Printf("Initial port cleanup error: %v", err)
		} else if count > 0 {
			log.Printf("Initial cleanup: removed %d orphaned port records", count)
		}

		for {
			select {
			case <-ctx.Done():
				log.Println("Port cleanup routine stopped")
				return
			case <-ticker.C:
				count, err := s.CleanupOrphanedPorts()
				if err != nil {
					log.Printf("Port cleanup error: %v", err)
				} else if count > 0 {
					log.Printf("Cleaned up %d orphaned port records", count)
				}
			}
		}
	}()
}

// CleanupInterval returns the recommended cleanup interval
func CleanupInterval() time.Duration {
	return constants.PortCleanupInterval
}
