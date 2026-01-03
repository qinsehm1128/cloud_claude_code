#!/bin/bash

# Claude Code Container Platform - Development Startup Script

set -e

echo "=========================================="
echo "  Claude Code Container Platform"
echo "  Development Environment Startup"
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if required tools are installed
check_requirements() {
    echo -e "${YELLOW}Checking requirements...${NC}"
    
    if ! command -v go &> /dev/null; then
        echo -e "${RED}Error: Go is not installed${NC}"
        exit 1
    fi
    
    if ! command -v node &> /dev/null; then
        echo -e "${RED}Error: Node.js is not installed${NC}"
        exit 1
    fi
    
    if ! command -v npm &> /dev/null; then
        echo -e "${RED}Error: npm is not installed${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}All requirements satisfied${NC}"
}

# Install backend dependencies
setup_backend() {
    echo -e "${YELLOW}Setting up backend...${NC}"
    cd backend
    go mod download
    cd ..
    echo -e "${GREEN}Backend setup complete${NC}"
}

# Install frontend dependencies
setup_frontend() {
    echo -e "${YELLOW}Setting up frontend...${NC}"
    cd frontend
    if [ ! -d "node_modules" ]; then
        npm install
    fi
    cd ..
    echo -e "${GREEN}Frontend setup complete${NC}"
}

# Start backend server
start_backend() {
    echo -e "${YELLOW}Starting backend server on port 8080...${NC}"
    cd backend
    go run ./cmd/server &
    BACKEND_PID=$!
    cd ..
    echo -e "${GREEN}Backend started (PID: $BACKEND_PID)${NC}"
}

# Start frontend dev server
start_frontend() {
    echo -e "${YELLOW}Starting frontend dev server on port 3000...${NC}"
    cd frontend
    npm run dev &
    FRONTEND_PID=$!
    cd ..
    echo -e "${GREEN}Frontend started (PID: $FRONTEND_PID)${NC}"
}

# Cleanup function
cleanup() {
    echo -e "\n${YELLOW}Shutting down services...${NC}"
    if [ ! -z "$BACKEND_PID" ]; then
        kill $BACKEND_PID 2>/dev/null || true
    fi
    if [ ! -z "$FRONTEND_PID" ]; then
        kill $FRONTEND_PID 2>/dev/null || true
    fi
    echo -e "${GREEN}Services stopped${NC}"
    exit 0
}

# Trap SIGINT and SIGTERM
trap cleanup SIGINT SIGTERM

# Main execution
main() {
    check_requirements
    setup_backend
    setup_frontend
    
    echo ""
    echo "=========================================="
    echo "  Starting Services"
    echo "=========================================="
    
    start_backend
    sleep 2
    start_frontend
    
    echo ""
    echo "=========================================="
    echo -e "${GREEN}  Services are running!${NC}"
    echo "=========================================="
    echo ""
    echo "  Frontend: http://localhost:3000"
    echo "  Backend:  http://localhost:8080"
    echo ""
    echo "  Press Ctrl+C to stop all services"
    echo "=========================================="
    
    # Wait for processes
    wait
}

main
