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
NC='\033[0m' # No Color

# Process IDs
BACKEND_PID=""
FRONTEND_PID=""

# Configuration
BACKEND_PORT=${BACKEND_PORT:-8080}
FRONTEND_PORT=${FRONTEND_PORT:-3000}
LOG_DIR="$SCRIPT_DIR/logs"

# Parse command line arguments
SKIP_DEPS=false
BUILD_ONLY=false
BACKEND_ONLY=false
FRONTEND_ONLY=false
AUTO_INSTALL=false

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
        -h|--help)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --skip-deps      Skip dependency installation"
            echo "  --build          Build only, don't start servers"
            echo "  --backend        Start backend only"
            echo "  --frontend       Start frontend only"
            echo "  --auto-install   Auto install missing tools (Go, Node.js)"
            echo "  -y               Same as --auto-install"
            echo "  -h, --help       Show this help message"
            echo ""
            echo "Environment variables:"
            echo "  BACKEND_PORT   Backend server port (default: 8080)"
            echo "  FRONTEND_PORT  Frontend dev server port (default: 3000)"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if a port is in use
check_port() {
    local port=$1
    if command -v lsof &> /dev/null; then
        lsof -i :$port &> /dev/null && return 0 || return 1
    elif command -v netstat &> /dev/null; then
        netstat -tuln | grep -q ":$port " && return 0 || return 1
    elif command -v ss &> /dev/null; then
        ss -tuln | grep -q ":$port " && return 0 || return 1
    fi
    return 1
}

# Detect OS and architecture
detect_platform() {
    OS=$(uname -s | tr '[:upper:]' '[:lower:]')
    ARCH=$(uname -m)
    
    case $ARCH in
        x86_64|amd64)
            ARCH="amd64"
            ;;
        aarch64|arm64)
            ARCH="arm64"
            ;;
        armv7l|armv6l)
            ARCH="armv6l"
            ;;
        *)
            log_error "Unsupported architecture: $ARCH"
            exit 1
            ;;
    esac
    
    case $OS in
        linux)
            OS="linux"
            ;;
        darwin)
            OS="darwin"
            ;;
        *)
            log_error "Unsupported OS: $OS"
            exit 1
            ;;
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
    
    # Check if we have sudo access
    if [ "$EUID" -ne 0 ]; then
        if ! command -v sudo &> /dev/null; then
            log_error "Need root privileges to install Go. Please run as root or install sudo."
            exit 1
        fi
        SUDO="sudo"
    else
        SUDO=""
    fi
    
    # Download Go
    log_info "Downloading from $GO_URL..."
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
    
    # Remove old Go installation if exists
    if [ -d "$INSTALL_DIR/go" ]; then
        log_info "Removing old Go installation..."
        $SUDO rm -rf "$INSTALL_DIR/go"
    fi
    
    # Extract Go
    log_info "Extracting to $INSTALL_DIR..."
    $SUDO tar -C "$INSTALL_DIR" -xzf "$TMP_DIR/$GO_TAR"
    
    # Cleanup
    rm -rf "$TMP_DIR"
    
    # Setup PATH
    GO_BIN="$INSTALL_DIR/go/bin"
    
    # Add to current session
    export PATH="$GO_BIN:$PATH"
    
    # Add to shell profile
    local PROFILE=""
    if [ -f "$HOME/.bashrc" ]; then
        PROFILE="$HOME/.bashrc"
    elif [ -f "$HOME/.zshrc" ]; then
        PROFILE="$HOME/.zshrc"
    elif [ -f "$HOME/.profile" ]; then
        PROFILE="$HOME/.profile"
    fi
    
    if [ -n "$PROFILE" ]; then
        if ! grep -q "$GO_BIN" "$PROFILE" 2>/dev/null; then
            echo "" >> "$PROFILE"
            echo "# Go installation" >> "$PROFILE"
            echo "export PATH=\"$GO_BIN:\$PATH\"" >> "$PROFILE"
            log_info "Added Go to PATH in $PROFILE"
        fi
    fi
    
    # Verify installation
    if command -v go &> /dev/null; then
        local installed_version=$(go version | awk '{print $3}' | sed 's/go//')
        log_success "Go $installed_version installed successfully"
    else
        # Try with full path
        if [ -x "$GO_BIN/go" ]; then
            local installed_version=$("$GO_BIN/go" version | awk '{print $3}' | sed 's/go//')
            log_success "Go $installed_version installed successfully"
            log_warn "Please restart your terminal or run: source $PROFILE"
        else
            log_error "Go installation failed"
            exit 1
        fi
    fi
}

# Install Node.js
install_node() {
    local NODE_VERSION="20"
    
    detect_platform
    
    log_info "Installing Node.js $NODE_VERSION..."
    
    # Check if we have sudo access
    if [ "$EUID" -ne 0 ]; then
        if ! command -v sudo &> /dev/null; then
            log_error "Need root privileges to install Node.js. Please run as root or install sudo."
            exit 1
        fi
        SUDO="sudo"
    else
        SUDO=""
    fi
    
    if [ "$OS" = "linux" ]; then
        # Use NodeSource for Linux
        if command -v apt-get &> /dev/null; then
            log_info "Using apt (Debian/Ubuntu)..."
            $SUDO apt-get update
            $SUDO apt-get install -y ca-certificates curl gnupg
            $SUDO mkdir -p /etc/apt/keyrings
            curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | $SUDO gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
            echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_VERSION.x nodistro main" | $SUDO tee /etc/apt/sources.list.d/nodesource.list
            $SUDO apt-get update
            $SUDO apt-get install -y nodejs
        elif command -v yum &> /dev/null; then
            log_info "Using yum (RHEL/CentOS)..."
            curl -fsSL https://rpm.nodesource.com/setup_$NODE_VERSION.x | $SUDO bash -
            $SUDO yum install -y nodejs
        elif command -v dnf &> /dev/null; then
            log_info "Using dnf (Fedora)..."
            curl -fsSL https://rpm.nodesource.com/setup_$NODE_VERSION.x | $SUDO bash -
            $SUDO dnf install -y nodejs
        else
            log_error "Unsupported package manager. Please install Node.js manually."
            exit 1
        fi
    elif [ "$OS" = "darwin" ]; then
        if command -v brew &> /dev/null; then
            log_info "Using Homebrew..."
            brew install node@$NODE_VERSION
        else
            log_error "Please install Homebrew first: https://brew.sh"
            exit 1
        fi
    fi
    
    # Verify installation
    if command -v node &> /dev/null; then
        local installed_version=$(node --version)
        log_success "Node.js $installed_version installed successfully"
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
        log_info "Auto-installing $tool..."
        $install_func
        return 0
    fi
    
    echo ""
    read -p "Would you like to install $tool automatically? [y/N] " -n 1 -r
    echo ""
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        $install_func
        return 0
    else
        return 1
    fi
}

# Check if required tools are installed
check_requirements() {
    log_info "Checking requirements..."
    
    local missing=()
    local can_install=()
    
    if ! command -v go &> /dev/null; then
        missing+=("go")
        can_install+=("go")
    else
        local go_version=$(go version | awk '{print $3}' | sed 's/go//')
        log_success "Go $go_version"
    fi
    
    if ! command -v node &> /dev/null; then
        missing+=("node")
        can_install+=("node")
    else
        local node_version=$(node --version)
        log_success "Node.js $node_version"
    fi
    
    if ! command -v npm &> /dev/null; then
        missing+=("npm")
    else
        local npm_version=$(npm --version)
        log_success "npm $npm_version"
    fi
    
    if ! command -v docker &> /dev/null; then
        log_warn "Docker is not installed (optional, required for container features)"
    else
        local docker_version=$(docker --version | awk '{print $3}' | sed 's/,//')
        log_success "Docker $docker_version"
        
        # Check if Docker daemon is running
        if ! docker info &> /dev/null; then
            log_warn "Docker daemon is not running"
        fi
    fi
    
    # Handle missing tools
    if [ ${#missing[@]} -ne 0 ]; then
        log_error "Missing required tools: ${missing[*]}"
        echo ""
        
        # Try to install missing tools
        for tool in "${can_install[@]}"; do
            case $tool in
                go)
                    if prompt_install "Go" install_go; then
                        # Remove from missing array
                        missing=("${missing[@]/go}")
                    fi
                    ;;
                node)
                    if prompt_install "Node.js" install_node; then
                        # Remove from missing array
                        missing=("${missing[@]/node}")
                        missing=("${missing[@]/npm}")
                    fi
                    ;;
            esac
        done
        
        # Check if still missing
        missing=($(echo "${missing[@]}" | tr ' ' '\n' | grep -v '^$'))
        
        if [ ${#missing[@]} -ne 0 ]; then
            echo ""
            log_error "Still missing: ${missing[*]}"
            echo ""
            echo "Please install manually:"
            for tool in "${missing[@]}"; do
                case $tool in
                    go)
                        echo "  - Go: https://golang.org/dl/"
                        ;;
                    node|npm)
                        echo "  - Node.js: https://nodejs.org/"
                        ;;
                esac
            done
            exit 1
        fi
    fi
    
    log_success "All requirements satisfied"
}

# Check if ports are available
check_ports() {
    log_info "Checking port availability..."
    
    if ! $FRONTEND_ONLY && check_port $BACKEND_PORT; then
        log_error "Port $BACKEND_PORT is already in use"
        echo "  Try: lsof -i :$BACKEND_PORT"
        exit 1
    fi
    
    if ! $BACKEND_ONLY && check_port $FRONTEND_PORT; then
        log_error "Port $FRONTEND_PORT is already in use"
        echo "  Try: lsof -i :$FRONTEND_PORT"
        exit 1
    fi
    
    log_success "Ports are available"
}

# Setup environment file
setup_env() {
    if [ ! -f ".env" ]; then
        if [ -f ".env.example" ]; then
            log_info "Creating .env from .env.example..."
            cp .env.example .env
            log_success ".env file created"
            log_warn "Please review and update .env with your settings"
        else
            log_warn "No .env file found, using defaults"
        fi
    else
        log_success ".env file exists"
    fi
}

# Create log directory
setup_logs() {
    if [ ! -d "$LOG_DIR" ]; then
        mkdir -p "$LOG_DIR"
        log_success "Created log directory: $LOG_DIR"
    fi
}

# Install backend dependencies
setup_backend() {
    log_info "Setting up backend..."
    
    if [ ! -d "backend" ]; then
        log_error "Backend directory not found"
        exit 1
    fi
    
    cd backend
    
    if [ "$SKIP_DEPS" = false ]; then
        log_info "Downloading Go modules..."
        go mod download
        go mod tidy
    fi
    
    # Build to check for errors
    log_info "Building backend..."
    go build -o ../bin/server ./cmd/server
    
    cd ..
    log_success "Backend setup complete"
}

# Install frontend dependencies
setup_frontend() {
    log_info "Setting up frontend..."
    
    if [ ! -d "frontend" ]; then
        log_error "Frontend directory not found"
        exit 1
    fi
    
    cd frontend
    
    if [ "$SKIP_DEPS" = false ]; then
        if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules" ]; then
            log_info "Installing npm packages..."
            npm install
        else
            log_info "npm packages up to date"
        fi
    fi
    
    cd ..
    log_success "Frontend setup complete"
}

# Build Docker base images
build_docker_images() {
    if command -v docker &> /dev/null && docker info &> /dev/null; then
        log_info "Checking Docker base images..."
        
        if ! docker image inspect cc-base:latest &> /dev/null; then
            log_warn "Base image not found. Build with: ./docker/build-base.sh"
        else
            log_success "Docker base images exist"
        fi
    fi
}

# Start backend server
start_backend() {
    log_info "Starting backend server on port $BACKEND_PORT..."
    
    cd backend
    
    # Use built binary if exists, otherwise use go run
    if [ -f "../bin/server" ]; then
        PORT=$BACKEND_PORT ../bin/server > "$LOG_DIR/backend.log" 2>&1 &
    else
        PORT=$BACKEND_PORT go run ./cmd/server > "$LOG_DIR/backend.log" 2>&1 &
    fi
    
    BACKEND_PID=$!
    cd ..
    
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
    
    log_error "Backend failed to start. Check logs: $LOG_DIR/backend.log"
    cat "$LOG_DIR/backend.log" | tail -20
    exit 1
}

# Start frontend dev server
start_frontend() {
    log_info "Starting frontend dev server on port $FRONTEND_PORT..."
    
    cd frontend
    VITE_PORT=$FRONTEND_PORT npm run dev > "$LOG_DIR/frontend.log" 2>&1 &
    FRONTEND_PID=$!
    cd ..
    
    # Wait for frontend to start
    local retries=30
    while [ $retries -gt 0 ]; do
        if check_port $FRONTEND_PORT; then
            log_success "Frontend started (PID: $FRONTEND_PID)"
            return 0
        fi
        sleep 1
        retries=$((retries - 1))
    done
    
    log_error "Frontend failed to start. Check logs: $LOG_DIR/frontend.log"
    cat "$LOG_DIR/frontend.log" | tail -20
    exit 1
}

# Cleanup function
cleanup() {
    echo ""
    log_info "Shutting down services..."
    
    if [ ! -z "$BACKEND_PID" ] && kill -0 $BACKEND_PID 2>/dev/null; then
        kill $BACKEND_PID 2>/dev/null || true
        log_success "Backend stopped"
    fi
    
    if [ ! -z "$FRONTEND_PID" ] && kill -0 $FRONTEND_PID 2>/dev/null; then
        kill $FRONTEND_PID 2>/dev/null || true
        log_success "Frontend stopped"
    fi
    
    # Kill any remaining child processes
    jobs -p | xargs -r kill 2>/dev/null || true
    
    log_success "All services stopped"
    exit 0
}

# Show status
show_status() {
    echo ""
    echo "=========================================="
    echo -e "${GREEN}  Services are running!${NC}"
    echo "=========================================="
    echo ""
    
    if [ -z "$FRONTEND_ONLY" ] || [ "$FRONTEND_ONLY" = false ]; then
        echo -e "  Backend API:  ${BLUE}http://localhost:$BACKEND_PORT${NC}"
    fi
    
    if [ -z "$BACKEND_ONLY" ] || [ "$BACKEND_ONLY" = false ]; then
        echo -e "  Frontend:     ${BLUE}http://localhost:$FRONTEND_PORT${NC}"
    fi
    
    echo ""
    echo "  Logs:         $LOG_DIR/"
    echo ""
    echo "  Press Ctrl+C to stop all services"
    echo "=========================================="
}

# Trap SIGINT and SIGTERM
trap cleanup SIGINT SIGTERM

# Main execution
main() {
    check_requirements
    setup_env
    setup_logs
    
    if ! $FRONTEND_ONLY; then
        setup_backend
    fi
    
    if ! $BACKEND_ONLY; then
        setup_frontend
    fi
    
    build_docker_images
    
    if [ "$BUILD_ONLY" = true ]; then
        log_success "Build complete!"
        exit 0
    fi
    
    check_ports
    
    echo ""
    echo "=========================================="
    echo "  Starting Services"
    echo "=========================================="
    
    if ! $FRONTEND_ONLY; then
        start_backend
    fi
    
    if ! $BACKEND_ONLY; then
        start_frontend
    fi
    
    show_status
    
    # Wait for processes
    wait
}

main
