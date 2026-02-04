# Docker 部署指南

## 概述

本目录包含 Claude Code 容器平台的 Docker 部署配置。采用多阶段构建方式创建最小化的生产就绪镜像。

## 架构说明

```
┌─────────────────────────────────────────────────────────────┐
│                      客户端（浏览器）                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    前端容器 (Nginx + React)                   │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ • 托管 React 静态文件                                    ││
│  │ • 代理 /api/* 请求到后端                                 ││
│  │ • 支持 WebSocket                                         ││
│  │ • Gzip 压缩                                              ││
│  └─────────────────────────────────────────────────────────┘│
│                         端口: 80                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      后端容器 (Go + Gin)                      │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ • REST API 接口                                          ││
│  │ • WebSocket（终端、聊天）                                 ││
│  │ • Docker 容器管理                                        ││
│  │ • SQLite 数据库                                          ││
│  └─────────────────────────────────────────────────────────┘│
│                         端口: 8080                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Docker Socket (宿主机)                     │
│              /var/run/docker.sock (只读)                      │
└─────────────────────────────────────────────────────────────┘
```

## 文件结构

```
deploy-docker/
├── docker-compose.yml      # 服务编排配置
├── Dockerfile.frontend     # 前端多阶段构建
├── Dockerfile.backend      # 后端多阶段构建
├── nginx.conf              # Nginx 配置
├── .env.example            # 环境变量模板
├── start.sh                # 快速启动脚本
├── README.md               # 英文文档
└── README.zh-CN.md         # 本文件
```

## 快速开始

### 1. 前置要求

- Docker 20.10+
- Docker Compose v2.0+

### 2. 配置环境变量

```bash
cd deploy-docker

# 复制环境变量模板
cp .env.example .env

# 生成安全密钥
echo "JWT_SECRET=$(openssl rand -hex 32)" >> .env
echo "ENCRYPTION_KEY=$(openssl rand -hex 32)" >> .env

# 编辑配置文件
nano .env
```

**必须配置的变量：**

| 变量 | 说明 | 示例 |
|-----|------|-----|
| `JWT_SECRET` | JWT 认证密钥 | 使用 `openssl rand -hex 32` 生成 |
| `ENCRYPTION_KEY` | 数据加密密钥 | 使用 `openssl rand -hex 32` 生成 |
| `ADMIN_PASSWORD` | 管理员密码 | 设置一个强密码 |

### 3. 构建并启动

```bash
# 构建并启动所有服务
docker compose up -d --build

# 查看日志
docker compose logs -f

# 检查状态
docker compose ps
```

或者使用快速启动脚本：

```bash
chmod +x start.sh
./start.sh
```

### 4. 访问

打开浏览器访问：`http://localhost`（或你配置的端口）

默认管理员账户：
- 用户名：`admin`（或 .env 中配置的 ADMIN_USERNAME）
- 密码：你在 .env 中设置的 ADMIN_PASSWORD

## 配置详解

### 环境变量说明

#### 核心配置（必填）

| 变量 | 默认值 | 说明 |
|-----|--------|------|
| `JWT_SECRET` | - | JWT 认证密钥，必须设置 |
| `ENCRYPTION_KEY` | - | 敏感数据加密密钥，必须设置 |
| `ADMIN_PASSWORD` | - | 管理员密码，必须设置 |

#### 可选配置

| 变量 | 默认值 | 说明 |
|-----|--------|------|
| `FRONTEND_PORT` | `80` | 前端服务暴露的端口 |
| `ENVIRONMENT` | `production` | 运行环境 |
| `ADMIN_USERNAME` | `admin` | 管理员用户名 |
| `ALLOWED_ORIGINS` | - | 允许的 CORS 来源，多个用逗号分隔 |
| `AUTO_START_TRAEFIK` | `false` | 是否自动启动 Traefik |
| `TRAEFIK_PORT_RANGE_START` | `30001` | Traefik 端口范围起始 |
| `TRAEFIK_PORT_RANGE_END` | `30020` | Traefik 端口范围结束 |

#### 可选 API 密钥

| 变量 | 说明 |
|-----|------|
| `GITHUB_TOKEN` | GitHub 个人访问令牌 |
| `ANTHROPIC_API_KEY` | Claude/Anthropic API 密钥 |
| `ANTHROPIC_BASE_URL` | 自定义 Anthropic API 地址 |
| `CODE_SERVER_BASE_DOMAIN` | Code-server 子域名基础域名 |

### 镜像大小

本部署方案使用最小化镜像：

| 镜像 | 大小 |
|-----|------|
| 前端 (nginx:alpine) | ~50MB |
| 后端 (alpine:3.19) | ~30MB |
| **总计** | **~80MB** |

## 常用操作

### 服务管理

```bash
# 启动服务
docker compose up -d

# 停止服务
docker compose down

# 重启服务
docker compose restart

# 重新构建并启动
docker compose up -d --build
```

### 日志查看

```bash
# 查看所有服务日志
docker compose logs -f

# 仅查看前端日志
docker compose logs -f frontend

# 仅查看后端日志
docker compose logs -f backend

# 查看最近 100 行日志
docker compose logs --tail 100
```

### 状态检查

```bash
# 查看容器状态
docker compose ps

# 查看资源使用
docker stats cc-frontend cc-backend
```

## 数据管理

### 数据持久化

数据存储在名为 `cc-platform-data` 的 Docker 卷中，包括：
- SQLite 数据库
- 上传的文件
- 配置数据

### 备份数据

```bash
# 创建备份
docker run --rm \
  -v cc-platform-data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/cc-data-$(date +%Y%m%d).tar.gz -C /data .
```

### 恢复数据

```bash
# 从备份恢复
docker run --rm \
  -v cc-platform-data:/data \
  -v $(pwd):/backup \
  alpine tar xzf /backup/cc-data-20240101.tar.gz -C /data
```

### 清理数据

```bash
# 停止服务并删除卷（警告：会删除所有数据！）
docker compose down -v

# 删除未使用的镜像
docker image prune -f
```

## 安全建议

### 1. 设置强密码

```bash
# 生成安全密钥
openssl rand -hex 32
```

### 2. 配置 HTTPS

推荐使用反向代理（如 Nginx、Caddy）配置 SSL：

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:80;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 3. 限制 CORS

在生产环境中设置 `ALLOWED_ORIGINS`：

```bash
ALLOWED_ORIGINS=https://your-domain.com,https://admin.your-domain.com
```

### 4. Docker Socket 安全

后端容器需要访问 Docker socket 来管理容器：
- Socket 以只读方式挂载
- 建议限制后端容器的网络访问

## 故障排除

### 容器无法启动

```bash
# 查看详细日志
docker compose logs backend

# 检查端口占用
netstat -tlnp | grep 80
ss -tlnp | grep 80
```

### 数据库错误

```bash
# 检查卷状态
docker volume inspect cc-platform-data

# 重建数据库（警告：会删除数据）
docker compose down -v
docker compose up -d --build
```

### 权限问题

```bash
# 检查 Docker socket 权限
ls -la /var/run/docker.sock

# 将用户添加到 docker 组
sudo usermod -aG docker $USER
# 重新登录生效
```

### 网络问题

```bash
# 检查网络
docker network inspect cc-platform-network

# 重建网络
docker compose down
docker network rm cc-platform-network
docker compose up -d
```

## 与 Shell 部署对比

| 特性 | Docker 部署 | Shell 部署 (deploy-sh) |
|------|------------|------------------------|
| 隔离性 | 高 | 低 |
| 可移植性 | 高 | 中 |
| 依赖管理 | 容器内打包 | 依赖系统环境 |
| 更新方式 | 重建镜像 | 执行脚本 |
| 回滚 | 简单（切换镜像） | 需手动操作 |
| 资源占用 | 较高 | 较低 |
| 适用场景 | 云服务器、容器平台 | 传统服务器 |

## 进阶配置

### 自定义构建参数

```yaml
# docker-compose.yml
services:
  frontend:
    build:
      context: ..
      dockerfile: deploy-docker/Dockerfile.frontend
      args:
        - NODE_ENV=production
```

### 资源限制

```yaml
# docker-compose.yml
services:
  backend:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '0.5'
          memory: 512M
```

### 日志配置

```yaml
# docker-compose.yml
services:
  backend:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

## 许可证

MIT License
