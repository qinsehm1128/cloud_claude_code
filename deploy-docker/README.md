# Docker Deployment Guide

Docker 部署指南

## Overview / 概述

This directory contains Docker deployment configuration for the Claude Code Container Platform. It uses a multi-stage build approach to create minimal, production-ready images.

本目录包含 Claude Code 容器平台的 Docker 部署配置。采用多阶段构建方式创建最小化的生产就绪镜像。

## Architecture / 架构

```
┌─────────────────────────────────────────────────────────────┐
│                     Client (Browser)                         │
│                        客户端（浏览器）                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                Frontend Container (Nginx)                    │
│                   前端容器 (Nginx)                            │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ • Serves static React files / 托管 React 静态文件        ││
│  │ • Proxies /api/* to backend / 代理 /api/* 到后端         ││
│  │ • WebSocket support / WebSocket 支持                     ││
│  │ • Gzip compression / Gzip 压缩                           ││
│  └─────────────────────────────────────────────────────────┘│
│                         Port: 80                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                Backend Container (Go)                        │
│                    后端容器 (Go)                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ • REST API / REST API 接口                               ││
│  │ • WebSocket (Terminal, Chat) / WebSocket（终端、聊天）    ││
│  │ • Docker container management / Docker 容器管理          ││
│  │ • SQLite database / SQLite 数据库                        ││
│  └─────────────────────────────────────────────────────────┘│
│                         Port: 8080                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Docker Socket (Host)                       │
│                    Docker Socket (宿主机)                     │
│              /var/run/docker.sock (read-only)                │
└─────────────────────────────────────────────────────────────┘
```

## File Structure / 文件结构

```
deploy-docker/
├── docker-compose.yml      # Service orchestration / 服务编排
├── Dockerfile.frontend     # Frontend multi-stage build / 前端多阶段构建
├── Dockerfile.backend      # Backend multi-stage build / 后端多阶段构建
├── nginx.conf              # Nginx configuration / Nginx 配置
├── .env.example            # Environment template / 环境变量模板
└── README.md               # This file / 本文件
```

## Quick Start / 快速开始

### 1. Prerequisites / 前置要求

- Docker 20.10+
- Docker Compose v2.0+

### 2. Configure Environment / 配置环境变量

```bash
cd deploy-docker

# Copy environment template / 复制环境变量模板
cp .env.example .env

# Generate secure keys / 生成安全密钥
echo "JWT_SECRET=$(openssl rand -hex 32)" >> .env
echo "ENCRYPTION_KEY=$(openssl rand -hex 32)" >> .env

# Edit .env with your settings / 编辑 .env 配置
nano .env
```

### 3. Build and Start / 构建并启动

```bash
# Build and start all services / 构建并启动所有服务
docker compose up -d --build

# View logs / 查看日志
docker compose logs -f

# Check status / 检查状态
docker compose ps
```

### 4. Access / 访问

Open browser and visit: `http://localhost` (or your configured port)

打开浏览器访问: `http://localhost`（或你配置的端口）

## Configuration Details / 配置详解

### Environment Variables / 环境变量

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `FRONTEND_PORT` | No | `80` | Frontend exposed port / 前端暴露端口 |
| `ENVIRONMENT` | No | `production` | Runtime environment / 运行环境 |
| `JWT_SECRET` | **Yes** | - | JWT authentication key / JWT 认证密钥 |
| `ENCRYPTION_KEY` | **Yes** | - | Data encryption key / 数据加密密钥 |
| `ADMIN_USERNAME` | No | `admin` | Admin username / 管理员用户名 |
| `ADMIN_PASSWORD` | **Yes** | - | Admin password / 管理员密码 |
| `ALLOWED_ORIGINS` | No | - | CORS origins / CORS 来源 |
| `AUTO_START_TRAEFIK` | No | `false` | Auto-start Traefik / 自动启动 Traefik |
| `GITHUB_TOKEN` | No | - | GitHub access token / GitHub 令牌 |
| `ANTHROPIC_API_KEY` | No | - | Claude API key / Claude API 密钥 |

### Docker Compose Services / Docker Compose 服务

#### Frontend Service / 前端服务

- **Base Image**: `nginx:alpine` (~40MB)
- **Build**: Multi-stage (Node.js build → Nginx serve)
- **Features**:
  - Gzip compression / Gzip 压缩
  - Static file caching / 静态文件缓存
  - SPA routing support / SPA 路由支持
  - WebSocket proxy / WebSocket 代理
  - Health check / 健康检查

#### Backend Service / 后端服务

- **Base Image**: `alpine:3.19` (~7MB)
- **Build**: Multi-stage (Go build → Alpine run)
- **Features**:
  - Static binary / 静态二进制
  - Docker socket access / Docker socket 访问
  - SQLite persistence / SQLite 持久化
  - Health check / 健康检查

### Image Sizes / 镜像大小

| Image | Approximate Size |
|-------|-----------------|
| Frontend (nginx:alpine) | ~50MB |
| Backend (alpine:3.19) | ~30MB |
| **Total** | **~80MB** |

## Common Operations / 常用操作

### Start Services / 启动服务

```bash
docker compose up -d
```

### Stop Services / 停止服务

```bash
docker compose down
```

### Rebuild and Restart / 重新构建并重启

```bash
docker compose up -d --build
```

### View Logs / 查看日志

```bash
# All services / 所有服务
docker compose logs -f

# Frontend only / 仅前端
docker compose logs -f frontend

# Backend only / 仅后端
docker compose logs -f backend
```

### Check Status / 检查状态

```bash
docker compose ps
```

### Restart a Service / 重启单个服务

```bash
docker compose restart backend
docker compose restart frontend
```

### Clean Up / 清理

```bash
# Stop and remove containers, networks
# 停止并删除容器和网络
docker compose down

# Also remove volumes (WARNING: deletes data!)
# 同时删除卷（警告：会删除数据！）
docker compose down -v

# Remove images
# 删除镜像
docker compose down --rmi all
```

## Data Persistence / 数据持久化

Data is stored in a Docker volume named `cc-platform-data`.

数据存储在名为 `cc-platform-data` 的 Docker 卷中。

### Backup Data / 备份数据

```bash
# Create backup / 创建备份
docker run --rm -v cc-platform-data:/data -v $(pwd):/backup \
  alpine tar czf /backup/cc-data-backup.tar.gz -C /data .
```

### Restore Data / 恢复数据

```bash
# Restore from backup / 从备份恢复
docker run --rm -v cc-platform-data:/data -v $(pwd):/backup \
  alpine tar xzf /backup/cc-data-backup.tar.gz -C /data
```

## Security Considerations / 安全注意事项

1. **Change Default Credentials / 更改默认凭据**
   - Always set `ADMIN_PASSWORD` in production
   - 在生产环境中务必设置 `ADMIN_PASSWORD`

2. **Use Strong Keys / 使用强密钥**
   ```bash
   openssl rand -hex 32  # For JWT_SECRET and ENCRYPTION_KEY
   ```

3. **HTTPS / HTTPS 配置**
   - Use a reverse proxy (Nginx, Traefik, Caddy) with SSL
   - 使用带 SSL 的反向代理

4. **Docker Socket Access / Docker Socket 访问**
   - The backend requires Docker socket access for container management
   - Socket is mounted as read-only for security
   - 后端需要 Docker socket 访问来管理容器
   - Socket 以只读方式挂载以提高安全性

## Troubleshooting / 故障排除

### Container Won't Start / 容器无法启动

```bash
# Check logs / 检查日志
docker compose logs backend

# Check if port is in use / 检查端口是否被占用
netstat -tlnp | grep 80
```

### Database Errors / 数据库错误

```bash
# Check volume / 检查卷
docker volume inspect cc-platform-data

# Reset database (WARNING: deletes data!)
# 重置数据库（警告：会删除数据！）
docker compose down -v
docker compose up -d --build
```

### Permission Issues / 权限问题

```bash
# Check Docker socket permissions / 检查 Docker socket 权限
ls -la /var/run/docker.sock

# Ensure current user is in docker group
# 确保当前用户在 docker 组中
sudo usermod -aG docker $USER
```

### Network Issues / 网络问题

```bash
# Check network / 检查网络
docker network inspect cc-platform-network

# Recreate network / 重建网络
docker compose down
docker network rm cc-platform-network
docker compose up -d
```

## Production Deployment / 生产部署

### With External Nginx / 使用外部 Nginx

If you have an existing Nginx server, you can use it as a reverse proxy:

如果你有现有的 Nginx 服务器，可以将其用作反向代理：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:8080;  # Docker frontend port
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### With SSL (Let's Encrypt) / 使用 SSL (Let's Encrypt)

```bash
# Install certbot / 安装 certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate / 获取证书
sudo certbot --nginx -d your-domain.com
```

## Comparison with Shell Deployment / 与 Shell 部署对比

| Feature | Docker | Shell (deploy-sh) |
|---------|--------|-------------------|
| Isolation / 隔离性 | High / 高 | Low / 低 |
| Portability / 可移植性 | High / 高 | Medium / 中 |
| Dependencies / 依赖管理 | Bundled / 打包 | System / 系统 |
| Updates / 更新 | Rebuild / 重建 | Script / 脚本 |
| Rollback / 回滚 | Easy / 简单 | Manual / 手动 |
| Resource Usage / 资源占用 | Higher / 较高 | Lower / 较低 |

## License / 许可证

MIT License
