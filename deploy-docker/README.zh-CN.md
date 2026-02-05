# Docker 部署指南

## 概述

本目录包含 Claude Code 容器平台的 Docker 部署配置。

**部署架构：**

```
用户浏览器
    │
    ▼
宿主机 Nginx (80/443)  ←── 用户只需配置这一层
    │
    ├── 主站点 example.com ──────► Docker 前端 (127.0.0.1:51080)
    │                                      │
    │                                      ▼
    │                              Docker 后端 (内部 8080)
    │                                      │
    │                                      ▼
    │                              Traefik (127.0.0.1:51081)
    │                                      │
    └── *.code.example.com ────────────────┘
                                           │
                                           ▼
                                    用户开发容器 (cc-base)
```

## 快速开始

### 1. 部署服务

```bash
cd deploy-docker

# 一键部署（构建基础镜像 + 启动服务）
./start.sh
```

脚本会：
1. 构建基础镜像 `cc-base:latest` 和 `cc-base:with-code-server`
2. 生成安全密钥
3. 提示你编辑 `.env` 配置
4. 启动前后端服务

### 2. 配置 .env

编辑 `.env` 文件：

```bash
# 必填
ADMIN_PASSWORD=your_secure_password

# 域名配置（用于生成 nginx 配置）
DOMAIN=cc.example.com
CODE_SERVER_BASE_DOMAIN=code.example.com
```

### 3. 生成并安装 Nginx 配置

```bash
# 生成 nginx 配置
./generate-nginx.sh

# 安装到宿主机 nginx
sudo cp nginx-site.conf /etc/nginx/sites-available/cc-platform.conf
sudo ln -s /etc/nginx/sites-available/cc-platform.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 4. 配置 DNS

```
A 记录: cc.example.com        → 服务器 IP
A 记录: *.code.example.com    → 服务器 IP （泛域名）
```

### 5. 配置 SSL（推荐）

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d cc.example.com
# 泛域名需要 DNS 验证
sudo certbot certonly --manual --preferred-challenges dns -d "*.code.example.com"
```

## 文件结构

```
deploy-docker/
├── start.sh                # 一键部署脚本
├── build-base.sh           # 基础镜像构建脚本
├── generate-nginx.sh       # Nginx 配置生成脚本
├── docker-compose.yml      # 服务编排
├── Dockerfile.frontend     # 前端镜像
├── Dockerfile.backend      # 后端镜像
├── nginx.conf              # 容器内 Nginx 配置
├── nginx-host.conf         # 宿主机 Nginx 参考配置
├── .env.example            # 环境变量模板
└── README.zh-CN.md         # 本文件
```

## 端口说明

| 端口 | 用途 | 说明 |
|------|------|------|
| `APP_PORT` (51080) | 主应用 | 前端容器，宿主机 nginx 代理到此 |
| `TRAEFIK_HTTP_PORT` (51081) | Code-Server | Traefik 代理，用于 code-server 子域名 |
| `TRAEFIK_DASHBOARD_PORT` (51082) | Dashboard | Traefik 仪表板 |
| `30001-30020` | 直接端口 | 容器服务直接访问端口 |

## 配置详解

### .env 配置项

```bash
# === 必填 ===
ADMIN_PASSWORD=xxx          # 管理员密码

# === 域名 ===
DOMAIN=cc.example.com       # 主站点域名
CODE_SERVER_BASE_DOMAIN=code.example.com  # code-server 子域名

# === 端口（一般不需要修改） ===
APP_PORT=51080               # 主应用端口
TRAEFIK_HTTP_PORT=51081      # Traefik HTTP 端口
TRAEFIK_DASHBOARD_PORT=51082 # Traefik Dashboard 端口

# === 可选 ===
GITHUB_TOKEN=xxx            # GitHub Token
ANTHROPIC_API_KEY=xxx       # Claude API Key
```

### Nginx 配置

运行 `./generate-nginx.sh` 会根据 `.env` 自动生成 `nginx-site.conf`：

- **主站点** - 代理到 `127.0.0.1:51080`
- **Code-Server 子域名** - 代理到 `127.0.0.1:51081` (Traefik)

## 常用命令

```bash
# 服务管理
docker compose up -d            # 启动
docker compose down             # 停止
docker compose restart          # 重启
docker compose logs -f          # 查看日志
docker compose logs -f backend  # 仅后端日志

# 重新部署
docker compose up -d --build    # 重新构建
./start.sh --skip-base          # 跳过基础镜像构建
./start.sh --clean              # 完全重建

# 基础镜像
./build-base.sh                 # 构建基础镜像
./build-base.sh --clean         # 清理后重建
docker images cc-base           # 查看基础镜像

# Nginx
./generate-nginx.sh             # 生成 nginx 配置
```

## 数据备份

```bash
# 备份数据卷
docker run --rm -v cc-platform-data:/data -v $(pwd):/backup \
  alpine tar czf /backup/backup-$(date +%Y%m%d).tar.gz -C /data .

# 恢复
docker run --rm -v cc-platform-data:/data -v $(pwd):/backup \
  alpine tar xzf /backup/backup-xxx.tar.gz -C /data
```

## 故障排除

### 服务无法启动

```bash
docker compose logs backend     # 查看后端日志
docker compose logs frontend    # 查看前端日志
```

### 基础镜像构建失败

```bash
./build-base.sh --clean         # 清理后重建
```

### Code-Server 子域名无法访问

1. 确认 `AUTO_START_TRAEFIK=true`
2. 确认 DNS 配置正确
3. 检查 Traefik 是否运行：`docker ps | grep traefik`
4. 检查 nginx 配置中的端口是否正确

### 端口被占用

```bash
netstat -tlnp | grep 51080
# 修改 .env 中的 APP_PORT
```

## 镜像大小

| 镜像 | 大小 |
|------|------|
| cc-frontend (nginx:alpine) | ~50MB |
| cc-backend (alpine:3.19) | ~30MB |
| cc-base:latest | ~500MB |
| cc-base:with-code-server | ~700MB |
