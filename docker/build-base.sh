#!/bin/bash

# Build the base images for Claude Code containers
# Creates two images:
#   - cc-base:latest (without code-server)
#   - cc-base:with-code-server (with code-server)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE_NAME="cc-base"

echo "========================================"
echo "Building Claude Code base images"
echo "========================================"

# Build base image (without code-server)
echo ""
echo "[1/2] Building base image (without code-server)..."
docker build \
    --build-arg INSTALL_CODE_SERVER=false \
    -t "${IMAGE_NAME}:latest" \
    -f "${SCRIPT_DIR}/Dockerfile.base" \
    "${SCRIPT_DIR}"
echo "✓ Built: ${IMAGE_NAME}:latest"

# Build image with code-server
echo ""
echo "[2/2] Building image with code-server..."
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
"

echo ""
echo "========================================"
echo "Build complete!"
echo "========================================"
echo "Available images:"
echo "  - ${IMAGE_NAME}:latest           (base, ~800MB)"
echo "  - ${IMAGE_NAME}:with-code-server (with VS Code, ~1GB)"
echo ""
