#!/bin/bash
# ============================================
# Complete Deployment Script for Docker
# Docker 完整部署脚本
# ============================================
#
# 此脚本执行完整部署：
#   1. 检测系统环境并自动安装依赖
#   2. 构建基础镜像（cc-base）
#   3. 配置环境变量
#   4. 构建并启动平台服务
#   5. 生成宿主机 nginx 配置（可选）
#
# Usage / 使用方法:
#   ./start.sh              # Full deployment / 完整部署
#   ./start.sh --skip-base  # Skip base image build / 跳过基础镜像构建
#   ./start.sh --clean      # Clean build everything / 清理后重新构建
#   ./start.sh --no-install # Skip auto-install of dependencies / 跳过自动安装依赖
#
# Supported OS / 支持的系统:
#   - Ubuntu/Debian (apt)
#   - CentOS/RHEL/Fedora (yum/dnf)
#   - Alpine (apk)
#
# ============================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_msg() {
    echo -e "${2}${1}${NC}"
}

print_header() {
    echo ""
    print_msg "============================================" "$BLUE"
    print_msg "$1" "$BLUE"
    print_msg "============================================" "$BLUE"
    echo ""
}

# ==========================================
# OS Detection Functions
# 系统检测函数
# ==========================================
detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS_ID="$ID"
        OS_ID_LIKE="$ID_LIKE"
        OS_VERSION="$VERSION_ID"
    elif [ -f /etc/redhat-release ]; then
        OS_ID="rhel"
    elif [ -f /etc/alpine-release ]; then
        OS_ID="alpine"
    else
        OS_ID="unknown"
    fi

    # Determine package manager
    if command -v apt-get &> /dev/null; then
        PKG_MANAGER="apt"
        PKG_UPDATE="apt-get update"
        PKG_INSTALL="apt-get install -y"
    elif command -v dnf &> /dev/null; then
        PKG_MANAGER="dnf"
        PKG_UPDATE="dnf check-update || true"
        PKG_INSTALL="dnf install -y"
    elif command -v yum &> /dev/null; then
        PKG_MANAGER="yum"
        PKG_UPDATE="yum check-update || true"
        PKG_INSTALL="yum install -y"
    elif command -v apk &> /dev/null; then
        PKG_MANAGER="apk"
        PKG_UPDATE="apk update"
        PKG_INSTALL="apk add --no-cache"
    else
        PKG_MANAGER="unknown"
    fi

    print_msg "  Detected OS: ${OS_ID} (package manager: ${PKG_MANAGER})" "$GREEN"
}

# Check if running as root or can sudo
check_sudo() {
    if [ "$EUID" -eq 0 ]; then
        SUDO=""
    elif command -v sudo &> /dev/null; then
        SUDO="sudo"
    else
        print_msg "Error: This script requires root privileges or sudo" "$RED"
        exit 1
    fi
}

# ==========================================
# Installation Functions
# 安装函数
# ==========================================
install_docker() {
    print_msg "  Installing Docker..." "$YELLOW"

    case "$PKG_MANAGER" in
        apt)
            $SUDO apt-get update
            $SUDO apt-get install -y ca-certificates curl gnupg

            # Add Docker's official GPG key
            $SUDO install -m 0755 -d /etc/apt/keyrings
            if [ ! -f /etc/apt/keyrings/docker.gpg ]; then
                curl -fsSL https://download.docker.com/linux/${OS_ID}/gpg | $SUDO gpg --dearmor -o /etc/apt/keyrings/docker.gpg
                $SUDO chmod a+r /etc/apt/keyrings/docker.gpg
            fi

            # Add Docker repository
            echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${OS_ID} $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
                $SUDO tee /etc/apt/sources.list.d/docker.list > /dev/null

            $SUDO apt-get update
            $SUDO apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
            ;;
        dnf|yum)
            $SUDO $PKG_INSTALL yum-utils
            $SUDO yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo 2>/dev/null || \
            $SUDO yum-config-manager --add-repo https://download.docker.com/linux/fedora/docker-ce.repo 2>/dev/null || true
            $SUDO $PKG_INSTALL docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
            ;;
        apk)
            $SUDO apk add docker docker-cli-compose
            ;;
        *)
            print_msg "  Cannot auto-install Docker for this OS" "$RED"
            print_msg "  Please install Docker manually: https://docs.docker.com/engine/install/" ""
            return 1
            ;;
    esac

    # Start and enable Docker
    if command -v systemctl &> /dev/null; then
        $SUDO systemctl start docker 2>/dev/null || true
        $SUDO systemctl enable docker 2>/dev/null || true
    elif command -v rc-service &> /dev/null; then
        $SUDO rc-service docker start 2>/dev/null || true
        $SUDO rc-update add docker boot 2>/dev/null || true
    fi

    # Add current user to docker group (if not root)
    if [ "$EUID" -ne 0 ]; then
        $SUDO usermod -aG docker "$USER" 2>/dev/null || true
        print_msg "  Note: You may need to log out and back in for docker group to take effect" "$YELLOW"
    fi

    print_msg "  Docker installed successfully" "$GREEN"
}

install_nodejs() {
    print_msg "  Installing Node.js and npm..." "$YELLOW"

    case "$PKG_MANAGER" in
        apt)
            # Use NodeSource for latest LTS
            if ! command -v node &> /dev/null; then
                curl -fsSL https://deb.nodesource.com/setup_lts.x | $SUDO -E bash - 2>/dev/null || {
                    # Fallback to system package
                    $SUDO apt-get update
                    $SUDO apt-get install -y nodejs npm
                }
                $SUDO apt-get install -y nodejs
            fi
            ;;
        dnf|yum)
            if ! command -v node &> /dev/null; then
                curl -fsSL https://rpm.nodesource.com/setup_lts.x | $SUDO bash - 2>/dev/null || {
                    # Fallback to system package
                    $SUDO $PKG_INSTALL nodejs npm
                }
                $SUDO $PKG_INSTALL nodejs
            fi
            ;;
        apk)
            $SUDO apk add nodejs npm
            ;;
        *)
            print_msg "  Cannot auto-install Node.js for this OS" "$YELLOW"
            print_msg "  VS Code extension build will be skipped" ""
            return 1
            ;;
    esac

    print_msg "  Node.js $(node --version 2>/dev/null || echo 'N/A') installed" "$GREEN"
}

install_openssl() {
    print_msg "  Installing OpenSSL..." "$YELLOW"

    case "$PKG_MANAGER" in
        apt)
            $SUDO apt-get install -y openssl
            ;;
        dnf|yum)
            $SUDO $PKG_INSTALL openssl
            ;;
        apk)
            $SUDO apk add openssl
            ;;
        *)
            return 1
            ;;
    esac

    print_msg "  OpenSSL installed" "$GREEN"
}

# Parse arguments
SKIP_BASE=false
CLEAN_BUILD=false
NO_INSTALL=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-base)
            SKIP_BASE=true
            shift
            ;;
        --clean)
            CLEAN_BUILD=true
            shift
            ;;
        --no-install)
            NO_INSTALL=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --skip-base   Skip building base images (if already built)"
            echo "  --clean       Clean build everything from scratch"
            echo "  --no-install  Skip auto-install of missing dependencies"
            echo "  --help        Show this help message"
            echo ""
            echo "Supported OS:"
            echo "  - Ubuntu/Debian (apt)"
            echo "  - CentOS/RHEL/Fedora (yum/dnf)"
            echo "  - Alpine (apk)"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Change to script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

print_header "Claude Code Container Platform - Docker Deployment"

# ==========================================
# Step 1: Detect System and Install Dependencies
# ==========================================
print_msg "[Step 1/5] Detecting system and checking dependencies..." "$YELLOW"

detect_os
check_sudo

# Check and install Docker
if ! command -v docker &> /dev/null; then
    if [ "$NO_INSTALL" = true ]; then
        print_msg "Error: Docker is not installed (use without --no-install to auto-install)" "$RED"
        exit 1
    fi
    print_msg "  Docker not found, installing..." "$YELLOW"
    install_docker
fi

# Verify Docker is running
if ! docker info &> /dev/null; then
    print_msg "  Starting Docker daemon..." "$YELLOW"
    if command -v systemctl &> /dev/null; then
        $SUDO systemctl start docker
    elif command -v rc-service &> /dev/null; then
        $SUDO rc-service docker start
    fi
    sleep 2
    if ! docker info &> /dev/null; then
        print_msg "Error: Docker daemon is not running" "$RED"
        exit 1
    fi
fi
print_msg "  Docker is available" "$GREEN"

# Check Docker Compose
if ! docker compose version &> /dev/null; then
    if [ "$NO_INSTALL" = true ]; then
        print_msg "Error: Docker Compose v2 is not installed" "$RED"
        exit 1
    fi
    print_msg "  Docker Compose not found, it should have been installed with Docker" "$YELLOW"
    print_msg "  Trying to install docker-compose-plugin..." "$YELLOW"

    case "$PKG_MANAGER" in
        apt)
            $SUDO apt-get install -y docker-compose-plugin
            ;;
        dnf|yum)
            $SUDO $PKG_INSTALL docker-compose-plugin
            ;;
        apk)
            $SUDO apk add docker-cli-compose
            ;;
    esac
fi

if ! docker compose version &> /dev/null; then
    print_msg "Error: Docker Compose v2 is not available" "$RED"
    exit 1
fi
print_msg "  Docker Compose is available" "$GREEN"

# Check and install Node.js/npm (optional, for VS Code extension)
if ! command -v npm &> /dev/null; then
    if [ "$NO_INSTALL" = true ]; then
        print_msg "  npm not found (VS Code extension build will be skipped)" "$YELLOW"
    else
        print_msg "  npm not found, installing Node.js..." "$YELLOW"
        install_nodejs || print_msg "  npm installation skipped (extension is optional)" "$YELLOW"
    fi
else
    print_msg "  npm is available ($(npm --version 2>/dev/null))" "$GREEN"
fi

# Check OpenSSL (for key generation)
if ! command -v openssl &> /dev/null; then
    if [ "$NO_INSTALL" = true ]; then
        print_msg "  openssl not found (will use fallback for key generation)" "$YELLOW"
    else
        install_openssl || true
    fi
fi

# ==========================================
# Step 2: Build Base Images
# ==========================================
if [ "$SKIP_BASE" = true ]; then
    print_msg "" ""
    print_msg "[Step 2/5] Skipping base image build (--skip-base)" "$YELLOW"

    if ! docker image inspect cc-base:latest &> /dev/null; then
        print_msg "Error: cc-base:latest not found" "$RED"
        exit 1
    fi
    if ! docker image inspect cc-base:with-code-server &> /dev/null; then
        print_msg "Error: cc-base:with-code-server not found" "$RED"
        exit 1
    fi
    print_msg "  Base images verified" "$GREEN"
else
    print_msg "" ""
    print_msg "[Step 2/5] Building base images..." "$YELLOW"
    print_msg "  This may take several minutes on first run..." ""

    BUILD_ARGS=""
    if [ "$CLEAN_BUILD" = true ]; then
        BUILD_ARGS="--clean"
    fi

    if ! ./build-base.sh $BUILD_ARGS; then
        print_msg "Error: Failed to build base images" "$RED"
        exit 1
    fi
    print_msg "  Base images built successfully" "$GREEN"
fi

# ==========================================
# Step 3: Configure Environment
# ==========================================
print_msg "" ""
print_msg "[Step 3/5] Configuring environment..." "$YELLOW"

if [ ! -f ".env" ]; then
    print_msg "  Creating .env from template..." ""
    cp .env.example .env

    # Generate secure keys
    if command -v openssl &> /dev/null; then
        JWT_SECRET=$(openssl rand -hex 32)
        ENCRYPTION_KEY=$(openssl rand -hex 32)
    else
        JWT_SECRET=$(head -c 64 /dev/urandom | base64 | tr -d '\n' | head -c 64)
        ENCRYPTION_KEY=$(head -c 64 /dev/urandom | base64 | tr -d '\n' | head -c 64)
    fi

    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s/^JWT_SECRET=.*/JWT_SECRET=${JWT_SECRET}/" .env
        sed -i '' "s/^ENCRYPTION_KEY=.*/ENCRYPTION_KEY=${ENCRYPTION_KEY}/" .env
    else
        sed -i "s/^JWT_SECRET=.*/JWT_SECRET=${JWT_SECRET}/" .env
        sed -i "s/^ENCRYPTION_KEY=.*/ENCRYPTION_KEY=${ENCRYPTION_KEY}/" .env
    fi

    print_msg "  Secure keys generated" "$GREEN"
    print_msg "" ""
    print_msg "============================================" "$RED"
    print_msg "IMPORTANT: Please edit .env to configure:" "$RED"
    print_msg "  1. ADMIN_PASSWORD (required)" "$RED"
    print_msg "  2. DOMAIN (for nginx config)" "$RED"
    print_msg "============================================" "$RED"
    print_msg "" ""
    print_msg "Edit: nano .env" "$YELLOW"
    print_msg "" ""

    read -p "Press Enter after editing .env, or Ctrl+C to cancel..."
fi

# Reload and verify
source .env

if [ -z "$ADMIN_PASSWORD" ] || [ "$ADMIN_PASSWORD" = "change_me_to_secure_password" ]; then
    print_msg "Error: ADMIN_PASSWORD is not configured" "$RED"
    print_msg "Edit .env and set a secure password" ""
    exit 1
fi

print_msg "  Environment configured" "$GREEN"

# ==========================================
# Step 4: Build and Start Services
# ==========================================
print_msg "" ""
print_msg "[Step 4/5] Building and starting services..." "$YELLOW"

if [ "$CLEAN_BUILD" = true ]; then
    print_msg "  Cleaning up old containers..." ""
    docker compose down -v --remove-orphans 2>/dev/null || true
fi

docker compose up -d --build

print_msg "  Waiting for services to start..." ""
sleep 5

# ==========================================
# Step 5: Verify Deployment
# ==========================================
print_msg "" ""
print_msg "[Step 5/5] Verifying deployment..." "$YELLOW"

# Check if services are running
if docker compose ps --format json 2>/dev/null | grep -q '"running"'; then
    print_msg "  Services are running" "$GREEN"
elif docker compose ps 2>/dev/null | grep -q "Up"; then
    print_msg "  Services are running" "$GREEN"
else
    print_msg "  Warning: Some services may not be running properly" "$YELLOW"
    print_msg "  Check with: docker compose logs" ""
fi

# ==========================================
# Deployment Complete
# ==========================================
print_header "Deployment Complete!"

# Load config for display
source .env
APP_PORT=${APP_PORT:-51080}
TRAEFIK_HTTP_PORT=${TRAEFIK_HTTP_PORT:-51081}

print_msg "Service Status:" "$BLUE"
docker compose ps
echo ""

print_msg "Base Images:" "$BLUE"
docker images cc-base --format "  {{.Repository}}:{{.Tag}} ({{.Size}})"
echo ""

print_msg "Port Mapping:" "$BLUE"
print_msg "  Main App:     127.0.0.1:${APP_PORT}" ""
print_msg "  Traefik:      127.0.0.1:${TRAEFIK_HTTP_PORT}" ""
echo ""

print_msg "Default Credentials:" "$BLUE"
print_msg "  Username: ${ADMIN_USERNAME:-admin}" ""
print_msg "  Password: (as configured in .env)" ""
echo ""

# ==========================================
# Next Steps
# ==========================================
print_header "Next Steps"

if [ -z "$DOMAIN" ]; then
    print_msg "1. Configure domain in .env:" "$YELLOW"
    print_msg "   DOMAIN=your-domain.com" ""
    print_msg "   CODE_SERVER_BASE_DOMAIN=code.your-domain.com" ""
    echo ""
fi

print_msg "2. Generate nginx configuration:" "$YELLOW"
print_msg "   ./generate-nginx.sh" ""
echo ""

print_msg "3. Install nginx config:" "$YELLOW"
print_msg "   sudo cp nginx-site.conf /etc/nginx/sites-available/cc-platform.conf" ""
print_msg "   sudo ln -s /etc/nginx/sites-available/cc-platform.conf /etc/nginx/sites-enabled/" ""
print_msg "   sudo nginx -t && sudo systemctl reload nginx" ""
echo ""

print_msg "4. Configure SSL (recommended):" "$YELLOW"
print_msg "   sudo certbot --nginx -d your-domain.com" ""
echo ""

print_msg "Useful Commands:" "$YELLOW"
print_msg "  View logs:      docker compose logs -f" ""
print_msg "  Stop:           docker compose down" ""
print_msg "  Restart:        docker compose restart" ""
print_msg "  Rebuild:        docker compose up -d --build" ""
print_msg "  Gen nginx:      ./generate-nginx.sh" ""
