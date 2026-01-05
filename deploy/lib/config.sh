#!/bin/bash

# ============================================
# 配置管理模块
# ============================================

# 检查配置文件是否存在
check_env_file() {
    [ -f "$SCRIPT_ROOT/$ENV_FILE" ]
}

# 检查配置是否完整
check_env_complete() {
    if ! check_env_file; then
        return 1
    fi

    local env_file="$SCRIPT_ROOT/$ENV_FILE"
    local required_vars=("PORT" "ADMIN_USERNAME" "ADMIN_PASSWORD" "JWT_SECRET")

    for var in "${required_vars[@]}"; do
        if ! grep -q "^${var}=" "$env_file"; then
            return 1
        fi
    done

    return 0
}

# 配置向导主流程
run_config_wizard() {
    show_header
    log_header ">>> 第 2 步：配置向导"
    show_separator
    echo ""

    log_info "让我们配置应用程序的环境变量"
    echo ""

    # 读取现有配置
    if check_env_file; then
        source "$SCRIPT_ROOT/$ENV_FILE" 2>/dev/null || true
    fi

    # ============================================
    # 部署目录配置
    # ============================================
    log_header "部署目录配置"
    show_separator
    echo ""

    log_info "配置应用程序的部署目录"
    echo ""

    # 前端部署目录
    local default_frontend_dir="${FRONTEND_DIR:-/var/www/cc-platform}"
    while true; do
        local input_frontend_dir=$(read_input "前端部署目录 (Nginx 静态文件目录)" "$default_frontend_dir")
        FRONTEND_DIR=$(sanitize_path "$input_frontend_dir")

        if validate_path "$FRONTEND_DIR"; then
            break
        else
            log_error "路径包含非法字符，请重新输入"
            log_info "允许的字符: 字母、数字、斜杠 /、下划线 _、连字符 -、点 .、空格、冒号 :"
        fi
    done

    # 后端部署目录
    local default_backend_dir="${BACKEND_DIR:-/opt/cc-platform}"
    while true; do
        local input_backend_dir=$(read_input "后端部署目录 (后端程序安装目录)" "$default_backend_dir")
        BACKEND_DIR=$(sanitize_path "$input_backend_dir")

        if validate_path "$BACKEND_DIR"; then
            break
        else
            log_error "路径包含非法字符，请重新输入"
            log_info "允许的字符: 字母、数字、斜杠 /、下划线 _、连字符 -、点 .、空格、冒号 :"
        fi
    done

    echo ""

    # ============================================
    # 基础配置
    # ============================================
    log_header "基础配置"
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

    # 前端端口
    FRONTEND_PORT=$(read_input "前端开发服务器端口 (仅开发环境)" "${FRONTEND_PORT:-3000}")

    echo ""

    # ============================================
    # 管理员账户
    # ============================================
    log_header "管理员账户"
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
    # 安全配置
    # ============================================
    log_header "安全配置"
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
    # Docker 配置
    # ============================================
    log_header "Docker 配置"
    show_separator
    echo ""

    # Traefik
    if read_confirm "是否自动启动 Traefik (用于容器路由)?" "${AUTO_START_TRAEFIK:-n}"; then
        AUTO_START_TRAEFIK="true"
    else
        AUTO_START_TRAEFIK="false"
    fi

    # Code-Server 域名
    CODE_SERVER_BASE_DOMAIN="${CODE_SERVER_BASE_DOMAIN:-}"
    if [ "$AUTO_START_TRAEFIK" = "true" ]; then
        echo ""
        log_info "Code-Server 子域名配置 (可选，用于通过子域名访问容器)"
        echo ""

        CODE_SERVER_BASE_DOMAIN=$(read_input "Code-Server 基础域名 (如: code.example.com)" "${CODE_SERVER_BASE_DOMAIN}")

        if [ -n "$CODE_SERVER_BASE_DOMAIN" ] && ! validate_domain "$CODE_SERVER_BASE_DOMAIN"; then
            log_warn "域名格式可能不正确，请确认"
        fi
    fi

    echo ""

    # ============================================
    # 配置摘要
    # ============================================
    show_separator
    log_header "配置摘要"
    show_separator
    echo ""

    echo -e "${BOLD}部署目录:${NC}"
    echo -e "  前端目录:       ${YELLOW}$FRONTEND_DIR${NC}"
    echo -e "  后端目录:       ${YELLOW}$BACKEND_DIR${NC}"
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
    echo -e "  自动启动 Traefik: ${YELLOW}$AUTO_START_TRAEFIK${NC}"
    [ -n "$CODE_SERVER_BASE_DOMAIN" ] && echo -e "  Code-Server 域名: ${YELLOW}$CODE_SERVER_BASE_DOMAIN${NC}"
    echo ""

    show_separator
    echo ""

    # ============================================
    # 确认和保存
    # ============================================
    if ! read_confirm "确认保存此配置?" "y"; then
        log_warn "配置未保存"
        return 1
    fi

    echo ""

    # 备份现有配置
    if check_env_file; then
        cp "$SCRIPT_ROOT/$ENV_FILE" "$SCRIPT_ROOT/${ENV_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
        log_info "已备份现有配置"
    fi

    # 生成配置文件
    cat > "$SCRIPT_ROOT/$ENV_FILE" << EOF
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
JWT_SECRET=$JWT_SECRET

# ============================================
# Docker 配置
# ============================================

# 是否自动启动 Traefik (容器反向代理)
AUTO_START_TRAEFIK=$AUTO_START_TRAEFIK

# Code-Server 子域名基础域名
${CODE_SERVER_BASE_DOMAIN:+CODE_SERVER_BASE_DOMAIN=$CODE_SERVER_BASE_DOMAIN}
${CODE_SERVER_BASE_DOMAIN:-# CODE_SERVER_BASE_DOMAIN=code.example.com}

# ============================================
# 其他可选配置
# ============================================

# 数据目录 (默认: ./data)
# DATA_DIR=./data

# 日志目录 (默认: ./logs)
# LOG_DIR=./logs

# 数据库文件路径
# DATABASE_PATH=./data/cc-platform.db

# 日志级别 (debug, info, warn, error)
# LOG_LEVEL=info

# Docker 网络名称
# DOCKER_NETWORK=cc-network

# 容器镜像前缀
# IMAGE_PREFIX=cc

# 容器默认内存限制 (默认: 2g)
# CONTAINER_MEMORY_LIMIT=2g

# 容器默认 CPU 限制 (默认: 2)
# CONTAINER_CPU_LIMIT=2

# Traefik HTTP 端口范围 (默认: 38000-39000)
# TRAEFIK_HTTP_PORT_START=38000
# TRAEFIK_HTTP_PORT_END=39000

# 环境类型 (development, production)
# NODE_ENV=production

# 是否启用调试模式
# DEBUG=false
EOF

    chmod 600 "$SCRIPT_ROOT/$ENV_FILE"
    log_success "配置已保存到 $ENV_FILE"

    # 保存部署配置
    save_deploy_config
    log_success "部署配置已保存到 $CONFIG_FILE"

    echo ""
    return 0
}

# 快速配置检查
quick_config_check() {
    if ! check_env_complete; then
        show_header
        log_header "[!] 配置检查"
        show_separator
        echo ""

        if ! check_env_file; then
            log_warn "未找到配置文件 $ENV_FILE"
        else
            log_warn "配置文件不完整"
        fi

        echo ""
        log_info "需要运行配置向导来创建配置文件"
        echo ""

        if read_confirm "现在运行配置向导?" "y"; then
            run_config_wizard
            return $?
        else
            return 1
        fi
    fi

    # 配置完整时，显示确认信息
    echo ""
    log_header ">>> 第 2 步：配置检查"
    show_separator
    echo ""
    log_success "环境配置已完成"
    echo ""
    show_separator
    echo ""
    press_enter

    return 0
}

# 显示当前配置
show_current_config() {
    if ! check_env_file; then
        log_warn "配置文件不存在"
        return 1
    fi

    echo ""
    log_header "当前配置"
    show_separator
    echo ""

    cat "$SCRIPT_ROOT/$ENV_FILE"
    echo ""
}
