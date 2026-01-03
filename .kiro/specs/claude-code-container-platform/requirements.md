# Requirements Document

## Introduction

Claude Code 容器管理平台是一个基于 React + Go 的 Web 应用，允许用户通过 Web 界面管理 Docker 容器化的 Claude Code 开发环境。用户可以拉取 GitHub 项目，在隔离的 Docker 容器中运行 Claude Code，并通过 WebSocket 实时交互终端。

## Glossary

- **Platform**: Claude Code 容器管理平台系统
- **Container_Manager**: 负责 Docker 容器生命周期管理的后端服务
- **Terminal_Service**: 负责 WebSocket 终端连接和交互的服务
- **Auth_Service**: 负责用户认证的服务
- **GitHub_Service**: 负责 GitHub 仓库操作的服务
- **File_Service**: 负责容器内文件上传下载的服务
- **Base_Image**: 预构建的包含 Ubuntu + Node + Claude Code + Git 的 Docker 镜像
- **User_Container**: 为用户创建的隔离 Docker 容器实例

## Requirements

### Requirement 1: 用户认证

**User Story:** 作为管理员，我希望通过唯一账号登录系统，以便安全地管理容器环境。

#### Acceptance Criteria

1. WHEN the Platform starts AND no admin credentials exist in environment variables, THEN the Auth_Service SHALL generate random admin credentials and display them in logs
2. WHEN admin credentials are configured via environment variables, THEN the Auth_Service SHALL use the configured credentials for authentication
3. WHEN a user submits valid credentials, THEN the Auth_Service SHALL issue a JWT token with 24-hour expiration
4. WHEN a user submits invalid credentials, THEN the Auth_Service SHALL return 401 Unauthorized error
5. WHEN a request lacks valid JWT token, THEN the Platform SHALL reject the request with 401 error
6. WHEN a JWT token expires, THEN the Auth_Service SHALL require re-authentication

### Requirement 2: GitHub 配置与项目管理

**User Story:** 作为用户，我希望配置 GitHub Key 并拉取项目，以便在容器中使用这些项目。

#### Acceptance Criteria

1. WHEN a user saves a GitHub Personal Access Token, THEN the GitHub_Service SHALL encrypt and store the token in database
2. WHEN a user requests to list repositories, THEN the GitHub_Service SHALL fetch accessible repositories using the stored token
3. WHEN a user selects a repository to clone, THEN the GitHub_Service SHALL clone the repository to a user-specific directory on the host
4. WHEN cloning fails due to invalid token, THEN the GitHub_Service SHALL return a descriptive error message
5. WHEN a user requests to delete a cloned repository, THEN the GitHub_Service SHALL remove the repository directory
6. WHEN listing cloned repositories, THEN the GitHub_Service SHALL return repository name, clone date, and size

### Requirement 3: Claude Code 配置

**User Story:** 作为用户，我希望通过前端界面灵活配置 Claude Code 的 API Key、自定义 URL、环境变量和启动命令，以便适配不同的 API 提供商和使用场景。

#### Acceptance Criteria

1. WHEN a user saves Claude Code configuration via frontend, THEN the Platform SHALL encrypt and store API Key, API URL, custom environment variables, and startup command in database
2. WHEN a user configures API URL via settings page, THEN the Platform SHALL store it in database and inject as ANTHROPIC_BASE_URL when creating container
3. WHEN a user configures API Key via settings page, THEN the Platform SHALL encrypt and store in database, and inject as ANTHROPIC_API_KEY when creating container
4. WHEN a user adds custom environment variables via frontend in format "VAR_NAME=value", THEN the Platform SHALL validate, store in database, and inject all variables into container at creation time
5. WHEN a user configures custom startup command via settings page, THEN the Platform SHALL store in database and execute the command instead of default Claude Code startup
6. WHEN custom environment variable format is invalid, THEN the Platform SHALL reject the configuration with validation error message in frontend
7. WHEN creating a container, THEN the Container_Manager SHALL read all configuration from database and inject as container environment variables
8. WHEN no API Key is configured in database, THEN the Platform SHALL prevent container creation and display error message in frontend
9. WHEN a user updates configuration via frontend, THEN the Platform SHALL update database values without affecting running containers
10. THE Platform SHALL provide default startup command template in frontend: "claude --dangerously-skip-permissions"
11. THE Platform SHALL provide a dedicated settings page for all Claude Code configuration management

### Requirement 4: Docker 基础镜像管理

**User Story:** 作为系统，我需要预构建包含完整开发环境的 Docker 镜像，以便快速启动容器。

#### Acceptance Criteria

1. THE Base_Image SHALL include Ubuntu 22.04 LTS as the base operating system
2. THE Base_Image SHALL include Node.js LTS version (v20.x)
3. THE Base_Image SHALL include Claude Code CLI installed globally via npm
4. THE Base_Image SHALL include Git with proper configuration
5. THE Base_Image SHALL include a non-root user named "developer" with sudo privileges
6. THE Base_Image SHALL expose port 22 for potential SSH access (disabled by default)
7. WHEN the Platform starts, THEN the Container_Manager SHALL verify Base_Image exists or build it automatically

### Requirement 5: 容器生命周期管理

**User Story:** 作为用户，我希望创建、启动、停止和删除容器，以便管理我的开发环境。

#### Acceptance Criteria

1. WHEN a user creates a container with a selected repository, THEN the Container_Manager SHALL create a new container from Base_Image with the repository mounted
2. WHEN creating a container, THEN the Container_Manager SHALL apply security restrictions including: no privileged mode, read-only root filesystem where possible, dropped capabilities, seccomp profile
3. WHEN creating a container, THEN the Container_Manager SHALL mount user-specific directories with proper ownership
4. WHEN a user starts a container, THEN the Container_Manager SHALL start the container and initialize Claude Code environment
5. WHEN a user stops a container, THEN the Container_Manager SHALL gracefully stop the container preserving state
6. WHEN a user deletes a container, THEN the Container_Manager SHALL remove the container and optionally clean up associated files
7. WHEN listing containers, THEN the Container_Manager SHALL return container ID, status, creation time, and associated repository

### Requirement 6: 终端交互

**User Story:** 作为用户，我希望通过 Web 终端与容器交互，以便执行命令和使用 Claude Code。

#### Acceptance Criteria

1. WHEN a user opens terminal for a running container, THEN the Terminal_Service SHALL establish WebSocket connection to container's PTY
2. WHEN user types in terminal, THEN the Terminal_Service SHALL forward input to container in real-time
3. WHEN container produces output, THEN the Terminal_Service SHALL stream output to frontend in real-time
4. WHEN WebSocket connection drops, THEN the Terminal_Service SHALL attempt reconnection with exponential backoff
5. WHEN multiple users connect to same container terminal, THEN the Terminal_Service SHALL broadcast output to all connected clients
6. WHEN user resizes terminal window, THEN the Terminal_Service SHALL resize container PTY accordingly
7. THE Terminal_Service SHALL support ANSI escape codes for proper terminal rendering

### Requirement 7: 文件管理

**User Story:** 作为用户，我希望上传和下载容器内的文件，以便在本地和容器之间传输数据。

#### Acceptance Criteria

1. WHEN a user uploads a file, THEN the File_Service SHALL transfer the file to specified path inside the container
2. WHEN a user downloads a file, THEN the File_Service SHALL retrieve the file from container and send to browser
3. WHEN uploading files larger than 100MB, THEN the File_Service SHALL reject the upload with size limit error
4. WHEN file path contains path traversal attempts (../), THEN the File_Service SHALL reject the request
5. WHEN listing directory contents, THEN the File_Service SHALL return file names, sizes, types, and modification times
6. THE File_Service SHALL only allow file operations within the mounted project directory

### Requirement 8: 安全隔离

**User Story:** 作为系统管理员，我希望确保容器安全隔离，以防止容器逃逸和宿主机暴露。

#### Acceptance Criteria

1. THE Container_Manager SHALL run containers with non-root user by default
2. THE Container_Manager SHALL drop all Linux capabilities except those explicitly required
3. THE Container_Manager SHALL apply seccomp profile to restrict system calls
4. THE Container_Manager SHALL disable container networking to host network
5. THE Container_Manager SHALL mount host directories as read-only where possible
6. THE Container_Manager SHALL set resource limits (CPU, memory) on containers
7. THE Container_Manager SHALL use user namespaces to map container root to unprivileged host user
8. WHEN container attempts to access host filesystem outside mounted directories, THEN the Container_Manager SHALL block the access
9. THE Platform SHALL NOT expose Docker socket to containers

### Requirement 9: 数据持久化

**User Story:** 作为用户，我希望我的配置和容器状态被持久化，以便重启后恢复。

#### Acceptance Criteria

1. THE Platform SHALL use SQLite as the default database with GORM
2. THE Platform SHALL store user credentials, GitHub tokens, Claude Code keys encrypted in database
3. THE Platform SHALL store container metadata including ID, status, associated repository, creation time
4. WHEN the Platform restarts, THEN the Container_Manager SHALL reconcile database state with actual Docker container states
5. THE Platform SHALL support database migration for schema updates

### Requirement 10: 前端界面

**User Story:** 作为用户，我希望有直观的 Web 界面来管理所有功能。

#### Acceptance Criteria

1. THE Platform SHALL provide a React-based single-page application
2. THE Platform SHALL include login page with credential input
3. THE Platform SHALL include dashboard showing container list and status
4. THE Platform SHALL include settings page for GitHub token and Claude Code key configuration
5. THE Platform SHALL include repository browser for selecting projects to clone
6. THE Platform SHALL include integrated terminal component using xterm.js
7. THE Platform SHALL include file browser with upload/download capabilities
8. WHEN API requests fail, THEN the Platform SHALL display user-friendly error messages
