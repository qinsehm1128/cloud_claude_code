package docker

import (
	"sync"

	"github.com/docker/docker/client"
)

var (
	sharedClient *client.Client
	clientOnce   sync.Once
	clientErr    error
)

// GetSharedClient returns a shared Docker client instance
// This avoids creating multiple clients across services
func GetSharedClient() (*client.Client, error) {
	clientOnce.Do(func() {
		sharedClient, clientErr = client.NewClientWithOpts(
			client.FromEnv,
			client.WithAPIVersionNegotiation(),
		)
	})
	return sharedClient, clientErr
}

// CloseSharedClient closes the shared Docker client
// Should be called on application shutdown
func CloseSharedClient() error {
	if sharedClient != nil {
		return sharedClient.Close()
	}
	return nil
}
