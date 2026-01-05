#!/bin/bash

# ============================================
# 环境检查模块
# ============================================

# 检查 Node.js
check_nodejs() {
    if command_exists node; then
        local version=$(node --version 2>/dev/null)
        echo "installed|$version"
    else
        echo "missing|"
    fi
}

# 检查 Go
check_go() {
    if command_exists go; then
        local version=$(go version 2>/dev/null | awk '{print $3}' | sed 's/go//')
        echo "installed|$version"
    else
        echo "missing|"
    fi
}

# 检查 Docker
check_docker() {
    if command_exists docker; then
        local version=$(docker --version 2>/dev/null | awk '{print $3}' | sed 's/,//')
        echo "installed|$version"
    else
        echo "missing|"
    fi
}

# 检查 Git
check_git() {
    if command_exists git; then
        local version=$(git --version 2>/dev/null | awk '{print $3}')
        echo "installed|$version"
    else
        echo "missing|"
    fi
}

# 检查系统状态
check_system_status() {
    local status_data=""

    # Node.js
    local node_status=$(check_nodejs)
    status_data+="node|$node_status\n"

    # Go
    local go_status=$(check_go)
    status_data+="go|$go_status\n"

    # Docker
    local docker_status=$(check_docker)
    status_data+="docker|$docker_status\n"

    # Git
    local git_status=$(check_git)
    status_data+="git|$git_status\n"

    # 构建状态
    if [ -d "$SCRIPT_ROOT/frontend/dist" ]; then
        status_data+="frontend_built|yes|\n"
    else
        status_data+="frontend_built|no|\n"
    fi

    if [ -f "$SCRIPT_ROOT/bin/$BACKEND_BINARY" ]; then
        status_data+="backend_built|yes|\n"
    else
        status_data+="backend_built|no|\n"
    fi

    # 部署状态
    if [ -f "$BACKEND_DIR/$BACKEND_BINARY" ]; then
        status_data+="backend_deployed|yes|\n"
    else
        status_data+="backend_deployed|no|\n"
    fi

    # 服务状态
    if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
        status_data+="service_running|yes|\n"
    else
        status_data+="service_running|no|\n"
    fi

    # 磁盘空间
    local disk_space=$(check_disk_space "$SCRIPT_ROOT")
    status_data+="disk_space|$disk_space|GB\n"

    echo -e "$status_data"
}

# 显示环境检查报告
show_env_check_report() {
    show_header
    log_header "第 1 步：环境检查"
    show_separator
    echo ""

    local status_data=$(check_system_status)

    # 依赖环境
    log_header "依赖环境:"
    echo ""

    # Node.js
    local node_info=$(echo -e "$status_data" | grep "^node|" | cut -d'|' -f2,3)
    local node_status=$(echo "$node_info" | cut -d'|' -f1)
    local node_version=$(echo "$node_info" | cut -d'|' -f2)

    if [ "$node_status" = "installed" ]; then
        log_success "Node.js: $node_version"
    else
        log_error "Node.js: 未安装"
    fi

    # Go
    local go_info=$(echo -e "$status_data" | grep "^go|" | cut -d'|' -f2,3)
    local go_status=$(echo "$go_info" | cut -d'|' -f1)
    local go_version=$(echo "$go_info" | cut -d'|' -f2)

    if [ "$go_status" = "installed" ]; then
        log_success "Go: $go_version"
    else
        log_error "Go: 未安装"
    fi

    # Docker
    local docker_info=$(echo -e "$status_data" | grep "^docker|" | cut -d'|' -f2,3)
    local docker_status=$(echo "$docker_info" | cut -d'|' -f1)
    local docker_version=$(echo "$docker_info" | cut -d'|' -f2)

    if [ "$docker_status" = "installed" ]; then
        log_success "Docker: $docker_version"
    else
        log_warn "Docker: 未安装 (可选)"
    fi

    # Git
    local git_info=$(echo -e "$status_data" | grep "^git|" | cut -d'|' -f2,3)
    local git_status=$(echo "$git_info" | cut -d'|' -f1)
    local git_version=$(echo "$git_info" | cut -d'|' -f2)

    if [ "$git_status" = "installed" ]; then
        log_success "Git: $git_version"
    else
        log_warn "Git: 未安装 (可选)"
    fi

    echo ""

    # 构建状态
    log_header "构建状态:"
    echo ""

    local frontend_built=$(echo -e "$status_data" | grep "^frontend_built|" | cut -d'|' -f2)
    if [ "$frontend_built" = "yes" ]; then
        log_success "前端已构建: frontend/dist"
    else
        log_info "前端未构建"
    fi

    local backend_built=$(echo -e "$status_data" | grep "^backend_built|" | cut -d'|' -f2)
    if [ "$backend_built" = "yes" ]; then
        log_success "后端已构建: bin/$BACKEND_BINARY"
    else
        log_info "后端未构建"
    fi

    echo ""

    # 部署状态
    log_header "部署状态:"
    echo ""

    local backend_deployed=$(echo -e "$status_data" | grep "^backend_deployed|" | cut -d'|' -f2)
    if [ "$backend_deployed" = "yes" ]; then
        log_success "后端已部署: $BACKEND_DIR"
    else
        log_info "后端未部署"
    fi

    local service_running=$(echo -e "$status_data" | grep "^service_running|" | cut -d'|' -f2)
    if [ "$service_running" = "yes" ]; then
        log_success "服务正在运行: $SERVICE_NAME"
    else
        log_info "服务未运行"
    fi

    echo ""

    # 系统资源
    log_header "系统资源:"
    echo ""

    local disk_space=$(echo -e "$status_data" | grep "^disk_space|" | cut -d'|' -f2)
    if [ "$disk_space" -gt 5 ]; then
        log_success "磁盘空间: ${disk_space}GB 可用"
    elif [ "$disk_space" -gt 2 ]; then
        log_warn "磁盘空间: ${disk_space}GB 可用 (建议至少5GB)"
    else
        log_error "磁盘空间不足: 仅${disk_space}GB 可用"
    fi

    echo ""

    # 检查必需依赖
    if [ "$node_status" != "installed" ] || [ "$go_status" != "installed" ]; then
        show_separator
        echo ""
        log_error "缺少必需依赖"
        echo ""
        log_info "安装建议:"

        if [ "$node_status" != "installed" ]; then
            echo "  • Node.js: https://nodejs.org/ 或使用包管理器安装"
        fi

        if [ "$go_status" != "installed" ]; then
            echo "  • Go: https://go.dev/dl/ 或使用包管理器安装"
        fi

        echo ""
        press_enter
        return 1
    fi

    return 0
}

# 快速环境检查（静默模式）
quick_env_check() {
    local status_data=$(check_system_status)

    local node_status=$(echo -e "$status_data" | grep "^node|" | cut -d'|' -f2)
    local go_status=$(echo -e "$status_data" | grep "^go|" | cut -d'|' -f2)

    if [ "$node_status" != "installed" ] || [ "$go_status" != "installed" ]; then
        return 1
    fi

    return 0
}
