# Claude Code Container Platform

一个基于 Web 的 Docker 容器管理平台，用于运行和管理 Claude Code 开发环境。

## 功能特性

- 🔐 **用户认证** - JWT 认证，支持环境变量配置管理员凭据
- 🐙 **GitHub 集成** - 配置 GitHub Token，浏览和克隆仓库
- 🤖 **Claude Code 配置** - 配置 API Key、自定义 URL、环境变量和启动命令
- 🐳 **容器管理** - 创建、启动、停止、删除 Docker 容器
- 💻 **Web 终端** - 通过 WebSocket 实时交互容器终端
- 📁 **文件管理** - 浏览、上传、下载容器内文件
- 🔒 **安全隔离** - 容器安全配置，防止容器逃逸

## 技术栈

### 后端
- Go 1.21+
- Gin Web Framework
- GORM + SQLite
- Docker SDK
- gorilla/websocket

### 前端
- React 18 + TypeScript
- Vite
- Ant Design
- xterm.js

## 快速开始

### 前置要求

- Docker 和 Docker Compose
- Node.js 20+ (开发环境)
- Go 1.21+ (开发环境)

### 使用 Docker Compose 部署

1. 克隆仓库：
```bash
git clone <repository-url>
cd cc-platform
```

2. 构建基础镜像：
```bash
cd docker
./build-base.sh
cd ..
```

3. 启动服务：
```bash
docker-compose up -d
```

4. 访问应用：
- 前端: http://localhost:3000
- 后端 API: http://localhost:8080

5. 查看管理员凭据：
```bash
docker-compose logs backend | grep "Admin credentials"
```

### 开发环境

#### 后端

```bash
cd backend
go mod download
go run ./cmd/server
```

#### 前端

```bash
cd frontend
npm install
npm run dev
```

## 环境变量

| 变量名 | 描述 | 默认值 |
|--------|------|--------|
| `ENVIRONMENT` | 运行环境 (development/production) | development |
| `DATABASE_PATH` | SQLite 数据库路径 | ./data/cc-platform.db |
| `DATA_DIR` | 数据目录 | ./data |
| `JWT_SECRET` | JWT 签名密钥 | 自动生成 |
| `ENCRYPTION_KEY` | 加密密钥 | 自动生成 |
| `ADMIN_USERNAME` | 管理员用户名 | admin |
| `ADMIN_PASSWORD` | 管理员密码 | 自动生成 |
| `PORT` | 后端服务端口 | 8080 |

## API 端点

### 认证
- `POST /api/auth/login` - 用户登录
- `POST /api/auth/logout` - 用户登出
- `GET /api/auth/verify` - 验证 Token

### 设置
- `GET /api/settings/github` - 获取 GitHub 配置状态
- `POST /api/settings/github` - 保存 GitHub Token
- `GET /api/settings/claude` - 获取 Claude 配置
- `POST /api/settings/claude` - 保存 Claude 配置

### 仓库
- `GET /api/repos/remote` - 列出 GitHub 仓库
- `POST /api/repos/clone` - 克隆仓库
- `GET /api/repos/local` - 列出本地仓库
- `DELETE /api/repos/:id` - 删除仓库

### 容器
- `GET /api/containers` - 列出容器
- `POST /api/containers` - 创建容器
- `GET /api/containers/:id` - 获取容器详情
- `POST /api/containers/:id/start` - 启动容器
- `POST /api/containers/:id/stop` - 停止容器
- `DELETE /api/containers/:id` - 删除容器

### 终端
- `GET /api/ws/terminal/:id` - WebSocket 终端连接

### 文件
- `GET /api/files/:id/list` - 列出目录
- `GET /api/files/:id/download` - 下载文件
- `POST /api/files/:id/upload` - 上传文件
- `DELETE /api/files/:id` - 删除文件
- `POST /api/files/:id/mkdir` - 创建目录

## 安全说明

- 容器以非 root 用户运行
- 删除所有不必要的 Linux capabilities
- 应用 seccomp 安全配置
- 设置 CPU 和内存资源限制
- 禁止访问 Docker socket
- 路径遍历防护

## 许可证

MIT License
