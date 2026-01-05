#!/bin/bash

# ============================================
# 渐进式交互流程
# ============================================

# 加载所有模块
FLOW_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="$(dirname "$FLOW_DIR")/lib"

source "$LIB_DIR/common.sh"
source "$LIB_DIR/env-check.sh"
source "$LIB_DIR/config.sh"
source "$LIB_DIR/build.sh"
source "$LIB_DIR/verify.sh"

init_script_root

# ============================================
# 欢迎界面
# ============================================
show_welcome() {
    show_header
    echo -e "${BOLD}欢迎使用 Claude Code Container Platform 部署向导！${NC}"
    echo ""
    echo "这个向导将引导您完成以下步骤："
    echo ""
    echo -e "  ${CYAN}1.${NC} 环境检查 - 验证系统依赖"
    echo -e "  ${CYAN}2.${NC} 配置向导 - 设置环境变量"
    echo -e "  ${CYAN}3.${NC} 选择模式 - 选择部署方式"
    echo -e "  ${CYAN}4.${NC} 确认计划 - 审查即将执行的操作"
    echo -e "  ${CYAN}5.${NC} 执行部署 - 构建和安装"
    echo -e "  ${CYAN}6.${NC} 部署验证 - 确保一切正常"
    echo -e "  ${CYAN}7.${NC} 完成提示 - 后续操作建议"
    echo ""
    show_separator
    echo ""

    read_confirm "准备好开始了吗?" "y" || exit 0
}

# ============================================
# 选择部署模式
# ============================================
select_deployment_mode() {
    # 不调用 show_header，避免在 Windows 环境下的清屏/缓冲问题
    echo ""
    log_header ">>> 第 3 步：选择部署模式"
    show_separator
    echo ""

    show_menu "请选择部署模式" \
        "[*] 快速一键部署 (推荐新手)" \
        "[D] 开发环境模式 (仅构建，不部署)" \
        "[P] 生产环境模式 (完整部署)" \
        "[C] 自定义部署步骤"

    local choice=$(read_choice 4)

    echo "$choice"
}

# ============================================
# 确认部署计划
# ============================================
confirm_deployment_plan() {
    local mode=$1

    # 不调用 show_header，避免在 Windows 环境下的清屏/缓冲问题
    echo ""
    log_header ">>> 第 4 步：确认部署计划"
    show_separator
    echo ""

    case $mode in
        1)
            echo -e "${BOLD}快速一键部署${NC}"
            echo ""
            echo "将执行以下操作："
            echo "  1. 构建前端和后端"
            echo "  2. 安装文件到目标目录"
            echo "  3. 配置 systemd 服务"
            echo "  4. 启用并启动服务"
            echo "  5. 运行部署验证"
            echo ""
            echo -e "${BOLD}部署配置:${NC}"
            echo -e "  前端目录: ${YELLOW}$FRONTEND_DIR${NC}"
            echo -e "  后端目录: ${YELLOW}$BACKEND_DIR${NC}"
            echo -e "  后端端口: ${YELLOW}$BACKEND_PORT${NC}"
            echo ""
            echo "预计耗时: 3-5 分钟"
            ;;
        2)
            echo -e "${BOLD}开发环境模式${NC}"
            echo ""
            echo "将执行以下操作："
            echo "  1. 构建前端（生成 dist 目录）"
            echo "  2. 构建后端（生成可执行文件）"
            echo ""
            echo "不会执行："
            echo "  • 不安装到部署目录"
            echo "  • 不配置 systemd 服务"
            echo ""
            echo "预计耗时: 2-3 分钟"
            ;;
        3)
            echo -e "${BOLD}生产环境模式${NC}"
            echo ""
            echo "将执行以下操作："
            echo "  1. 创建部署前备份"
            echo "  2. 构建前端和后端"
            echo "  3. 安装文件到目标目录"
            echo "  4. 配置 systemd 服务"
            echo "  5. 启用并启动服务"
            echo "  6. 运行完整验证"
            echo ""
            echo -e "${BOLD}部署配置:${NC}"
            echo -e "  前端目录: ${YELLOW}$FRONTEND_DIR${NC}"
            echo -e "  后端目录: ${YELLOW}$BACKEND_DIR${NC}"
            echo -e "  后端端口: ${YELLOW}$BACKEND_PORT${NC}"
            echo ""
            echo "预计耗时: 3-5 分钟"
            ;;
        4)
            echo -e "${BOLD}自定义部署步骤${NC}"
            echo ""
            echo "您可以选择执行特定的部署步骤"
            ;;
    esac

    echo ""
    show_separator
    echo ""

    read_confirm "确认开始部署?" "y"
}

# ============================================
# 执行快速部署
# ============================================
execute_quick_deploy() {
    # 不调用 show_header，避免在 Windows 环境下的清屏/缓冲问题
    echo ""
    log_header ">>> 第 5 步：执行部署"
    show_separator
    echo ""

    local total_steps=5
    local current_step=0

    # 步骤 1: 构建前端
    current_step=$((current_step + 1))
    show_progress $current_step $total_steps "构建前端..."
    if ! build_frontend false; then
        echo ""
        log_error "前端构建失败"
        return 1
    fi

    # 步骤 2: 构建后端
    current_step=$((current_step + 1))
    show_progress $current_step $total_steps "构建后端..."
    if ! build_backend false; then
        echo ""
        log_error "后端构建失败"
        return 1
    fi

    # 步骤 3: 安装文件
    current_step=$((current_step + 1))
    show_progress $current_step $total_steps "安装文件..."
    install_files > /dev/null 2>&1

    # 步骤 4: 配置服务
    current_step=$((current_step + 1))
    show_progress $current_step $total_steps "配置服务..."
    setup_service > /dev/null 2>&1
    enable_service > /dev/null 2>&1

    # 步骤 5: 启动服务
    current_step=$((current_step + 1))
    show_progress $current_step $total_steps "启动服务..."
    if ! start_service > /dev/null 2>&1; then
        echo ""
        log_error "服务启动失败"
        return 1
    fi

    echo ""
    log_success "部署完成！"
    echo ""

    return 0
}

# ============================================
# 执行开发环境部署
# ============================================
execute_dev_deploy() {
    # 不调用 show_header，避免在 Windows 环境下的清屏/缓冲问题
    echo ""
    log_header ">>> 第 5 步：构建开发环境"
    show_separator
    echo ""

    # 构建前端
    if ! build_frontend; then
        return 1
    fi

    echo ""

    # 构建后端
    if ! build_backend; then
        return 1
    fi

    echo ""
    log_success "开发环境构建完成！"
    echo ""
    log_info "构建产物:"
    echo "  • 前端: $SCRIPT_ROOT/frontend/dist"
    echo "  • 后端: $SCRIPT_ROOT/bin/$BACKEND_BINARY"
    echo ""

    return 0
}

# ============================================
# 执行生产环境部署
# ============================================
execute_prod_deploy() {
    # 不调用 show_header，避免在 Windows 环境下的清屏/缓冲问题
    echo ""
    log_header ">>> 第 5 步：执行生产部署"
    show_separator
    echo ""

    # 创建备份
    log_step "创建部署前备份..."
    local backup_name=$(create_backup)
    echo ""

    # 构建
    if ! build_frontend; then
        log_error "前端构建失败，是否回滚到备份?"
        if read_confirm "回滚到备份 $backup_name?" "y"; then
            restore_backup "$backup_name"
        fi
        return 1
    fi

    echo ""

    if ! build_backend; then
        log_error "后端构建失败，是否回滚到备份?"
        if read_confirm "回滚到备份 $backup_name?" "y"; then
            restore_backup "$backup_name"
        fi
        return 1
    fi

    echo ""

    # 安装
    install_files
    echo ""

    # 配置服务
    setup_service
    enable_service
    echo ""

    # 启动服务
    if ! start_service; then
        log_error "服务启动失败，是否回滚到备份?"
        if read_confirm "回滚到备份 $backup_name?" "y"; then
            restore_backup "$backup_name"
            start_service
        fi
        return 1
    fi

    echo ""
    log_success "生产部署完成！"
    echo ""

    # 清理旧备份
    cleanup_old_backups

    return 0
}

# ============================================
# 自定义部署步骤
# ============================================
execute_custom_deploy() {
    while true; do
        # 不调用 show_header，避免在 Windows 环境下的清屏/缓冲问题
        echo ""
        log_header ">>> 自定义部署步骤"
        show_separator
        echo ""

        show_menu "选择要执行的步骤" \
            "构建前端" \
            "构建后端" \
            "清理构建产物" \
            "安装文件到目标目录" \
            "配置 systemd 服务" \
            "启动服务" \
            "停止服务" \
            "重启服务" \
            "查看服务状态"

        local choice=$(read_choice 9)

        if [ "$choice" = "0" ]; then
            return 0
        fi

        # 执行操作时不清屏，保持输出连续性
        echo ""

        case $choice in
            1)
                build_frontend
                ;;
            2)
                build_backend
                ;;
            3)
                clean_build
                ;;
            4)
                install_files
                ;;
            5)
                setup_service
                enable_service
                ;;
            6)
                start_service
                ;;
            7)
                stop_service
                ;;
            8)
                restart_service
                ;;
            9)
                show_service_status
                ;;
        esac

        echo ""
        press_enter
    done
}

# ============================================
# 完成提示
# ============================================
show_completion() {
    # 不调用 show_header，避免在 Windows 环境下的清屏/缓冲问题
    echo ""
    log_header ">>> 第 7 步：部署完成"
    show_separator
    echo ""

    log_success "恭喜！部署已成功完成！"
    echo ""

    log_header "访问地址:"
    echo -e "  • 后端 API: ${BLUE}http://your-server:$BACKEND_PORT${NC}"
    echo -e "  • 前端页面: ${BLUE}http://your-domain.com${NC} (需配置 Nginx)"
    echo ""

    log_header "下一步操作:"
    echo "  1. 配置 Nginx 反向代理 (参考 deploy/nginx.conf)"
    echo "  2. 配置域名 DNS 解析"
    echo "  3. 申请 SSL 证书 (推荐使用 Let's Encrypt)"
    echo "  4. 构建 Docker 基础镜像: cd $BACKEND_DIR/docker && ./build-base.sh"
    echo ""

    log_header "常用命令:"
    echo "  • 查看服务状态: sudo systemctl status $SERVICE_NAME"
    echo "  • 查看服务日志: sudo journalctl -u $SERVICE_NAME -f"
    echo "  • 重启服务: sudo systemctl restart $SERVICE_NAME"
    echo "  • 查看后端日志: tail -f $BACKEND_DIR/logs/backend.log"
    echo ""

    if [ -n "$CODE_SERVER_BASE_DOMAIN" ]; then
        log_header "Code-Server 配置提醒:"
        echo "  1. 添加 DNS 泛域名记录: *.$CODE_SERVER_BASE_DOMAIN -> 服务器IP"
        echo "  2. 配置 Nginx 子域名代理"
        echo "  3. 确认 Traefik 已启动"
        echo ""
    fi

    show_separator
    echo ""
    press_enter
}

# ============================================
# 主流程
# ============================================
run_interactive_flow() {
    cd "$SCRIPT_ROOT"
    check_project_root

    # 加载配置
    load_deploy_config
    load_env_config

    # 欢迎界面
    show_welcome

    # 步骤 1: 环境检查
    if ! show_env_check_report; then
        exit 1
    fi
    press_enter

    # 步骤 2: 配置检查
    if ! quick_config_check; then
        exit 1
    fi

    # 重新加载配置
    load_env_config

    # 步骤 3: 选择模式
    local mode=$(select_deployment_mode)

    if [ "$mode" = "0" ]; then
        log_info "部署已取消"
        exit 0
    fi

    # 步骤 4: 确认计划
    if ! confirm_deployment_plan $mode; then
        log_warn "部署已取消"
        exit 0
    fi

    # 步骤 5: 执行部署
    local deploy_success=false

    case $mode in
        1)
            execute_quick_deploy && deploy_success=true
            ;;
        2)
            execute_dev_deploy && deploy_success=true
            ;;
        3)
            execute_prod_deploy && deploy_success=true
            ;;
        4)
            execute_custom_deploy
            deploy_success=true
            ;;
    esac

    # 步骤 6: 部署验证
    if [ "$deploy_success" = "true" ] && [ "$mode" != "2" ] && [ "$mode" != "4" ]; then
        run_deployment_verification
        press_enter
    fi

    # 步骤 7: 完成提示
    if [ "$deploy_success" = "true" ] && [ "$mode" != "4" ]; then
        show_completion
    fi
}

# 运行交互流程
run_interactive_flow
