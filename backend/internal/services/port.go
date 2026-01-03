package services

import (
	"errors"

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
	ID            uint   `json:"id"`
	ContainerID   uint   `json:"container_id"`
	ContainerName string `json:"container_name"`
	Port          int    `json:"port"`
	Name          string `json:"name"`
	Protocol      string `json:"protocol"`
	AutoCreated   bool   `json:"auto_created"`
	ProxyURL      string `json:"proxy_url"`
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

// ListAllPorts lists all exposed ports across all containers
func (s *PortService) ListAllPorts() ([]PortInfo, error) {
	var ports []models.ContainerPort
	if err := s.db.Find(&ports).Error; err != nil {
		return nil, err
	}

	// Get container names
	containerNames := make(map[uint]string)
	var containers []models.Container
	if err := s.db.Select("id", "name").Find(&containers).Error; err != nil {
		return nil, err
	}
	for _, c := range containers {
		containerNames[c.ID] = c.Name
	}

	// Build result
	result := make([]PortInfo, len(ports))
	for i, p := range ports {
		result[i] = PortInfo{
			ID:            p.ID,
			ContainerID:   p.ContainerID,
			ContainerName: containerNames[p.ContainerID],
			Port:          p.Port,
			Name:          p.Name,
			Protocol:      p.Protocol,
			AutoCreated:   p.AutoCreated,
			ProxyURL:      "", // Will be set by frontend based on current host
		}
	}

	return result, nil
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
