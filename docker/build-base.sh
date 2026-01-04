#!/bin/bash

# Build the base images for Claude Code containers
# Creates two images:
#   - cc-base:latest (without code-server)
#   - cc-base:with-code-server (with code-server)
#
# Usage:
#   ./build-base.sh              # Normal build (uses cache)
#   ./build-base.sh --clean      # Clean build (remove old images and cache first)
#   ./build-base.sh --help       # Show help

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE_NAME="cc-base"
EXTENSION_DIR="${SCRIPT_DIR}/extensions"
CLEAN_BUILD=false
NO_CACHE=""

# Parse command line arguments
show_help() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --clean     Remove existing images and build cache before building"
    echo "  --no-cache  Build without using Docker cache (but don't remove images)"
    echo "  --help      Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0              # Normal build with cache"
    echo "  $0 --clean      # Full clean rebuild"
    echo "  $0 --no-cache   # Rebuild without cache"
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

# Clean up existing images and cache if requested
if [ "$CLEAN_BUILD" = true ]; then
    echo ""
    echo "[0/4] Cleaning up existing images and cache..."
    
    # Remove existing cc-base images
    echo "  - Removing existing ${IMAGE_NAME} images..."
    docker images "${IMAGE_NAME}" -q | xargs -r docker rmi -f 2>/dev/null || true
    
    # Remove dangling images
    echo "  - Removing dangling images..."
    docker images -f "dangling=true" -q | xargs -r docker rmi -f 2>/dev/null || true
    
    # Remove build cache for this image
    echo "  - Pruning build cache..."
    docker builder prune -f --filter "until=24h" 2>/dev/null || true
    
    # Clean extension build artifacts
    echo "  - Cleaning extension artifacts..."
    rm -rf "${EXTENSION_DIR}"
    rm -rf "${SCRIPT_DIR}/../vscode-extension/out"
    rm -rf "${SCRIPT_DIR}/../vscode-extension/node_modules"
    rm -f "${SCRIPT_DIR}/../vscode-extension/*.vsix"
    
    echo "✓ Cleanup complete"
fi

# Build VS Code extension if source exists
if [ -d "${SCRIPT_DIR}/../vscode-extension" ]; then
    echo ""
    echo "[1/4] Building PTY Automation VS Code extension..."
    mkdir -p "${EXTENSION_DIR}"
    
    cd "${SCRIPT_DIR}/../vscode-extension"
    
    # Install dependencies and build
    if [ ! -d "node_modules" ]; then
        npm install
    fi
    npm run compile
    
    # Package extension
    if ! command -v vsce &> /dev/null; then
        npm install -g @vscode/vsce
    fi
    vsce package --out "${EXTENSION_DIR}/pty-automation-monitor.vsix"
    
    cd "${SCRIPT_DIR}"
    echo "✓ Built: pty-automation-monitor.vsix"
else
    echo ""
    echo "[1/4] Warning: vscode-extension directory not found, skipping extension build"
    mkdir -p "${EXTENSION_DIR}"
fi

# Build base image (without code-server)
echo ""
echo "[2/4] Building base image (without code-server)..."
docker build \
    ${NO_CACHE} \
    --build-arg INSTALL_CODE_SERVER=false \
    -t "${IMAGE_NAME}:latest" \
    -f "${SCRIPT_DIR}/Dockerfile.base" \
    "${SCRIPT_DIR}"
echo "✓ Built: ${IMAGE_NAME}:latest"

# Build image with code-server
echo ""
echo "[3/4] Building image with code-server..."
docker build \
    ${NO_CACHE} \
    --build-arg INSTALL_CODE_SERVER=true \
    -t "${IMAGE_NAME}:with-code-server" \
    -f "${SCRIPT_DIR}/Dockerfile.base" \
    "${SCRIPT_DIR}"
echo "✓ Built: ${IMAGE_NAME}:with-code-server"

# Verify the images
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
    echo 'PTY Automation:' \$(code-server --list-extensions 2>/dev/null | grep -q 'pty-automation' && echo 'installed' || echo 'not installed')
"

# Cleanup extension build artifacts
echo ""
echo "[4/4] Cleaning up build artifacts..."
rm -rf "${EXTENSION_DIR}"

echo ""
echo "========================================"
echo "Build complete!"
echo "========================================"
echo "Available images:"
docker images "${IMAGE_NAME}" --format "  - {{.Repository}}:{{.Tag}}\t({{.Size}})"
echo ""
echo "To do a clean rebuild next time, run:"
echo "  $0 --clean"
echo ""
