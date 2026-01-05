#!/bin/bash

# Claude Code Container Platform - Configuration Wizard
# 配置向导 - 帮助用户轻松配置 .env 文件

set -e

# ============================================
# 配置
# ============================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

ENV_FILE=".env"
ENV_EXAMPLE=".env.example"

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
ICON_KEY="🔑"
ICON_GEAR="⚙"

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
    echo -e "${CYAN}║${NC}  ${MAGENTA}${ICON_GEAR} 配置向导${NC}                                         ${CYAN}║${NC}"
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

# 生成随机密钥
generate_secret() {
    if command -v openssl &> /dev/null; then
        openssl rand -hex 32
    else
        # 备用方案
        head -c 32 /dev/urandom | base64 | tr -d '\n='
    fi
}

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
# 配置读取和保存
# ============================================

# 读取现有配置
read_existing_config() {
    if [ -f "$ENV_FILE" ]; then
        source "$ENV_FILE" 2>/dev/null || true
    fi
}

# 保存配置到文件
save_config() {
    local config_content="$1"

    # 备份现有配置
    if [ -f "$ENV_FILE" ]; then
        cp "$ENV_FILE" "${ENV_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
        log_info "已备份现有配置"
    fi

    # 保存新配置
    echo "$config_content" > "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    log_success "配置已保存到 $ENV_FILE"
}

# ============================================
# 配置向导主流程
# ============================================

run_wizard() {
    show_header
    echo -e "${BOLD}欢迎使用配置向导${NC}"
    show_separator
    echo ""

    log_info "此向导将帮助你配置应用程序所需的环境变量"
    echo ""

    # 读取现有配置
    read_existing_config

    # ============================================
    # 1. 基础配置
    # ============================================
    echo -e "${BOLD}${ICON_GEAR} 基础配置${NC}"
    show_separator
    echo ""

    # 端口
    while true; do
        PORT=$(read_input "后端服务端口" "${PORT:-8080}")
        if validate_port "$PORT"; then
            break
        else
            log_error "无效的端口号，请输入 1-65535 之间的数字"
        fi
    done

    # 前端端口（开发用）
    FRONTEND_PORT=$(read_input "前端开发服务器端口 (仅开发环境)" "${FRONTEND_PORT:-3000}")

    echo ""

    # ============================================
    # 2. 管理员账户
    # ============================================
    echo -e "${BOLD}${ICON_KEY} 管理员账户${NC}"
    show_separator
    echo ""

    ADMIN_USERNAME=$(read_input "管理员用户名" "${ADMIN_USERNAME:-admin}")

    # 密码
    if [ -n "$ADMIN_PASSWORD" ]; then
        echo -e "当前密码: ${YELLOW}********${NC}"
        if read_confirm "是否更改密码?" "n"; then
            ADMIN_PASSWORD=$(read_password "请输入新密码")
        fi
    else
        ADMIN_PASSWORD=$(read_password "管理员密码")
    fi

    echo ""

    # ============================================
    # 3. 安全配置
    # ============================================
    echo -e "${BOLD}${ICON_KEY} 安全配置${NC}"
    show_separator
    echo ""

    # JWT 密钥
    if [ -n "$JWT_SECRET" ]; then
        echo -e "当前 JWT 密钥: ${YELLOW}${JWT_SECRET:0:16}...${NC}"
        if read_confirm "是否重新生成 JWT 密钥?" "n"; then
            JWT_SECRET=$(generate_secret)
            log_success "已生成新的 JWT 密钥"
        fi
    else
        log_info "正在生成 JWT 密钥..."
        JWT_SECRET=$(generate_secret)
        log_success "JWT 密钥已生成"
    fi

    echo ""

    # ============================================
    # 4. Docker 配置
    # ============================================
    echo -e "${BOLD}🐳 Docker 配置${NC}"
    show_separator
    echo ""

    # Traefik
    if read_confirm "是否自动启动 Traefik (用于容器路由)?" "${AUTO_START_TRAEFIK:-false}"; then
        AUTO_START_TRAEFIK="true"
    else
        AUTO_START_TRAEFIK="false"
    fi

    # Code-Server 域名
    if [ "$AUTO_START_TRAEFIK" = "true" ]; then
        echo ""
        log_info "Code-Server 子域名配置 (可选，用于通过子域名访问容器)"
        echo ""

        CODE_SERVER_BASE_DOMAIN=$(read_input "Code-Server 基础域名 (如: code.example.com)" "${CODE_SERVER_BASE_DOMAIN:-}")

        if [ -n "$CODE_SERVER_BASE_DOMAIN" ] && ! validate_domain "$CODE_SERVER_BASE_DOMAIN"; then
            log_warn "域名格式可能不正确，请确认"
        fi
    fi

    echo ""

    # ============================================
    # 5. 可选配置
    # ============================================
    echo -e "${BOLD}⚙️  可选配置${NC}"
    show_separator
    echo ""

    if read_confirm "配置更多高级选项?" "n"; then
        echo ""

        # 数据库路径
        DATABASE_PATH=$(read_input "数据库文件路径" "${DATABASE_PATH:-./data/cc-platform.db}")

        # 日志级别
        echo ""
        echo "日志级别选项: debug, info, warn, error"
        LOG_LEVEL=$(read_input "日志级别" "${LOG_LEVEL:-info}")

        # 容器网络
        DOCKER_NETWORK=$(read_input "Docker 网络名称" "${DOCKER_NETWORK:-cc-network}")

        # 镜像前缀
        IMAGE_PREFIX=$(read_input "容器镜像前缀" "${IMAGE_PREFIX:-cc}")
    fi

    echo ""

    # ============================================
    # 6. 配置摘要
    # ============================================
    show_separator
    echo -e "${BOLD}配置摘要${NC}"
    show_separator
    echo ""

    echo -e "${BOLD}基础配置:${NC}"
    echo -e "  后端端口:       ${YELLOW}$PORT${NC}"
    echo -e "  前端端口:       ${YELLOW}$FRONTEND_PORT${NC}"
    echo ""

    echo -e "${BOLD}管理员账户:${NC}"
    echo -e "  用户名:         ${YELLOW}$ADMIN_USERNAME${NC}"
    echo -e "  密码:           ${YELLOW}********${NC}"
    echo ""

    echo -e "${BOLD}安全配置:${NC}"
    echo -e "  JWT 密钥:       ${YELLOW}${JWT_SECRET:0:16}...${NC}"
    echo ""

    echo -e "${BOLD}Docker 配置:${NC}"
    echo -e "  自动启动 Traefik:     ${YELLOW}$AUTO_START_TRAEFIK${NC}"
    [ -n "$CODE_SERVER_BASE_DOMAIN" ] && echo -e "  Code-Server 域名:     ${YELLOW}$CODE_SERVER_BASE_DOMAIN${NC}"
    echo ""

    if [ -n "$DATABASE_PATH" ]; then
        echo -e "${BOLD}高级配置:${NC}"
        echo -e "  数据库路径:     ${YELLOW}$DATABASE_PATH${NC}"
        echo -e "  日志级别:       ${YELLOW}$LOG_LEVEL${NC}"
        echo -e "  Docker 网络:    ${YELLOW}$DOCKER_NETWORK${NC}"
        echo -e "  镜像前缀:       ${YELLOW}$IMAGE_PREFIX${NC}"
        echo ""
    fi

    show_separator
    echo ""

    # ============================================
    # 7. 确认和保存
    # ============================================
    if ! read_confirm "确认保存此配置?" "y"; then
        log_warn "配置未保存"
        exit 0
    fi

    echo ""

    # 生成配置文件内容
    local config_content=$(cat << EOF
# Claude Code Container Platform - Environment Configuration
# 环境配置文件
#
# 此文件由配置向导自动生成
# 生成时间: $(date '+%Y-%m-%d %H:%M:%S')

# ============================================
# 基础配置
# ============================================

# 后端服务端口
PORT=$PORT

# 前端开发服务器端口 (仅开发环境使用)
FRONTEND_PORT=$FRONTEND_PORT

# ============================================
# 管理员账户
# ============================================

# 管理员用户名
ADMIN_USERNAME=$ADMIN_USERNAME

# 管理员密码
ADMIN_PASSWORD=$ADMIN_PASSWORD

# ============================================
# 安全配置
# ============================================

# JWT 密钥 (用于生成和验证 JWT token)
# 生成命令: openssl rand -hex 32
JWT_SECRET=$JWT_SECRET

# ============================================
# Docker 配置
# ============================================

# 是否自动启动 Traefik (容器反向代理)
AUTO_START_TRAEFIK=$AUTO_START_TRAEFIK

# Code-Server 子域名基础域名
# 例如: code.example.com
# 容器将通过 {container-name}.code.example.com 访问
${CODE_SERVER_BASE_DOMAIN:+CODE_SERVER_BASE_DOMAIN=$CODE_SERVER_BASE_DOMAIN}
${CODE_SERVER_BASE_DOMAIN:-# CODE_SERVER_BASE_DOMAIN=code.example.com}

EOF
)

    # 添加高级配置
    if [ -n "$DATABASE_PATH" ]; then
        config_content+=$(cat << EOF

# ============================================
# 高级配置 (可选)
# ============================================

# 数据库文件路径
DATABASE_PATH=$DATABASE_PATH

# 日志级别 (debug, info, warn, error)
LOG_LEVEL=$LOG_LEVEL

# Docker 网络名称
DOCKER_NETWORK=$DOCKER_NETWORK

# 容器镜像前缀
IMAGE_PREFIX=$IMAGE_PREFIX

EOF
)
    fi

    # 添加注释说明
    config_content+=$(cat << 'EOF'

# ============================================
# 其他可选配置
# ============================================

# 数据目录 (默认: ./data)
# DATA_DIR=./data

# 日志目录 (默认: ./logs)
# LOG_DIR=./logs

# 容器默认内存限制 (默认: 2g)
# CONTAINER_MEMORY_LIMIT=2g

# 容器默认 CPU 限制 (默认: 2)
# CONTAINER_CPU_LIMIT=2

# Traefik HTTP 端口范围 (默认: 38000-39000)
# TRAEFIK_HTTP_PORT_START=38000
# TRAEFIK_HTTP_PORT_END=39000

# ============================================
# 环境标识
# ============================================

# 环境类型 (development, production)
# NODE_ENV=production

# 是否启用调试模式
# DEBUG=false

EOF
)

    # 保存配置
    save_config "$config_content"

    echo ""
    show_separator
    log_success "配置完成!"
    show_separator
    echo ""

    log_info "下一步操作:"
    echo "  1. 查看配置文件: cat $ENV_FILE"
    echo "  2. 运行部署脚本: ./deploy-interactive.sh"
    echo "  3. 或使用开发模式: ./start-dev.sh"
    echo ""

    if [ -n "$CODE_SERVER_BASE_DOMAIN" ]; then
        log_warn "Code-Server 域名配置提醒:"
        echo "  1. 添加 DNS 泛域名记录: *.$CODE_SERVER_BASE_DOMAIN -> 服务器IP"
        echo "  2. 配置 Nginx (参考 deploy/nginx.conf)"
        echo "  3. 确认 Traefik 已启动"
        echo ""
    fi

    press_enter
}

# ============================================
# 快速配置菜单
# ============================================

quick_config_menu() {
    show_header
    echo -e "${BOLD}快速配置选项${NC}"
    show_separator
    echo ""

    echo -e "  ${GREEN}1.${NC} 运行完整配置向导 (推荐)"
    echo -e "  ${GREEN}2.${NC} 仅配置管理员密码"
    echo -e "  ${GREEN}3.${NC} 重新生成 JWT 密钥"
    echo -e "  ${GREEN}4.${NC} 配置 Code-Server 域名"
    echo -e "  ${GREEN}5.${NC} 查看当前配置"
    echo -e "  ${GREEN}6.${NC} 从示例文件创建配置"
    echo -e "  ${RED}0.${NC} 退出"
    echo ""

    read -p "$(echo -e ${CYAN}请选择${NC} [0-6]: )" choice

    case $choice in
        1)
            run_wizard
            ;;
        2)
            show_header
            read_existing_config
            echo -e "${BOLD}修改管理员密码${NC}"
            show_separator
            echo ""
            ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
            echo -e "用户名: ${YELLOW}$ADMIN_USERNAME${NC}"
            echo ""
            ADMIN_PASSWORD=$(read_password "请输入新密码")
            echo ""

            # 更新配置文件中的密码
            if [ -f "$ENV_FILE" ]; then
                sed -i.bak "s/^ADMIN_PASSWORD=.*/ADMIN_PASSWORD=$ADMIN_PASSWORD/" "$ENV_FILE"
                log_success "密码已更新"
            else
                log_error "配置文件不存在，请先运行完整配置向导"
            fi
            press_enter
            ;;
        3)
            show_header
            echo -e "${BOLD}重新生成 JWT 密钥${NC}"
            show_separator
            echo ""
            log_warn "警告: 重新生成密钥将使所有现有的 JWT token 失效"
            echo ""
            if read_confirm "确认重新生成?" "n"; then
                JWT_SECRET=$(generate_secret)
                if [ -f "$ENV_FILE" ]; then
                    sed -i.bak "s/^JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" "$ENV_FILE"
                    log_success "JWT 密钥已更新: ${JWT_SECRET:0:16}..."
                else
                    log_error "配置文件不存在，请先运行完整配置向导"
                fi
            fi
            press_enter
            ;;
        4)
            show_header
            read_existing_config
            echo -e "${BOLD}配置 Code-Server 域名${NC}"
            show_separator
            echo ""
            CODE_SERVER_BASE_DOMAIN=$(read_input "Code-Server 基础域名" "${CODE_SERVER_BASE_DOMAIN:-code.example.com}")

            if [ -f "$ENV_FILE" ]; then
                if grep -q "^CODE_SERVER_BASE_DOMAIN=" "$ENV_FILE"; then
                    sed -i.bak "s|^CODE_SERVER_BASE_DOMAIN=.*|CODE_SERVER_BASE_DOMAIN=$CODE_SERVER_BASE_DOMAIN|" "$ENV_FILE"
                else
                    echo "CODE_SERVER_BASE_DOMAIN=$CODE_SERVER_BASE_DOMAIN" >> "$ENV_FILE"
                fi
                log_success "域名配置已更新"
            else
                log_error "配置文件不存在，请先运行完整配置向导"
            fi
            press_enter
            ;;
        5)
            show_header
            echo -e "${BOLD}当前配置${NC}"
            show_separator
            echo ""
            if [ -f "$ENV_FILE" ]; then
                cat "$ENV_FILE"
            else
                log_warn "配置文件不存在"
            fi
            echo ""
            press_enter
            ;;
        6)
            show_header
            echo -e "${BOLD}从示例文件创建配置${NC}"
            show_separator
            echo ""
            if [ -f "$ENV_EXAMPLE" ]; then
                if [ -f "$ENV_FILE" ]; then
                    log_warn "配置文件已存在"
                    if read_confirm "是否覆盖?" "n"; then
                        cp "$ENV_EXAMPLE" "$ENV_FILE"
                        log_success "已从示例文件创建配置"
                        log_warn "请编辑 $ENV_FILE 设置你的参数"
                    fi
                else
                    cp "$ENV_EXAMPLE" "$ENV_FILE"
                    log_success "已从示例文件创建配置"
                    log_warn "请编辑 $ENV_FILE 设置你的参数"
                fi
            else
                log_error "示例文件 $ENV_EXAMPLE 不存在"
            fi
            press_enter
            ;;
        0)
            exit 0
            ;;
        *)
            log_error "无效的选择"
            press_enter
            quick_config_menu
            ;;
    esac
}

# ============================================
# 主程序
# ============================================

# 检查是否在正确的目录
if [ ! -d "frontend" ] || [ ! -d "backend" ]; then
    log_error "请在项目根目录运行此脚本"
    exit 1
fi

# 如果没有参数，显示快速配置菜单
if [ $# -eq 0 ]; then
    quick_config_menu
else
    # 命令行参数
    case $1 in
        --full|-f)
            run_wizard
            ;;
        --quick|-q)
            quick_config_menu
            ;;
        --help|-h)
            echo "配置向导使用说明:"
            echo ""
            echo "  $0              显示快速配置菜单"
            echo "  $0 --full       运行完整配置向导"
            echo "  $0 --quick      显示快速配置菜单"
            echo "  $0 --help       显示此帮助信息"
            echo ""
            ;;
        *)
            log_error "未知参数: $1"
            echo "使用 --help 查看帮助"
            exit 1
            ;;
    esac
fi
