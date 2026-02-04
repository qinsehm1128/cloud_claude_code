#!/bin/bash
# ============================================
# Quick Start Script for Docker Deployment
# Docker 部署快速启动脚本
# ============================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored message
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

# Check if running from correct directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

print_header "Claude Code Container Platform - Docker Deployment"

# Check Docker
if ! command -v docker &> /dev/null; then
    print_msg "Error: Docker is not installed" "$RED"
    exit 1
fi

if ! docker info &> /dev/null; then
    print_msg "Error: Docker daemon is not running" "$RED"
    exit 1
fi

print_msg "✓ Docker is available" "$GREEN"

# Check Docker Compose
if ! docker compose version &> /dev/null; then
    print_msg "Error: Docker Compose v2 is not installed" "$RED"
    exit 1
fi

print_msg "✓ Docker Compose is available" "$GREEN"

# Check .env file
if [ ! -f ".env" ]; then
    print_msg "Creating .env from template..." "$YELLOW"

    if [ ! -f ".env.example" ]; then
        print_msg "Error: .env.example not found" "$RED"
        exit 1
    fi

    cp .env.example .env

    # Generate secure keys
    print_msg "Generating secure keys..." "$YELLOW"

    JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | base64 | tr -d '\n' | head -c 64)
    ENCRYPTION_KEY=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | base64 | tr -d '\n' | head -c 64)

    # Update .env with generated keys
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s/JWT_SECRET=.*/JWT_SECRET=${JWT_SECRET}/" .env
        sed -i '' "s/ENCRYPTION_KEY=.*/ENCRYPTION_KEY=${ENCRYPTION_KEY}/" .env
    else
        # Linux
        sed -i "s/JWT_SECRET=.*/JWT_SECRET=${JWT_SECRET}/" .env
        sed -i "s/ENCRYPTION_KEY=.*/ENCRYPTION_KEY=${ENCRYPTION_KEY}/" .env
    fi

    print_msg "✓ Secure keys generated" "$GREEN"
    print_msg "" ""
    print_msg "IMPORTANT: Please edit .env to set ADMIN_PASSWORD" "$RED"
    print_msg "  nano .env" "$YELLOW"
    print_msg "" ""

    read -p "Press Enter after you've set the password, or Ctrl+C to cancel..."
fi

# Check required environment variables
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

print_msg "✓ Environment configured" "$GREEN"

# Build and start
print_header "Building and Starting Services"

docker compose up -d --build

# Wait for services to be healthy
print_msg "Waiting for services to start..." "$YELLOW"
sleep 5

# Check service status
print_header "Service Status"
docker compose ps

# Get frontend port
FRONTEND_PORT=$(grep -E "^FRONTEND_PORT=" .env | cut -d'=' -f2)
FRONTEND_PORT=${FRONTEND_PORT:-80}

print_header "Deployment Complete!"
print_msg "Access the platform at: http://localhost:${FRONTEND_PORT}" "$GREEN"
print_msg "" ""
print_msg "Default credentials:" "$BLUE"
print_msg "  Username: ${ADMIN_USERNAME:-admin}" "$BLUE"
print_msg "  Password: (as configured in .env)" "$BLUE"
print_msg "" ""
print_msg "Useful commands:" "$YELLOW"
print_msg "  View logs:     docker compose logs -f" "$NC"
print_msg "  Stop:          docker compose down" "$NC"
print_msg "  Restart:       docker compose restart" "$NC"
print_msg "  Rebuild:       docker compose up -d --build" "$NC"
