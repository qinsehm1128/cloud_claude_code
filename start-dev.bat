@echo off
REM Claude Code Container Platform - Development Startup Script (Windows)
REM 开发环境启动脚本 (Windows)

setlocal enabledelayedexpansion

REM Script directory
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

REM Configuration
set "LOG_DIR=%SCRIPT_DIR%logs"

REM Default ports
set "BACKEND_PORT=8080"
set "FRONTEND_PORT=3000"

REM Load from .env file if exists
if exist "%SCRIPT_DIR%.env" (
    for /f "usebackq tokens=1,* delims==" %%a in ("%SCRIPT_DIR%.env") do (
        set "line=%%a"
        if "!line:~0,1!" neq "#" (
            if "%%a"=="PORT" set "BACKEND_PORT=%%b"
            if "%%a"=="FRONTEND_PORT" set "FRONTEND_PORT=%%b"
        )
    )
)

REM Parse arguments
set "SKIP_DEPS=0"
set "BUILD_ONLY=0"
set "BACKEND_ONLY=0"
set "FRONTEND_ONLY=0"

:parse_args
if "%~1"=="" goto :end_parse
if "%~1"=="--skip-deps" (
    set "SKIP_DEPS=1"
    shift
    goto :parse_args
)
if "%~1"=="--build" (
    set "BUILD_ONLY=1"
    shift
    goto :parse_args
)
if "%~1"=="--backend" (
    set "BACKEND_ONLY=1"
    shift
    goto :parse_args
)
if "%~1"=="--frontend" (
    set "FRONTEND_ONLY=1"
    shift
    goto :parse_args
)
if "%~1"=="-h" goto :show_help
if "%~1"=="--help" goto :show_help
echo Unknown option: %~1
exit /b 1

:show_help
echo Usage: %~nx0 [options]
echo.
echo Options:
echo   --skip-deps    Skip dependency installation
echo   --build        Build only, don't start servers
echo   --backend      Start backend only
echo   --frontend     Start frontend only
echo   -h, --help     Show this help message
echo.
exit /b 0

:end_parse

echo ==========================================
echo   Claude Code Container Platform
echo   Development Environment Startup
echo ==========================================
echo.

REM Check requirements
echo [INFO] Checking requirements...

where go >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Go is not installed
    echo   Download from: https://golang.org/dl/
    exit /b 1
)
for /f "tokens=3" %%v in ('go version') do echo [OK] Go %%v

where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed
    echo   Download from: https://nodejs.org/
    exit /b 1
)
for /f "tokens=1" %%v in ('node --version') do echo [OK] Node.js %%v

where npm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] npm is not installed
    exit /b 1
)
for /f "tokens=1" %%v in ('npm --version') do echo [OK] npm %%v

where docker >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [WARN] Docker is not installed (optional)
) else (
    for /f "tokens=3" %%v in ('docker --version') do echo [OK] Docker %%v
)

echo [OK] All requirements satisfied
echo.

REM Setup .env file
if not exist ".env" (
    if exist ".env.example" (
        echo [INFO] Creating .env from .env.example...
        copy .env.example .env >nul
        echo [OK] .env file created
        echo [WARN] Please review and update .env with your settings
    ) else (
        echo [WARN] No .env file found, using defaults
    )
) else (
    echo [OK] .env file exists
)

REM Create log directory
if not exist "%LOG_DIR%" (
    mkdir "%LOG_DIR%"
    echo [OK] Created log directory
)

REM Setup backend
if "%FRONTEND_ONLY%"=="0" (
    echo.
    echo [INFO] Setting up backend...
    
    if not exist "backend" (
        echo [ERROR] Backend directory not found
        exit /b 1
    )
    
    cd backend
    
    if "%SKIP_DEPS%"=="0" (
        echo [INFO] Downloading Go modules...
        go mod download
        go mod tidy
    )
    
    echo [INFO] Building backend...
    if not exist "..\bin" mkdir "..\bin"
    go build -o ..\bin\server.exe .\cmd\server
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Backend build failed
        cd ..
        exit /b 1
    )
    
    cd ..
    echo [OK] Backend setup complete
)

REM Setup frontend
if "%BACKEND_ONLY%"=="0" (
    echo.
    echo [INFO] Setting up frontend...
    
    if not exist "frontend" (
        echo [ERROR] Frontend directory not found
        exit /b 1
    )
    
    cd frontend
    
    if "%SKIP_DEPS%"=="0" (
        if not exist "node_modules" (
            echo [INFO] Installing npm packages...
            call npm install
        ) else (
            echo [INFO] npm packages exist
        )
    )
    
    cd ..
    echo [OK] Frontend setup complete
)

REM Check Docker images
where docker >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo.
    echo [INFO] Checking Docker base images...
    docker image inspect cc-base:latest >nul 2>nul
    if %ERRORLEVEL% neq 0 (
        echo [WARN] Base image not found. Build with: docker\build-base.sh
    ) else (
        echo [OK] Docker base images exist
    )
)

REM Build only mode
if "%BUILD_ONLY%"=="1" (
    echo.
    echo [OK] Build complete!
    exit /b 0
)

echo.
echo ==========================================
echo   Starting Services
echo ==========================================
echo.

REM Start backend
if "%FRONTEND_ONLY%"=="0" (
    echo [INFO] Starting backend server on port %BACKEND_PORT%...
    
    if exist "bin\server.exe" (
        start "CC-Platform Backend" cmd /c "set PORT=%BACKEND_PORT% && bin\server.exe > %LOG_DIR%\backend.log 2>&1"
    ) else (
        start "CC-Platform Backend" cmd /c "cd backend && set PORT=%BACKEND_PORT% && go run ./cmd/server > %LOG_DIR%\backend.log 2>&1"
    )
    
    REM Wait for backend to start
    echo [INFO] Waiting for backend to start...
    timeout /t 5 /nobreak >nul
    echo [OK] Backend started
)

REM Start frontend
if "%BACKEND_ONLY%"=="0" (
    echo [INFO] Starting frontend dev server on port %FRONTEND_PORT%...
    start "CC-Platform Frontend" cmd /c "cd frontend && npm run dev > %LOG_DIR%\frontend.log 2>&1"
    
    REM Wait for frontend to start
    echo [INFO] Waiting for frontend to start...
    timeout /t 5 /nobreak >nul
    echo [OK] Frontend started
)

echo.
echo ==========================================
echo   Services are running!
echo ==========================================
echo.
if "%FRONTEND_ONLY%"=="0" (
    echo   Backend API:  http://localhost:%BACKEND_PORT%
)
if "%BACKEND_ONLY%"=="0" (
    echo   Frontend:     http://localhost:%FRONTEND_PORT%
)
echo.
echo   Logs:         %LOG_DIR%\
echo.
echo   Close the terminal windows to stop services
echo   Or press any key to stop all services
echo ==========================================
echo.

pause

REM Stop services
echo.
echo [INFO] Stopping services...
taskkill /FI "WINDOWTITLE eq CC-Platform Backend*" /F >nul 2>nul
taskkill /FI "WINDOWTITLE eq CC-Platform Frontend*" /F >nul 2>nul
echo [OK] Services stopped

endlocal
