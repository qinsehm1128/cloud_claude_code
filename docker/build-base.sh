#!/bin/bash

# Build the base images for Claude Code containers
# Creates two images:
#   - cc-base:latest (without code-server)
#   - cc-base:with-code-server (with code-server)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE_NAME="cc-base"
CLEAN_BUILD=false
NO_CACHE=""

show_help() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --clean     Remove existing images and build cache before building"
    echo "  --no-cache  Build without using Docker cache (but don't remove images)"
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

echo "========================================"
echo "Building Claude Code base images"
echo "========================================"

if [ "$CLEAN_BUILD" = true ]; then
    echo ""
    echo "[0/3] Cleaning up existing images and cache..."
    docker images "${IMAGE_NAME}" -q | xargs -r docker rmi -f 2>/dev/null || true
    docker images -f "dangling=true" -q | xargs -r docker rmi -f 2>/dev/null || true
    docker builder prune -f --filter "until=24h" 2>/dev/null || true
    echo "✓ Cleanup complete"
fi

echo ""
echo "[1/3] Building base image (without code-server)..."
docker build \
    ${NO_CACHE} \
    --build-arg INSTALL_CODE_SERVER=false \
    -t "${IMAGE_NAME}:latest" \
    -f "${SCRIPT_DIR}/Dockerfile.base" \
    "${SCRIPT_DIR}"
echo "✓ Built: ${IMAGE_NAME}:latest"

echo ""
echo "[2/3] Building image with code-server..."
docker build \
    ${NO_CACHE} \
    --build-arg INSTALL_CODE_SERVER=true \
    -t "${IMAGE_NAME}:with-code-server" \
    -f "${SCRIPT_DIR}/Dockerfile.base" \
    "${SCRIPT_DIR}"
echo "✓ Built: ${IMAGE_NAME}:with-code-server"

echo ""
echo "========================================"
echo "Verifying images..."
echo "========================================"

echo ""
echo "--- ${IMAGE_NAME}:latest ---"
docker run --rm "${IMAGE_NAME}:latest" bash -c "
    echo 'Node.js:' \$(node --version)
    echo 'npm:' \$(npm --version)
    echo 'Git:' \$(git --version | cut -d' ' -f3)
    echo 'Claude Code:' \$(which claude > /dev/null && echo 'installed' || echo 'not found')
    echo 'code-server:' \$(which code-server > /dev/null && echo 'installed' || echo 'not installed')
"

echo ""
echo "--- ${IMAGE_NAME}:with-code-server ---"
docker run --rm "${IMAGE_NAME}:with-code-server" bash -c "
    echo 'Node.js:' \$(node --version)
    echo 'npm:' \$(npm --version)
    echo 'Git:' \$(git --version | cut -d' ' -f3)
    echo 'Claude Code:' \$(which claude > /dev/null && echo 'installed' || echo 'not found')
    echo 'code-server:' \$(which code-server > /dev/null && echo 'installed' || echo 'not installed')
"

echo ""
echo "========================================"
echo "Build complete!"
echo "========================================"
echo "Available images:"
docker images "${IMAGE_NAME}" --format "  - {{.Repository}}:{{.Tag}}\t({{.Size}})"
