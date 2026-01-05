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

### 核心功能

| 功能 | 说明 |
|------|------|
| 🔐 **用户认证** | 基于 JWT 的认证系统，支持配置管理员凭据和速率限制 |
| 🐙 **GitHub 集成** | 浏览并克隆仓库到容器内 |
| 🤖 **Claude Code 初始化** | 自动使用 Claude Code CLI 初始化项目（可选） |
| 🐳 **容器管理** | 创建、启动、停止、删除 Docker 容器 |
| 💻 **Web 终端** | 通过 WebSocket 实时交互，支持会话持久化和历史记录 |
| 📁 **文件管理** | 浏览、上传、下载文件，支持拖拽操作 |
| 🌐 **服务代理** | 通过 Traefik 反向代理暴露容器内服务 |
| 💻 **Code-Server** | 通过子域名路由在浏览器中访问 VS Code |
| ⚙️ **资源控制** | 自定义容器 CPU 和内存限制 |
| 🔒 **安全隔离** | 容器隔离、能力删除、seccomp 配置 |

### 高级功能

| 功能 | 说明 |
|------|------|
| 🤖 **PTY 监控** | 实时终端监控，支持静默检测（5-300秒可配置阈值） |
| ⚡ **自动化策略** | 4 种自动化模式：Webhook、命令注入、任务队列、AI 智能 |
| 📋 **任务队列系统** | 管理任务队列，支持拖拽排序和自动执行 |
| 📊 **自动化日志** | 全面的日志记录，支持筛选、导出和统计 |
| 🔌 **动态端口管理** | 为运行中的容器动态添加/删除端口映射 |
| 🎯 **AI 集成** | 基于 LLM 的自动化决策，支持 OpenAI 兼容 API |
| 📡 **Docker 事件监听** | 基于容器生命周期事件的自动清理和监控 |
| 🔄 **会话管理** | 终端会话持久化，支持压缩存储和重连 |
| 🏭 **孤立容器管理** | 列出和管理数据库外的 Docker 容器 |
| 🔐 **灵活认证** | 多种认证方式：header、cookie、query 参数 |

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

## 🤖 自动化与监控

本平台内置强大的 PTY（伪终端）监控系统，可自动检测终端静默并触发相应动作。

### 监控功能

- **静默检测**：可配置 5 到 300 秒的阈值
- **上下文缓冲**：捕获最近的终端输出（可配置大小）
- **Claude Code 检测**：自动检测终端中的 Claude Code CLI
- **多种策略**：4 种不同的自动化策略可选

### 自动化策略

#### 1. Webhook 策略
在终端静默时向配置的 webhook URL 发送 HTTP POST 请求。

**配置项：**
- Webhook URL
- 自定义 headers（JSON 格式）
- 自动重试机制，指数退避（3 次尝试）

**载荷示例：**
```json
{
  "container_id": 123,
  "session_id": "abc123",
  "silence_duration": 10,
  "last_output": "最近的终端输出..."
}
```

#### 2. 命令注入策略
在检测到终端静默时自动注入命令。

**配置项：**
- 命令模板，支持占位符：
  - `{container_id}` - 容器 ID
  - `{session_id}` - 终端会话 ID
  - `{timestamp}` - 当前时间戳
  - `{silence_duration}` - 静默持续时间
  - `{docker_id}` - Docker 容器 ID

**示例：**
```
echo "检测到静默 {silence_duration}秒，时间 {timestamp}"
```

#### 3. 任务队列策略
维护任务队列，在终端静默时自动执行队列中的任务。

**功能特性：**
- 拖拽排序任务
- 任务状态跟踪（待处理、进行中、已完成、已跳过、失败）
- 清除已完成任务
- 队列空通知

**任务管理：**
- 添加/更新/删除任务
- 自定义优先级排序
- 查看任务数量（总数和待处理）
- 清除全部或仅清除已完成任务

#### 4. AI 策略（LLM 驱动）
使用外部 LLM（OpenAI 兼容 API）分析终端输出并决定执行动作。

**配置项：**
- AI API 端点
- API 密钥
- 模型名称
- 系统提示词
- 温度参数（0.0-2.0）
- 超时时间
- AI 不可用时的备用动作

**AI 决策类型：**
- `inject`：注入命令
- `skip`：跳过此次静默事件
- `notify`：仅发送通知
- `complete`：标记任务完成

**响应示例：**
```json
{
  "action": "inject",
  "command": "npm test",
  "reason": "代码修改后需要运行测试"
}
```

### 自动化日志

所有自动化动作都会被详细记录：

- 策略类型
- 执行动作
- 执行的命令
- 上下文片段
- AI 响应（AI 策略）
- 执行结果
- 错误信息（如有）
- 时间戳

**日志功能：**
- 按容器、策略、结果、日期范围筛选
- 分页支持
- 导出为 JSON（最多 10,000 条记录）
- 统计仪表板
- 可配置的保留期限

### 会话管理

- **自动清理**：30 分钟空闲超时的会话
- **Docker 事件监听**：容器停止/销毁时自动清理
- **持久化历史**：终端输出压缩存储
- **多会话支持**：每个容器支持多个终端

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
| GET | `/api/containers/:id/logs` | 获取容器日志 |
| GET | `/api/docker/containers` | 列出所有 Docker 容器 |
| POST | `/api/docker/containers/:dockerId/stop` | 停止 Docker 容器 |
| DELETE | `/api/docker/containers/:dockerId` | 删除 Docker 容器 |

</details>

<details>
<summary>🔌 <b>端口接口</b></summary>

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/ports/:id` | 列出容器端口 |
| POST | `/api/ports/:id` | 添加端口映射 |
| DELETE | `/api/ports/:id/:portId` | 删除端口映射 |
| GET | `/api/ports/all` | 列出所有端口 |

</details>

<details>
<summary>💻 <b>终端和文件接口</b></summary>

| 方法 | 端点 | 说明 |
|------|------|------|
| WS | `/api/ws/terminal/:id` | WebSocket 终端 |
| GET | `/api/terminal/:id/sessions` | 列出终端会话 |
| GET | `/api/files/:id/list` | 列出目录 |
| GET | `/api/files/:id/download` | 下载文件 |
| POST | `/api/files/:id/upload` | 上传文件 |
| DELETE | `/api/files/:id/delete` | 删除文件/目录 |
| POST | `/api/files/:id/mkdir` | 创建目录 |

</details>

<details>
<summary>🤖 <b>监控与自动化接口</b></summary>

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/monitoring/:id/status` | 获取监控状态 |
| POST | `/api/monitoring/:id/config` | 更新监控配置 |
| GET | `/api/monitoring/:id/config` | 获取监控配置 |
| GET | `/api/monitoring/:id/context` | 获取上下文缓冲 |
| GET | `/api/monitoring/strategies` | 列出可用策略 |

</details>

<details>
<summary>📋 <b>任务队列接口</b></summary>

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/tasks/:id` | 列出容器任务 |
| POST | `/api/tasks/:id` | 添加新任务 |
| PUT | `/api/tasks/:id/:taskId` | 更新任务 |
| DELETE | `/api/tasks/:id/:taskId` | 删除任务 |
| POST | `/api/tasks/:id/reorder` | 重排任务 |
| GET | `/api/tasks/:id/count` | 获取任务数量 |
| DELETE | `/api/tasks/:id/clear` | 清除所有任务 |
| DELETE | `/api/tasks/:id/clear-completed` | 清除已完成任务 |

</details>

<details>
<summary>📊 <b>自动化日志接口</b></summary>

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/automation-logs` | 列出自动化日志 |
| GET | `/api/automation-logs/stats` | 获取日志统计 |
| POST | `/api/automation-logs/export` | 导出日志为 JSON |
| DELETE | `/api/automation-logs/cleanup` | 清理旧日志 |

</details>

<details>
<summary>🔀 <b>服务代理接口</b></summary>

| 方法 | 端点 | 说明 |
|------|------|------|
| ANY | `/api/proxy/:id/*` | 代理请求到容器 |
| GET | `/api/proxy/:id/health` | 检查代理健康状态 |

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
│   │   ├── terminal/        # 终端管理
│   │   ├── monitoring/      # PTY 监控与自动化
│   │   ├── middleware/      # 认证、CORS、速率限制
│   │   ├── docker/          # Docker 客户端与安全
│   │   ├── database/        # 数据库模型
│   │   └── models/          # 数据模型
│   └── pkg/                 # 公共包
│       ├── crypto/          # 加密工具
│       ├── pathutil/        # 路径验证
│       └── httputil/        # HTTP 工具
│
├── 🎨 frontend/             # React 前端
│   └── src/
│       ├── components/      # UI 组件
│       │   ├── automation/  # 自动化 UI 组件
│       │   ├── terminal/    # 终端组件
│       │   └── ui/          # shadcn/ui 组件
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
| 🔒 加密存储 | 敏感数据使用 AES-256-GCM 加密 |
| ⏱️ 速率限制 | 登录尝试限制（5次/分钟，突发 10 次） |
| 🍪 安全 Cookie | HTTP-only cookie 管理会话 |
| 🔑 灵活认证 | 支持多种认证方式 |

---

## 🙏 鸣谢

本项目基于以下优秀的开源项目构建：

### 后端
- [Go](https://github.com/golang/go) - Go 编程语言
- [Gin](https://github.com/gin-gonic/gin) - HTTP Web 框架
- [GORM](https://github.com/go-gorm/gorm) - Go 语言 ORM 库
- [gorilla/websocket](https://github.com/gorilla/websocket) - WebSocket 实现
- [Docker Engine API](https://github.com/moby/moby) - 容器管理

### 前端
- [React](https://github.com/facebook/react) - UI 库
- [Vite](https://github.com/vitejs/vite) - 下一代前端构建工具
- [Tailwind CSS](https://github.com/tailwindlabs/tailwindcss) - 原子化 CSS 框架
- [shadcn/ui](https://github.com/shadcn-ui/ui) - 可复用 UI 组件
- [xterm.js](https://github.com/xtermjs/xterm.js) - 终端模拟器

### 基础设施
- [Traefik](https://github.com/traefik/traefik) - 云原生反向代理
- [code-server](https://github.com/coder/code-server) - 浏览器中的 VS Code
- [SQLite](https://sqlite.org/) - 嵌入式数据库引擎

---

## 📄 许可证

MIT License

---

<p align="center">
  用 ❤️ 为 Claude Code 开发者打造
</p>
