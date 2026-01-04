#!/bin/bash

# Build the base images for Claude Code containers
# Creates two images:
#   - cc-base:latest (without code-server)
#   - cc-base:with-code-server (with code-server)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE_NAME="cc-base"
EXTENSION_DIR="${SCRIPT_DIR}/extensions"

echo "========================================"
echo "Building Claude Code base images"
echo "========================================"

# Build VS Code extension if source exists
if [ -d "${SCRIPT_DIR}/../vscode-extension" ]; then
    echo ""
    echo "[0/3] Building PTY Automation VS Code extension..."
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
    echo "Warning: vscode-extension directory not found, skipping extension build"
    mkdir -p "${EXTENSION_DIR}"
fi

# Build base image (without code-server)
echo ""
echo "[1/3] Building base image (without code-server)..."
docker build \
    --build-arg INSTALL_CODE_SERVER=false \
    -t "${IMAGE_NAME}:latest" \
    -f "${SCRIPT_DIR}/Dockerfile.base" \
    "${SCRIPT_DIR}"
echo "✓ Built: ${IMAGE_NAME}:latest"

# Build image with code-server
echo ""
echo "[2/3] Building image with code-server..."
docker build \
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
echo "[3/3] Cleaning up..."
rm -rf "${EXTENSION_DIR}"

echo ""
echo "========================================"
echo "Build complete!"
echo "========================================"
echo "Available images:"
echo "  - ${IMAGE_NAME}:latest           (base, ~800MB)"
echo "  - ${IMAGE_NAME}:with-code-server (with VS Code, ~1GB)"
echo ""
