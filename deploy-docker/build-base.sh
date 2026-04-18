#!/bin/bash
# ============================================
# Build Base Images for AI Coding Agent Containers
# 构建 AI 编程代理容器基础镜像 (Claude Code + Codex + Gemini)
# ============================================

set -e

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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_DIR="${SCRIPT_DIR}"
IMAGE_NAME="cc-base"
CLEAN_BUILD=false
NO_CACHE=""

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

if ! command -v docker &> /dev/null; then
    print_msg "Error: Docker is not installed" "$RED"
    exit 1
fi

if ! docker info &> /dev/null; then
    print_msg "Error: Docker daemon is not running" "$RED"
    exit 1
fi

if [ "$CLEAN_BUILD" = true ]; then
    print_msg "" ""
    print_msg "[0/3] Cleaning up existing images and cache..." "$YELLOW"
    docker images "${IMAGE_NAME}" -q | xargs -r docker rmi -f 2>/dev/null || true
    docker images -f "dangling=true" -q | xargs -r docker rmi -f 2>/dev/null || true
    docker builder prune -f --filter "until=24h" 2>/dev/null || true
    print_msg "Cleanup complete" "$GREEN"
fi

print_msg "" ""
print_msg "[1/3] Building base image (without code-server)..." "$YELLOW"
docker build \
    ${NO_CACHE} \
    --build-arg INSTALL_CODE_SERVER=false \
    -t "${IMAGE_NAME}:latest" \
    -f "${DOCKER_DIR}/Dockerfile.base" \
    "${DOCKER_DIR}"
print_msg "Built: ${IMAGE_NAME}:latest" "$GREEN"

print_msg "" ""
print_msg "[2/3] Building image with code-server..." "$YELLOW"
docker build \
    ${NO_CACHE} \
    --build-arg INSTALL_CODE_SERVER=true \
    -t "${IMAGE_NAME}:with-code-server" \
    -f "${DOCKER_DIR}/Dockerfile.base" \
    "${DOCKER_DIR}"
print_msg "Built: ${IMAGE_NAME}:with-code-server" "$GREEN"

print_header "Verifying Images"

print_msg "" ""
print_msg "--- ${IMAGE_NAME}:latest ---" "$BLUE"
docker run --rm "${IMAGE_NAME}:latest" bash -c "
    echo 'Node.js:' \$(node --version 2>/dev/null || echo 'N/A')
    echo 'npm:' \$(npm --version 2>/dev/null || echo 'N/A')
    echo 'Git:' \$(git --version 2>/dev/null | cut -d' ' -f3 || echo 'N/A')
    echo 'Claude Code:' \$(which claude > /dev/null 2>&1 && echo 'installed' || echo 'not found')
    echo 'Codex CLI:' \$(which codex > /dev/null 2>&1 && echo 'installed' || echo 'not found')
    echo 'Gemini CLI:' \$(which gemini > /dev/null 2>&1 && echo 'installed' || echo 'not found')
    echo 'code-server:' \$(which code-server > /dev/null 2>&1 && echo 'installed' || echo 'not installed')
"

print_msg "" ""
print_msg "--- ${IMAGE_NAME}:with-code-server ---" "$BLUE"
docker run --rm "${IMAGE_NAME}:with-code-server" bash -c "
    echo 'Node.js:' \$(node --version 2>/dev/null || echo 'N/A')
    echo 'npm:' \$(npm --version 2>/dev/null || echo 'N/A')
    echo 'Git:' \$(git --version 2>/dev/null | cut -d' ' -f3 || echo 'N/A')
    echo 'Claude Code:' \$(which claude > /dev/null 2>&1 && echo 'installed' || echo 'not found')
    echo 'Codex CLI:' \$(which codex > /dev/null 2>&1 && echo 'installed' || echo 'not found')
    echo 'Gemini CLI:' \$(which gemini > /dev/null 2>&1 && echo 'installed' || echo 'not found')
    echo 'code-server:' \$(which code-server > /dev/null 2>&1 && echo 'installed' || echo 'not installed')
"

print_header "Build Complete!"
print_msg "Available images:" "$GREEN"
docker images "${IMAGE_NAME}" --format "  - {{.Repository}}:{{.Tag}}\t({{.Size}})"
