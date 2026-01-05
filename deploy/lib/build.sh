#!/bin/bash

# ============================================
# 构建模块
# ============================================

# 构建前端
build_frontend() {
    local show_progress=${1:-true}

    if [ "$show_progress" = "true" ]; then
        log_step "构建前端..."
    fi

    cd "$SCRIPT_ROOT/frontend"

    # 安装依赖
    if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules" ]; then
        if [ "$show_progress" = "true" ]; then
            log_info "安装 npm 依赖..."
        fi
        npm install > /dev/null 2>&1 || npm install
    fi

    # 构建
    if [ "$show_progress" = "true" ]; then
        log_info "运行构建命令..."
    fi

    npm run build

    cd "$SCRIPT_ROOT"

    if [ -d "frontend/dist" ]; then
        if [ "$show_progress" = "true" ]; then
            log_success "前端构建完成"
        fi
        return 0
    else
        if [ "$show_progress" = "true" ]; then
            log_error "前端构建失败"
        fi
        return 1
    fi
}

# 构建后端
build_backend() {
    local show_progress=${1:-true}

    if [ "$show_progress" = "true" ]; then
        log_step "构建后端..."
    fi

    cd "$SCRIPT_ROOT/backend"

    # 下载依赖
    if [ "$show_progress" = "true" ]; then
        log_info "下载 Go 模块..."
    fi
    go mod download > /dev/null 2>&1

    # 构建
    if [ "$show_progress" = "true" ]; then
        log_info "编译后端程序..."
    fi

    mkdir -p "$SCRIPT_ROOT/bin"
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o "$SCRIPT_ROOT/bin/$BACKEND_BINARY" ./cmd/server

    cd "$SCRIPT_ROOT"

    if [ -f "bin/$BACKEND_BINARY" ]; then
        if [ "$show_progress" = "true" ]; then
            log_success "后端构建完成"
        fi
        return 0
    else
        if [ "$show_progress" = "true" ]; then
            log_error "后端构建失败"
        fi
        return 1
    fi
}

# 清理构建产物
clean_build() {
    log_info "清理构建产物..."
    rm -rf "$SCRIPT_ROOT/frontend/dist"
    rm -rf "$SCRIPT_ROOT/bin"
    log_success "清理完成"
}

# 安装文件到目标目录
install_files() {
    log_step "安装文件到目标目录..."

    # 安装前端
    if [ -d "$SCRIPT_ROOT/frontend/dist" ]; then
        log_info "安装前端到 $FRONTEND_DIR..."
        sudo mkdir -p "$FRONTEND_DIR"
        sudo cp -r "$SCRIPT_ROOT/frontend/dist/"* "$FRONTEND_DIR/"
        log_success "前端已安装"
    else
        log_warn "前端未构建，跳过安装"
    fi

    # 安装后端
    if [ -f "$SCRIPT_ROOT/bin/$BACKEND_BINARY" ]; then
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

        # 复制二进制文件
        sudo cp "$SCRIPT_ROOT/bin/$BACKEND_BINARY" "$BACKEND_DIR/"
        sudo chmod +x "$BACKEND_DIR/$BACKEND_BINARY"

        # 复制 docker 目录
        if [ -d "$SCRIPT_ROOT/docker" ]; then
            sudo mkdir -p "$BACKEND_DIR/docker"
            sudo cp -r "$SCRIPT_ROOT/docker/"* "$BACKEND_DIR/docker/" 2>/dev/null || true
        fi

        # 处理配置文件
        if [ -f "$SCRIPT_ROOT/$ENV_FILE" ]; then
            # 如果目标目录已有配置文件，先备份
            if [ -f "$BACKEND_DIR/.env" ]; then
                sudo cp "$BACKEND_DIR/.env" "$BACKEND_DIR/.env.backup.$(date +%Y%m%d_%H%M%S)"
                log_info "已备份现有配置文件"
            fi

            # 复制新配置文件
            sudo cp "$SCRIPT_ROOT/$ENV_FILE" "$BACKEND_DIR/.env"
            log_success "已更新配置文件"
        fi

        log_success "后端已安装"
    else
        log_warn "后端未构建，跳过安装"
    fi
}

# 配置 systemd 服务
setup_service() {
    log_step "配置 systemd 服务..."

    # 读取端口配置
    local port=$BACKEND_PORT
    if [ -f "$BACKEND_DIR/.env" ]; then
        local env_port=$(grep -E "^PORT=" "$BACKEND_DIR/.env" 2>/dev/null | cut -d'=' -f2 | tr -d '"' | tr -d "'" | tr -d ' ')
        [ -n "$env_port" ] && port=$env_port
    fi

    local service_file="/etc/systemd/system/${SERVICE_NAME}.service"

    sudo tee "$service_file" > /dev/null << EOF
[Unit]
Description=Claude Code Container Platform Backend
Documentation=https://github.com/qinsehm1128/cloud_claude_code
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

# 启动服务
start_service() {
    log_step "启动服务..."
    sudo systemctl start "$SERVICE_NAME"
    sleep 2

    if systemctl is-active --quiet "$SERVICE_NAME"; then
        log_success "服务启动成功"
        return 0
    else
        log_error "服务启动失败"
        return 1
    fi
}

# 停止服务
stop_service() {
    log_step "停止服务..."
    sudo systemctl stop "$SERVICE_NAME" 2>/dev/null || true
    log_success "服务已停止"
}

# 重启服务
restart_service() {
    log_step "重启服务..."
    sudo systemctl restart "$SERVICE_NAME"
    sleep 2

    if systemctl is-active --quiet "$SERVICE_NAME"; then
        log_success "服务重启成功"
        return 0
    else
        log_error "服务重启失败"
        return 1
    fi
}

# 启用服务开机自启
enable_service() {
    log_step "启用服务开机自启..."
    sudo systemctl enable "$SERVICE_NAME"
    log_success "服务已设置为开机自启"
}

# 查看服务状态
show_service_status() {
    echo ""
    log_header "服务状态"
    show_separator
    echo ""
    sudo systemctl status "$SERVICE_NAME" --no-pager || true
    echo ""
}
