# 🚀 Claude Code 容器管理平台

<p align="center">
  <b>基于 Web 的 Docker 容器管理平台，用于运行和管理 Claude Code 开发环境</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Go-1.21+-00ADD8?style=flat-square&logo=go" alt="Go">
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react" alt="React">
  <img src="https://img.shields.io/badge/Docker-Required-2496ED?style=flat-square&logo=docker" alt="Docker">
  <img src="https://img.shields.io/badge/Traefik-v3-24A1C1?style=flat-square&logo=traefikproxy" alt="Traefik">
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License">
</p>

<p align="center">
  <a href="README.md">English</a> | <a href="README.zh-CN.md">简体中文</a>
</p>

---

## ✨ 功能特性

| 功能 | 说明 |
|------|------|
| 🔐 **用户认证** | 基于 JWT 的认证系统，支持配置管理员凭据 |
| 🐙 **GitHub 集成** | 浏览并克隆仓库到容器内 |
| 🤖 **Claude Code 初始化** | 自动使用 Claude Code CLI 初始化项目（可选） |
| 🐳 **容器管理** | 创建、启动、停止、删除 Docker 容器 |
| 💻 **Web 终端** | 通过 WebSocket 实时交互，支持会话持久化 |
| 📁 **文件管理** | 浏览、上传、下载文件，支持拖拽操作 |
| 🌐 **服务代理** | 通过 Traefik 反向代理暴露容器内服务 |
| 💻 **Code-Server** | 通过子域名路由在浏览器中访问 VS Code |
| ⚙️ **资源控制** | 自定义容器 CPU 和内存限制 |
| 🔒 **安全隔离** | 容器隔离、能力删除、seccomp 配置 |

---

## 🏗️ 系统架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                         🌐 浏览器                                    │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     📡 Nginx (反向代理)                              │
│  ┌─────────────────────┐    ┌─────────────────────────────────────┐ │
│  │   主站点 (:80)       │    │  *.code.example.com (子域名)        │ │
│  │   example.com       │    │  → Traefik → 容器:8080              │ │
│  └──────────┬──────────┘    └──────────────┬──────────────────────┘ │
└─────────────┼──────────────────────────────┼────────────────────────┘
              │                              │
              ▼                              ▼
┌─────────────────────────┐    ┌─────────────────────────────────────┐
│  🔧 后端 (Go:8080)      │    │       🔀 Traefik (38080)            │
│  ┌───────────────────┐  │    │  根据容器名自动路由                  │
│  │ REST API          │  │    └──────────────┬──────────────────────┘
│  │ WebSocket 终端    │  │                   │
│  │ 容器管理          │  │                   ▼
│  └───────────────────┘  │    ┌─────────────────────────────────────┐
└─────────────┬───────────┘    │       🐳 Docker 容器                │
              │                │  ┌─────────┐ ┌─────────┐ ┌─────────┐│
              └───────────────▶│  │ dev-1   │ │ dev-2   │ │ dev-N   ││
                               │  │ :8080   │ │ :8080   │ │ :8080   ││
                               │  └─────────┘ └─────────┘ └─────────┘│
                               └─────────────────────────────────────┘
```

---

## 🛠️ 技术栈

<table>
<tr>
<td width="50%">

### 🔧 后端
- **Go 1.21+** - 核心语言
- **Gin** - Web 框架
- **GORM + SQLite** - 数据库
- **Docker SDK** - 容器管理
- **gorilla/websocket** - 终端 WebSocket

</td>
<td width="50%">

### 🎨 前端
- **React 18 + TypeScript**
- **Vite** - 构建工具
- **shadcn/ui + Tailwind CSS** - UI 组件
- **xterm.js** - 终端模拟器

</td>
</tr>
</table>

---

## 🚀 快速开始

### 📋 前置要求

- 🐳 Docker（用于运行开发容器）
- 📦 Node.js 20+
- 🔧 Go 1.21+

### 1️⃣ 构建基础镜像

```bash
cd docker
./build-base.sh
```

> 这会创建包含 Node.js 20、Git 和 Claude Code CLI 的 `cc-base:latest` 镜像。

### 2️⃣ 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件：
```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-secure-password
```

### 3️⃣ 启动开发服务

**🐧 Linux/macOS:**
```bash
./start-dev.sh
```

**🪟 Windows:**
```cmd
start-dev.bat
```

### 4️⃣ 访问应用

| 服务 | 地址 |
|------|------|
| 🎨 前端 | http://localhost:5173 |
| 🔧 后端 API | http://localhost:8080 |
| 📊 Traefik 仪表板 | http://localhost:8081/dashboard/ |

> 💡 如果未设置 `ADMIN_PASSWORD`，系统会自动生成密码并显示在后端日志中。

---

## 📦 部署

> 📖 **生产环境部署请参考 [部署指南](deploy/README.zh-CN.md)**

### ⚡ 快速部署

```bash
# 🚀 一键完整部署
./deploy.sh --full-deploy

# 📁 自定义目录
./deploy.sh --full-deploy \
    --frontend-dir /var/www/mysite.com \
    --backend-dir /opt/myapp
```

### 📋 部署命令

| 命令 | 说明 |
|------|------|
| `./deploy.sh --build` | 🔨 构建前端和后端 |
| `./deploy.sh --install` | 📥 安装到部署目录 |
| `./deploy.sh --setup-service` | ⚙️ 创建 systemd 服务 |
| `./deploy.sh --full-deploy` | 🚀 以上全部 + 启动服务 |

> 📖 **[查看完整部署指南 →](deploy/README.zh-CN.md)**

---

## 🌐 服务代理

### 🔗 方式一：子域名访问（推荐）

通过 `{容器名}.code.example.com` 访问容器服务

```
👤 用户 → 📡 Nginx → 🔀 Traefik → 🐳 容器:8080
```

**配置步骤：**
1. 🌍 **DNS**：添加泛域名解析 `*.code.example.com → 服务器IP`
2. 📝 **Nginx**：配置子域名路由（参考 [nginx.conf](deploy/nginx.conf)）
3. ⚙️ **环境变量**：设置 `CODE_SERVER_BASE_DOMAIN=code.example.com`

### 🔌 方式二：端口直接访问

通过 `http://服务器IP:30001` 直接访问

📌 可用端口范围：`30001-30020`

---

## ⚙️ 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 后端服务端口 | `8080` |
| `ADMIN_USERNAME` | 管理员用户名 | `admin` |
| `ADMIN_PASSWORD` | 管理员密码 | 自动生成 |
| `JWT_SECRET` | JWT 签名密钥 | 自动生成 |
| `DATABASE_PATH` | SQLite 数据库路径 | `./data/cc-platform.db` |
| `AUTO_START_TRAEFIK` | 自动启动 Traefik | `false` |
| `CODE_SERVER_BASE_DOMAIN` | Code-server 子域名 | (空) |
| `TRAEFIK_HTTP_PORT` | Traefik HTTP 端口 | 自动 (38000+) |

---

## 📚 API 参考

<details>
<summary>🔐 <b>认证接口</b></summary>

| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | 用户登录 |
| POST | `/api/auth/logout` | 用户登出 |
| GET | `/api/auth/verify` | 验证 Token |

</details>

<details>
<summary>⚙️ <b>设置接口</b></summary>

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/settings/github` | 获取 GitHub 配置状态 |
| POST | `/api/settings/github` | 保存 GitHub Token |
| GET | `/api/settings/claude` | 获取 Claude 配置 |
| POST | `/api/settings/claude` | 保存 Claude 配置 |

</details>

<details>
<summary>📂 <b>仓库接口</b></summary>

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/repos/remote` | 列出 GitHub 仓库 |
| POST | `/api/repos/clone` | 克隆仓库 |
| GET | `/api/repos/local` | 列出本地仓库 |
| DELETE | `/api/repos/:id` | 删除仓库 |

</details>

<details>
<summary>🐳 <b>容器接口</b></summary>

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/containers` | 列出容器 |
| POST | `/api/containers` | 创建容器 |
| GET | `/api/containers/:id` | 获取容器详情 |
| POST | `/api/containers/:id/start` | 启动容器 |
| POST | `/api/containers/:id/stop` | 停止容器 |
| DELETE | `/api/containers/:id` | 删除容器 |

</details>

<details>
<summary>💻 <b>终端和文件接口</b></summary>

| 方法 | 端点 | 说明 |
|------|------|------|
| WS | `/api/ws/terminal/:id` | WebSocket 终端 |
| GET | `/api/files/:id/list` | 列出目录 |
| GET | `/api/files/:id/download` | 下载文件 |
| POST | `/api/files/:id/upload` | 上传文件 |

</details>

---

## 📁 项目结构

```
.
├── 🔧 backend/              # Go 后端
│   ├── cmd/server/          # 入口点
│   ├── internal/            # 内部包
│   │   ├── config/          # 配置
│   │   ├── handlers/        # HTTP 处理器
│   │   ├── services/        # 业务逻辑
│   │   └── terminal/        # 终端管理
│   └── pkg/                 # 公共包
│
├── 🎨 frontend/             # React 前端
│   └── src/
│       ├── components/      # UI 组件
│       ├── pages/           # 页面
│       └── services/        # API 服务
│
├── 🐳 docker/               # Docker 配置
│   ├── Dockerfile.base      # 基础镜像
│   └── traefik/             # Traefik 代理配置
│
├── 📦 deploy/               # 部署配置
│   ├── README.md            # 部署指南 (英文)
│   ├── README.zh-CN.md      # 部署指南 (中文)
│   └── nginx.conf           # Nginx 配置
│
├── .env.example             # 环境变量模板
├── start-dev.sh             # 开发启动脚本 (Linux/Mac)
├── start-dev.bat            # 开发启动脚本 (Windows)
└── deploy.sh                # 部署脚本
```

---

## 🔒 安全特性

| 特性 | 说明 |
|------|------|
| 👤 非 root 运行 | 容器以非 root 用户运行 |
| 🔐 能力删除 | 删除所有不必要的 Linux 能力 |
| 🛡️ Seccomp | 应用安全配置文件 |
| 📊 资源限制 | 强制执行 CPU 和内存限制 |
| 🚫 Docker Socket | 容器内禁止访问 |
| 🛤️ 路径保护 | 启用路径遍历防护 |

---

## 📄 许可证

MIT License

---

<p align="center">
  用 ❤️ 为 Claude Code 开发者打造
</p>
