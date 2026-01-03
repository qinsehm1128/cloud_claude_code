#!/bin/bash

# Claude Code Container Platform - Development Startup Script
# 开发环境启动脚本

set -e

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=========================================="
echo "  Claude Code Container Platform"
echo "  Development Environment Startup"
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Process IDs
BACKEND_PID=""
FRONTEND_PID=""

# Default configuration
BACKEND_PORT=${BACKEND_PORT:-8080}
FRONTEND_PORT=${FRONTEND_PORT:-3000}
FRONTEND_DEPLOY_DIR=""

# Parse command line arguments
SKIP_DEPS=false
BUILD_ONLY=false
BACKEND_ONLY=false
FRONTEND_ONLY=false
AUTO_INSTALL=false
PROD_MODE=false  # 生产模式：打包前端 + 运行后端

show_help() {
    cat << EOF
Usage: $0 [options]

Development Mode (default):
  --backend            Start backend only (go run)
  --frontend           Start frontend dev server only (vite)
  --skip-deps          Skip dependency installation

Production-like Mode:
  --prod               Build frontend, deploy to dir, run backend directly
  --deploy-dir DIR     Frontend deploy directory (required with --prod)

Build Options:
  --build              Build only, don't start servers
  --auto-install, -y   Auto install missing tools (Go, Node.js)

Other:
  -h, --help           Show this help message

Environment Variables:
  BACKEND_PORT         Backend server port (default: 8080)
  FRONTEND_PORT        Frontend dev server port (default: 3000)

Examples:
  $0                                    # Start both frontend dev + backend
  $0 --backend                          # Start backend only
  $0 --prod --deploy-dir /var/www/mysite  # Build frontend, run backend

EOF
}

while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-deps)
            SKIP_DEPS=true
            shift
            ;;
        --build)
            BUILD_ONLY=true
            shift
            ;;
        --backend)
            BACKEND_ONLY=true
            shift
            ;;
        --frontend)
            FRONTEND_ONLY=true
            shift
            ;;
        --auto-install|-y)
            AUTO_INSTALL=true
            shift
            ;;
        --prod)
            PROD_MODE=true
            BACKEND_ONLY=true
            shift
            ;;
        --deploy-dir)
            FRONTEND_DEPLOY_DIR="$2"
            shift 2
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            show_help
            exit 1
            ;;
    esac
done

# Logging functions
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Load configuration from .env file
load_env_config() {
    local env_file="$SCRIPT_DIR/.env"
    
    if [ -f "$env_file" ]; then
        log_info "Loading configuration from .env..."
        
        local port=$(grep -E "^PORT=" "$env_file" | cut -d'=' -f2 | tr -d '"' | tr -d "'" | tr -d ' ')
        [ -n "$port" ] && BACKEND_PORT=$port
        
        local frontend_port=$(grep -E "^FRONTEND_PORT=" "$env_file" | cut -d'=' -f2 | tr -d '"' | tr -d "'" | tr -d ' ')
        [ -n "$frontend_port" ] && FRONTEND_PORT=$frontend_port
    fi
}

# Check if a port is in use
check_port() {
    local port=$1
    if command -v lsof &> /dev/null; then
        lsof -i :$port &> /dev/null && return 0 || return 1
    elif command -v ss &> /dev/null; then
        ss -tuln | grep -q ":$port " && return 0 || return 1
    elif command -v netstat &> /dev/null; then
        netstat -tuln | grep -q ":$port " && return 0 || return 1
    fi
    return 1
}

# Detect OS and architecture
detect_platform() {
    OS=$(uname -s | tr '[:upper:]' '[:lower:]')
    ARCH=$(uname -m)
    
    case $ARCH in
        x86_64|amd64) ARCH="amd64" ;;
        aarch64|arm64) ARCH="arm64" ;;
        armv7l|armv6l) ARCH="armv6l" ;;
        *) log_error "Unsupported architecture: $ARCH"; exit 1 ;;
    esac
    
    case $OS in
        linux) OS="linux" ;;
        darwin) OS="darwin" ;;
        *) log_error "Unsupported OS: $OS"; exit 1 ;;
    esac
}

# Install Go
install_go() {
    local GO_VERSION="1.22.5"
    detect_platform
    
    log_info "Installing Go $GO_VERSION for $OS/$ARCH..."
    
    local GO_TAR="go${GO_VERSION}.${OS}-${ARCH}.tar.gz"
    local GO_URL="https://go.dev/dl/${GO_TAR}"
    local INSTALL_DIR="/usr/local"
    
    [ "$EUID" -ne 0 ] && SUDO="sudo" || SUDO=""
    
    local TMP_DIR=$(mktemp -d)
    
    if command -v wget &> /dev/null; then
        wget -q --show-progress -O "$TMP_DIR/$GO_TAR" "$GO_URL"
    elif command -v curl &> /dev/null; then
        curl -L --progress-bar -o "$TMP_DIR/$GO_TAR" "$GO_URL"
    else
        log_error "Neither wget nor curl is available"
        rm -rf "$TMP_DIR"
        exit 1
    fi
    
    [ -d "$INSTALL_DIR/go" ] && $SUDO rm -rf "$INSTALL_DIR/go"
    $SUDO tar -C "$INSTALL_DIR" -xzf "$TMP_DIR/$GO_TAR"
    rm -rf "$TMP_DIR"
    
    export PATH="$INSTALL_DIR/go/bin:$PATH"
    
    if command -v go &> /dev/null; then
        log_success "Go $(go version | awk '{print $3}' | sed 's/go//') installed"
    else
        log_error "Go installation failed"
        exit 1
    fi
}

# Install Node.js
install_node() {
    local NODE_VERSION="20"
    detect_platform
    
    log_info "Installing Node.js $NODE_VERSION..."
    
    [ "$EUID" -ne 0 ] && SUDO="sudo" || SUDO=""
    
    if [ "$OS" = "linux" ]; then
        if command -v apt-get &> /dev/null; then
            $SUDO apt-get update
            $SUDO apt-get install -y ca-certificates curl gnupg
            $SUDO mkdir -p /etc/apt/keyrings
            curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | $SUDO gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
            echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_VERSION.x nodistro main" | $SUDO tee /etc/apt/sources.list.d/nodesource.list
            $SUDO apt-get update
            $SUDO apt-get install -y nodejs
        elif command -v yum &> /dev/null; then
            curl -fsSL https://rpm.nodesource.com/setup_$NODE_VERSION.x | $SUDO bash -
            $SUDO yum install -y nodejs
        else
            log_error "Unsupported package manager"
            exit 1
        fi
    elif [ "$OS" = "darwin" ]; then
        brew install node@$NODE_VERSION
    fi
    
    if command -v node &> /dev/null; then
        log_success "Node.js $(node --version) installed"
    else
        log_error "Node.js installation failed"
        exit 1
    fi
}

# Prompt for installation
prompt_install() {
    local tool=$1
    local install_func=$2
    
    if [ "$AUTO_INSTALL" = true ]; then
        $install_func
        return 0
    fi
    
    read -p "Install $tool automatically? [y/N] " -n 1 -r
    echo
    [[ $REPLY =~ ^[Yy]$ ]] && $install_func && return 0
    return 1
}

# Check requirements
check_requirements() {
    log_info "Checking requirements..."
    
    local missing=()
    
    if ! command -v go &> /dev/null; then
        missing+=("go")
    else
        log_success "Go $(go version | awk '{print $3}' | sed 's/go//')"
    fi
    
    if ! command -v node &> /dev/null; then
        missing+=("node")
    else
        log_success "Node.js $(node --version)"
    fi
    
    if ! command -v npm &> /dev/null; then
        missing+=("npm")
    else
        log_success "npm $(npm --version)"
    fi
    
    if command -v docker &> /dev/null; then
        log_success "Docker $(docker --version | awk '{print $3}' | sed 's/,//')"
    else
        log_warn "Docker not installed (optional)"
    fi
    
    # Install missing tools
    for tool in "${missing[@]}"; do
        case $tool in
            go) prompt_install "Go" install_go || { log_error "Go is required"; exit 1; } ;;
            node|npm) prompt_install "Node.js" install_node || { log_error "Node.js is required"; exit 1; } ;;
        esac
    done
    
    log_success "All requirements satisfied"
}

# Setup environment file
setup_env() {
    if [ ! -f ".env" ] && [ -f ".env.example" ]; then
        log_info "Creating .env from .env.example..."
        cp .env.example .env
        log_warn "Please review .env settings"
    fi
}

# Build frontend
build_frontend() {
    log_info "Building frontend..."
    
    cd "$SCRIPT_DIR/frontend"
    
    if [ "$SKIP_DEPS" = false ]; then
        if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules" ]; then
            log_info "Installing npm packages..."
            npm install
        fi
    fi
    
    npm run build
    
    cd "$SCRIPT_DIR"
    
    if [ -d "frontend/dist" ]; then
        log_success "Frontend build complete"
    else
        log_error "Frontend build failed"
        exit 1
    fi
}

# Deploy frontend to directory
deploy_frontend() {
    local target_dir="$1"
    
    if [ -z "$target_dir" ]; then
        log_error "Deploy directory not specified"
        exit 1
    fi
    
    log_info "Deploying frontend to $target_dir..."
    
    # Create directory if not exists
    if [ ! -d "$target_dir" ]; then
        sudo mkdir -p "$target_dir"
    fi
    
    # Copy files
    sudo cp -r frontend/dist/* "$target_dir/"
    
    log_success "Frontend deployed to $target_dir"
}

# Setup backend
setup_backend() {
    log_info "Setting up backend..."
    
    cd "$SCRIPT_DIR/backend"
    
    if [ "$SKIP_DEPS" = false ]; then
        log_info "Downloading Go modules..."
        go mod download
        go mod tidy
    fi
    
    cd "$SCRIPT_DIR"
    log_success "Backend setup complete"
}

# Start backend server (go run, not binary)
start_backend() {
    log_info "Starting backend on port $BACKEND_PORT..."
    
    cd "$SCRIPT_DIR/backend"
    
    # Run directly with go run
    PORT=$BACKEND_PORT go run ./cmd/server &
    BACKEND_PID=$!
    
    cd "$SCRIPT_DIR"
    
    # Wait for backend to start
    local retries=30
    while [ $retries -gt 0 ]; do
        if check_port $BACKEND_PORT; then
            log_success "Backend started (PID: $BACKEND_PID)"
            return 0
        fi
        sleep 1
        retries=$((retries - 1))
    done
    
    log_error "Backend failed to start"
    exit 1
}

# Start frontend dev server
start_frontend() {
    log_info "Starting frontend dev server on port $FRONTEND_PORT..."
    
    cd "$SCRIPT_DIR/frontend"
    
    if [ "$SKIP_DEPS" = false ]; then
        if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules" ]; then
            log_info "Installing npm packages..."
            npm install
        fi
    fi
    
    VITE_PORT=$FRONTEND_PORT npm run dev &
    FRONTEND_PID=$!
    
    cd "$SCRIPT_DIR"
    
    local retries=30
    while [ $retries -gt 0 ]; do
        if check_port $FRONTEND_PORT; then
            log_success "Frontend started (PID: $FRONTEND_PID)"
            return 0
        fi
        sleep 1
        retries=$((retries - 1))
    done
    
    log_error "Frontend failed to start"
    exit 1
}

# Cleanup
cleanup() {
    echo ""
    log_info "Shutting down..."
    
    [ -n "$BACKEND_PID" ] && kill $BACKEND_PID 2>/dev/null && log_success "Backend stopped"
    [ -n "$FRONTEND_PID" ] && kill $FRONTEND_PID 2>/dev/null && log_success "Frontend stopped"
    
    jobs -p | xargs -r kill 2>/dev/null || true
    exit 0
}

# Show status
show_status() {
    echo ""
    echo "=========================================="
    echo -e "${GREEN}  Services are running!${NC}"
    echo "=========================================="
    echo ""
    
    if [ "$FRONTEND_ONLY" != true ]; then
        echo -e "  Backend:  ${BLUE}http://0.0.0.0:$BACKEND_PORT${NC}"
    fi
    
    if [ "$BACKEND_ONLY" != true ]; then
        echo -e "  Frontend: ${BLUE}http://0.0.0.0:$FRONTEND_PORT${NC}"
    fi
    
    if [ -n "$FRONTEND_DEPLOY_DIR" ]; then
        echo -e "  Static:   ${BLUE}$FRONTEND_DEPLOY_DIR${NC}"
    fi
    
    echo ""
    echo "  Press Ctrl+C to stop"
    echo "=========================================="
}

trap cleanup SIGINT SIGTERM

# Main
main() {
    load_env_config
    check_requirements
    setup_env
    
    # Production mode: build frontend, deploy, run backend
    if [ "$PROD_MODE" = true ]; then
        if [ -z "$FRONTEND_DEPLOY_DIR" ]; then
            log_error "--prod requires --deploy-dir"
            echo "Example: $0 --prod --deploy-dir /var/www/mysite"
            exit 1
        fi
        
        build_frontend
        deploy_frontend "$FRONTEND_DEPLOY_DIR"
        setup_backend
        
        if [ "$BUILD_ONLY" = true ]; then
            log_success "Build and deploy complete!"
            exit 0
        fi
        
        if check_port $BACKEND_PORT; then
            log_error "Port $BACKEND_PORT is already in use"
            exit 1
        fi
        
        echo ""
        echo "=========================================="
        echo "  Starting Backend (Production Mode)"
        echo "=========================================="
        
        start_backend
        show_status
        wait
        exit 0
    fi
    
    # Development mode
    if [ "$BUILD_ONLY" = true ]; then
        [ "$FRONTEND_ONLY" != true ] && setup_backend
        [ "$BACKEND_ONLY" != true ] && build_frontend
        log_success "Build complete!"
        exit 0
    fi
    
    # Check ports
    if [ "$FRONTEND_ONLY" != true ] && check_port $BACKEND_PORT; then
        log_error "Port $BACKEND_PORT is already in use"
        exit 1
    fi
    
    if [ "$BACKEND_ONLY" != true ] && check_port $FRONTEND_PORT; then
        log_error "Port $FRONTEND_PORT is already in use"
        exit 1
    fi
    
    # Setup
    [ "$FRONTEND_ONLY" != true ] && setup_backend
    
    echo ""
    echo "=========================================="
    echo "  Starting Services (Development Mode)"
    echo "=========================================="
    
    # Start services
    [ "$FRONTEND_ONLY" != true ] && start_backend
    [ "$BACKEND_ONLY" != true ] && start_frontend
    
    show_status
    wait
}

main
