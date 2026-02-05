#!/bin/bash
# ============================================
# Complete Deployment Script for Docker
# Docker 完整部署脚本
# ============================================
#
# 此脚本执行完整部署：
#   1. 检查前置条件
#   2. 构建基础镜像（cc-base）
#   3. 配置环境变量
#   4. 构建并启动平台服务
#   5. 生成宿主机 nginx 配置（可选）
#
# Usage / 使用方法:
#   ./start.sh              # Full deployment / 完整部署
#   ./start.sh --skip-base  # Skip base image build / 跳过基础镜像构建
#   ./start.sh --clean      # Clean build everything / 清理后重新构建
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

# Parse arguments
SKIP_BASE=false
CLEAN_BUILD=false

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
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --skip-base  Skip building base images (if already built)"
            echo "  --clean      Clean build everything from scratch"
            echo "  --help       Show this help message"
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
# Step 1: Check Prerequisites
# ==========================================
print_msg "[Step 1/4] Checking prerequisites..." "$YELLOW"

if ! command -v docker &> /dev/null; then
    print_msg "Error: Docker is not installed" "$RED"
    exit 1
fi

if ! docker info &> /dev/null; then
    print_msg "Error: Docker daemon is not running" "$RED"
    exit 1
fi
print_msg "  Docker is available" "$GREEN"

if ! docker compose version &> /dev/null; then
    print_msg "Error: Docker Compose v2 is not installed" "$RED"
    exit 1
fi
print_msg "  Docker Compose is available" "$GREEN"

# ==========================================
# Step 2: Build Base Images
# ==========================================
if [ "$SKIP_BASE" = true ]; then
    print_msg "" ""
    print_msg "[Step 2/4] Skipping base image build (--skip-base)" "$YELLOW"

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
    print_msg "[Step 2/4] Building base images..." "$YELLOW"
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
print_msg "[Step 3/4] Configuring environment..." "$YELLOW"

if [ ! -f ".env" ]; then
    print_msg "  Creating .env from template..." ""
    cp .env.example .env

    # Generate secure keys
    JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | base64 | tr -d '\n' | head -c 64)
    ENCRYPTION_KEY=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | base64 | tr -d '\n' | head -c 64)

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
print_msg "[Step 4/4] Building and starting services..." "$YELLOW"

if [ "$CLEAN_BUILD" = true ]; then
    print_msg "  Cleaning up old containers..." ""
    docker compose down -v --remove-orphans 2>/dev/null || true
fi

docker compose up -d --build

print_msg "  Waiting for services to start..." ""
sleep 5

# ==========================================
# Deployment Complete
# ==========================================
print_header "Deployment Complete!"

# Load config for display
source .env
APP_PORT=${APP_PORT:-8080}
TRAEFIK_HTTP_PORT=${TRAEFIK_HTTP_PORT:-8081}

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
