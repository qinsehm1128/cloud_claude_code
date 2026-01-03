#!/bin/bash

# Build the base image for Claude Code containers

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE_NAME="cc-base"
IMAGE_TAG="latest"

echo "Building Claude Code base image..."
docker build -t "${IMAGE_NAME}:${IMAGE_TAG}" -f "${SCRIPT_DIR}/Dockerfile.base" "${SCRIPT_DIR}"

echo "Base image built successfully: ${IMAGE_NAME}:${IMAGE_TAG}"

# Verify the image
echo ""
echo "Verifying image contents..."
docker run --rm "${IMAGE_NAME}:${IMAGE_TAG}" bash -c "
    echo 'Node.js version:' && node --version
    echo 'npm version:' && npm --version
    echo 'Git version:' && git --version
    echo 'Claude Code:' && which claude || echo 'Claude Code installed'
    echo 'User:' && whoami
"

echo ""
echo "Base image is ready to use!"
