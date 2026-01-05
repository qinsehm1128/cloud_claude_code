#!/bin/bash

# Claude Code Container Platform - Interactive Deployment Script
# 交互式部署脚本 - 提供友好的菜单驱动界面

set -e

# ============================================
# 配置
# ============================================
VERSION="1.0.0"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 默认配置
DEFAULT_FRONTEND_DIR="/var/www/example.com"
DEFAULT_BACKEND_DIR="/opt/cc-platform"
BACKEND_BINARY="cc-server"
SERVICE_NAME="cc-platform"

# 当前会话配置
FRONTEND_DIR=""
BACKEND_DIR=""
CONFIG_FILE="$SCRIPT_DIR/.deploy-config"

# ============================================
# 颜色和图标
# ============================================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m'

ICON_CHECK="✓"
ICON_CROSS="✗"
ICON_ARROW="→"
ICON_STAR="★"
ICON_INFO="ℹ"
ICON_WARN="⚠"

# ============================================
# 日志函数
# ============================================
log_info() { echo -e "${BLUE}${ICON_INFO}${NC} $1"; }
log_success() { echo -e "${GREEN}${ICON_CHECK}${NC} $1"; }
log_warn() { echo -e "${YELLOW}${ICON_WARN}${NC} $1"; }
log_error() { echo -e "${RED}${ICON_CROSS}${NC} $1"; }
log_step() { echo -e "${CYAN}${ICON_ARROW}${NC} $1"; }

# ============================================
# 工具函数
# ============================================

# 显示标题
show_header() {
    clear
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC}  ${BOLD}Claude Code Container Platform${NC}                       ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}  ${MAGENTA}交互式部署向导${NC} v${VERSION}                             ${CYAN}║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

# 显示分隔线
show_separator() {
    echo -e "${CYAN}──────────────────────────────────────────────────────────${NC}"
}

# 等待用户按键继续
press_enter() {
    echo ""
    read -p "按 Enter 键继续..."
}

# 读取用户输入
read_input() {
    local prompt="$1"
    local default="$2"
    local result

    if [ -n "$default" ]; then
        read -p "$(echo -e ${CYAN}${prompt}${NC} [默认: ${YELLOW}${default}${NC}]: )" result
        echo "${result:-$default}"
    else
        read -p "$(echo -e ${CYAN}${prompt}${NC}: )" result
        echo "$result"
    fi
}

# 读取确认
read_confirm() {
    local prompt="$1"
    local default="${2:-n}"
    local result

    if [ "$default" = "y" ]; then
        read -p "$(echo -e ${CYAN}${prompt}${NC} [Y/n]: )" -n 1 result
    else
        read -p "$(echo -e ${CYAN}${prompt}${NC} [y/N]: )" -n 1 result
    fi
    echo

    result="${result:-$default}"
    [[ "$result" =~ ^[Yy]$ ]]
}

# 选择菜单
show_menu() {
    local title="$1"
    shift
    local options=("$@")

    echo -e "${BOLD}${title}${NC}"
    echo ""

    local i=1
    for option in "${options[@]}"; do
        echo -e "  ${GREEN}${i}.${NC} $option"
        ((i++))
    done
    echo -e "  ${RED}0.${NC} 返回/退出"
    echo ""
}

# 读取菜单选择
read_choice() {
    local max=$1
    local choice

    while true; do
        read -p "$(echo -e ${CYAN}请选择${NC} [0-${max}]: )" choice

        if [[ "$choice" =~ ^[0-9]+$ ]] && [ "$choice" -ge 0 ] && [ "$choice" -le "$max" ]; then
            echo "$choice"
            return 0
        else
            log_error "无效的选择，请输入 0-${max} 之间的数字"
        fi
    done
}

# ============================================
# 系统检测
# ============================================

# 检测系统状态
check_system_status() {
    local status_file="/tmp/deploy-status-$$"

    # 检测 Node.js
    if command -v node &> /dev/null; then
        echo "node_installed=yes" >> "$status_file"
        echo "node_version=$(node --version)" >> "$status_file"
    else
        echo "node_installed=no" >> "$status_file"
    fi

    # 检测 Go
    if command -v go &> /dev/null; then
        echo "go_installed=yes" >> "$status_file"
        echo "go_version=$(go version | awk '{print $3}' | sed 's/go//')" >> "$status_file"
    else
        echo "go_installed=no" >> "$status_file"
    fi

    # 检测 Docker
    if command -v docker &> /dev/null; then
        echo "docker_installed=yes" >> "$status_file"
        echo "docker_version=$(docker --version | awk '{print $3}' | sed 's/,//')" >> "$status_file"
    else
        echo "docker_installed=no" >> "$status_file"
    fi

    # 检测服务状态
    if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
        echo "service_running=yes" >> "$status_file"
    else
        echo "service_running=no" >> "$status_file"
    fi

    # 检测是否已构建
    if [ -d "frontend/dist" ]; then
        echo "frontend_built=yes" >> "$status_file"
    else
        echo "frontend_built=no" >> "$status_file"
    fi

    if [ -f "bin/$BACKEND_BINARY" ]; then
        echo "backend_built=yes" >> "$status_file"
    else
        echo "backend_built=no" >> "$status_file"
    fi

    # 检测是否已部署
    if [ -f "$DEFAULT_BACKEND_DIR/$BACKEND_BINARY" ]; then
        echo "backend_deployed=yes" >> "$status_file"
    else
        echo "backend_deployed=no" >> "$status_file"
    fi

    echo "$status_file"
}

# 显示系统状态
display_system_status() {
    show_header
    echo -e "${BOLD}系统状态检查${NC}"
    show_separator
    echo ""

    local status_file=$(check_system_status)
    source "$status_file"

    # 依赖检查
    echo -e "${BOLD}依赖环境:${NC}"

    if [ "$node_installed" = "yes" ]; then
        log_success "Node.js: $node_version"
    else
        log_error "Node.js: 未安装"
    fi

    if [ "$go_installed" = "yes" ]; then
        log_success "Go: $go_version"
    else
        log_error "Go: 未安装"
    fi

    if [ "$docker_installed" = "yes" ]; then
        log_success "Docker: $docker_version"
    else
        log_warn "Docker: 未安装 (可选)"
    fi

    echo ""

    # 构建状态
    echo -e "${BOLD}构建状态:${NC}"

    if [ "$frontend_built" = "yes" ]; then
        log_success "前端已构建: frontend/dist"
    else
        log_info "前端未构建"
    fi

    if [ "$backend_built" = "yes" ]; then
        log_success "后端已构建: bin/$BACKEND_BINARY"
    else
        log_info "后端未构建"
    fi

    echo ""

    # 部署状态
    echo -e "${BOLD}部署状态:${NC}"

    if [ "$backend_deployed" = "yes" ]; then
        log_success "后端已部署: $DEFAULT_BACKEND_DIR"
    else
        log_info "后端未部署"
    fi

    if [ "$service_running" = "yes" ]; then
        log_success "服务正在运行: $SERVICE_NAME"
    else
        log_info "服务未运行"
    fi

    rm -f "$status_file"

    echo ""
    press_enter
}

# ============================================
# 配置管理
# ============================================

# 加载配置
load_config() {
    if [ -f "$CONFIG_FILE" ]; then
        source "$CONFIG_FILE"
    fi

    FRONTEND_DIR="${FRONTEND_DIR:-$DEFAULT_FRONTEND_DIR}"
    BACKEND_DIR="${BACKEND_DIR:-$DEFAULT_BACKEND_DIR}"
}

# 保存配置
save_config() {
    cat > "$CONFIG_FILE" << EOF
# 部署配置
FRONTEND_DIR="$FRONTEND_DIR"
BACKEND_DIR="$BACKEND_DIR"
EOF
}

# 配置向导
config_wizard() {
    show_header
    echo -e "${BOLD}${ICON_STAR} 配置向导${NC}"
    show_separator
    echo ""

    log_info "让我们配置部署目录和参数"
    echo ""

    # 前端目录
    FRONTEND_DIR=$(read_input "前端部署目录 (Nginx静态文件)" "$FRONTEND_DIR")

    # 后端目录
    BACKEND_DIR=$(read_input "后端部署目录 (可执行文件)" "$BACKEND_DIR")

    echo ""
    log_info "配置摘要:"
    echo -e "  前端: ${YELLOW}$FRONTEND_DIR${NC}"
    echo -e "  后端: ${YELLOW}$BACKEND_DIR${NC}"
    echo ""

    if read_confirm "保存此配置?" "y"; then
        save_config
        log_success "配置已保存"
    fi

    press_enter
}

# ============================================
# 构建功能
# ============================================

# 构建前端
build_frontend() {
    log_step "构建前端..."

    cd "$SCRIPT_DIR/frontend"

    # 安装依赖
    if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules" ]; then
        log_info "安装 npm 依赖..."
        npm install
    fi

    # 构建
    log_info "运行构建命令..."
    npm run build

    cd "$SCRIPT_DIR"

    if [ -d "frontend/dist" ]; then
        log_success "前端构建完成: frontend/dist"
        return 0
    else
        log_error "前端构建失败"
        return 1
    fi
}

# 构建后端
build_backend() {
    log_step "构建后端..."

    cd "$SCRIPT_DIR/backend"

    # 下载依赖
    log_info "下载 Go 模块..."
    go mod download

    # 构建
    log_info "编译后端程序..."
    mkdir -p "$SCRIPT_DIR/bin"
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o "$SCRIPT_DIR/bin/$BACKEND_BINARY" ./cmd/server

    cd "$SCRIPT_DIR"

    if [ -f "bin/$BACKEND_BINARY" ]; then
        log_success "后端构建完成: bin/$BACKEND_BINARY"
        return 0
    else
        log_error "后端构建失败"
        return 1
    fi
}

# 构建管理菜单
build_menu() {
    while true; do
        show_header
        show_menu "构建管理" \
            "构建所有 (前端 + 后端)" \
            "仅构建前端" \
            "仅构建后端" \
            "清理构建产物"

        local choice=$(read_choice 4)

        case $choice in
            0) return ;;
            1)
                show_header
                echo -e "${BOLD}构建所有组件${NC}"
                show_separator
                echo ""
                build_frontend && build_backend
                echo ""
                press_enter
                ;;
            2)
                show_header
                echo -e "${BOLD}构建前端${NC}"
                show_separator
                echo ""
                build_frontend
                echo ""
                press_enter
                ;;
            3)
                show_header
                echo -e "${BOLD}构建后端${NC}"
                show_separator
                echo ""
                build_backend
                echo ""
                press_enter
                ;;
            4)
                show_header
                echo -e "${BOLD}清理构建产物${NC}"
                show_separator
                echo ""
                if read_confirm "确认清理所有构建产物?" "n"; then
                    log_info "清理中..."
                    rm -rf frontend/dist
                    rm -rf bin
                    log_success "清理完成"
                fi
                echo ""
                press_enter
                ;;
        esac
    done
}

# ============================================
# 部署功能
# ============================================

# 安装文件
install_files() {
    log_step "安装文件到目标目录..."

    # 安装前端
    if [ -d "frontend/dist" ]; then
        log_info "安装前端到 $FRONTEND_DIR..."
        sudo mkdir -p "$FRONTEND_DIR"
        sudo cp -r frontend/dist/* "$FRONTEND_DIR/"
        log_success "前端已安装"
    else
        log_warn "前端未构建，跳过安装"
    fi

    # 安装后端
    if [ -f "bin/$BACKEND_BINARY" ]; then
        log_info "安装后端到 $BACKEND_DIR..."

        # 停止服务
        if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
            log_info "停止现有服务..."
            sudo systemctl stop "$SERVICE_NAME"
        fi

        # 创建目录
        sudo mkdir -p "$BACKEND_DIR"
        sudo mkdir -p "$BACKEND_DIR/logs"
        sudo mkdir -p "$BACKEND_DIR/data"

        # 复制文件
        sudo cp "bin/$BACKEND_BINARY" "$BACKEND_DIR/"
        sudo chmod +x "$BACKEND_DIR/$BACKEND_BINARY"

        # 复制 docker 目录
        if [ -d "docker" ]; then
            sudo mkdir -p "$BACKEND_DIR/docker"
            sudo cp -r docker/* "$BACKEND_DIR/docker/" 2>/dev/null || true
        fi

        # 处理配置文件
        if [ ! -f "$BACKEND_DIR/.env" ]; then
            if [ -f ".env.example" ]; then
                sudo cp .env.example "$BACKEND_DIR/.env"
                log_warn "已创建 $BACKEND_DIR/.env，请编辑配置"
            elif [ -f ".env" ]; then
                sudo cp .env "$BACKEND_DIR/.env"
                log_info "已复制现有 .env 配置"
            fi
        fi

        log_success "后端已安装"
    else
        log_warn "后端未构建，跳过安装"
    fi
}

# 设置 systemd 服务
setup_service() {
    log_step "配置 systemd 服务..."

    # 读取端口配置
    local port=8080
    if [ -f "$BACKEND_DIR/.env" ]; then
        port=$(grep -E "^PORT=" "$BACKEND_DIR/.env" 2>/dev/null | cut -d'=' -f2 | tr -d '"' | tr -d "'" | tr -d ' ' || echo "8080")
    fi

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
Environment=PORT=$port
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

    sudo systemctl daemon-reload
    log_success "服务文件已创建: $service_file"
}

# 快速部署
quick_deploy() {
    show_header
    echo -e "${BOLD}${ICON_STAR} 快速一键部署${NC}"
    show_separator
    echo ""

    log_info "这将执行完整的部署流程:"
    echo "  1. 构建前端和后端"
    echo "  2. 安装文件到目标目录"
    echo "  3. 配置 systemd 服务"
    echo "  4. 启用并启动服务"
    echo ""

    echo -e "${BOLD}部署配置:${NC}"
    echo -e "  前端目录: ${YELLOW}$FRONTEND_DIR${NC}"
    echo -e "  后端目录: ${YELLOW}$BACKEND_DIR${NC}"
    echo ""

    if ! read_confirm "确认开始部署?" "y"; then
        return
    fi

    echo ""
    show_separator
    echo ""

    # 执行部署
    build_frontend || { log_error "前端构建失败"; press_enter; return; }
    echo ""

    build_backend || { log_error "后端构建失败"; press_enter; return; }
    echo ""

    install_files
    echo ""

    setup_service
    echo ""

    log_step "启用服务..."
    sudo systemctl enable "$SERVICE_NAME"
    log_success "服务已设置为开机自启"
    echo ""

    log_step "启动服务..."
    sudo systemctl start "$SERVICE_NAME"
    sleep 2

    if systemctl is-active --quiet "$SERVICE_NAME"; then
        log_success "服务启动成功!"
        echo ""
        log_info "查看服务状态: sudo systemctl status $SERVICE_NAME"
        log_info "查看日志: sudo journalctl -u $SERVICE_NAME -f"
    else
        log_error "服务启动失败"
        log_info "查看错误日志: sudo journalctl -u $SERVICE_NAME -n 50"
    fi

    echo ""
    show_separator
    echo ""
    log_success "部署完成!"
    echo ""
    log_warn "下一步操作:"
    echo "  1. 编辑配置文件: sudo vim $BACKEND_DIR/.env"
    echo "  2. 配置 Nginx (参考 deploy/nginx.conf)"
    echo "  3. 重启服务: sudo systemctl restart $SERVICE_NAME"
    echo ""

    press_enter
}

# 开发环境部署
dev_deploy() {
    show_header
    echo -e "${BOLD}${ICON_STAR} 开发环境部署${NC}"
    show_separator
    echo ""

    log_info "开发环境将启动开发服务器，无需构建生产版本"
    echo ""

    if [ ! -f "start-dev.sh" ]; then
        log_error "找不到 start-dev.sh 脚本"
        press_enter
        return
    fi

    show_menu "选择启动模式" \
        "启动前端 + 后端 (完整开发环境)" \
        "仅启动后端" \
        "仅启动前端"

    local choice=$(read_choice 3)

    case $choice in
        0) return ;;
        1)
            log_info "启动完整开发环境..."
            ./start-dev.sh
            ;;
        2)
            log_info "启动后端开发服务器..."
            ./start-dev.sh --backend
            ;;
        3)
            log_info "启动前端开发服务器..."
            ./start-dev.sh --frontend
            ;;
    esac
}

# 生产环境部署
prod_deploy() {
    show_header
    echo -e "${BOLD}${ICON_STAR} 生产环境部署${NC}"
    show_separator
    echo ""

    log_info "生产环境将构建优化版本并部署到服务器"
    echo ""

    show_menu "选择部署方式" \
        "完整部署 (推荐)" \
        "仅构建并安装" \
        "仅配置服务" \
        "自定义部署步骤"

    local choice=$(read_choice 4)

    case $choice in
        0) return ;;
        1) quick_deploy ;;
        2)
            show_header
            build_frontend && build_backend
            echo ""
            install_files
            echo ""
            log_success "构建和安装完成"
            press_enter
            ;;
        3)
            show_header
            setup_service
            echo ""
            if read_confirm "启用服务?" "y"; then
                sudo systemctl enable "$SERVICE_NAME"
                log_success "服务已启用"
            fi
            echo ""
            if read_confirm "启动服务?" "y"; then
                sudo systemctl start "$SERVICE_NAME"
                log_success "服务已启动"
            fi
            press_enter
            ;;
        4)
            custom_deploy
            ;;
    esac
}

# 自定义部署
custom_deploy() {
    while true; do
        show_header
        echo -e "${BOLD}自定义部署步骤${NC}"
        show_separator
        echo ""

        show_menu "选择要执行的步骤" \
            "1. 构建前端" \
            "2. 构建后端" \
            "3. 安装文件" \
            "4. 配置服务" \
            "5. 启用服务" \
            "6. 启动服务"

        local choice=$(read_choice 6)

        case $choice in
            0) return ;;
            1) build_frontend; press_enter ;;
            2) build_backend; press_enter ;;
            3) install_files; press_enter ;;
            4) setup_service; press_enter ;;
            5)
                sudo systemctl enable "$SERVICE_NAME"
                log_success "服务已启用"
                press_enter
                ;;
            6)
                sudo systemctl start "$SERVICE_NAME"
                log_success "服务已启动"
                press_enter
                ;;
        esac
    done
}

# ============================================
# 服务管理
# ============================================

service_management() {
    while true; do
        show_header
        show_menu "服务管理" \
            "查看服务状态" \
            "启动服务" \
            "停止服务" \
            "重启服务" \
            "查看服务日志" \
            "启用开机自启" \
            "禁用开机自启"

        local choice=$(read_choice 7)

        case $choice in
            0) return ;;
            1)
                show_header
                echo -e "${BOLD}服务状态${NC}"
                show_separator
                echo ""
                sudo systemctl status "$SERVICE_NAME" --no-pager || true
                echo ""
                press_enter
                ;;
            2)
                show_header
                log_step "启动服务..."
                sudo systemctl start "$SERVICE_NAME"
                sleep 1
                if systemctl is-active --quiet "$SERVICE_NAME"; then
                    log_success "服务已启动"
                else
                    log_error "服务启动失败"
                fi
                press_enter
                ;;
            3)
                show_header
                log_step "停止服务..."
                sudo systemctl stop "$SERVICE_NAME"
                log_success "服务已停止"
                press_enter
                ;;
            4)
                show_header
                log_step "重启服务..."
                sudo systemctl restart "$SERVICE_NAME"
                sleep 1
                if systemctl is-active --quiet "$SERVICE_NAME"; then
                    log_success "服务已重启"
                else
                    log_error "服务重启失败"
                fi
                press_enter
                ;;
            5)
                show_header
                echo -e "${BOLD}服务日志 (最后50行)${NC}"
                show_separator
                echo ""
                sudo journalctl -u "$SERVICE_NAME" -n 50 --no-pager
                echo ""
                log_info "实时查看日志: sudo journalctl -u $SERVICE_NAME -f"
                press_enter
                ;;
            6)
                sudo systemctl enable "$SERVICE_NAME"
                log_success "已启用开机自启"
                press_enter
                ;;
            7)
                sudo systemctl disable "$SERVICE_NAME"
                log_success "已禁用开机自启"
                press_enter
                ;;
        esac
    done
}

# ============================================
# 帮助文档
# ============================================

show_help_docs() {
    show_header
    echo -e "${BOLD}帮助文档${NC}"
    show_separator
    echo ""

    cat << 'EOF'
📚 快速开始指南

1. 首次部署
   推荐使用 "快速一键部署"，它会自动完成所有步骤

2. 开发环境
   使用 "开发环境部署" 启动开发服务器进行调试

3. 配置文件
   编辑 /opt/cc-platform/.env 设置以下参数:
   - PORT: 后端服务端口 (默认 8080)
   - ADMIN_USERNAME: 管理员用户名
   - ADMIN_PASSWORD: 管理员密码
   - JWT_SECRET: JWT 密钥 (使用 openssl rand -hex 32 生成)

4. Nginx 配置
   参考 deploy/nginx.conf 配置反向代理

5. 常见问题

   Q: 502 Bad Gateway
   A: 检查后端服务是否运行: systemctl status cc-platform

   Q: WebSocket 连接失败
   A: 确保 nginx 配置包含 WebSocket 支持

   Q: 权限问题
   A: 确保运行用户在 docker 组: sudo usermod -aG docker $USER

📖 更多文档
   - 部署文档: deploy/README.zh-CN.md
   - 项目文档: README.md

EOF

    press_enter
}

# ============================================
# 主菜单
# ============================================

main_menu() {
    load_config

    while true; do
        show_header
        show_menu "主菜单 - 请选择操作" \
            "🚀 快速一键部署 (推荐)" \
            "💻 开发环境部署" \
            "🏭 生产环境部署" \
            "⚙️  配置向导" \
            "🔨 构建管理" \
            "🔧 服务管理" \
            "📊 查看系统状态" \
            "📚 帮助文档"

        local choice=$(read_choice 8)

        case $choice in
            0)
                echo ""
                log_info "感谢使用 Claude Code Container Platform 部署向导"
                exit 0
                ;;
            1) quick_deploy ;;
            2) dev_deploy ;;
            3) prod_deploy ;;
            4) config_wizard ;;
            5) build_menu ;;
            6) service_management ;;
            7) display_system_status ;;
            8) show_help_docs ;;
        esac
    done
}

# ============================================
# 启动脚本
# ============================================

# 检查是否在正确的目录
if [ ! -f "deploy.sh" ] || [ ! -d "frontend" ] || [ ! -d "backend" ]; then
    log_error "请在项目根目录运行此脚本"
    exit 1
fi

# 启动主菜单
main_menu
