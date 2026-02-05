# Docker 部署指南

## 概述

本目录包含 Claude Code 容器平台的 Docker 部署配置。部署包含两个部分：

1. **平台服务** - 前端 (React/Nginx) + 后端 (Go)
2. **基础镜像** - 用于创建用户开发容器的基础镜像

## 架构说明

```
┌─────────────────────────────────────────────────────────────┐
│                      客户端（浏览器）                         │
└─────────────────────────────────────────────────────────────┘
          │                                    │
          ▼                                    ▼
┌─────────────────────┐            ┌─────────────────────────┐
│  主站点访问          │            │  Code-Server 子域名访问   │
│  example.com        │            │  *.code.example.com     │
└─────────────────────┘            └─────────────────────────┘
          │                                    │
          ▼                                    ▼
┌─────────────────────────────────────────────────────────────┐
│                   宿主机 Nginx (可选)                        │
│              用于域名访问和 SSL 终止                          │
└─────────────────────────────────────────────────────────────┘
          │                                    │
          ▼                                    ▼
┌─────────────────────────────────────────────────────────────┐
│                    Docker 容器                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │           前端容器 (cc-frontend)                       │  │
│  │  • Nginx 托管 React 静态文件                           │  │
│  │  • 代理 /api/* 到后端                                  │  │
│  │  • 端口: 80                                           │  │
│  └───────────────────────────────────────────────────────┘  │
│                           │                                  │
│                           ▼                                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │           后端容器 (cc-backend)                        │  │
│  │  • Go API 服务                                        │  │
│  │  • 容器管理（通过 Docker Socket）                       │  │
│  │  • SQLite 数据库                                      │  │
│  │  • 端口: 8080                                         │  │
│  └───────────────────────────────────────────────────────┘  │
│                           │                                  │
│                           ▼                                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │           Traefik 容器 (可选)                          │  │
│  │  • 路由到各个 code-server 容器                         │  │
│  │  • 端口: 38000-39000 (HTTP)                           │  │
│  │  • 端口: 30001-30020 (直接访问)                        │  │
│  └───────────────────────────────────────────────────────┘  │
│                           │                                  │
│                           ▼                                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │           用户开发容器 (基于 cc-base)                   │  │
│  │  • Ubuntu 22.04 + Node.js 20                          │  │
│  │  • Claude Code CLI                                    │  │
│  │  • code-server (可选)                                 │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## 文件结构

```
deploy-docker/
├── start.sh                # 一键部署脚本（推荐）
├── build-base.sh           # 基础镜像构建脚本
├── docker-compose.yml      # 平台服务编排
├── Dockerfile.frontend     # 前端镜像构建
├── Dockerfile.backend      # 后端镜像构建
├── nginx.conf              # 容器内 Nginx 配置
├── nginx-host.conf         # 宿主机 Nginx 配置模板
├── .env.example            # 环境变量模板
├── README.md               # 英文文档
└── README.zh-CN.md         # 本文件
```

## 快速开始

### 1. 前置要求

- Docker 20.10+
- Docker Compose v2.0+
- Node.js 20+ (用于构建 VS Code 扩展，可选)

### 2. 一键部署

```bash
cd deploy-docker

# 运行部署脚本
chmod +x start.sh
./start.sh
```

脚本会自动完成以下步骤：
1. 检查 Docker 环境
2. 构建基础镜像 (`cc-base:latest`, `cc-base:with-code-server`)
3. 配置环境变量
4. 构建并启动平台服务

### 3. 访问平台

部署完成后，访问：`http://localhost`（或配置的端口）

默认凭据：
- 用户名：`admin`
- 密码：在 `.env` 中配置的 `ADMIN_PASSWORD`

## 详细部署步骤

### 步骤 1：配置环境变量

```bash
cd deploy-docker

# 复制模板
cp .env.example .env

# 生成安全密钥
JWT_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)

# 编辑配置
nano .env
```

**必须配置的变量：**

| 变量 | 说明 |
|-----|------|
| `JWT_SECRET` | JWT 认证密钥 |
| `ENCRYPTION_KEY` | 数据加密密钥 |
| `ADMIN_PASSWORD` | 管理员密码 |

### 步骤 2：构建基础镜像

基础镜像用于创建用户的开发容器：

```bash
# 常规构建
./build-base.sh

# 清理后重新构建
./build-base.sh --clean

# 不使用缓存构建
./build-base.sh --no-cache
```

构建完成后会生成两个镜像：
- `cc-base:latest` - 基础开发环境（无 code-server）
- `cc-base:with-code-server` - 含 Web IDE 的开发环境

### 步骤 3：启动平台服务

```bash
# 构建并启动
docker compose up -d --build

# 查看状态
docker compose ps

# 查看日志
docker compose logs -f
```

## 生产环境部署

### 方案 A：直接端口访问

最简单的部署方式，直接通过端口访问：

```bash
# .env 配置
FRONTEND_PORT=80
```

访问：`http://服务器IP`

### 方案 B：域名 + Nginx 反向代理（推荐）

使用宿主机 Nginx 进行反向代理，支持域名和 SSL：

#### 1. 配置 DNS

```
A 记录: example.com -> 服务器IP
A 记录: *.code.example.com -> 服务器IP (泛域名，用于 code-server)
```

#### 2. 配置宿主机 Nginx

```bash
# 复制配置模板
sudo cp nginx-host.conf /etc/nginx/sites-available/cc-platform.conf

# 编辑配置，替换占位符
sudo nano /etc/nginx/sites-available/cc-platform.conf
# 替换:
#   YOUR_DOMAIN -> 你的域名 (如 cc.example.com)
#   YOUR_CODE_DOMAIN -> code-server 域名 (如 code.example.com)
#   TRAEFIK_HTTP_PORT -> Traefik HTTP 端口 (查看 docker ps)

# 启用配置
sudo ln -s /etc/nginx/sites-available/cc-platform.conf /etc/nginx/sites-enabled/

# 测试并重载
sudo nginx -t
sudo systemctl reload nginx
```

#### 3. 配置 SSL（推荐）

```bash
# 安装 certbot
sudo apt install certbot python3-certbot-nginx

# 获取主站点证书
sudo certbot --nginx -d example.com

# 获取 code-server 泛域名证书（需要 DNS 验证）
sudo certbot certonly --manual --preferred-challenges dns -d "*.code.example.com"
```

### 方案 C：启用 Code-Server 子域名访问

如果需要通过子域名访问容器中的 code-server：

#### 1. 修改 .env

```bash
# 启用 Traefik
AUTO_START_TRAEFIK=true

# 设置 code-server 基础域名
CODE_SERVER_BASE_DOMAIN=code.example.com
```

#### 2. 重启后端

```bash
docker compose restart backend
```

#### 3. 配置宿主机 Nginx

参考 `nginx-host.conf` 中的 code-server 子域名配置部分。

#### 4. 获取 Traefik 端口

```bash
# 查看 Traefik 容器端口
docker ps | grep traefik

# 或查看后端日志
docker compose logs backend | grep "Traefik HTTP port"
```

将获取到的端口填入 nginx-host.conf 的 `TRAEFIK_HTTP_PORT`。

## Nginx 配置详解

### 容器内 Nginx (nginx.conf)

这是前端容器内的 Nginx 配置，主要功能：

```nginx
# 代理 API 请求到后端
location /api/ {
    proxy_pass http://backend:8080;
    # WebSocket 支持
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}

# 前端 SPA 路由
location / {
    try_files $uri $uri/ /index.html;
}
```

### 宿主机 Nginx (nginx-host.conf)

这是宿主机 Nginx 的配置模板，主要功能：

1. **主站点代理** - 将请求代理到 Docker 前端容器
2. **Code-Server 子域名** - 将子域名请求代理到 Traefik
3. **SSL 终止** - 处理 HTTPS

## 镜像说明

### 平台镜像

| 镜像 | 基础 | 大小 | 用途 |
|-----|------|------|------|
| cc-frontend | nginx:alpine | ~50MB | 前端服务 |
| cc-backend | alpine:3.19 | ~30MB | 后端服务 |

### 基础镜像

| 镜像 | 基础 | 大小 | 用途 |
|-----|------|------|------|
| cc-base:latest | ubuntu:22.04 | ~500MB | 用户开发容器（无 IDE） |
| cc-base:with-code-server | ubuntu:22.04 | ~700MB | 用户开发容器（含 Web IDE） |

基础镜像包含：
- Ubuntu 22.04
- Node.js 20 LTS
- Git
- Claude Code CLI
- code-server（仅 with-code-server 版本）
- PTY Automation VS Code 扩展

## 常用命令

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

# 清理后重新构建
docker compose down -v
docker compose up -d --build --no-cache
```

### 日志查看

```bash
# 所有服务
docker compose logs -f

# 仅后端
docker compose logs -f backend

# 仅前端
docker compose logs -f frontend

# 最近 100 行
docker compose logs --tail 100
```

### 基础镜像管理

```bash
# 重新构建基础镜像
./build-base.sh

# 清理后重建
./build-base.sh --clean

# 查看基础镜像
docker images cc-base
```

### 数据管理

```bash
# 备份数据
docker run --rm -v cc-platform-data:/data -v $(pwd):/backup \
  alpine tar czf /backup/backup-$(date +%Y%m%d).tar.gz -C /data .

# 恢复数据
docker run --rm -v cc-platform-data:/data -v $(pwd):/backup \
  alpine tar xzf /backup/backup-20240101.tar.gz -C /data
```

## 故障排除

### 基础镜像构建失败

```bash
# 检查 Docker 是否运行
docker info

# 清理后重试
./build-base.sh --clean

# 查看详细错误
docker build --no-cache -f ../docker/Dockerfile.base ../docker/
```

### 容器无法启动

```bash
# 查看日志
docker compose logs

# 检查端口占用
netstat -tlnp | grep 80
ss -tlnp | grep 80
```

### Code-Server 子域名无法访问

1. 确认 `AUTO_START_TRAEFIK=true`
2. 确认 Traefik 容器已启动：`docker ps | grep traefik`
3. 确认 DNS 配置正确
4. 检查宿主机 Nginx 配置中的 Traefik 端口是否正确

### Docker Socket 权限问题

```bash
# 检查权限
ls -la /var/run/docker.sock

# 将用户添加到 docker 组
sudo usermod -aG docker $USER
# 重新登录生效
```

## 与 Shell 部署对比

| 特性 | Docker 部署 | Shell 部署 (deploy-sh) |
|------|------------|------------------------|
| 隔离性 | 高（容器隔离） | 低（系统环境） |
| 可移植性 | 高 | 中 |
| 依赖管理 | 容器内打包 | 依赖系统环境 |
| 更新方式 | 重建镜像 | 执行脚本 |
| 回滚 | 简单（切换镜像） | 需手动操作 |
| 资源占用 | 较高 | 较低 |
| 适用场景 | 云服务器、容器平台 | 传统服务器 |

## 许可证

MIT License
