# Traefik Proxy Setup

This directory contains Traefik configuration for proxying container services.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Access Methods                          │
├─────────────────────────────────────────────────────────────┤
│  Method 1: Domain Access                                     │
│  *.containers.yourdomain.com → Nginx:80 → Traefik:8080      │
│                                              ↓               │
│                                        Container Service     │
├─────────────────────────────────────────────────────────────┤
│  Method 2: Direct Port Access                                │
│  http://your-ip:9001 → Traefik:9001 → Container Service     │
└─────────────────────────────────────────────────────────────┘
```

## Setup

### 1. Start Traefik

```bash
cd docker/traefik
docker-compose up -d
```

### 2. Configure Nginx (for domain access)

Add the configuration from `nginx-example.conf` to your Nginx:

```bash
# Copy to Nginx conf.d
sudo cp nginx-example.conf /etc/nginx/conf.d/traefik-proxy.conf

# Edit and update domain
sudo nano /etc/nginx/conf.d/traefik-proxy.conf

# Test and reload
sudo nginx -t
sudo nginx -s reload
```

### 3. DNS Configuration

For domain-based access, configure a wildcard DNS record:
```
*.containers.yourdomain.com → your-server-ip
```

## Usage

When creating a container, you can configure:

1. **Service Port**: The port your app runs on inside the container (e.g., 3000)
2. **Domain**: Full domain for access (e.g., `myapp.containers.example.com`)
3. **Direct Port**: Port 9001-9010 for IP:port access

## Access Examples

- Domain: `http://myapp.containers.example.com`
- Direct: `http://your-server-ip:9001`

## Traefik Dashboard

Access at: `http://your-server-ip:8081/dashboard/`

## Ports

| Port | Purpose |
|------|---------|
| 8080 | HTTP entry (Nginx proxies here) |
| 8081 | Traefik Dashboard |
| 30001-30020 | Direct port access |

## Troubleshooting

Check Traefik logs:
```bash
docker logs traefik
```

Verify container labels:
```bash
docker inspect <container-id> | grep -A 20 Labels
```
