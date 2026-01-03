#!/bin/bash

# Claude Code Container Platform - Build & Deploy Script
# 构建和部署脚本 - 支持前后端分离部署

set -e

# ============================================
# 默认配置 - 可通过参数或环境变量覆盖
# ============================================

# 前端部署目录 (nginx root)
FRONTEND_DIR="${FRONTEND_DIR:-/var/www/example.com}"

# 后端部署目录 (可执行文件和配置)
BACKEND_DIR="${BACKEND_DIR:-/opt/cc-platform}"

# 后端二进制文件名
BACKEND_BINARY="cc-server"

# 服务名称
SERVICE_NAME="cc-platform"

# ============================================
# 颜色定义
# ============================================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# ============================================
# 日志函数
# ============================================
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# ============================================
# 帮助信息
# ============================================
show_help() {
    cat << EOF
Usage: $0 [options]

Build Options:
  --build              Build frontend and backend
  --frontend           Build frontend only
  --backend            Build backend only
  --clean              Clean build artifacts

Deploy Options:
  --install            Install files to deploy directories
  --frontend-dir DIR   Frontend deploy directory (default: $FRONTEND_DIR)
  --backend-dir DIR    Backend deploy directory (default: $BACKEND_DIR)

Service Options:
  --setup-service      Generate and install systemd service
  --enable-service     Enable service to start on boot
  --start-service      Start the backend service
  --stop-service       Stop the backend service
  --restart-service    Restart the backend service
  --status             Show service status

Combined:
  --deploy             Build + Install + Setup service
  --full-deploy        Build + Install + Setup + Enable + Start service

Other:
  -h, --help           Show this help message

Environment Variables:
  FRONTEND_DIR         Frontend deploy directory
  BACKEND_DIR          Backend deploy directory

Examples:
  $0 --build                              # Build all
  $0 --deploy                             # Full deployment
  $0 --frontend --install                 # Build and install frontend only
  $0 --backend-dir /opt/myapp --deploy    # Deploy to custom backend directory
  $0 --setup-service --enable-service     # Setup and enable systemd service

EOF
}

# ============================================
# 参数解析
# ============================================
BUILD_FRONTEND=false
BUILD_BACKEND=false
DO_INSTALL=false
DO_CLEAN=false
SETUP_SERVICE=false
ENABLE_SERVICE=false
START_SERVICE=false
STOP_SERVICE=false
RESTART_SERVICE=false
SHOW_STATUS=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --build)
            BUILD_FRONTEND=true
            BUILD_BACKEND=true
            shift
            ;;
        --frontend)
            BUILD_FRONTEND=true
            shift
            ;;
        --backend)
            BUILD_BACKEND=true
            shift
            ;;
        --install)
            DO_INSTALL=true
            shift
            ;;
        --frontend-dir)
            FRONTEND_DIR="$2"
            shift 2
            ;;
        --backend-dir)
            BACKEND_DIR="$2"
            shift 2
            ;;
        --setup-service)
            SETUP_SERVICE=true
            shift
            ;;
        --enable-service)
            ENABLE_SERVICE=true
            shift
            ;;
        --start-service)
            START_SERVICE=true
            shift
            ;;
        --stop-service)
            STOP_SERVICE=true
            shift
            ;;
        --restart-service)
            RESTART_SERVICE=true
            shift
            ;;
        --status)
            SHOW_STATUS=true
            shift
            ;;
        --deploy)
            BUILD_FRONTEND=true
            BUILD_BACKEND=true
            DO_INSTALL=true
            SETUP_SERVICE=true
            shift
            ;;
        --full-deploy)
            BUILD_FRONTEND=true
            BUILD_BACKEND=true
            DO_INSTALL=true
            SETUP_SERVICE=true
            ENABLE_SERVICE=true
            START_SERVICE=true
            shift
            ;;
        --clean)
            DO_CLEAN=true
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# 如果没有指定任何操作，显示帮助
if ! $BUILD_FRONTEND && ! $BUILD_BACKEND && ! $DO_CLEAN && \
   ! $SETUP_SERVICE && ! $ENABLE_SERVICE && ! $START_SERVICE && \
   ! $STOP_SERVICE && ! $RESTART_SERVICE && ! $SHOW_STATUS && ! $DO_INSTALL; then
    show_help
    exit 0
fi

# ============================================
# 脚本目录
# ============================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ============================================
# 服务状态
# ============================================
if $SHOW_STATUS; then
    if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
        log_success "Service $SERVICE_NAME is running"
        systemctl status "$SERVICE_NAME" --no-pager
    else
        log_warn "Service $SERVICE_NAME is not running"
    fi
    exit 0
fi

# ============================================
# 停止服务
# ============================================
if $STOP_SERVICE; then
    log_info "Stopping $SERVICE_NAME..."
    sudo systemctl stop "$SERVICE_NAME" 2>/dev/null || true
    log_success "Service stopped"
    if ! $START_SERVICE && ! $RESTART_SERVICE; then
        exit 0
    fi
fi

# ============================================
# 清理
# ============================================
if $DO_CLEAN; then
    log_info "Cleaning build artifacts..."
    rm -rf frontend/dist
    rm -rf bin
    rm -f backend/$BACKEND_BINARY
    log_success "Clean complete"
    
    if ! $BUILD_FRONTEND && ! $BUILD_BACKEND; then
        exit 0
    fi
fi

# ============================================
# 构建前端
# ============================================
build_frontend() {
    log_info "Building frontend..."
    
    cd "$SCRIPT_DIR/frontend"
    
    # 安装依赖
    if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules" ]; then
        log_info "Installing npm packages..."
        npm install
    fi
    
    # 构建
    npm run build
    
    cd "$SCRIPT_DIR"
    
    if [ -d "frontend/dist" ]; then
        log_success "Frontend build complete: frontend/dist"
    else
        log_error "Frontend build failed"
        exit 1
    fi
}

# ============================================
# 构建后端
# ============================================
build_backend() {
    log_info "Building backend..."
    
    cd "$SCRIPT_DIR/backend"
    
    # 下载依赖
    go mod download
    
    # 检测目标平台 - 默认构建 Linux 版本
    GOOS=${GOOS:-linux}
    GOARCH=${GOARCH:-amd64}
    
    log_info "Building for $GOOS/$GOARCH..."
    
    # 构建
    mkdir -p "$SCRIPT_DIR/bin"
    CGO_ENABLED=0 GOOS=$GOOS GOARCH=$GOARCH go build -ldflags="-s -w" -o "$SCRIPT_DIR/bin/$BACKEND_BINARY" ./cmd/server
    
    cd "$SCRIPT_DIR"
    
    if [ -f "bin/$BACKEND_BINARY" ]; then
        log_success "Backend build complete: bin/$BACKEND_BINARY"
    else
        log_error "Backend build failed"
        exit 1
    fi
}

# ============================================
# 安装文件
# ============================================
install_files() {
    log_info "Installing files..."
    log_info "  Frontend -> $FRONTEND_DIR"
    log_info "  Backend  -> $BACKEND_DIR"
    
    # 安装前端
    if $BUILD_FRONTEND && [ -d "frontend/dist" ]; then
        log_info "Installing frontend files..."
        
        # 创建目录
        sudo mkdir -p "$FRONTEND_DIR"
        
        # 复制文件
        sudo cp -r frontend/dist/* "$FRONTEND_DIR/"
        
        log_success "Frontend installed to $FRONTEND_DIR"
    fi
    
    # 安装后端
    if $BUILD_BACKEND && [ -f "bin/$BACKEND_BINARY" ]; then
        log_info "Installing backend files..."
        
        # 创建目录
        sudo mkdir -p "$BACKEND_DIR"
        sudo mkdir -p "$BACKEND_DIR/logs"
        sudo mkdir -p "$BACKEND_DIR/data"
        
        # 停止服务（如果正在运行）
        if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
            log_info "Stopping existing service..."
            sudo systemctl stop "$SERVICE_NAME"
        fi
        
        # 复制二进制文件
        sudo cp "bin/$BACKEND_BINARY" "$BACKEND_DIR/"
        sudo chmod +x "$BACKEND_DIR/$BACKEND_BINARY"
        
        # 复制配置文件（如果不存在）
        if [ ! -f "$BACKEND_DIR/.env" ]; then
            if [ -f ".env.example" ]; then
                sudo cp .env.example "$BACKEND_DIR/.env"
                log_warn "Created $BACKEND_DIR/.env - please edit with your settings"
            fi
        fi
        
        # 复制 docker 构建脚本
        sudo mkdir -p "$BACKEND_DIR/docker"
        sudo cp -r docker/* "$BACKEND_DIR/docker/" 2>/dev/null || true
        
        log_success "Backend installed to $BACKEND_DIR"
    fi
}

# ============================================
# 从 .env 读取配置
# ============================================
read_env_config() {
    local env_file="$BACKEND_DIR/.env"
    
    if [ -f "$env_file" ]; then
        # 读取 PORT
        ENV_PORT=$(grep -E "^PORT=" "$env_file" 2>/dev/null | cut -d'=' -f2 | tr -d '"' | tr -d "'" | tr -d ' ')
        ENV_PORT=${ENV_PORT:-8080}
    else
        ENV_PORT=8080
    fi
}

# ============================================
# 生成 systemd service 文件
# ============================================
generate_service() {
    log_info "Generating systemd service file..."
    
    read_env_config
    
    local service_file="/etc/systemd/system/${SERVICE_NAME}.service"
    
    sudo tee "$service_file" > /dev/null << EOF
[Unit]
Description=Claude Code Container Platform Backend
Documentation=https://github.com/your-username/cloud_claude_code
After=network.target docker.service
Wants=docker.service

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=$BACKEND_DIR
ExecStart=$BACKEND_DIR/$BACKEND_BINARY
Restart=on-failure
RestartSec=5
StartLimitInterval=60
StartLimitBurst=3

# Environment
Environment=PORT=$ENV_PORT
EnvironmentFile=-$BACKEND_DIR/.env

# Logging
StandardOutput=append:$BACKEND_DIR/logs/backend.log
StandardError=append:$BACKEND_DIR/logs/backend.log

# Security
NoNewPrivileges=false
ProtectSystem=false
ProtectHome=false

[Install]
WantedBy=multi-user.target
EOF

    log_success "Service file created: $service_file"
    
    # 重载 systemd
    sudo systemctl daemon-reload
    log_success "Systemd daemon reloaded"
}

# ============================================
# 启用服务
# ============================================
enable_service() {
    log_info "Enabling $SERVICE_NAME service..."
    sudo systemctl enable "$SERVICE_NAME"
    log_success "Service enabled (will start on boot)"
}

# ============================================
# 启动服务
# ============================================
start_service() {
    log_info "Starting $SERVICE_NAME service..."
    sudo systemctl start "$SERVICE_NAME"
    
    sleep 2
    
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        log_success "Service started successfully"
        systemctl status "$SERVICE_NAME" --no-pager -l | head -20
    else
        log_error "Service failed to start"
        log_info "Check logs: journalctl -u $SERVICE_NAME -n 50"
        exit 1
    fi
}

# ============================================
# 重启服务
# ============================================
restart_service() {
    log_info "Restarting $SERVICE_NAME service..."
    sudo systemctl restart "$SERVICE_NAME"
    
    sleep 2
    
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        log_success "Service restarted successfully"
    else
        log_error "Service failed to restart"
        log_info "Check logs: journalctl -u $SERVICE_NAME -n 50"
        exit 1
    fi
}

# ============================================
# 主流程
# ============================================
echo "=========================================="
echo "  Claude Code Container Platform"
echo "  Build & Deploy Script"
echo "=========================================="
echo ""

if $BUILD_FRONTEND; then
    build_frontend
fi

if $BUILD_BACKEND; then
    build_backend
fi

if $DO_INSTALL; then
    install_files
fi

if $SETUP_SERVICE; then
    generate_service
fi

if $ENABLE_SERVICE; then
    enable_service
fi

if $RESTART_SERVICE; then
    restart_service
elif $START_SERVICE; then
    start_service
fi

echo ""
echo "=========================================="
log_success "All tasks completed!"
echo "=========================================="

if $DO_INSTALL; then
    echo ""
    echo "Deployment Summary:"
    echo "  Frontend: $FRONTEND_DIR"
    echo "  Backend:  $BACKEND_DIR"
    echo ""
    echo "Next steps:"
    echo "  1. Edit $BACKEND_DIR/.env with your settings"
    echo "  2. Update nginx config (see deploy/nginx.conf)"
    echo "  3. Reload nginx: sudo nginx -s reload"
    if ! $START_SERVICE; then
        echo "  4. Start service: sudo systemctl start $SERVICE_NAME"
    fi
    echo ""
fi
