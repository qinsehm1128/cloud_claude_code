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
        -h|--help)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --skip-deps    Skip dependency installation"
            echo "  --build        Build only, don't start servers"
            echo "  --backend      Start backend only"
            echo "  --frontend     Start frontend only"
            echo "  -h, --help     Show this help message"
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

# Check if required tools are installed
check_requirements() {
    log_info "Checking requirements..."
    
    local missing=()
    
    if ! command -v go &> /dev/null; then
        missing+=("go")
    else
        local go_version=$(go version | awk '{print $3}' | sed 's/go//')
        log_success "Go $go_version"
    fi
    
    if ! command -v node &> /dev/null; then
        missing+=("node")
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
    
    if [ ${#missing[@]} -ne 0 ]; then
        log_error "Missing required tools: ${missing[*]}"
        echo ""
        echo "Please install the missing tools:"
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
