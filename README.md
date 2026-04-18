# 🚀 Claude Code Container Platform

<p align="center">
  <b>Web-based Docker container management platform for Claude Code development environments</b>
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

## ✨ Features

### Core Features

| Feature | Description |
|---------|-------------|
| 🔐 **Authentication** | JWT-based auth with configurable admin credentials and rate limiting |
| 🐙 **GitHub Integration** | Browse and clone repositories directly into containers |
| 🤖 **Claude Code Init** | Auto-initialize projects with Claude Code CLI (optional) |
| 🐳 **Container Management** | Create, start, stop, delete Docker containers with ease |
| 💻 **Web Terminal** | Real-time terminal via WebSocket with session persistence and history |
| 📁 **File Manager** | Browse, upload, download files with drag-and-drop support |
| 🌐 **Service Proxy** | Expose container services via Traefik reverse proxy |
| 💻 **Code-Server** | Access VS Code in browser via subdomain routing |
| ⚙️ **Resource Control** | Custom CPU and memory limits per container |
| 🔒 **Security** | Container isolation, capability dropping, seccomp profiles |

### 🆕 Headless Mode (New!)

| Feature | Description |
|---------|-------------|
| 💬 **Headless Chat** | Standalone chat interface for Claude CLI interactions |
| 🔄 **Stream JSON Output** | Real-time streaming of Claude responses with structured parsing |
| 📝 **Conversation History** | Persistent conversation storage with turn-by-turn tracking |
| 🎯 **Model Selection** | Choose from available Claude models or use default |
| 💰 **Token & Cost Tracking** | Track input/output tokens and API costs per turn |
| 🔌 **WebSocket Real-time** | Live streaming of Claude responses via WebSocket |
| 📊 **Turn Cards** | Visual display of user prompts and assistant responses |
| 🔗 **Session Resume** | Resume existing Claude sessions with `--resume` flag |

### 🆕 Claude Config Management (New!)

| Feature | Description |
|---------|-------------|
| 📝 **Config Templates** | Create and manage Claude configuration templates (CLAUDE.md, Skills, MCP, Commands) |
| 📦 **Multi-file Skills** | Upload zip archives containing complete skill folder structure |
| 💉 **Auto Injection** | Automatically inject configs when creating containers |
| 🔧 **Manual Injection** | Inject configs into running containers via Terminal page UI |
| 👀 **Config Preview** | Preview configuration content before injection |
| 🌐 **Dynamic Server Address** | Configure and switch between multiple server addresses |

### Advanced Features

| Feature | Description |
|---------|-------------|
| 🤖 **PTY Monitoring** | Real-time terminal monitoring with silence detection (5-300s threshold) |
| ⚡ **Automation Strategies** | 4 automation modes: Webhook, Command Injection, Task Queue, AI-powered |
| 📋 **Task Queue System** | Manage task queues with drag-and-drop reordering and auto-execution |
| 📊 **Automation Logs** | Comprehensive logging with filtering, export, and statistics |
| 🔌 **Dynamic Port Management** | Add/remove port mappings to running containers on-the-fly |
| 🎯 **AI Integration** | LLM-based automation with OpenAI-compatible API support |
| 📡 **Docker Event Listener** | Auto-cleanup and monitoring based on container lifecycle events |
| 🔄 **Session Management** | Terminal session persistence with compression and reconnection |
| 🏭 **Orphaned Container Management** | List and manage Docker containers not tracked in database |
| 🔐 **Flexible Auth** | Multiple auth methods: header, cookie, query parameter |
| ⚙️ **Environment Profiles** | Configurable API URL and Token variable names per profile |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         🌐 Browser                                   │
│  ┌─────────────────────┐    ┌─────────────────────────────────────┐ │
│  │   Main Dashboard    │    │   Headless Chat (/chat)             │ │
│  │   Terminal, Files   │    │   Claude Conversations              │ │
│  └──────────┬──────────┘    └──────────────┬──────────────────────┘ │
└─────────────┼──────────────────────────────┼────────────────────────┘
              │                              │
              ▼                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     📡 Nginx (Reverse Proxy)                         │
│  ┌─────────────────────┐    ┌─────────────────────────────────────┐ │
│  │   Main Site (:80)   │    │  *.code.example.com (Subdomain)     │ │
│  │   example.com       │    │  → Traefik → Container:8080         │ │
│  └──────────┬──────────┘    └──────────────┬──────────────────────┘ │
└─────────────┼──────────────────────────────┼────────────────────────┘
              │                              │
              ▼                              ▼
┌─────────────────────────┐    ┌─────────────────────────────────────┐
│  🔧 Backend (Go:8080)   │    │       🔀 Traefik (38080)            │
│  ┌───────────────────┐  │    │  Auto-routing by container name     │
│  │ REST API          │  │    └──────────────┬──────────────────────┘
│  │ WebSocket Terminal│  │                   │
│  │ Headless Manager  │  │                   ▼
│  │ Container Manager │  │    ┌─────────────────────────────────────┐
│  └───────────────────┘  │    │       🐳 Docker Containers          │
└─────────────┬───────────┘    │  ┌─────────┐ ┌─────────┐ ┌─────────┐│
              │                │  │ dev-1   │ │ dev-2   │ │ dev-N   ││
              └───────────────▶│  │ :8080   │ │ :8080   │ │ :8080   ││
                               │  └─────────┘ └─────────┘ └─────────┘│
                               └─────────────────────────────────────┘
```

---

## 🛠️ Tech Stack

<table>
<tr>
<td width="50%">

### 🔧 Backend
- **Go 1.21+** - Core language
- **Gin** - Web framework
- **GORM + SQLite** - Database
- **Docker SDK** - Container management
- **gorilla/websocket** - Terminal & Headless WebSocket

</td>
<td width="50%">

### 🎨 Frontend
- **React 18 + TypeScript**
- **Vite** - Build tool
- **shadcn/ui + Tailwind CSS** - UI components
- **xterm.js** - Terminal emulator

</td>
</tr>
<tr>
<td width="50%">

### 🐳 Infrastructure
- **Docker** - Container runtime
- **Traefik** - Reverse proxy
- **Nginx** - Web server
- **SQLite** - Database

</td>
</tr>
</table>

---

## 🚀 Quick Start

### 📋 Prerequisites

- 🐳 Docker (for running dev containers)
- 📦 Node.js 20+
- 🔧 Go 1.21+

### 1️⃣ Build Base Image

```bash
cd docker
./build-base.sh
```

> This creates `cc-base:latest` with Node.js 20, Git, and Claude Code CLI.

### 2️⃣ Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:
```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-secure-password
```

### 3️⃣ Start Development Server

**🐧 Linux/macOS:**
```bash
./start-dev.sh
```

**🪟 Windows:**
```cmd
start-dev.bat
```

### 4️⃣ Access Application

| Service | URL |
|---------|-----|
| 🎨 Frontend | http://localhost:5173 |
| 💬 Headless Chat | http://localhost:5173/chat |
| 📝 Claude Config | http://localhost:5173/claude-config |
| 🔧 Backend API | http://localhost:8080 |
| 📊 Traefik Dashboard | http://localhost:8081/dashboard/ |

> 💡 If `ADMIN_PASSWORD` is not set, a random password will be generated and shown in backend logs.

---

## 📝 Claude Config Management

Claude Config Management allows you to create, manage, and inject Claude configurations into containers.

### Configuration Types

| Type | Description | File Location |
|------|-------------|---------------|
| 📄 **CLAUDE.md** | Project-level Claude instruction file | `~/.claude/CLAUDE.md` |
| 🎯 **Skills** | Claude skill definitions | `~/.claude/skills/` |
| 🔌 **MCP** | Model Context Protocol configuration | `~/.claude/mcp.json` |
| ⌨️ **Commands** | Custom command configuration | `~/.claude/commands.json` |

### Features

- **Template Management** - Create, edit, delete configuration templates
- **Multi-file Skills** - Upload zip archives containing complete skill folders (SKILL.md + scripts, resources, etc.)
- **Auto Injection** - Automatically inject selected configs when creating containers
- **Manual Injection** - Inject configs into running containers via Terminal page
- **Config Preview** - Preview configuration content before injection

### How to Use

1. Go to **Claude Config** page
2. Create a new configuration template, select type and fill in content
3. For skill type, you can choose:
   - **Single File Mode** - Edit SKILL.md content directly
   - **Archive Mode** - Upload a zip file containing complete skill folder
4. When creating a container, select configuration templates to inject
5. For running containers, click "Inject Config" button on Terminal page

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/config-templates` | List all config templates |
| POST | `/api/config-templates` | Create config template |
| GET | `/api/config-templates/:id` | Get config template |
| PUT | `/api/config-templates/:id` | Update config template |
| DELETE | `/api/config-templates/:id` | Delete config template |
| POST | `/api/containers/:id/inject-configs` | Inject configs into container |

---

## 💬 Headless Mode

Headless mode provides a chat-like interface for interacting with Claude CLI without the traditional terminal UI.

### Features

- **Standalone Chat Interface** (`/chat`) - Dedicated page for Claude conversations
- **Container Selection** - Switch between multiple running containers
- **Conversation Management** - Create, view, and delete conversations
- **Model Selection** - Choose from available Claude models or use "Default"
- **Real-time Streaming** - Live streaming of Claude responses via WebSocket
- **Turn History** - View complete conversation history with token/cost tracking
- **Session Resume** - Automatically resume existing Claude sessions
- **Markdown Rendering** - Rich markdown display with syntax highlighting
- **Tool Call Display** - Collapsible tool use and result blocks with preview

### How It Works

1. **Select Container** - Choose a running container from the sidebar
2. **Create/Select Conversation** - Start a new conversation or continue an existing one
3. **Choose Model** (Optional) - Select a specific Claude model or use "Default"
4. **Send Prompts** - Type your message and Claude will respond in real-time
5. **View Results** - See structured responses with tool usage, thinking, and text

### API Configuration

To enable model selection, configure API settings in Environment Profiles:

1. Go to **Settings** → **Environment Profiles**
2. Edit or create a profile
3. Set **API URL Variable Name** (e.g., `ANTHROPIC_BASE_URL`)
4. Set **API Token Variable Name** (e.g., `ANTHROPIC_API_KEY`)
5. The system will fetch available models from `{API_URL}/v1/models`

### WebSocket Protocol

The Headless WebSocket supports the following message types:

**Client → Server:**
- `headless_start` - Create new session
- `headless_prompt` - Send prompt (with optional `model` parameter)
- `headless_cancel` - Cancel current execution
- `load_more` - Load more history
- `ping` - Keep-alive

**Server → Client:**
- `session_info` - Session information
- `history` - Conversation history
- `event` - Stream event (assistant response, tool use, etc.)
- `turn_complete` - Turn completed with stats
- `error` - Error message
- `pong` - Keep-alive response

---

## 📦 Deployment

### 🐳 Docker Deployment (Recommended)

The fastest way to deploy with minimal configuration:

```bash
cd deploy-docker
cp .env.example .env
# Edit .env with your settings
./start.sh
```

**Features:**
- Multi-stage build for minimal image sizes (~80MB total)
- Frontend served by nginx:alpine
- Backend as Go binary on alpine:3.19
- docker-compose for service orchestration
- Built-in nginx proxy with WebSocket support

> 📖 **[View Docker Deployment Guide →](deploy-docker/README.md)**

### 🔧 Shell Script Deployment

For more control over the deployment process:

```bash
# Launch interactive deployment wizard
./deploy.sh
```

The interactive wizard guides you through the entire deployment process with:

- ✅ **Environment Check** - Automatic dependency verification
- ⚙️ **Configuration Wizard** - Step-by-step .env setup with validation
- 🎯 **Deployment Modes** - Choose from 4 deployment strategies
- 📊 **Progress Display** - Real-time progress tracking
- ✅ **Automatic Verification** - Post-deployment health checks
- 🔄 **Rollback Support** - Automatic rollback on failure

### 📋 Deployment Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| 🐳 **Docker** | Container-based deployment | Quick setup, isolated environment |
| 🚀 **Quick Deploy** | One-click complete deployment | First-time setup, quick production |
| 💻 **Development** | Build only, no installation | Local development |
| 📦 **Production** | Full deployment with backup | Production updates |
| ⚙️ **Custom** | Step-by-step manual control | Advanced users |

**Estimated Time:** 3-5 minutes

> 📖 **[View Shell Deployment Guide →](deploy-sh/README.md)**

---

## 🌐 Service Proxy

### 🔗 Option 1: Subdomain Access (Recommended)

Access container services via `{container-name}.code.example.com`

```
👤 User → 📡 Nginx → 🔀 Traefik → 🐳 Container:8080
```

**Setup:**
1. 🌍 **DNS**: Add `*.code.example.com → Server IP`
2. 📝 **Nginx**: Configure subdomain routing (see [nginx.conf](deploy/nginx.conf))
3. ⚙️ **Environment**: Set `CODE_SERVER_BASE_DOMAIN=code.example.com`

### 🔌 Option 2: Direct Port Access

Access via `http://server-ip:30001`

📌 Available ports: `30001-30020`

---

## ⚙️ Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Backend server port | `8080` |
| `ADMIN_USERNAME` | Admin username | `admin` |
| `ADMIN_PASSWORD` | Admin password | Auto-generated |
| `JWT_SECRET` | JWT signing key | Auto-generated |
| `DATABASE_PATH` | SQLite database path | `./data/cc-platform.db` |
| `AUTO_START_TRAEFIK` | Auto-start Traefik | `false` |
| `CODE_SERVER_BASE_DOMAIN` | Subdomain for code-server | (empty) |
| `TRAEFIK_HTTP_PORT` | Traefik HTTP port | Auto (38000+) |

---

## 🤖 Automation & Monitoring

This platform includes a powerful PTY (pseudo-terminal) monitoring system that can automatically detect terminal silence and trigger actions.

### Monitoring Features

- **Silence Detection**: Configurable threshold from 5 to 300 seconds
- **Context Buffer**: Captures recent terminal output (configurable size)
- **Claude Code Detection**: Automatically detects Claude Code CLI in terminal sessions
- **Multiple Strategies**: Choose from 4 different automation strategies

### Automation Strategies

#### 1. Webhook Strategy
Sends HTTP POST requests to a configured webhook URL when terminal is silent.

**Configuration:**
- Webhook URL
- Custom headers (JSON format)
- Automatic retry with exponential backoff (3 attempts)

**Payload Example:**
```json
{
  "container_id": 123,
  "session_id": "abc123",
  "silence_duration": 10,
  "last_output": "Recent terminal output..."
}
```

#### 2. Command Injection Strategy
Automatically injects commands into the terminal when silence is detected.

**Configuration:**
- Command template with placeholders:
  - `{container_id}` - Container ID
  - `{session_id}` - Terminal session ID
  - `{timestamp}` - Current timestamp
  - `{silence_duration}` - Duration of silence
  - `{docker_id}` - Docker container ID

**Example:**
```
echo "Silence detected for {silence_duration}s at {timestamp}"
```

#### 3. Task Queue Strategy
Maintains a queue of tasks and automatically executes them when terminal is silent.

**Features:**
- Drag-and-drop task reordering
- Task status tracking (pending, in_progress, completed, skipped, failed)
- Clear completed tasks
- Queue empty notifications

#### 4. AI Strategy (LLM-powered)
Uses an external LLM (OpenAI-compatible API) to analyze terminal output and decide actions.

**Configuration:**
- AI API endpoint
- API key
- Model name
- System prompt
- Temperature (0.0-2.0)
- Timeout
- Fallback action when AI unavailable

**AI Decision Types:**
- `inject`: Inject a command
- `skip`: Skip this silence event
- `notify`: Send notification only
- `complete`: Mark task as complete

### Automation Logs

All automation actions are logged with comprehensive details:

- Strategy type
- Action taken
- Command executed
- Context snippet
- AI response (for AI strategy)
- Result status
- Error messages (if any)
- Timestamp

**Log Features:**
- Filter by container, strategy, result, date range
- Pagination support
- Export to JSON (up to 10,000 records)
- Statistics dashboard
- Configurable retention period

---


### Commands

| Command | Shortcut | Description |
|---------|----------|-------------|
| `PTY: Toggle Monitoring` | `Ctrl+Shift+M` | Enable/disable monitoring |
| `PTY: Open Task Panel` | `Ctrl+Shift+T` | Open task queue panel |
| `PTY: Open Settings` | - | Configure automation settings |
| `PTY: Change Strategy` | - | Switch automation strategy |
| `PTY: Reconnect` | - | Reconnect to server |

### Configuration

```json
{
  "ptyAutomation.serverUrl": "http://localhost:8080",
  "ptyAutomation.autoConnect": true,
  "ptyAutomation.showStatusBar": true,
  "ptyAutomation.defaultStrategy": "webhook",
  "ptyAutomation.silenceThreshold": 30
}
```

## 📚 API Reference

<details>
<summary>🔐 <b>Authentication</b></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | User login |
| POST | `/api/auth/logout` | User logout |
| GET | `/api/auth/verify` | Verify token |

</details>

<details>
<summary>⚙️ <b>Settings</b></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/settings/github` | Get GitHub config status |
| POST | `/api/settings/github` | Save GitHub token |
| GET | `/api/settings/claude` | Get Claude config |
| POST | `/api/settings/claude` | Save Claude config |

</details>

<details>
<summary>📂 <b>Repositories</b></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/repos/remote` | List GitHub repos |
| POST | `/api/repos/clone` | Clone repository |
| GET | `/api/repos/local` | List local repos |
| DELETE | `/api/repos/:id` | Delete repository |

</details>

<details>
<summary>🐳 <b>Containers</b></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/containers` | List containers |
| POST | `/api/containers` | Create container |
| GET | `/api/containers/:id` | Get container details |
| POST | `/api/containers/:id/start` | Start container |
| POST | `/api/containers/:id/stop` | Stop container |
| DELETE | `/api/containers/:id` | Delete container |
| GET | `/api/containers/:id/logs` | Get container logs |
| GET | `/api/containers/:id/api-config` | Get API config (URL & Token) |
| GET | `/api/docker/containers` | List all Docker containers |
| POST | `/api/docker/containers/:dockerId/stop` | Stop Docker container |
| DELETE | `/api/docker/containers/:dockerId` | Delete Docker container |

</details>

<details>
<summary>🔌 <b>Ports</b></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/ports/:id` | List container ports |
| POST | `/api/ports/:id` | Add port mapping |
| DELETE | `/api/ports/:id/:portId` | Remove port mapping |
| GET | `/api/ports/all` | List all ports |

</details>

<details>
<summary>💻 <b>Terminal & Files</b></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| WS | `/api/ws/terminal/:id` | WebSocket terminal |
| GET | `/api/terminal/:id/sessions` | List terminal sessions |
| GET | `/api/files/:id/list` | List directory |
| GET | `/api/files/:id/download` | Download file |
| POST | `/api/files/:id/upload` | Upload file |
| DELETE | `/api/files/:id/delete` | Delete file/directory |
| POST | `/api/files/:id/mkdir` | Create directory |

</details>

<details>
<summary>💬 <b>Headless Mode</b></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| WS | `/api/ws/headless/:containerId` | Headless WebSocket (container mode) |
| WS | `/api/ws/headless/conversation/:conversationId` | Headless WebSocket (conversation mode) |
| GET | `/api/containers/:id/headless/conversations` | List conversations |
| GET | `/api/containers/:id/headless/conversations/:convId` | Get conversation |
| DELETE | `/api/containers/:id/headless/conversations/:convId` | Delete conversation |
| GET | `/api/containers/:id/headless/conversations/:convId/turns` | Get conversation turns |
| GET | `/api/containers/:id/headless/conversations/:convId/status` | Get conversation status |

</details>

<details>
<summary>🤖 <b>Monitoring & Automation</b></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/monitoring/:id/status` | Get monitoring status |
| POST | `/api/monitoring/:id/config` | Update monitoring config |
| GET | `/api/monitoring/:id/config` | Get monitoring config |
| GET | `/api/monitoring/:id/context` | Get context buffer |
| GET | `/api/monitoring/strategies` | List available strategies |

</details>

<details>
<summary>📋 <b>Task Queue</b></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tasks/:id` | List tasks for container |
| POST | `/api/tasks/:id` | Add new task |
| PUT | `/api/tasks/:id/:taskId` | Update task |
| DELETE | `/api/tasks/:id/:taskId` | Delete task |
| POST | `/api/tasks/:id/reorder` | Reorder tasks |
| GET | `/api/tasks/:id/count` | Get task count |
| DELETE | `/api/tasks/:id/clear` | Clear all tasks |
| DELETE | `/api/tasks/:id/clear-completed` | Clear completed tasks |

</details>

<details>
<summary>📊 <b>Automation Logs</b></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/automation-logs` | List automation logs |
| GET | `/api/automation-logs/stats` | Get log statistics |
| POST | `/api/automation-logs/export` | Export logs to JSON |
| DELETE | `/api/automation-logs/cleanup` | Cleanup old logs |

</details>

<details>
<summary>📝 <b>Config Templates</b></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/config-templates` | List all config templates |
| POST | `/api/config-templates` | Create config template |
| GET | `/api/config-templates/:id` | Get config template |
| PUT | `/api/config-templates/:id` | Update config template |
| DELETE | `/api/config-templates/:id` | Delete config template |
| POST | `/api/containers/:id/inject-configs` | Inject configs into container |

</details>

<details>
<summary>⚙️ <b>Config Profiles</b></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/config-profiles` | List all profiles |
| POST | `/api/config-profiles` | Create profile |
| GET | `/api/config-profiles/:id` | Get profile |
| PUT | `/api/config-profiles/:id` | Update profile |
| DELETE | `/api/config-profiles/:id` | Delete profile |
| GET | `/api/config-profiles/:id/env` | Get env profile |
| POST | `/api/config-profiles/:id/env` | Create/update env profile |

</details>

---

## 📁 Project Structure

```
.
├── 🔧 backend/              # Go backend
│   ├── cmd/server/          # Entry point
│   ├── internal/            # Internal packages
│   │   ├── config/          # Configuration
│   │   ├── handlers/        # HTTP handlers
│   │   │   └── config_template.go  # Config template API
│   │   ├── services/        # Business logic
│   │   │   ├── config_template_service.go    # Template management
│   │   │   └── config_injection_service.go   # Config injection
│   │   ├── terminal/        # Terminal management
│   │   ├── headless/        # Headless mode (Claude CLI)
│   │   ├── monitoring/      # PTY monitoring & automation
│   │   ├── mode/            # TUI/Headless mode manager
│   │   ├── middleware/      # Auth, CORS, rate limiting
│   │   ├── docker/          # Docker client & security
│   │   ├── database/        # Database models
│   │   └── models/          # Data models
│   │       └── claude_config_template.go  # Config template model
│   └── pkg/                 # Public packages
│       ├── crypto/          # Encryption utilities
│       ├── pathutil/        # Path validation
│       └── httputil/        # HTTP utilities
│
├── 🎨 frontend/             # React frontend
│   └── src/
│       ├── components/      # UI components
│       │   ├── Automation/  # Automation UI components
│       │   ├── Headless/    # Headless mode components
│       │   │   ├── MarkdownRenderer.tsx  # Markdown with syntax highlight
│       │   │   └── TurnCard.tsx          # Conversation turn display
│       │   ├── FileManager/ # File manager components
│       │   ├── layout/      # Layout components
│       │   ├── ui/          # shadcn/ui components
│       │   ├── ConfigPreview.tsx         # Config preview component
│       │   ├── ConfigTemplateEditor.tsx  # Template editor
│       │   ├── ConfigInjectionDialog.tsx # Injection dialog
│       │   └── ServerAddressInput.tsx    # Server address input
│       ├── pages/           # Pages
│       │   ├── Dashboard.tsx
│       │   ├── HeadlessChat.tsx    # Standalone chat UI
│       │   ├── HeadlessTerminal.tsx
│       │   ├── ContainerTerminal.tsx
│       │   ├── ClaudeConfig.tsx    # Config management page
│       │   ├── Settings.tsx
│       │   └── ...
│       ├── hooks/           # React hooks
│       │   ├── useAuth.ts
│       │   └── useHeadlessSession.ts
│       ├── services/        # API services
│       │   ├── api.ts
│       │   ├── headlessApi.ts
│       │   ├── headlessWebsocket.ts
│       │   ├── claudeConfigApi.ts        # Config API service
│       │   ├── serverAddressManager.ts   # Server address manager
│       │   └── ...
│       └── types/           # TypeScript types
│           └── claudeConfig.ts           # Config types
│
├── 🐳 docker/               # Docker configs (dev containers)
│   ├── Dockerfile.base      # Base image
│   └── traefik/             # Traefik proxy config
│
├── 🐳 deploy-docker/        # Docker deployment
│   ├── Dockerfile.backend   # Backend image
│   ├── Dockerfile.frontend  # Frontend image
│   ├── docker-compose.yml   # Service orchestration
│   ├── nginx.conf           # Nginx config
│   ├── start.sh             # Quick start script
│   └── README.md            # Docker deployment guide
│
├── 📦 deploy-sh/            # Shell script deployment
│   ├── README.md            # Deployment guide (EN)
│   ├── README.zh-CN.md      # Deployment guide (CN)
│   ├── flows/               # Deployment flows
│   ├── lib/                 # Deployment libraries
│   └── nginx.conf           # Nginx config
│
├── .env.example             # Environment template
├── start-dev.sh             # Dev startup (Linux/Mac)
├── start-dev.bat            # Dev startup (Windows)
└── deploy.sh                # Deployment script
```

---

## 🔒 Security

| Feature | Description |
|---------|-------------|
| 👤 Non-root | Containers run as non-root user |
| 🔐 Capabilities | All unnecessary Linux capabilities dropped |
| 🛡️ Seccomp | Security profile applied |
| 📊 Resources | CPU and memory limits enforced |
| 🚫 Docker Socket | Access disabled in containers |
| 🛤️ Path Protection | Path traversal protection enabled |
| 🔒 Encryption | AES-256-GCM encryption for sensitive data |
| ⏱️ Rate Limiting | Login attempts limited (5/min, burst 10) |
| 🍪 Secure Cookies | HTTP-only cookies for session management |
| 🔑 Flexible Auth | Multiple authentication methods supported |

---

## 🙏 Acknowledgements

This project is built with the following amazing open source projects:

### Backend
- [Go](https://github.com/golang/go) - The Go programming language
- [Gin](https://github.com/gin-gonic/gin) - HTTP web framework
- [GORM](https://github.com/go-gorm/gorm) - ORM library for Go
- [gorilla/websocket](https://github.com/gorilla/websocket) - WebSocket implementation
- [Docker Engine API](https://github.com/moby/moby) - Container management

### Frontend
- [React](https://github.com/facebook/react) - UI library
- [Vite](https://github.com/vitejs/vite) - Next generation frontend tooling
- [Tailwind CSS](https://github.com/tailwindlabs/tailwindcss) - Utility-first CSS framework
- [shadcn/ui](https://github.com/shadcn-ui/ui) - Re-usable UI components
- [xterm.js](https://github.com/xtermjs/xterm.js) - Terminal emulator

### Infrastructure
- [Traefik](https://github.com/traefik/traefik) - Cloud native reverse proxy
- [code-server](https://github.com/coder/code-server) - VS Code in the browser
- [SQLite](https://sqlite.org/) - Embedded database engine

---

## 📄 License

MIT License

---

<p align="center">
  Made with ❤️ for Claude Code developers
</p>
