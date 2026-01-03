package services

import (
	"context"
	"fmt"
	"log"
	"math/rand"
	"net"
	"time"

	"cc-platform/internal/config"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/network"
	"github.com/docker/docker/client"
	"github.com/docker/go-connections/nat"
)

const (
	TraefikContainerName = "cc-traefik"
	TraefikImage         = "traefik:v3.0"
	TraefikNetworkName   = "traefik-net"
)

// TraefikService manages the Traefik container
type TraefikService struct {
	cli    *client.Client
	config *config.Config
	
	// Assigned ports (may be auto-generated)
	HTTPPort      int
	DashboardPort int
}

// NewTraefikService creates a new TraefikService
func NewTraefikService(cfg *config.Config) (*TraefikService, error) {
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return nil, fmt.Errorf("failed to create Docker client: %w", err)
	}

	return &TraefikService{
		cli:    cli,
		config: cfg,
	}, nil
}

// Close closes the Docker client
func (s *TraefikService) Close() error {
	return s.cli.Close()
}

// EnsureTraefik ensures Traefik is running if AUTO_START_TRAEFIK is true
func (s *TraefikService) EnsureTraefik(ctx context.Context) error {
	if !s.config.AutoStartTraefik {
		log.Println("Traefik auto-start is disabled")
		return nil
	}

	log.Println("Checking Traefik status...")

	// Check if Traefik container exists and get its ports
	exists, running, ports, err := s.getTraefikStatus(ctx)
	if err != nil {
		return fmt.Errorf("failed to check Traefik status: %w", err)
	}

	if running {
		// Use existing ports
		s.HTTPPort = ports.httpPort
		s.DashboardPort = ports.dashboardPort
		log.Printf("Traefik is already running (HTTP: %d, Dashboard: %d)", s.HTTPPort, s.DashboardPort)
		return nil
	}

	if exists {
		// Container exists but not running, start it
		log.Println("Starting existing Traefik container...")
		if err := s.cli.ContainerStart(ctx, TraefikContainerName, container.StartOptions{}); err != nil {
			return fmt.Errorf("failed to start Traefik: %w", err)
		}
		s.HTTPPort = ports.httpPort
		s.DashboardPort = ports.dashboardPort
		log.Printf("Traefik started (HTTP: %d, Dashboard: %d)", s.HTTPPort, s.DashboardPort)
		return nil
	}

	// Container doesn't exist, create it with auto-assigned ports
	log.Println("Creating Traefik container...")
	if err := s.createTraefik(ctx); err != nil {
		return fmt.Errorf("failed to create Traefik: %w", err)
	}

	log.Printf("Traefik created and started (HTTP: %d, Dashboard: %d)", s.HTTPPort, s.DashboardPort)
	return nil
}

type traefikPorts struct {
	httpPort      int
	dashboardPort int
}

// getTraefikStatus checks if Traefik container exists and is running
func (s *TraefikService) getTraefikStatus(ctx context.Context) (exists bool, running bool, ports traefikPorts, err error) {
	containers, err := s.cli.ContainerList(ctx, container.ListOptions{
		All: true,
		Filters: filters.NewArgs(
			filters.Arg("name", TraefikContainerName),
		),
	})
	if err != nil {
		return false, false, ports, err
	}

	if len(containers) == 0 {
		return false, false, ports, nil
	}

	// Extract ports from existing container
	for _, p := range containers[0].Ports {
		if p.PrivatePort == 8080 {
			ports.httpPort = int(p.PublicPort)
		}
		if p.PrivatePort == 8081 {
			ports.dashboardPort = int(p.PublicPort)
		}
	}

	return true, containers[0].State == "running", ports, nil
}

// createTraefik creates and starts the Traefik container
func (s *TraefikService) createTraefik(ctx context.Context) error {
	// Ensure network exists
	if err := s.ensureNetwork(ctx); err != nil {
		return err
	}

	// Pull image if not exists
	if err := s.pullImageIfNeeded(ctx, TraefikImage); err != nil {
		return err
	}

	// Auto-assign ports if not specified
	s.HTTPPort = s.config.TraefikHTTPPort
	s.DashboardPort = s.config.TraefikDashboardPort
	
	if s.HTTPPort == 0 {
		port, err := findFreePort(38000, 39000)
		if err != nil {
			return fmt.Errorf("failed to find free port for HTTP: %w", err)
		}
		s.HTTPPort = port
	}
	
	if s.DashboardPort == 0 {
		port, err := findFreePort(39000, 40000)
		if err != nil {
			return fmt.Errorf("failed to find free port for dashboard: %w", err)
		}
		s.DashboardPort = port
	}

	// Build port bindings
	portBindings := nat.PortMap{
		nat.Port("8080/tcp"): []nat.PortBinding{{HostIP: "0.0.0.0", HostPort: fmt.Sprintf("%d", s.HTTPPort)}},
		nat.Port("8081/tcp"): []nat.PortBinding{{HostIP: "0.0.0.0", HostPort: fmt.Sprintf("%d", s.DashboardPort)}},
	}

	// Add direct port range
	for port := s.config.TraefikPortRangeStart; port <= s.config.TraefikPortRangeEnd; port++ {
		portBindings[nat.Port(fmt.Sprintf("%d/tcp", port))] = []nat.PortBinding{
			{HostIP: "0.0.0.0", HostPort: fmt.Sprintf("%d", port)},
		}
	}

	// Build exposed ports
	exposedPorts := nat.PortSet{}
	for port := range portBindings {
		exposedPorts[port] = struct{}{}
	}

	// Build Traefik command with dynamic configuration
	cmd := s.buildTraefikCommand()

	// Create container
	resp, err := s.cli.ContainerCreate(ctx,
		&container.Config{
			Image:        TraefikImage,
			Cmd:          cmd,
			ExposedPorts: exposedPorts,
		},
		&container.HostConfig{
			PortBindings: portBindings,
			Binds: []string{
				"/var/run/docker.sock:/var/run/docker.sock:ro",
			},
			RestartPolicy: container.RestartPolicy{
				Name: "unless-stopped",
			},
		},
		&network.NetworkingConfig{
			EndpointsConfig: map[string]*network.EndpointSettings{
				TraefikNetworkName: {},
			},
		},
		nil,
		TraefikContainerName,
	)
	if err != nil {
		return fmt.Errorf("failed to create Traefik container: %w", err)
	}

	// Start container
	if err := s.cli.ContainerStart(ctx, resp.ID, container.StartOptions{}); err != nil {
		return fmt.Errorf("failed to start Traefik container: %w", err)
	}

	return nil
}

// findFreePort finds a free port in the given range
func findFreePort(start, end int) (int, error) {
	// Try random ports first for better distribution
	rand.Seed(time.Now().UnixNano())
	for i := 0; i < 10; i++ {
		port := start + rand.Intn(end-start)
		if isPortFree(port) {
			return port, nil
		}
	}
	
	// Fall back to sequential search
	for port := start; port < end; port++ {
		if isPortFree(port) {
			return port, nil
		}
	}
	
	return 0, fmt.Errorf("no free port found in range %d-%d", start, end)
}

// isPortFree checks if a port is available
func isPortFree(port int) bool {
	ln, err := net.Listen("tcp", fmt.Sprintf(":%d", port))
	if err != nil {
		return false
	}
	ln.Close()
	return true
}

// buildTraefikCommand builds the Traefik command with dynamic entrypoints
func (s *TraefikService) buildTraefikCommand() []string {
	cmd := []string{
		"--api.dashboard=true",
		"--api.insecure=true",
		"--providers.docker=true",
		"--providers.docker.exposedbydefault=false",
		fmt.Sprintf("--providers.docker.network=%s", TraefikNetworkName),
		"--entrypoints.web.address=:8080",
	}

	// Add direct port entrypoints
	for port := s.config.TraefikPortRangeStart; port <= s.config.TraefikPortRangeEnd; port++ {
		cmd = append(cmd, fmt.Sprintf("--entrypoints.direct-%d.address=:%d", port, port))
	}

	return cmd
}

// ensureNetwork ensures the Traefik network exists
func (s *TraefikService) ensureNetwork(ctx context.Context) error {
	// Check if network exists
	networks, err := s.cli.NetworkList(ctx, types.NetworkListOptions{
		Filters: filters.NewArgs(filters.Arg("name", TraefikNetworkName)),
	})
	if err != nil {
		return err
	}

	if len(networks) > 0 {
		return nil
	}

	// Create network
	_, err = s.cli.NetworkCreate(ctx, TraefikNetworkName, types.NetworkCreate{
		Driver: "bridge",
	})
	return err
}

// pullImageIfNeeded pulls the image if it doesn't exist locally
func (s *TraefikService) pullImageIfNeeded(ctx context.Context, imageName string) error {
	// Check if image exists
	_, _, err := s.cli.ImageInspectWithRaw(ctx, imageName)
	if err == nil {
		return nil
	}

	log.Printf("Pulling image %s...", imageName)
	reader, err := s.cli.ImagePull(ctx, imageName, types.ImagePullOptions{})
	if err != nil {
		return err
	}
	defer reader.Close()

	// Wait for pull to complete (with timeout)
	ctx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()

	// Read and discard output
	buf := make([]byte, 1024)
	for {
		_, err := reader.Read(buf)
		if err != nil {
			break
		}
	}

	return nil
}
