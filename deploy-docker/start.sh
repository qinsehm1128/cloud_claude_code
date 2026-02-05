#!/bin/bash
# ============================================
# Complete Deployment Script for Docker
# Docker 完整部署脚本
# ============================================
#
# This script performs the complete deployment:
#   1. Check prerequisites
#   2. Build base images (cc-base:latest, cc-base:with-code-server)
#   3. Configure environment
#   4. Build and start platform services
#
# 此脚本执行完整部署：
#   1. 检查前置条件
#   2. 构建基础镜像
#   3. 配置环境变量
#   4. 构建并启动平台服务
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
# 步骤 1：检查前置条件
# ==========================================
print_msg "[Step 1/4] Checking prerequisites..." "$YELLOW"

# Check Docker
if ! command -v docker &> /dev/null; then
    print_msg "Error: Docker is not installed" "$RED"
    print_msg "Install Docker: https://docs.docker.com/get-docker/" ""
    exit 1
fi

if ! docker info &> /dev/null; then
    print_msg "Error: Docker daemon is not running" "$RED"
    exit 1
fi

print_msg "  Docker is available" "$GREEN"

# Check Docker Compose
if ! docker compose version &> /dev/null; then
    print_msg "Error: Docker Compose v2 is not installed" "$RED"
    exit 1
fi

print_msg "  Docker Compose is available" "$GREEN"

# ==========================================
# Step 2: Build Base Images
# 步骤 2：构建基础镜像
# ==========================================
if [ "$SKIP_BASE" = true ]; then
    print_msg "" ""
    print_msg "[Step 2/4] Skipping base image build (--skip-base)" "$YELLOW"

    # Verify base images exist
    if ! docker image inspect cc-base:latest &> /dev/null; then
        print_msg "Error: cc-base:latest not found. Remove --skip-base to build it." "$RED"
        exit 1
    fi
    if ! docker image inspect cc-base:with-code-server &> /dev/null; then
        print_msg "Error: cc-base:with-code-server not found. Remove --skip-base to build it." "$RED"
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
# 步骤 3：配置环境变量
# ==========================================
print_msg "" ""
print_msg "[Step 3/4] Configuring environment..." "$YELLOW"

if [ ! -f ".env" ]; then
    print_msg "  Creating .env from template..." ""

    if [ ! -f ".env.example" ]; then
        print_msg "Error: .env.example not found" "$RED"
        exit 1
    fi

    cp .env.example .env

    # Generate secure keys
    print_msg "  Generating secure keys..." ""

    JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | base64 | tr -d '\n' | head -c 64)
    ENCRYPTION_KEY=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | base64 | tr -d '\n' | head -c 64)

    # Update .env with generated keys
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s/JWT_SECRET=.*/JWT_SECRET=${JWT_SECRET}/" .env
        sed -i '' "s/ENCRYPTION_KEY=.*/ENCRYPTION_KEY=${ENCRYPTION_KEY}/" .env
    else
        sed -i "s/JWT_SECRET=.*/JWT_SECRET=${JWT_SECRET}/" .env
        sed -i "s/ENCRYPTION_KEY=.*/ENCRYPTION_KEY=${ENCRYPTION_KEY}/" .env
    fi

    print_msg "  Secure keys generated" "$GREEN"
    print_msg "" ""
    print_msg "============================================" "$RED"
    print_msg "IMPORTANT: Please edit .env to set:" "$RED"
    print_msg "  - ADMIN_PASSWORD (required)" "$RED"
    print_msg "  - Your domain settings (optional)" "$RED"
    print_msg "============================================" "$RED"
    print_msg "" ""
    print_msg "Edit command: nano .env" "$YELLOW"
    print_msg "" ""

    read -p "Press Enter after you've configured .env, or Ctrl+C to cancel..."
fi

# Verify required environment variables
source .env

if [ -z "$ADMIN_PASSWORD" ] || [ "$ADMIN_PASSWORD" = "your_secure_password_here" ]; then
    print_msg "Error: ADMIN_PASSWORD is not set in .env" "$RED"
    print_msg "Please edit .env and set a secure password" "$YELLOW"
    exit 1
fi

if [ -z "$JWT_SECRET" ] || [ "$JWT_SECRET" = "your_jwt_secret_here_change_this" ]; then
    print_msg "Error: JWT_SECRET is not set properly in .env" "$RED"
    exit 1
fi

print_msg "  Environment configured" "$GREEN"

# ==========================================
# Step 4: Build and Start Services
# 步骤 4：构建并启动服务
# ==========================================
print_msg "" ""
print_msg "[Step 4/4] Building and starting services..." "$YELLOW"

BUILD_ARGS=""
if [ "$CLEAN_BUILD" = true ]; then
    print_msg "  Cleaning up old containers..." ""
    docker compose down -v --remove-orphans 2>/dev/null || true
    BUILD_ARGS="--no-cache"
fi

docker compose up -d --build $BUILD_ARGS

# Wait for services
print_msg "  Waiting for services to start..." ""
sleep 5

# Check service status
print_header "Service Status"
docker compose ps

# Get configuration
FRONTEND_PORT=$(grep -E "^FRONTEND_PORT=" .env 2>/dev/null | cut -d'=' -f2)
FRONTEND_PORT=${FRONTEND_PORT:-80}

print_header "Deployment Complete!"

print_msg "Platform URL: http://localhost:${FRONTEND_PORT}" "$GREEN"
print_msg "" ""
print_msg "Default credentials:" "$BLUE"
print_msg "  Username: ${ADMIN_USERNAME:-admin}" ""
print_msg "  Password: (as configured in .env)" ""
print_msg "" ""

# Check for base images
print_msg "Base images available:" "$BLUE"
docker images cc-base --format "  - {{.Repository}}:{{.Tag}} ({{.Size}})"
print_msg "" ""

print_msg "============================================" "$YELLOW"
print_msg "Next Steps:" "$YELLOW"
print_msg "============================================" "$YELLOW"
print_msg "" ""
print_msg "1. Access the platform at http://localhost:${FRONTEND_PORT}" ""
print_msg "" ""
print_msg "2. For production deployment with domain:" ""
print_msg "   - Configure nginx-host.conf on your server" ""
print_msg "   - Set up DNS records for your domain" ""
print_msg "   - Configure SSL with Let's Encrypt" ""
print_msg "" ""
print_msg "3. For code-server subdomain access:" ""
print_msg "   - Set CODE_SERVER_BASE_DOMAIN in .env" ""
print_msg "   - Configure wildcard DNS (*.code.example.com)" ""
print_msg "   - Set AUTO_START_TRAEFIK=true in .env" ""
print_msg "   - Restart: docker compose restart backend" ""
print_msg "" ""

print_msg "Useful commands:" "$YELLOW"
print_msg "  View logs:      docker compose logs -f" ""
print_msg "  Stop:           docker compose down" ""
print_msg "  Restart:        docker compose restart" ""
print_msg "  Rebuild:        docker compose up -d --build" ""
print_msg "  Rebuild base:   ./build-base.sh" ""
