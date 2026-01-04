package services

import (
	"fmt"
)

// TraefikLabelBuilder helps build Traefik labels for containers
type TraefikLabelBuilder struct {
	labels map[string]string
}

// NewTraefikLabelBuilder creates a new TraefikLabelBuilder
func NewTraefikLabelBuilder() *TraefikLabelBuilder {
	return &TraefikLabelBuilder{
		labels: make(map[string]string),
	}
}

// Enable enables Traefik for this container
func (b *TraefikLabelBuilder) Enable() *TraefikLabelBuilder {
	b.labels["traefik.enable"] = "true"
	return b
}

// AddDomainRouter adds a domain-based router
func (b *TraefikLabelBuilder) AddDomainRouter(name, domain, serviceName string) *TraefikLabelBuilder {
	b.labels[fmt.Sprintf("traefik.http.routers.%s.rule", name)] = fmt.Sprintf("Host(`%s`)", domain)
	b.labels[fmt.Sprintf("traefik.http.routers.%s.entrypoints", name)] = "web"
	b.labels[fmt.Sprintf("traefik.http.routers.%s.service", name)] = serviceName
	return b
}

// AddDirectPortRouter adds a direct port router
func (b *TraefikLabelBuilder) AddDirectPortRouter(name string, port int, serviceName string) *TraefikLabelBuilder {
	entrypoint := fmt.Sprintf("direct-%d", port)
	b.labels[fmt.Sprintf("traefik.http.routers.%s.rule", name)] = "PathPrefix(`/`)"
	b.labels[fmt.Sprintf("traefik.http.routers.%s.entrypoints", name)] = entrypoint
	b.labels[fmt.Sprintf("traefik.http.routers.%s.service", name)] = serviceName
	return b
}

// AddService adds a service configuration
func (b *TraefikLabelBuilder) AddService(serviceName string, port int) *TraefikLabelBuilder {
	b.labels[fmt.Sprintf("traefik.http.services.%s.loadbalancer.server.port", serviceName)] = fmt.Sprintf("%d", port)
	return b
}

// Build returns the built labels
func (b *TraefikLabelBuilder) Build() map[string]string {
	return b.labels
}

// Merge merges another set of labels into this builder
func (b *TraefikLabelBuilder) Merge(other map[string]string) *TraefikLabelBuilder {
	for k, v := range other {
		b.labels[k] = v
	}
	return b
}

// BuildCodeServerLabels builds Traefik labels for code-server subdomain routing
func BuildCodeServerLabels(containerName, domain string, internalPort int) map[string]string {
	serviceName := fmt.Sprintf("cc-%s-code", containerName)
	routerName := fmt.Sprintf("%s-code", containerName)

	return NewTraefikLabelBuilder().
		Enable().
		AddDomainRouter(routerName, domain, serviceName).
		AddService(serviceName, internalPort).
		Build()
}

// BuildProxyLabels builds Traefik labels for proxy configuration
func BuildProxyLabels(containerName string, domain string, directPort int, servicePort int) map[string]string {
	serviceName := fmt.Sprintf("cc-%s", containerName)
	builder := NewTraefikLabelBuilder().Enable()

	// Domain-based routing
	if domain != "" {
		routerName := fmt.Sprintf("%s-domain", serviceName)
		builder.AddDomainRouter(routerName, domain, serviceName)
	}

	// Direct port access
	if directPort >= 30001 && directPort <= 30020 {
		routerName := fmt.Sprintf("%s-direct", serviceName)
		builder.AddDirectPortRouter(routerName, directPort, serviceName)
	}

	// Service configuration
	builder.AddService(serviceName, servicePort)

	return builder.Build()
}
