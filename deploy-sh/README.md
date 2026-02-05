# 📦 Deployment Guide

<p align="center">
  <a href="README.md">English</a> | <a href="README.zh-CN.md">简体中文</a>
</p>

---

## ⚡ Quick Start

### 🚀 One-Click Deployment (Recommended)

Use the new unified deployment script with progressive wizard:

```bash
./deploy.sh
```

That's it! The script will guide you through all the steps automatically.

---

## ✨ Deployment Script Features

### 🎯 Progressive Guided Flow

```
Step 1: Environment Check ✓
├─ Detect dependencies (Node.js, Go, Docker)
├─ Check disk space
├─ Check port availability
└─ Smart suggestions and fixes

Step 2: Configuration Wizard ✓
├─ Detect existing configuration
├─ Smart default values
├─ Configuration validation
└─ Security key generation

Step 3: Select Deployment Mode
  1. 🚀 Quick One-Click Deploy (Recommended)
  2. 💻 Development Mode
  3. 📦 Production Mode
  4. ⚙️  Custom Deployment Steps

Step 4: Confirm Deployment Plan
├─ Display operations to be performed
├─ Estimated time
└─ User confirmation

Step 5: Execute Deployment ⏳
├─ [▓▓▓▓▓▓▓▓░░] 80%
├─ Real-time progress display
└─ Automatic error handling

Step 6: Deployment Verification ✅
├─ Service status check
├─ Port listening check
├─ API health check
└─ File integrity check

Step 7: Completion Tips
├─ Access URLs
├─ Next steps suggestions
└─ Common commands
```

### 💡 Core Features

✅ **Smart Environment Check** - Auto-detect missing dependencies with installation suggestions
✅ **Configuration Wizard** - Interactive configuration with validation and defaults
✅ **Multiple Deployment Modes** - Adapt to different scenarios
✅ **Deployment Verification** - Automatic health checks and problem diagnosis
✅ **Rollback Mechanism** - Auto-rollback on deployment failure
✅ **Progress Indicators** - Real-time deployment progress display
✅ **Backup Management** - Automatic backups, keep last 3 deployments

---

## 📖 Usage Guide

### Basic Usage

```bash
# Launch interactive deployment wizard
./deploy.sh

# Show help information
./deploy.sh --help

# Show version information
./deploy.sh --version
```

### Deployment Modes

#### 1. 🚀 Quick One-Click Deploy (Recommended)

**Best for:** First-time deployment, quick production setup

**Includes:**
- Build frontend and backend
- Install to deployment directories
- Configure systemd service
- Start and verify service

**Estimated time:** 3-5 minutes

#### 2. 💻 Development Mode

**Best for:** Development and debugging

**Includes:**
- Build frontend and backend only
- Generate dist and bin directories

**Excludes:**
- No system directory deployment
- No service configuration

**Estimated time:** 2-3 minutes

#### 3. 📦 Production Mode

**Best for:** Production environment

**Includes:**
- Automatic backup before deployment
- Complete build and deployment
- Auto-rollback on failure
- Full verification

**Estimated time:** 3-5 minutes

#### 4. ⚙️ Custom Deployment Steps

**Best for:** Advanced users

**Optional steps:**
- Build frontend/backend
- Clean build artifacts
- Install files
- Configure service
- Start/stop/restart service

---

## 📁 Directory Structure

Post-deployment file structure:

```
Frontend Directory (default: /var/www/example.com)
├── index.html
├── assets/
└── ...

Backend Directory (default: /opt/cc-platform)
├── cc-server           # Executable
├── .env                # Configuration
├── data/               # Data directory
│   └── cc-platform.db
├── logs/               # Log directory
│   └── backend.log
└── docker/             # Docker related
    └── build-base.sh

Backup Directory (.deploy-backups)
├── backup_20260105_120000/
├── backup_20260105_130000/
└── backup_20260105_140000/
```

---

## ⚙️ Configuration

### Environment Variables (.env)

The configuration wizard automatically generates the `.env` file with:

```bash
# Basic Configuration
PORT=8080                           # Backend port
FRONTEND_PORT=3000                  # Frontend dev port

# Admin Account
ADMIN_USERNAME=admin                # Admin username
ADMIN_PASSWORD=your_password        # Admin password

# Security Configuration
JWT_SECRET=your_jwt_secret          # JWT secret key

# Docker Configuration
AUTO_START_TRAEFIK=false            # Auto-start Traefik
CODE_SERVER_BASE_DOMAIN=            # Code-Server domain
```

### Deployment Directories (.deploy-config)

```bash
FRONTEND_DIR=/var/www/example.com   # Frontend deployment directory
BACKEND_DIR=/opt/cc-platform        # Backend deployment directory
```

---

## 🌐 Nginx Configuration

After deployment, configure Nginx:

```bash
# Copy example configuration
sudo cp deploy/nginx.conf /etc/nginx/sites-available/example.com.conf

# Edit configuration
sudo vim /etc/nginx/sites-available/example.com.conf

# Create symbolic link
sudo ln -s /etc/nginx/sites-available/example.com.conf /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload Nginx
sudo nginx -s reload
```

Key configuration items:
- Frontend static files: `root /var/www/example.com;`
- Backend proxy: `proxy_pass http://127.0.0.1:8080;`

---

## 🔧 Service Management

### Using systemctl

```bash
# Check status
sudo systemctl status cc-platform

# Start service
sudo systemctl start cc-platform

# Stop service
sudo systemctl stop cc-platform

# Restart service
sudo systemctl restart cc-platform

# View logs
sudo journalctl -u cc-platform -f

# Or view file logs
tail -f /opt/cc-platform/logs/backend.log
```

---

## 🔄 Update Deployment

```bash
# Pull latest code
git pull

# Re-run deployment script
./deploy.sh

# Select "Quick One-Click Deploy" or "Production Mode"
```

The system will automatically:
- Create backup
- Build new version
- Stop old service
- Deploy new version
- Start service
- Verify deployment

If it fails, you can rollback to the backup.

---

## ❓ Troubleshooting

### Deployment Failed?

1. Check error messages
2. View logs: `sudo journalctl -u cc-platform -n 50`
3. Verify configuration: `cat /opt/cc-platform/.env`
4. Rollback to backup if available

### How to Rollback?

Backups are located in `.deploy-backups/` directory:

```bash
# List available backups
ls -la .deploy-backups/

# Manual rollback (select in deployment script)
# Or manually restore files
```

### Service Won't Start?

```bash
# View detailed errors
sudo systemctl status cc-platform
sudo journalctl -u cc-platform -n 100

# Check if port is in use
sudo lsof -i :8080

# Run manually to see errors
cd /opt/cc-platform
./cc-server
```

### Frontend 502 Error?

1. Check if backend service is running
2. Verify Nginx configuration
3. Check if port numbers are correct
4. View Nginx error logs

---

## 🐳 Docker Base Image

First-time deployment requires building the Docker base image:

```bash
cd /opt/cc-platform/docker
./build-base.sh
```

---

## 📚 More Information

- Project Documentation: [README.md](../README.md)
- Deployment Script Source: `deploy/`
- Issue Reporting: [GitHub Issues](https://github.com/qinsehm1128/cloud_claude_code/issues)

---

<p align="center">
  <a href="../README.md">← Back to Main Documentation</a>
</p>
