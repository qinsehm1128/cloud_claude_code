# 📦 Deployment Guide

<p align="center">
  <a href="README.md">English</a> | <a href="README.zh-CN.md">简体中文</a>
</p>

---

## ⚡ Quick Start

### 🎯 Interactive Deployment (Recommended for Beginners)

Use the new interactive deployment wizard with a friendly menu interface:

```bash
# Run interactive deployment wizard
./deploy-interactive.sh

# Or configure environment first
./config-wizard.sh
```

**Interactive Deployment Features:**
- ✨ Menu-driven, no need to memorize command parameters
- 🔍 Auto-detect system status and dependencies
- 📝 Smart configuration wizard with default suggestions
- 🎨 Progressive guidance, step-by-step deployment
- ✅ Configuration validation to avoid common errors

**Main Features:**
1. **Quick One-Click Deploy** - Automatic complete deployment
2. **Development Environment** - Start dev servers
3. **Production Deployment** - Build and deploy production version
4. **Configuration Wizard** - Easy .env file configuration
5. **Build Management** - Manage frontend/backend builds
6. **Service Management** - Start/stop/restart services
7. **System Status** - View current deployment status

---

### 🛠️ Development Mode

```bash
# Start frontend dev server + backend
./start-dev.sh

# Backend only
./start-dev.sh --backend

# Frontend only
./start-dev.sh --frontend
```

### 🚀 Production Mode

```bash
# Build frontend to specified directory, then run backend
./start-dev.sh --prod --deploy-dir /var/www/example.com
```

This mode will:
1. Build frontend production version
2. Copy to specified directory
3. Run backend directly (go run, not binary)

Ideal for quick server testing with nginx pointing to frontend directory.

---

## 📁 Directory Structure

Supports frontend/backend separation:

| Directory | Purpose | Default |
|-----------|---------|---------|
| 🎨 Frontend | Nginx static files | `/var/www/example.com` |
| 🔧 Backend | Backend program & config | `/opt/cc-platform` |

```
/var/www/example.com/        # Frontend
├── index.html
├── assets/
└── ...

/opt/cc-platform/            # Backend
├── cc-server                # Executable
├── .env                     # Configuration
├── data/                    # Data directory
│   └── cc-platform.db
├── logs/                    # Log directory
│   └── backend.log
└── docker/                  # Docker related
    └── build-base.sh
```

---

## 🎯 Interactive Deployment Tools

### 📋 deploy-interactive.sh - Interactive Deployment Wizard

Provides a friendly menu-driven interface, suitable for beginners and quick deployments:

```bash
./deploy-interactive.sh
```

**Main Menu Options:**
1. 🚀 **Quick One-Click Deploy** - Complete all deployment steps automatically
2. 💻 **Development Environment** - Start dev servers (frontend/backend)
3. 🏭 **Production Deployment** - Complete/custom deployment workflow
4. ⚙️ **Configuration Wizard** - Set deployment directories and parameters
5. 🔨 **Build Management** - Build frontend/backend/clean
6. 🔧 **Service Management** - Start/stop/restart/view logs
7. 📊 **System Status** - Check dependencies and deployment status
8. 📚 **Help Documentation** - Quick reference guide

### 🔧 config-wizard.sh - Configuration Wizard

Easy configuration of `.env` environment file:

```bash
./config-wizard.sh
```

**Configuration Options:**
1. **Run Full Configuration Wizard** - Step-by-step parameter configuration
2. **Configure Admin Password Only** - Quick password modification
3. **Regenerate JWT Secret** - Update security key
4. **Configure Code-Server Domain** - Set subdomain access
5. **View Current Configuration** - Display existing settings
6. **Create Config from Example** - Quick initialization

**Auto Configuration Features:**
- ✅ Smart default value suggestions
- ✅ Input validation (ports/domains)
- ✅ Auto-generate security keys
- ✅ Configuration summary confirmation
- ✅ Auto-backup existing configuration

---

## 🚀 Command-Line Deployment (Advanced Users)

### 🎯 One-Command Full Deployment

```bash
# Build + Install + Configure service + Enable + Start
./deploy.sh --full-deploy

# With custom directories
./deploy.sh --full-deploy \
    --frontend-dir /var/www/mysite.com \
    --backend-dir /opt/myapp
```

### 📋 Step-by-Step Deployment

```bash
# 1. Build
./deploy.sh --build

# 2. Install files
./deploy.sh --install

# 3. Configure systemd service
./deploy.sh --setup-service

# 4. Enable and start service
./deploy.sh --enable-service --start-service
```

---

## 📚 Command Reference

### 🔨 Build Options

| Command | Description |
|---------|-------------|
| `./deploy.sh --build` | Build frontend and backend |
| `./deploy.sh --frontend` | Build frontend only |
| `./deploy.sh --backend` | Build backend only |
| `./deploy.sh --clean` | Clean build artifacts |

### 📥 Deploy Options

| Command | Description |
|---------|-------------|
| `./deploy.sh --install` | Install to default directories |
| `./deploy.sh --frontend-dir /path --install` | Specify frontend directory |
| `./deploy.sh --backend-dir /path --install` | Specify backend directory |

### ⚙️ Service Management

| Command | Description |
|---------|-------------|
| `./deploy.sh --setup-service` | Generate systemd service file |
| `./deploy.sh --enable-service` | Enable auto-start on boot |
| `./deploy.sh --start-service` | Start service |
| `./deploy.sh --stop-service` | Stop service |
| `./deploy.sh --restart-service` | Restart service |
| `./deploy.sh --status` | View service status |

### 🔗 Combined Commands

| Command | Description |
|---------|-------------|
| `./deploy.sh --deploy` | Build + Install + Configure service |
| `./deploy.sh --full-deploy` | All of the above + Enable + Start |

---

## 🌍 Environment Variables

Preset directories via environment variables:

```bash
export FRONTEND_DIR=/var/www/mysite.com
export BACKEND_DIR=/opt/myapp
./deploy.sh --deploy
```

---

## 🌐 Nginx Configuration

Add `deploy/nginx.conf` content to your nginx configuration.

### 📝 Key Settings

| Setting | Value |
|---------|-------|
| Frontend static files | `root /var/www/example.com;` |
| Backend proxy | `proxy_pass http://127.0.0.1:8080;` |

```bash
# Edit nginx config
vim /etc/nginx/sites-available/example.com.conf

# Reload nginx
nginx -s reload
```

### 💻 Code-Server Subdomain Routing

To enable code-server subdomain access (like VS Code Codespaces):

#### 1️⃣ DNS Configuration

Add wildcard A record:
```
*.code.example.com -> Server IP
```

#### 2️⃣ Nginx Configuration

Add subdomain server block (see second server block in `deploy/nginx.conf`)

#### 3️⃣ Environment Variables

Set in `.env`:
```bash
CODE_SERVER_BASE_DOMAIN=code.example.com
```

#### 4️⃣ Traefik

Ensure Traefik is running (containers auto-register routes):
```bash
AUTO_START_TRAEFIK=true
```

After setup, created containers are accessible via `{container-name}.code.example.com`.

---

## ⚙️ Configuration

Edit `/opt/cc-platform/.env`:

```bash
# Required
PORT=8080
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_secure_password
JWT_SECRET=your_jwt_secret_key

# Optional
AUTO_START_TRAEFIK=false
CODE_SERVER_BASE_DOMAIN=code.example.com
```

### 🔐 Generate Secure Key

```bash
openssl rand -hex 32
```

---

## 🔧 Service Management

### Using systemctl

```bash
# Check status
sudo systemctl status cc-platform

# Start/Stop/Restart
sudo systemctl start cc-platform
sudo systemctl stop cc-platform
sudo systemctl restart cc-platform

# View logs
sudo journalctl -u cc-platform -f
# Or
tail -f /opt/cc-platform/logs/backend.log
```

### Manual Run (Debug)

```bash
cd /opt/cc-platform
./cc-server
```

---

## 🐳 Docker Base Image

Build Docker base image on first deployment:

```bash
cd /opt/cc-platform/docker
./build-base.sh
```

This creates:
- `cc-base:latest` - Base image
- `cc-base:with-code-server` - Image with code-server

---

## ❓ Troubleshooting

### 🔴 502 Bad Gateway

- Check if backend is running: `systemctl status cc-platform`
- Verify port configuration consistency

### 🔴 WebSocket Connection Failed

- Ensure nginx config includes WebSocket support
- Check `proxy_set_header Upgrade` settings

### 🔴 Permission Issues

- Backend needs Docker access: ensure user is in docker group
- Or run as root user

### 🔴 Service Start Failed

```bash
# View detailed logs
journalctl -u cc-platform -n 100 --no-pager

# Run manually to see errors
cd /opt/cc-platform && ./cc-server
```

---

## 🔄 Update Deployment

```bash
# Pull latest code
git pull

# Redeploy
./deploy.sh --deploy --restart-service
```

---

<p align="center">
  <a href="../README.md">← Back to Main README</a>
</p>
