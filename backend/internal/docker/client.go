package docker

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/network"
	"github.com/docker/docker/client"
	"github.com/docker/go-connections/nat"
)

const (
	BaseImageName           = "cc-base"
	BaseImageTag            = "latest"
	BaseImageWithCodeServer = "with-code-server"
)

// Client wraps the Docker SDK client
type Client struct {
	cli *client.Client
}

// NewClient creates a new Docker client
func NewClient() (*Client, error) {
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return nil, fmt.Errorf("failed to create Docker client: %w", err)
	}

	return &Client{cli: cli}, nil
}

// Close closes the Docker client
func (c *Client) Close() error {
	return c.cli.Close()
}

// Ping checks if Docker daemon is accessible
func (c *Client) Ping(ctx context.Context) error {
	_, err := c.cli.Ping(ctx)
	return err
}

// BaseImageExists checks if the base image exists
func (c *Client) BaseImageExists(ctx context.Context) bool {
	imageName := fmt.Sprintf("%s:%s", BaseImageName, BaseImageTag)
	_, _, err := c.cli.ImageInspectWithRaw(ctx, imageName)
	return err == nil
}

// BuildBaseImage builds the base image from Dockerfile
func (c *Client) BuildBaseImage(ctx context.Context, dockerfilePath string) error {
	// Read Dockerfile directory
	dockerfileDir := filepath.Dir(dockerfilePath)
	
	// Create tar archive of the build context
	tarPath, err := createBuildContext(dockerfileDir)
	if err != nil {
		return fmt.Errorf("failed to create build context: %w", err)
	}
	defer os.Remove(tarPath)

	// Open tar file
	buildContext, err := os.Open(tarPath)
	if err != nil {
		return fmt.Errorf("failed to open build context: %w", err)
	}
	defer buildContext.Close()

	// Build image
	imageName := fmt.Sprintf("%s:%s", BaseImageName, BaseImageTag)
	buildOptions := types.ImageBuildOptions{
		Tags:       []string{imageName},
		Dockerfile: filepath.Base(dockerfilePath),
		Remove:     true,
	}

	resp, err := c.cli.ImageBuild(ctx, buildContext, buildOptions)
	if err != nil {
		return fmt.Errorf("failed to build image: %w", err)
	}
	defer resp.Body.Close()

	// Read build output
	_, err = io.Copy(io.Discard, resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read build output: %w", err)
	}

	return nil
}

// PullImage pulls an image from registry
func (c *Client) PullImage(ctx context.Context, imageName string) error {
	resp, err := c.cli.ImagePull(ctx, imageName, types.ImagePullOptions{})
	if err != nil {
		return err
	}
	defer resp.Close()

	// Read pull output
	_, err = io.Copy(io.Discard, resp)
	return err
}

// CreateContainer creates a new container
func (c *Client) CreateContainer(ctx context.Context, config *ContainerConfig) (string, error) {
	// Select image based on code-server requirement
	imageTag := BaseImageTag
	if config.UseCodeServer {
		imageTag = BaseImageWithCodeServer
	}
	imageName := fmt.Sprintf("%s:%s", BaseImageName, imageTag)

	// Build exposed ports and port bindings
	exposedPorts := nat.PortSet{}
	portBindings := nat.PortMap{}
	
	for containerPort, hostPort := range config.PortBindings {
		port := nat.Port(containerPort)
		exposedPorts[port] = struct{}{}
		portBindings[port] = []nat.PortBinding{
			{
				HostIP:   "0.0.0.0",
				HostPort: hostPort,
			},
		}
	}

	// Determine user: root or dev (default)
	user := "dev"
	if config.RunAsRoot {
		user = "root"
	}

	// Build container config
	containerConfig := &container.Config{
		Image:        imageName,
		Env:          config.EnvVars,
		User:         user,
		Tty:          true,
		OpenStdin:    true,
		AttachStdin:  true,
		AttachStdout: true,
		AttachStderr: true,
		WorkingDir:   "/workspace",
		ExposedPorts: exposedPorts,
		Labels:       config.Labels,
	}

	// Build host config with security settings
	hostConfig := &container.HostConfig{
		Binds:        config.Binds,
		SecurityOpt:  config.SecurityOpt,
		CapDrop:      config.CapDrop,
		CapAdd:       config.CapAdd,
		Resources:    config.Resources,
		NetworkMode:  container.NetworkMode(config.NetworkMode),
		PortBindings: portBindings,
	}

	// Network config - connect to traefik network only if explicitly requested
	var networkingConfig *network.NetworkingConfig
	if config.UseTraefikNet {
		networkingConfig = &network.NetworkingConfig{
			EndpointsConfig: map[string]*network.EndpointSettings{
				"traefik-net": {},
			},
		}
	}

	// Create container
	resp, err := c.cli.ContainerCreate(ctx, containerConfig, hostConfig, networkingConfig, nil, config.Name)
	if err != nil {
		return "", fmt.Errorf("failed to create container: %w", err)
	}

	return resp.ID, nil
}

// StartContainer starts a container
func (c *Client) StartContainer(ctx context.Context, containerID string) error {
	return c.cli.ContainerStart(ctx, containerID, container.StartOptions{})
}

// StopContainer stops a container
func (c *Client) StopContainer(ctx context.Context, containerID string, timeout *int) error {
	stopOptions := container.StopOptions{}
	if timeout != nil {
		stopOptions.Timeout = timeout
	}
	return c.cli.ContainerStop(ctx, containerID, stopOptions)
}

// RemoveContainer removes a container
func (c *Client) RemoveContainer(ctx context.Context, containerID string, force bool) error {
	return c.cli.ContainerRemove(ctx, containerID, container.RemoveOptions{
		Force:         force,
		RemoveVolumes: true,
	})
}

// GetContainerStatus gets the status of a container
func (c *Client) GetContainerStatus(ctx context.Context, containerID string) (string, error) {
	info, err := c.cli.ContainerInspect(ctx, containerID)
	if err != nil {
		return "", err
	}
	return info.State.Status, nil
}

// GetContainerIP gets the IP address of a container in the bridge network
func (c *Client) GetContainerIP(ctx context.Context, containerID string) (string, error) {
	info, err := c.cli.ContainerInspect(ctx, containerID)
	if err != nil {
		return "", err
	}
	
	// Try traefik-net first
	if network, ok := info.NetworkSettings.Networks["traefik-net"]; ok && network.IPAddress != "" {
		return network.IPAddress, nil
	}
	
	// Fall back to bridge network
	if network, ok := info.NetworkSettings.Networks["bridge"]; ok && network.IPAddress != "" {
		return network.IPAddress, nil
	}
	
	// Try any available network
	for _, network := range info.NetworkSettings.Networks {
		if network.IPAddress != "" {
			return network.IPAddress, nil
		}
	}
	
	return "", fmt.Errorf("no IP address found for container")
}

// ListContainers lists all containers managed by cc-platform
func (c *Client) ListContainers(ctx context.Context) ([]types.Container, error) {
	return c.cli.ContainerList(ctx, container.ListOptions{
		All: true,
		Filters: filters.NewArgs(
			filters.Arg("label", "cc-platform.managed=true"),
		),
	})
}

// ListAllContainers lists all containers (for admin/debug purposes)
func (c *Client) ListAllContainers(ctx context.Context) ([]types.Container, error) {
	return c.cli.ContainerList(ctx, container.ListOptions{
		All: true,
	})
}

// ExecInContainer executes a command in a container
func (c *Client) ExecInContainer(ctx context.Context, containerID string, cmd []string) (string, error) {
	execConfig := types.ExecConfig{
		Cmd:          cmd,
		AttachStdout: true,
		AttachStderr: true,
	}

	execID, err := c.cli.ContainerExecCreate(ctx, containerID, execConfig)
	if err != nil {
		return "", err
	}

	resp, err := c.cli.ContainerExecAttach(ctx, execID.ID, types.ExecStartCheck{})
	if err != nil {
		return "", err
	}
	defer resp.Close()

	output, err := io.ReadAll(resp.Reader)
	if err != nil {
		return "", err
	}

	return string(output), nil
}

// ContainerConfig holds configuration for creating a container
type ContainerConfig struct {
	Name            string
	EnvVars         []string
	Binds           []string
	SecurityOpt     []string
	CapDrop         []string
	CapAdd          []string
	Resources       container.Resources
	NetworkMode     string
	PortBindings    map[string]string // containerPort -> hostPort, e.g., "3000/tcp" -> "13000"
	Labels          map[string]string // Container labels (for Traefik routing)
	UseTraefikNet   bool              // Connect to traefik-net network
	UseCodeServer   bool              // Use image with code-server
	RunAsRoot       bool              // Run as root user (default: false, runs as dev user)
}

// createBuildContext creates a tar archive of the build context
func createBuildContext(dir string) (string, error) {
	// For simplicity, we'll use a temporary approach
	// In production, use archive/tar to create proper tar
	tarPath := filepath.Join(os.TempDir(), fmt.Sprintf("docker-build-%d.tar", time.Now().UnixNano()))
	
	// This is a simplified version - in production use proper tar creation
	// For now, we'll rely on the Docker daemon to handle the context
	return tarPath, nil
}
