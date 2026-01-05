#!/bin/bash

# ============================================
# 部署验证模块
# ============================================

# 验证服务启动
verify_service_running() {
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        return 0
    else
        return 1
    fi
}

# 验证端口监听
verify_port_listening() {
    local port=$1
    local max_retries=30
    local retry=0

    while [ $retry -lt $max_retries ]; do
        if check_port $port; then
            return 0
        fi
        sleep 1
        retry=$((retry + 1))
    done

    return 1
}

# 验证 HTTP 端点
verify_http_endpoint() {
    local url="$1"
    local max_retries=10
    local retry=0

    while [ $retry -lt $max_retries ]; do
        if command_exists curl; then
            local response=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null)
            if [ "$response" = "200" ] || [ "$response" = "401" ] || [ "$response" = "404" ]; then
                return 0
            fi
        elif command_exists wget; then
            if wget -q --spider "$url" 2>/dev/null; then
                return 0
            fi
        fi
        sleep 1
        retry=$((retry + 1))
    done

    return 1
}

# 运行部署验证
run_deployment_verification() {
    show_header
    log_header "${ICON_CHECK} 第 6 步：部署验证"
    show_separator
    echo ""

    local all_passed=true

    # 1. 检查服务状态
    log_info "检查服务状态..."
    if verify_service_running; then
        log_success "服务正在运行"
    else
        log_error "服务未运行"
        all_passed=false
    fi

    # 2. 检查端口监听
    log_info "检查端口监听 (端口: $BACKEND_PORT)..."
    if verify_port_listening $BACKEND_PORT; then
        log_success "端口 $BACKEND_PORT 正在监听"
    else
        log_error "端口 $BACKEND_PORT 未监听"
        all_passed=false
    fi

    # 3. 检查 HTTP 端点
    local api_url="http://127.0.0.1:$BACKEND_PORT/api/health"
    log_info "检查 API 健康端点..."
    if verify_http_endpoint "$api_url"; then
        log_success "API 健康端点响应正常"
    else
        log_warn "API 健康端点未响应 (可能需要登录)"
    fi

    # 4. 检查前端文件
    if [ -d "$FRONTEND_DIR" ] && [ -f "$FRONTEND_DIR/index.html" ]; then
        log_success "前端文件已部署"
    else
        log_warn "前端文件未找到"
    fi

    # 5. 检查后端文件
    if [ -f "$BACKEND_DIR/$BACKEND_BINARY" ]; then
        log_success "后端可执行文件已部署"
    else
        log_error "后端可执行文件未找到"
        all_passed=false
    fi

    # 6. 检查配置文件
    if [ -f "$BACKEND_DIR/.env" ]; then
        log_success "配置文件存在"
    else
        log_warn "配置文件未找到"
    fi

    # 7. 检查日志目录
    if [ -d "$BACKEND_DIR/logs" ]; then
        log_success "日志目录已创建"
    else
        log_warn "日志目录未找到"
    fi

    echo ""
    show_separator
    echo ""

    if [ "$all_passed" = "true" ]; then
        log_success "部署验证通过！"
        return 0
    else
        log_error "部署验证发现问题"
        echo ""
        log_info "建议操作:"
        echo "  1. 查看服务日志: sudo journalctl -u $SERVICE_NAME -n 50"
        echo "  2. 查看服务状态: sudo systemctl status $SERVICE_NAME"
        echo "  3. 检查配置文件: cat $BACKEND_DIR/.env"
        return 1
    fi
}

# 快速验证（静默模式）
quick_verify() {
    if ! verify_service_running; then
        return 1
    fi

    if ! verify_port_listening $BACKEND_PORT; then
        return 1
    fi

    return 0
}

# 生成验证报告
generate_verification_report() {
    local report_file="$SCRIPT_ROOT/deployment-report.txt"

    cat > "$report_file" << EOF
部署验证报告
============================================
时间: $(date '+%Y-%m-%d %H:%M:%S')

服务信息:
- 服务名称: $SERVICE_NAME
- 后端端口: $BACKEND_PORT
- 前端端口: $FRONTEND_PORT

部署目录:
- 前端目录: $FRONTEND_DIR
- 后端目录: $BACKEND_DIR

验证结果:
EOF

    # 服务状态
    if verify_service_running; then
        echo "- [✓] 服务正在运行" >> "$report_file"
    else
        echo "- [✗] 服务未运行" >> "$report_file"
    fi

    # 端口监听
    if check_port $BACKEND_PORT; then
        echo "- [✓] 端口 $BACKEND_PORT 正在监听" >> "$report_file"
    else
        echo "- [✗] 端口 $BACKEND_PORT 未监听" >> "$report_file"
    fi

    # 文件检查
    if [ -f "$BACKEND_DIR/$BACKEND_BINARY" ]; then
        echo "- [✓] 后端可执行文件已部署" >> "$report_file"
    else
        echo "- [✗] 后端可执行文件未找到" >> "$report_file"
    fi

    if [ -d "$FRONTEND_DIR" ]; then
        echo "- [✓] 前端文件已部署" >> "$report_file"
    else
        echo "- [✗] 前端文件未找到" >> "$report_file"
    fi

    log_success "验证报告已生成: $report_file"
}
