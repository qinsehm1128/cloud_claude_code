#!/bin/bash

# ============================================
# 共享函数库 - Claude Code Container Platform
# ============================================

# ============================================
# 颜色和图标定义
# ============================================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m'

ICON_CHECK="[OK]"
ICON_CROSS="[X]"
ICON_ARROW="->"
ICON_STAR="*"
ICON_INFO="[i]"
ICON_WARN="[!]"
ICON_ROCKET=">>>"
ICON_GEAR="[*]"
ICON_KEY="[K]"
ICON_PACKAGE="[P]"
ICON_WRENCH="[W]"

# ============================================
# 全局变量
# ============================================
SCRIPT_ROOT=""
VERSION="2.0.0"
SERVICE_NAME="cc-platform"
BACKEND_BINARY="cc-server"

# 默认配置
DEFAULT_FRONTEND_DIR="/var/www/example.com"
DEFAULT_BACKEND_DIR="/opt/cc-platform"

# 当前配置
FRONTEND_DIR=""
BACKEND_DIR=""
BACKEND_PORT="8080"
FRONTEND_PORT="3000"

# 状态变量
ENV_FILE=".env"
CONFIG_FILE=".deploy-config"
BACKUP_DIR=".deploy-backups"

# ============================================
# 日志函数
# ============================================
log_info() { echo -e "${BLUE}${ICON_INFO}${NC} $1"; }
log_success() { echo -e "${GREEN}${ICON_CHECK}${NC} $1"; }
log_warn() { echo -e "${YELLOW}${ICON_WARN}${NC} $1"; }
log_error() { echo -e "${RED}${ICON_CROSS}${NC} $1"; }
log_step() { echo -e "${CYAN}${ICON_ARROW}${NC} $1"; }
log_header() { echo -e "${BOLD}$1${NC}"; }

# ============================================
# UI 函数
# ============================================

# 显示标题
show_header() {
    # 在 Windows Git Bash 环境下，clear 可能导致输出问题
    # 使用更可靠的方式：清屏后强制刷新输出
    if [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win32" ]] || [[ "$(uname -s)" =~ MINGW ]]; then
        # Windows 环境：使用 printf 输出换行代替 clear，避免清屏问题
        printf '\n\n\n'
    else
        clear
    fi

    echo -e "${CYAN}+============================================================+${NC}"
    echo -e "${CYAN}|${NC}  ${BOLD}Claude Code Container Platform${NC}                       ${CYAN}|${NC}"
    echo -e "${CYAN}|${NC}  ${MAGENTA}统一部署向导${NC} v${VERSION}                                ${CYAN}|${NC}"
    echo -e "${CYAN}+============================================================+${NC}"
    echo ""
}

# 显示分隔线
show_separator() {
    echo -e "${CYAN}------------------------------------------------------------${NC}"
}

# 显示进度条
show_progress() {
    local current=$1
    local total=$2
    local message=$3
    local percent=$((current * 100 / total))
    local filled=$((percent / 10))
    local empty=$((10 - filled))

    local bar=""
    for ((i=0; i<filled; i++)); do bar+="#"; done
    for ((i=0; i<empty; i++)); do bar+="-"; done

    echo -ne "\r  [${bar}] ${percent}% ${message}  "
    [ $current -eq $total ] && echo ""
}

# 等待用户按键
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
        read -p "$(echo -e ${CYAN}${prompt}${NC} [${YELLOW}${default}${NC}]: )" result
        echo "${result:-$default}"
    else
        read -p "$(echo -e ${CYAN}${prompt}${NC}: )" result
        echo "$result"
    fi
}

# 读取密码
read_password() {
    local prompt="$1"
    local password

    read -s -p "$(echo -e ${CYAN}${prompt}${NC}: )" password
    echo
    echo "$password"
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
# 系统检测函数
# ============================================

# 检测操作系统
detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        echo "$ID"
    elif [ -f /etc/redhat-release ]; then
        echo "rhel"
    elif [ -f /etc/debian_version ]; then
        echo "debian"
    else
        echo "unknown"
    fi
}

# 检测架构
detect_arch() {
    local arch=$(uname -m)
    case $arch in
        x86_64|amd64) echo "amd64" ;;
        aarch64|arm64) echo "arm64" ;;
        *) echo "$arch" ;;
    esac
}

# 检查命令是否存在
command_exists() {
    command -v "$1" &> /dev/null
}

# 检查端口是否被占用
check_port() {
    local port=$1
    if command_exists lsof; then
        lsof -i :$port &> /dev/null && return 0 || return 1
    elif command_exists ss; then
        ss -tuln | grep -q ":$port " && return 0 || return 1
    elif command_exists netstat; then
        netstat -tuln | grep -q ":$port " && return 0 || return 1
    fi
    return 1
}

# 检查磁盘空间（单位：GB）
check_disk_space() {
    local path="${1:-.}"
    local available=$(df -BG "$path" | tail -1 | awk '{print $4}' | sed 's/G//')
    echo "$available"
}

# ============================================
# 配置管理函数
# ============================================

# 加载部署配置
load_deploy_config() {
    if [ -f "$SCRIPT_ROOT/$CONFIG_FILE" ]; then
        source "$SCRIPT_ROOT/$CONFIG_FILE"
    fi

    FRONTEND_DIR="${FRONTEND_DIR:-$DEFAULT_FRONTEND_DIR}"
    BACKEND_DIR="${BACKEND_DIR:-$DEFAULT_BACKEND_DIR}"
}

# 保存部署配置
save_deploy_config() {
    cat > "$SCRIPT_ROOT/$CONFIG_FILE" << EOF
# 部署配置
FRONTEND_DIR="$FRONTEND_DIR"
BACKEND_DIR="$BACKEND_DIR"
EOF
}

# 加载环境配置
load_env_config() {
    local env_file="$SCRIPT_ROOT/$ENV_FILE"

    if [ -f "$env_file" ]; then
        # 读取 PORT
        local port=$(grep -E "^PORT=" "$env_file" 2>/dev/null | cut -d'=' -f2 | tr -d '"' | tr -d "'" | tr -d ' ')
        [ -n "$port" ] && BACKEND_PORT=$port

        # 读取 FRONTEND_PORT
        local frontend_port=$(grep -E "^FRONTEND_PORT=" "$env_file" 2>/dev/null | cut -d'=' -f2 | tr -d '"' | tr -d "'" | tr -d ' ')
        [ -n "$frontend_port" ] && FRONTEND_PORT=$frontend_port
    fi
}

# 生成安全密钥
generate_secret() {
    if command_exists openssl; then
        openssl rand -hex 32
    else
        head -c 32 /dev/urandom | base64 | tr -d '\n='
    fi
}

# ============================================
# 验证函数
# ============================================

# 验证端口
validate_port() {
    local port=$1
    if [[ "$port" =~ ^[0-9]+$ ]] && [ "$port" -ge 1 ] && [ "$port" -le 65535 ]; then
        return 0
    else
        return 1
    fi
}

# 验证域名
validate_domain() {
    local domain=$1
    if [[ "$domain" =~ ^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$ ]]; then
        return 0
    else
        return 1
    fi
}

# ============================================
# 备份和回滚函数
# ============================================

# 创建备份
create_backup() {
    local backup_name="backup_$(date +%Y%m%d_%H%M%S)"
    local backup_path="$SCRIPT_ROOT/$BACKUP_DIR/$backup_name"

    log_info "创建备份: $backup_name"

    mkdir -p "$backup_path"

    # 备份后端
    if [ -d "$BACKEND_DIR" ]; then
        sudo cp -r "$BACKEND_DIR" "$backup_path/backend"
    fi

    # 备份前端
    if [ -d "$FRONTEND_DIR" ]; then
        sudo cp -r "$FRONTEND_DIR" "$backup_path/frontend"
    fi

    # 备份配置
    [ -f "$SCRIPT_ROOT/$ENV_FILE" ] && cp "$SCRIPT_ROOT/$ENV_FILE" "$backup_path/"

    # 保存备份信息
    cat > "$backup_path/info.txt" << EOF
备份时间: $(date '+%Y-%m-%d %H:%M:%S')
前端目录: $FRONTEND_DIR
后端目录: $BACKEND_DIR
服务状态: $(systemctl is-active $SERVICE_NAME 2>/dev/null || echo "未知")
EOF

    log_success "备份完成: $backup_name"
    echo "$backup_name"
}

# 列出备份
list_backups() {
    if [ ! -d "$SCRIPT_ROOT/$BACKUP_DIR" ]; then
        echo ""
        return
    fi

    ls -t "$SCRIPT_ROOT/$BACKUP_DIR" 2>/dev/null | head -n 3
}

# 恢复备份
restore_backup() {
    local backup_name="$1"
    local backup_path="$SCRIPT_ROOT/$BACKUP_DIR/$backup_name"

    if [ ! -d "$backup_path" ]; then
        log_error "备份不存在: $backup_name"
        return 1
    fi

    log_info "恢复备份: $backup_name"

    # 停止服务
    if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
        sudo systemctl stop "$SERVICE_NAME"
    fi

    # 恢复后端
    if [ -d "$backup_path/backend" ]; then
        sudo rm -rf "$BACKEND_DIR"
        sudo cp -r "$backup_path/backend" "$BACKEND_DIR"
    fi

    # 恢复前端
    if [ -d "$backup_path/frontend" ]; then
        sudo rm -rf "$FRONTEND_DIR"
        sudo cp -r "$backup_path/frontend" "$FRONTEND_DIR"
    fi

    # 恢复配置
    if [ -f "$backup_path/$ENV_FILE" ]; then
        cp "$backup_path/$ENV_FILE" "$SCRIPT_ROOT/"
    fi

    log_success "备份恢复完成"
}

# ============================================
# 工具函数
# ============================================

# 初始化脚本根目录
# 向上遍历查找包含 frontend 和 backend 的项目根目录
init_script_root() {
    local current_dir="$(cd "$(dirname "${BASH_SOURCE[1]}")" && pwd)"
    
    # 向上查找项目根目录（最多5层）
    local search_dir="$current_dir"
    for i in 1 2 3 4 5; do
        if [ -d "$search_dir/frontend" ] && [ -d "$search_dir/backend" ]; then
            SCRIPT_ROOT="$search_dir"
            return 0
        fi
        search_dir="$(dirname "$search_dir")"
    done
    
    # 如果找不到，使用当前目录的父目录作为回退
    SCRIPT_ROOT="$(cd "$current_dir" && cd .. && pwd)"
}

# 检查是否在项目根目录
check_project_root() {
    if [ ! -d "frontend" ] || [ ! -d "backend" ]; then
        log_error "请在项目根目录运行此脚本"
        exit 1
    fi
}

# 清理过期备份（保留最近3个）
cleanup_old_backups() {
    if [ ! -d "$SCRIPT_ROOT/$BACKUP_DIR" ]; then
        return
    fi

    local backups=($(ls -t "$SCRIPT_ROOT/$BACKUP_DIR" 2>/dev/null))
    local count=${#backups[@]}

    if [ $count -gt 3 ]; then
        for ((i=3; i<count; i++)); do
            rm -rf "$SCRIPT_ROOT/$BACKUP_DIR/${backups[$i]}"
        done
        log_info "清理了 $((count - 3)) 个过期备份"
    fi
}
