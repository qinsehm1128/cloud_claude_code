#!/bin/bash
# ============================================
# Build Base Images for Claude Code Containers
# 构建 Claude Code 容器基础镜像
# ============================================
#
# This script builds two base images:
#   - cc-base:latest (without code-server)
#   - cc-base:with-code-server (with code-server)
#
# These images are required for creating user development containers.
#
# 此脚本构建两个基础镜像：
#   - cc-base:latest（不含 code-server）
#   - cc-base:with-code-server（含 code-server）
#
# 这些镜像用于创建用户的开发环境容器。
#
# Usage / 使用方法:
#   ./build-base.sh              # Normal build / 常规构建
#   ./build-base.sh --clean      # Clean build / 清理构建
#   ./build-base.sh --no-cache   # Build without cache / 不使用缓存构建
#
# ============================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_msg() {
    echo -e "${2}${1}${NC}"
}

print_header() {
    echo ""
    print_msg "============================================" "$BLUE"
    print_msg "$1" "$BLUE"
    print_msg "============================================" "$BLUE"
}

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DOCKER_DIR="${PROJECT_ROOT}/docker"

IMAGE_NAME="cc-base"
EXTENSION_DIR="${DOCKER_DIR}/extensions"
CLEAN_BUILD=false
NO_CACHE=""

# Parse arguments
show_help() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --clean     Remove existing images and build cache before building"
    echo "  --no-cache  Build without using Docker cache"
    echo "  --help      Show this help message"
}

while [[ $# -gt 0 ]]; do
    case $1 in
        --clean)
            CLEAN_BUILD=true
            NO_CACHE="--no-cache"
            shift
            ;;
        --no-cache)
            NO_CACHE="--no-cache"
            shift
            ;;
        --help|-h)
            show_help
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

print_header "Building Claude Code Base Images"

# Check Docker
if ! command -v docker &> /dev/null; then
    print_msg "Error: Docker is not installed" "$RED"
    exit 1
fi

if ! docker info &> /dev/null; then
    print_msg "Error: Docker daemon is not running" "$RED"
    exit 1
fi

print_msg "Docker is available" "$GREEN"

# Check if Dockerfile.base exists
if [ ! -f "${DOCKER_DIR}/Dockerfile.base" ]; then
    print_msg "Error: ${DOCKER_DIR}/Dockerfile.base not found" "$RED"
    exit 1
fi

# Clean up if requested
if [ "$CLEAN_BUILD" = true ]; then
    print_msg "" ""
    print_msg "[0/4] Cleaning up existing images and cache..." "$YELLOW"

    # Remove existing cc-base images
    docker images "${IMAGE_NAME}" -q | xargs -r docker rmi -f 2>/dev/null || true

    # Remove dangling images
    docker images -f "dangling=true" -q | xargs -r docker rmi -f 2>/dev/null || true

    # Prune build cache
    docker builder prune -f --filter "until=24h" 2>/dev/null || true

    # Clean extension build artifacts
    rm -rf "${EXTENSION_DIR}"
    rm -rf "${PROJECT_ROOT}/vscode-extension/out"
    rm -rf "${PROJECT_ROOT}/vscode-extension/node_modules"
    rm -f "${PROJECT_ROOT}/vscode-extension/*.vsix"

    print_msg "Cleanup complete" "$GREEN"
fi

# Build VS Code extension if source exists
print_msg "" ""
print_msg "[1/4] Building PTY Automation VS Code extension..." "$YELLOW"

if [ -d "${PROJECT_ROOT}/vscode-extension" ]; then
    mkdir -p "${EXTENSION_DIR}"

    cd "${PROJECT_ROOT}/vscode-extension"

    # Install dependencies and build
    if [ ! -d "node_modules" ]; then
        print_msg "  Installing dependencies..." ""
        npm install
    fi

    print_msg "  Compiling TypeScript..." ""
    npm run compile

    # Package extension
    if ! command -v vsce &> /dev/null; then
        print_msg "  Installing vsce..." ""
        npm install -g @vscode/vsce
    fi

    print_msg "  Packaging extension..." ""
    vsce package --out "${EXTENSION_DIR}/pty-automation-monitor.vsix" --allow-missing-repository

    cd "${SCRIPT_DIR}"

    if [ -f "${EXTENSION_DIR}/pty-automation-monitor.vsix" ]; then
        print_msg "Extension built successfully" "$GREEN"
    else
        print_msg "Warning: Failed to build extension, continuing without it" "$YELLOW"
    fi
else
    print_msg "Warning: vscode-extension directory not found, skipping extension build" "$YELLOW"
    mkdir -p "${EXTENSION_DIR}"
fi

# Build base image (without code-server)
print_msg "" ""
print_msg "[2/4] Building base image (without code-server)..." "$YELLOW"
docker build \
    ${NO_CACHE} \
    --build-arg INSTALL_CODE_SERVER=false \
    -t "${IMAGE_NAME}:latest" \
    -f "${DOCKER_DIR}/Dockerfile.base" \
    "${DOCKER_DIR}"
print_msg "Built: ${IMAGE_NAME}:latest" "$GREEN"

# Build image with code-server
print_msg "" ""
print_msg "[3/4] Building image with code-server..." "$YELLOW"
docker build \
    ${NO_CACHE} \
    --build-arg INSTALL_CODE_SERVER=true \
    -t "${IMAGE_NAME}:with-code-server" \
    -f "${DOCKER_DIR}/Dockerfile.base" \
    "${DOCKER_DIR}"
print_msg "Built: ${IMAGE_NAME}:with-code-server" "$GREEN"

# Verify images
print_header "Verifying Images"

print_msg "" ""
print_msg "--- ${IMAGE_NAME}:latest ---" "$BLUE"
docker run --rm "${IMAGE_NAME}:latest" bash -c "
    echo 'Node.js:' \$(node --version)
    echo 'npm:' \$(npm --version)
    echo 'Git:' \$(git --version | cut -d' ' -f3)
    echo 'Claude Code:' \$(which claude > /dev/null && echo 'installed' || echo 'not found')
    echo 'code-server:' \$(which code-server > /dev/null && echo 'installed' || echo 'not installed')
"

print_msg "" ""
print_msg "--- ${IMAGE_NAME}:with-code-server ---" "$BLUE"
docker run --rm "${IMAGE_NAME}:with-code-server" bash -c "
    echo 'Node.js:' \$(node --version)
    echo 'npm:' \$(npm --version)
    echo 'Git:' \$(git --version | cut -d' ' -f3)
    echo 'Claude Code:' \$(which claude > /dev/null && echo 'installed' || echo 'not found')
    echo 'code-server:' \$(which code-server > /dev/null && echo 'installed' || echo 'not installed')
    echo 'PTY Automation:' \$(code-server --list-extensions 2>/dev/null | grep -q 'pty-automation' && echo 'installed' || echo 'not installed')
"

# Cleanup
print_msg "" ""
print_msg "[4/4] Cleaning up build artifacts..." "$YELLOW"
rm -rf "${EXTENSION_DIR}"

print_header "Build Complete!"
print_msg "Available images:" "$GREEN"
docker images "${IMAGE_NAME}" --format "  - {{.Repository}}:{{.Tag}}\t({{.Size}})"
print_msg "" ""
print_msg "These base images are required for the platform to create user containers." "$YELLOW"
print_msg "You can now start the platform with: docker compose up -d" ""
