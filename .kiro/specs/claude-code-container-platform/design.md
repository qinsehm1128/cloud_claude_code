# Design Document

## Overview

Claude Code 容器管理平台采用前后端分离架构，前端使用 React + TypeScript + xterm.js，后端使用 Go + Gin + GORM。系统通过 Docker SDK 管理容器生命周期，使用 WebSocket 实现实时终端交互。

### 技术栈

- **前端**: React 18, TypeScript, Ant Design, xterm.js, Axios
- **后端**: Go 1.21+, Gin, GORM, Docker SDK, gorilla/websocket
- **数据库**: SQLite (GORM)
- **容器**: Docker with custom base image (Ubuntu 22.04 + Node 20 + Claude Code)

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │  Login   │ │Dashboard │ │ Settings │ │ Terminal │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
│                         │                     │                  │
│                    HTTP/REST              WebSocket              │
└─────────────────────────┼─────────────────────┼─────────────────┘
                          │                     │
┌─────────────────────────┼─────────────────────┼─────────────────┐
│                     Backend (Go/Gin)          │                  │
│  ┌──────────────────────┴─────────────────────┴───────────────┐ │
│  │                      API Gateway                            │ │
│  │              (JWT Auth Middleware)                          │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                              │                                   │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────────┐  │
│  │Auth Service│ │GitHub Svc  │ │Container   │ │Terminal Svc  │  │
│  │            │ │            │ │Manager     │ │(WebSocket)   │  │
│  └────────────┘ └────────────┘ └────────────┘ └──────────────┘  │
│         │              │              │               │          │
│  ┌──────┴──────────────┴──────────────┴───────────────┴───────┐ │
│  │                    GORM (SQLite)                            │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                              │                                   │
│  ┌───────────────────────────┴─────────────────────────────────┐ │
│  │                    Docker SDK                                │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                               │
┌──────────────────────────────┴──────────────────────────────────┐
│                     Docker Engine                                │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              Base Image (cc-base:latest)                    ││
│  │  Ubuntu 22.04 + Node 20 + Claude Code + Git                 ││
│  └─────────────────────────────────────────────────────────────┘│
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐               │
│  │ Container 1 │ │ Container 2 │ │ Container N │               │
│  │ (Project A) │ │ (Project B) │ │ (Project X) │               │
│  └─────────────┘ └─────────────┘ └─────────────┘               │
└─────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### Backend API Endpoints

```go
// Auth API
POST   /api/auth/login          // 用户登录
POST   /api/auth/logout         // 用户登出
GET    /api/auth/verify         // 验证 token

// Settings API
GET    /api/settings/github     // 获取 GitHub 配置
POST   /api/settings/github     // 保存 GitHub token
GET    /api/settings/claude     // 获取 Claude Code 配置
POST   /api/settings/claude     // 保存 Claude Code 配置

// Repository API
GET    /api/repos/remote        // 列出 GitHub 仓库
POST   /api/repos/clone         // 克隆仓库
GET    /api/repos/local         // 列出本地仓库
DELETE /api/repos/:id           // 删除本地仓库

// Container API
GET    /api/containers          // 列出容器
POST   /api/containers          // 创建容器
GET    /api/containers/:id      // 获取容器详情
POST   /api/containers/:id/start   // 启动容器
POST   /api/containers/:id/stop    // 停止容器
DELETE /api/containers/:id      // 删除容器

// Terminal WebSocket
GET    /api/ws/terminal/:containerId  // WebSocket 终端连接

// File API
GET    /api/files/:containerId/list   // 列出目录
GET    /api/files/:containerId/download  // 下载文件
POST   /api/files/:containerId/upload    // 上传文件
```

### Service Interfaces

```go
// AuthService 认证服务接口
type AuthService interface {
    Login(username, password string) (token string, err error)
    VerifyToken(token string) (claims *Claims, err error)
    GenerateCredentials() (username, password string)
}

// GitHubService GitHub 服务接口
type GitHubService interface {
    ListRepositories(token string) ([]Repository, error)
    CloneRepository(token, repoURL, targetPath string) error
    ListLocalRepositories() ([]LocalRepository, error)
    DeleteRepository(repoID uint) error
}

// ContainerManager 容器管理接口
type ContainerManager interface {
    CreateContainer(config ContainerConfig) (containerID string, error)
    StartContainer(containerID string) error
    StopContainer(containerID string) error
    DeleteContainer(containerID string) error
    ListContainers() ([]ContainerInfo, error)
    GetContainerStatus(containerID string) (ContainerStatus, error)
    ExecInContainer(containerID string, cmd []string) (output string, error)
}

// TerminalService 终端服务接口
type TerminalService interface {
    AttachTerminal(containerID string, conn *websocket.Conn) error
    ResizeTerminal(containerID string, width, height uint) error
    DetachTerminal(containerID string, conn *websocket.Conn) error
}

// FileService 文件服务接口
type FileService interface {
    ListDirectory(containerID, path string) ([]FileInfo, error)
    UploadFile(containerID, path string, content io.Reader) error
    DownloadFile(containerID, path string) (io.Reader, error)
}
```

## Data Models

```go
// User 用户模型
type User struct {
    gorm.Model
    Username     string `gorm:"uniqueIndex;not null"`
    PasswordHash string `gorm:"not null"`
}

// Setting 配置模型
type Setting struct {
    gorm.Model
    Key         string `gorm:"uniqueIndex;not null"`
    Value       string `gorm:"type:text"` // 加密存储
    Description string
}

// Repository 仓库模型
type Repository struct {
    gorm.Model
    Name      string `gorm:"not null"`
    URL       string `gorm:"not null"`
    LocalPath string `gorm:"not null"`
    Size      int64
    ClonedAt  time.Time
}

// Container 容器模型
type Container struct {
    gorm.Model
    DockerID     string `gorm:"uniqueIndex"`
    Name         string `gorm:"not null"`
    Status       string // created, running, stopped, deleted
    RepositoryID uint
    Repository   Repository
    CreatedAt    time.Time
    StartedAt    *time.Time
    StoppedAt    *time.Time
}

// ClaudeConfig Claude Code 配置模型
type ClaudeConfig struct {
    gorm.Model
    APIKey          string `gorm:"type:text"` // 加密存储
    APIURL          string
    CustomEnvVars   string `gorm:"type:text"` // JSON 格式存储 {"VAR1": "value1", "VAR2": "value2"}
    StartupCommand  string
}
```


## Dockerfile for Base Image

```dockerfile
# Dockerfile for cc-base image
FROM ubuntu:22.04

# Avoid interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    sudo \
    ca-certificates \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20.x
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code globally
RUN npm install -g @anthropic-ai/claude-code

# Create non-root user with sudo privileges
RUN useradd -m -s /bin/bash developer \
    && echo "developer ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Set working directory
WORKDIR /workspace

# Switch to non-root user
USER developer

# Default command
CMD ["/bin/bash"]
```

## Security Design

### Container Security Measures

```go
// ContainerSecurityConfig 容器安全配置
type ContainerSecurityConfig struct {
    // 禁用特权模式
    Privileged: false
    
    // 删除所有 capabilities，只保留必要的
    CapDrop: []string{"ALL"}
    CapAdd:  []string{"CHOWN", "SETUID", "SETGID"}
    
    // 使用 seccomp profile
    SecurityOpt: []string{"seccomp=default"}
    
    // 禁用网络到宿主机
    NetworkMode: "bridge" // 隔离网络
    
    // 资源限制
    Resources: container.Resources{
        Memory:     2 * 1024 * 1024 * 1024, // 2GB
        MemorySwap: 2 * 1024 * 1024 * 1024,
        CPUQuota:   100000, // 1 CPU
        CPUPeriod:  100000,
    }
    
    // 只读根文件系统（工作目录除外）
    ReadonlyRootfs: false // 需要写入，但限制挂载点
    
    // 用户命名空间
    UsernsMode: "host" // 或配置 userns-remap
}
```

### Path Traversal Prevention

```go
// ValidatePath 验证路径防止目录遍历
func ValidatePath(basePath, requestedPath string) (string, error) {
    // 清理路径
    cleanPath := filepath.Clean(requestedPath)
    
    // 检查是否包含 ..
    if strings.Contains(cleanPath, "..") {
        return "", errors.New("path traversal detected")
    }
    
    // 构建完整路径
    fullPath := filepath.Join(basePath, cleanPath)
    
    // 确保路径在基础目录内
    if !strings.HasPrefix(fullPath, basePath) {
        return "", errors.New("path outside allowed directory")
    }
    
    return fullPath, nil
}
```

### Encryption for Sensitive Data

```go
// 使用 AES-256-GCM 加密敏感数据
func Encrypt(plaintext string, key []byte) (string, error) {
    block, err := aes.NewCipher(key)
    if err != nil {
        return "", err
    }
    
    gcm, err := cipher.NewGCM(block)
    if err != nil {
        return "", err
    }
    
    nonce := make([]byte, gcm.NonceSize())
    if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
        return "", err
    }
    
    ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
    return base64.StdEncoding.EncodeToString(ciphertext), nil
}
```

## WebSocket Terminal Protocol

```
Client                                Server
   |                                     |
   |------ Connect WebSocket ----------->|
   |                                     |
   |<----- Connection Established -------|
   |                                     |
   |------ Terminal Input (stdin) ------>|
   |                                     |
   |<----- Terminal Output (stdout) -----|
   |                                     |
   |------ Resize Event ---------------->|
   |       {type: "resize",              |
   |        cols: 80, rows: 24}          |
   |                                     |
   |<----- Heartbeat/Ping ---------------|
   |------ Pong ------------------------>|
   |                                     |
   |------ Close Connection ------------>|
```

### Message Format

```typescript
// WebSocket 消息格式
interface TerminalMessage {
    type: 'input' | 'output' | 'resize' | 'error';
    data?: string;      // input/output 数据
    cols?: number;      // resize 列数
    rows?: number;      // resize 行数
    error?: string;     // 错误信息
}
```

## Frontend Components

```
src/
├── components/
│   ├── Login/
│   │   └── LoginForm.tsx
│   ├── Dashboard/
│   │   ├── ContainerList.tsx
│   │   ├── ContainerCard.tsx
│   │   └── CreateContainerModal.tsx
│   ├── Settings/
│   │   ├── GitHubSettings.tsx
│   │   ├── ClaudeSettings.tsx
│   │   └── EnvVarEditor.tsx
│   ├── Repository/
│   │   ├── RepoList.tsx
│   │   └── CloneRepoModal.tsx
│   ├── Terminal/
│   │   └── XTerminal.tsx
│   └── FileManager/
│       ├── FileBrowser.tsx
│       └── FileUpload.tsx
├── services/
│   ├── api.ts
│   ├── auth.ts
│   └── websocket.ts
├── hooks/
│   ├── useAuth.ts
│   ├── useWebSocket.ts
│   └── useContainers.ts
└── App.tsx
```


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Authentication Response Correctness

*For any* login request with credentials, the Auth_Service SHALL return a valid JWT token if and only if the credentials match the configured admin credentials; otherwise it SHALL return 401 Unauthorized.

**Validates: Requirements 1.3, 1.4**

### Property 2: JWT Token Validation

*For any* API request to a protected endpoint, the Platform SHALL accept the request if and only if it contains a valid, non-expired JWT token; otherwise it SHALL return 401 error.

**Validates: Requirements 1.5, 1.6**

### Property 3: Sensitive Data Encryption

*For any* sensitive configuration (GitHub token, Claude Code API Key), the stored value in database SHALL NOT equal the plaintext input value (must be encrypted).

**Validates: Requirements 2.1, 3.1, 3.3**

### Property 4: Environment Variable Injection

*For any* Claude Code configuration with API Key and API URL, when creating a container, the container's environment variables SHALL include ANTHROPIC_API_KEY and ANTHROPIC_BASE_URL with the decrypted values.

**Validates: Requirements 3.2, 3.3, 3.7**

### Property 5: Custom Environment Variable Parsing

*For any* string in format "VAR_NAME=value" where VAR_NAME matches pattern `^[A-Z_][A-Z0-9_]*$`, the Platform SHALL successfully parse and store it; for any string not matching this format, the Platform SHALL reject with validation error.

**Validates: Requirements 3.4, 3.6**

### Property 6: Repository Listing Completeness

*For any* list of cloned repositories, each item in the response SHALL contain non-empty name, valid clone date, and non-negative size.

**Validates: Requirements 2.6**

### Property 7: Container Listing Completeness

*For any* list of containers, each item in the response SHALL contain non-empty container ID, valid status (created/running/stopped), valid creation time, and associated repository information.

**Validates: Requirements 5.7**

### Property 8: File Upload/Download Round-Trip

*For any* file content uploaded to a container at a valid path, downloading the same file SHALL return identical content.

**Validates: Requirements 7.1, 7.2**

### Property 9: Path Traversal Prevention

*For any* file operation request where the path contains ".." or resolves to a location outside the mounted project directory, the File_Service SHALL reject the request.

**Validates: Requirements 7.4, 7.6**

### Property 10: Directory Listing Completeness

*For any* directory listing request, each item in the response SHALL contain file name, size (non-negative), type (file/directory), and modification time.

**Validates: Requirements 7.5**

### Property 11: Container Security Configuration

*For any* created container, the container configuration SHALL have: privileged=false, all capabilities dropped except explicitly required ones, seccomp profile applied, resource limits set, and no access to Docker socket.

**Validates: Requirements 5.2, 8.1, 8.2, 8.3, 8.6, 8.9**

### Property 12: Repository Deletion Completeness

*For any* repository deletion request for an existing repository, after deletion the repository directory SHALL NOT exist on the filesystem.

**Validates: Requirements 2.5**

## Error Handling

### HTTP Error Responses

```go
type ErrorResponse struct {
    Code    int    `json:"code"`
    Message string `json:"message"`
    Details string `json:"details,omitempty"`
}

// 标准错误码
const (
    ErrUnauthorized     = 401
    ErrForbidden        = 403
    ErrNotFound         = 404
    ErrValidation       = 422
    ErrInternalServer   = 500
    ErrServiceUnavailable = 503
)
```

### Error Handling Strategy

1. **认证错误**: 返回 401，不暴露具体原因（安全考虑）
2. **验证错误**: 返回 422，包含具体字段和错误信息
3. **资源不存在**: 返回 404，包含资源类型
4. **Docker 错误**: 记录详细日志，返回用户友好消息
5. **数据库错误**: 记录详细日志，返回通用错误消息

## Testing Strategy

### Unit Tests

- 认证逻辑（JWT 生成、验证、过期）
- 加密/解密函数
- 路径验证函数
- 环境变量解析函数
- 数据模型验证

### Property-Based Tests

使用 Go 的 `testing/quick` 或 `gopter` 库进行属性测试：

- **Property 1-2**: 认证响应正确性
- **Property 3**: 敏感数据加密验证
- **Property 5**: 环境变量格式验证
- **Property 8**: 文件上传下载往返测试
- **Property 9**: 路径遍历防护测试

### Integration Tests

- Docker 容器生命周期
- WebSocket 终端连接
- GitHub API 集成
- 文件系统操作

### Security Tests

- 容器逃逸尝试
- 路径遍历攻击
- JWT 伪造尝试
- 资源限制验证
