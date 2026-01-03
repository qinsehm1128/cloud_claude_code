# Claude Code Container Platform

一个基于 Web 的 Docker 容器管理平台，用于运行和管理 Claude Code 开发环境。

## 功能特性

- 🔐 **用户认证** - JWT 认证，支持环境变量配置管理员凭据
- 🐙 **GitHub 集成** - 配置 GitHub Token，浏览和克隆仓库到容器内
- 🤖 **Claude Code 初始化** - 自动使用 Claude Code 初始化项目环境（可选）
- 🐳 **容器管理** - 创建、启动、停止、删除 Docker 容器
- 💻 **Web 终端** - 通过 WebSocket 实时交互容器终端，支持会话持久化
- 📁 **文件管理** - 浏览、上传、下载容器内文件，支持拖拽文件路径到终端
- 🌐 **服务代理** - 通过 Traefik 反向代理暴露容器内服务，支持域名和端口访问
- ⚙️ **资源配置** - 自定义容器 CPU 和内存限制
- 🔒 **安全隔离** - 容器安全配置，防止容器逃逸
- 🎨 **现代 UI** - 基于 shadcn/ui 的 Vercel 风格深色主题

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
- shadcn/ui + Tailwind CSS
- xterm.js

### 代理
- Traefik v3 (可选，用于服务代理)

## 快速开始

### 前置要求

- Docker（用于运行开发容器）
- Node.js 20+
- Go 1.21+

### 1. 构建 Claude Code 基础镜像

首先需要构建用于开发容器的基础镜像：

```bash
cd docker
chmod +x build-base.sh
./build-base.sh
```

这会创建一个包含 Node.js 20、Git 和 Claude Code CLI 的基础镜像 `cc-base:latest`。

### 2. 配置环境变量

在项目根目录创建 `.env` 文件：

```bash
cp .env.example .env
```

编辑 `.env` 文件配置管理员凭据和其他设置：

```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-secure-password
JWT_SECRET=your-jwt-secret
ENCRYPTION_KEY=your-32-char-encryption-key
```

### 3. 启动 Traefik（可选，用于服务代理）

如果需要通过域名或端口访问容器内运行的服务：

```bash
cd docker/traefik
docker-compose up -d
```

详细配置请参考 [docker/traefik/README.md](docker/traefik/README.md)

### 4. 启动开发服务

**方式一：使用启动脚本**

Linux/macOS:
```bash
chmod +x start-dev.sh
./start-dev.sh
```

Windows:
```cmd
start-dev.bat
```

**方式二：手动启动**

启动后端：
```bash
cd backend
go mod download
go run ./cmd/server
```

启动前端（新终端）：
```bash
cd frontend
npm install
npm run dev
```

### 5. 访问应用

- 前端: http://localhost:5173
- 后端 API: http://localhost:8080
- Traefik Dashboard: http://localhost:8081/dashboard/ (如已启动)

首次启动时，如果未配置 `ADMIN_PASSWORD`，系统会自动生成密码并显示在后端日志中。

## 使用流程

1. **登录** - 使用管理员凭据登录系统
2. **配置 GitHub Token** - 在 Settings 页面配置 GitHub Personal Access Token
3. **配置环境变量** - 在 Settings 页面配置 Claude Code 所需的环境变量（如 API Key）
4. **创建容器** - 在 Dashboard 选择 GitHub 仓库创建新容器
   - 可选择是否使用 Claude Code 自动初始化项目
   - 可配置 CPU/内存资源限制
   - 可配置 Traefik 代理暴露容器服务
5. **使用终端** - 容器就绪后，通过 Web 终端进行开发
6. **文件管理** - 使用文件浏览器管理容器内文件，支持拖拽路径到终端
7. **访问服务** - 通过配置的域名或端口访问容器内运行的服务

## 服务代理配置

平台支持通过 Traefik 反向代理暴露容器内服务，提供两种访问方式：

### 方式一：域名访问
```
myapp.containers.yourdomain.com → Nginx:80 → Traefik:8080 → 容器服务
```

需要配置：
1. DNS 泛域名解析 `*.containers.yourdomain.com`
2. Nginx 转发到 Traefik:8080（参考 `docker/traefik/nginx-example.conf`）

### 方式二：IP:端口直接访问
```
http://your-server-ip:9001 → Traefik:9001 → 容器服务
```

可用端口范围：9001-9010

### 创建容器时配置

1. 勾选 "Enable Traefik Proxy"
2. 填写容器服务端口（如 3000）
3. 可选：填写完整域名或选择直接端口

## 环境变量

| 变量名 | 描述 | 默认值 |
|--------|------|--------|
| `ENVIRONMENT` | 运行环境 (development/production) | development |
| `DATABASE_PATH` | SQLite 数据库路径 | ./data/cc-platform.db |
| `DATA_DIR` | 数据目录 | ./data |
| `JWT_SECRET` | JWT 签名密钥 | 自动生成 |
| `ENCRYPTION_KEY` | 加密密钥（32字符） | 自动生成 |
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
- `POST /api/containers` - 创建容器（支持资源配置和代理配置）
- `GET /api/containers/:id` - 获取容器详情
- `GET /api/containers/:id/status` - 获取容器状态
- `GET /api/containers/:id/logs` - 获取容器初始化日志
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
- 设置 CPU 和内存资源限制（可自定义）
- 禁止访问 Docker socket
- 路径遍历防护

## 项目结构

```
.
├── backend/                 # Go 后端
│   ├── cmd/server/         # 入口点
│   ├── internal/           # 内部包
│   │   ├── config/         # 配置
│   │   ├── database/       # 数据库
│   │   ├── docker/         # Docker 客户端
│   │   ├── handlers/       # HTTP 处理器
│   │   ├── middleware/     # 中间件
│   │   ├── models/         # 数据模型
│   │   ├── services/       # 业务逻辑
│   │   └── terminal/       # 终端管理
│   └── pkg/                # 公共包
├── frontend/               # React 前端
│   ├── src/
│   │   ├── components/     # UI 组件
│   │   ├── pages/          # 页面
│   │   ├── services/       # API 服务
│   │   └── hooks/          # React Hooks
│   └── ...
├── docker/                 # Docker 相关配置
│   ├── Dockerfile.base     # Claude Code 基础镜像
│   ├── build-base.sh       # 基础镜像构建脚本
│   └── traefik/            # Traefik 代理配置
│       ├── docker-compose.yml
│       ├── traefik.yml
│       ├── nginx-example.conf
│       └── README.md
├── .env.example            # 环境变量示例
├── start-dev.sh            # Linux/macOS 启动脚本
└── start-dev.bat           # Windows 启动脚本
```

## 许可证

MIT License
