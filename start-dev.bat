@echo off
REM Claude Code Container Platform - Development Startup Script (Windows)

echo ==========================================
echo   Claude Code Container Platform
echo   Development Environment Startup
echo ==========================================
echo.

REM Check if Go is installed
where go >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo Error: Go is not installed
    exit /b 1
)

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo Error: Node.js is not installed
    exit /b 1
)

REM Check if npm is installed
where npm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo Error: npm is not installed
    exit /b 1
)

echo All requirements satisfied
echo.

REM Setup backend
echo Setting up backend...
cd backend
call go mod download
cd ..
echo Backend setup complete
echo.

REM Setup frontend
echo Setting up frontend...
cd frontend
if not exist "node_modules" (
    call npm install
)
cd ..
echo Frontend setup complete
echo.

echo ==========================================
echo   Starting Services
echo ==========================================
echo.

REM Start backend in new window
echo Starting backend server on port 8080...
start "CC-Platform Backend" cmd /c "cd backend && go run ./cmd/server"

REM Wait a moment for backend to start
timeout /t 3 /nobreak >nul

REM Start frontend in new window
echo Starting frontend dev server on port 3000...
start "CC-Platform Frontend" cmd /c "cd frontend && npm run dev"

echo.
echo ==========================================
echo   Services are running!
echo ==========================================
echo.
echo   Frontend: http://localhost:3000
echo   Backend:  http://localhost:8080
echo.
echo   Close the terminal windows to stop services
echo ==========================================
echo.

pause
