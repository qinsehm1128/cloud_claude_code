# Claude Code Container Platform

<p align="center">
  <b>Web-based Docker container management platform for Claude Code development environments</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Go-1.21+-00ADD8?style=flat-square&logo=go" alt="Go">
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react" alt="React">
  <img src="https://img.shields.io/badge/Docker-Required-2496ED?style=flat-square&logo=docker" alt="Docker">
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License">
</p>

---

## Features

| Feature | Description |
|---------|-------------|
| **User Auth** | JWT authentication with configurable admin credentials |
| **GitHub Integration** | Browse and clone repositories directly into containers |
| **Claude Code Init** | Auto-initialize projects with Claude Code (optional) |
| **Container Management** | Create, start, stop, delete Docker containers |
| **Web Terminal** | Real-time terminal via WebSocket with session persistence |
| **File Manager** | Browse, upload, download files with drag-and-drop support |
| **Service Proxy** | Expose container services via Traefik (domain or port access) |
| **Code-Server** | Access VS Code in browser via subdomain routing |
| **Resource Control** | Custom CPU and memory limits per container |
| **Security** | Container isolation, capability dropping, seccomp profiles |

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Browser                                      │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Nginx (Reverse Proxy)                            │
│  ┌─────────────────────┐    ┌─────────────────────────────────────┐ │
│  │   Main Site (80)    │    │  *.code.example.com (Subdomain)     │ │
│  │   example.com       │    │  → Traefik → Container:8080         │ │
│  └──────────┬──────────┘    └──────────────┬──────────────────────┘ │
└─────────────┼──────────────────────────────┼────────────────────────┘
              │                              │
              ▼                              ▼
┌─────────────────────────┐    ┌─────────────────────────────────────┐
│   Backend (Go:8080)     │    │         Traefik (38080)             │
│  ┌───────────────────┐  │    │  Auto-routing by container name     │
│  │ REST API          │  │    └──────────────┬──────────────────────┘
│  │ WebSocket Terminal│  │                   │
│  │ Container Manager │  │                   ▼
│  └───────────────────┘  │    ┌─────────────────────────────────────┐
└─────────────┬───────────┘    │         Docker Containers           │
              │                │  ┌─────────┐ ┌─────────┐ ┌─────────┐│
              └───────────────▶│  │ dev-1   │ │ dev-2   │ │ dev-N   ││
                               │  │ :8080   │ │ :8080   │ │ :8080   ││
                               │  └─────────┘ └─────────┘ └─────────┘│
                               └─────────────────────────────────────┘
```

## Tech Stack

<table>
<tr>
<td width="50%">

### Backend
- **Go 1.21+** - Core language
- **Gin** - Web framework
- **GORM + SQLite** - Database
- **Docker SDK** - Container management
- **gorilla/websocket** - Terminal WebSocket

</td>
<td width="50%">

### Frontend
- **React 18 + TypeScript**
- **Vite** - Build tool
- **shadcn/ui + Tailwind CSS** - UI
- **xterm.js** - Terminal emulator

</td>
</tr>
</table>

## Quick Start

### Prerequisites

- Docker (for running dev containers)
- Node.js 20+
- Go 1.21+

### 1. Build Base Image

```bash
cd docker
./build-base.sh
```

This creates `cc-base:latest` with Node.js 20, Git, and Claude Code CLI.

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:
```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-secure-password
```

### 3. Start Development Server

**Linux/macOS:**
```bash
./start-dev.sh
```

**Windows:**
```cmd
start-dev.bat
```

### 4. Access Application

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8080 |
| Traefik Dashboard | http://localhost:8081/dashboard/ |

> If `ADMIN_PASSWORD` is not set, a random password will be generated and shown in backend logs.

---

## Deployment

For production deployment, see the **[Deployment Guide](deploy/README.md)**.

### Quick Deploy

```bash
# One-command full deployment
./deploy.sh --full-deploy

# Custom directories
./deploy.sh --full-deploy \
    --frontend-dir /var/www/mysite.com \
    --backend-dir /opt/myapp
```

### Deployment Options

| Command | Description |
|---------|-------------|
| `./deploy.sh --build` | Build frontend and backend |
| `./deploy.sh --install` | Install to deploy directories |
| `./deploy.sh --setup-service` | Create systemd service |
| `./deploy.sh --full-deploy` | All of the above + start |

> **[View Full Deployment Guide →](deploy/README.md)**

---

## Service Proxy

### Option 1: Subdomain Access (Recommended)

Access container services via `{container-name}.code.example.com`

```
User → Nginx → Traefik → Container:8080
```

**Setup:**
1. DNS: Add `*.code.example.com → Server IP`
2. Nginx: Configure subdomain routing (see [nginx.conf](deploy/nginx.conf))
3. Environment: Set `CODE_SERVER_BASE_DOMAIN=code.example.com`

### Option 2: Direct Port Access

Access via `http://server-ip:30001`

Available ports: `30001-30020`

---

## Environment Variables

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

## API Reference

<details>
<summary><b>Authentication</b></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | User login |
| POST | `/api/auth/logout` | User logout |
| GET | `/api/auth/verify` | Verify token |

</details>

<details>
<summary><b>Settings</b></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/settings/github` | Get GitHub config status |
| POST | `/api/settings/github` | Save GitHub token |
| GET | `/api/settings/claude` | Get Claude config |
| POST | `/api/settings/claude` | Save Claude config |

</details>

<details>
<summary><b>Repositories</b></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/repos/remote` | List GitHub repos |
| POST | `/api/repos/clone` | Clone repository |
| GET | `/api/repos/local` | List local repos |
| DELETE | `/api/repos/:id` | Delete repository |

</details>

<details>
<summary><b>Containers</b></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/containers` | List containers |
| POST | `/api/containers` | Create container |
| GET | `/api/containers/:id` | Get container details |
| POST | `/api/containers/:id/start` | Start container |
| POST | `/api/containers/:id/stop` | Stop container |
| DELETE | `/api/containers/:id` | Delete container |

</details>

<details>
<summary><b>Terminal & Files</b></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| WS | `/api/ws/terminal/:id` | WebSocket terminal |
| GET | `/api/files/:id/list` | List directory |
| GET | `/api/files/:id/download` | Download file |
| POST | `/api/files/:id/upload` | Upload file |

</details>

---

## Project Structure

```
.
├── backend/                 # Go backend
│   ├── cmd/server/          # Entry point
│   ├── internal/            # Internal packages
│   │   ├── config/          # Configuration
│   │   ├── handlers/        # HTTP handlers
│   │   ├── services/        # Business logic
│   │   └── terminal/        # Terminal management
│   └── pkg/                 # Public packages
│
├── frontend/                # React frontend
│   └── src/
│       ├── components/      # UI components
│       ├── pages/           # Pages
│       └── services/        # API services
│
├── docker/                  # Docker configs
│   ├── Dockerfile.base      # Base image
│   └── traefik/             # Traefik proxy config
│
├── deploy/                  # Deployment configs
│   ├── README.md            # Deployment guide
│   └── nginx.conf           # Nginx config
│
├── .env.example             # Environment template
├── start-dev.sh             # Dev startup (Linux/Mac)
├── start-dev.bat            # Dev startup (Windows)
└── deploy.sh                # Deployment script
```

---

## Security

- Containers run as non-root user
- All unnecessary Linux capabilities dropped
- Seccomp security profile applied
- CPU and memory limits enforced
- Docker socket access disabled
- Path traversal protection

---

## License

MIT License
