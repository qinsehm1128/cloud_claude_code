#!/bin/bash

# ============================================
# Claude Code Container Platform
# 统一部署脚本 v2.0
# ============================================

set -e

# 脚本目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 加载函数库
source "$SCRIPT_DIR/deploy/lib/common.sh"

init_script_root

# ============================================
# 帮助信息
# ============================================
show_help() {
    cat << 'EOF'
Claude Code Container Platform - 统一部署脚本 v2.0

用法:
  ./deploy.sh [选项]

选项:
  无参数             启动交互式部署向导 (推荐)
  -i, --interactive  启动交互式部署向导
  -h, --help         显示此帮助信息
  -v, --version      显示版本信息

交互式部署向导特点:
  ✨ 渐进式引导流程，一步步完成部署
  🔍 自动环境检查和依赖验证
  ⚙️  智能配置向导
  📊 实时进度显示
  ✅ 部署后自动验证
  🔄 失败自动回滚
  📝 详细的操作建议

示例:
  ./deploy.sh                 # 启动交互式向导
  ./deploy.sh --interactive   # 同上
  ./deploy.sh --help          # 显示帮助

更多信息请访问: https://github.com/qinsehm1128/cloud_claude_code

EOF
}

# ============================================
# 版本信息
# ============================================
show_version() {
    echo "Claude Code Container Platform 部署脚本"
    echo "版本: $VERSION"
    echo ""
}

# ============================================
# 参数解析
# ============================================
RUN_MODE="interactive"

if [ $# -eq 0 ]; then
    RUN_MODE="interactive"
else
    case "$1" in
        -i|--interactive)
            RUN_MODE="interactive"
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        -v|--version)
            show_version
            exit 0
            ;;
        *)
            echo "错误: 未知选项 '$1'"
            echo ""
            show_help
            exit 1
            ;;
    esac
fi

# ============================================
# 执行部署
# ============================================

# 检查是否在项目根目录
check_project_root

# 根据模式执行
case "$RUN_MODE" in
    interactive)
        bash "$SCRIPT_DIR/deploy/flows/interactive.sh"
        ;;
esac
