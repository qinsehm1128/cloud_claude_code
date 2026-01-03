# Implementation Plan: Claude Code 容器管理平台

## Overview

本实现计划将项目分为后端（Go）和前端（React）两部分，采用增量开发方式，每个阶段都能产出可验证的功能。

## Tasks

- [-] 1. 项目初始化与基础架构
  - [x] 1.1 初始化 Go 后端项目结构
    - 创建 `backend/` 目录结构：`cmd/`, `internal/`, `pkg/`
    - 初始化 Go module: `go mod init cc-platform`
    - 添加依赖：Gin, GORM, gorilla/websocket, Docker SDK
    - 创建 `main.go` 入口文件
    - _Requirements: 9.1_

  - [ ] 1.2 初始化 React 前端项目
    - 使用 Vite 创建 React + TypeScript 项目
    - 安装依赖：Ant Design, xterm.js, axios
    - 配置代理到后端 API
    - _Requirements: 10.1_

  - [x] 1.3 创建 Docker 基础镜像 Dockerfile
    - 创建 `docker/Dockerfile.base` 文件
    - 基于 Ubuntu 22.04，安装 Node 20, Git, Claude Code
    - 创建 developer 用户
    - 编写构建脚本
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [-] 2. 数据库与数据模型
  - [x] 2.1 实现 GORM 数据模型
    - 创建 `internal/models/` 目录
    - 实现 User, Setting, Repository, Container, ClaudeConfig 模型
    - 实现数据库初始化和迁移逻辑
    - _Requirements: 9.1, 9.2, 9.3, 9.5_

  - [x] 2.2 实现加密工具函数
    - 创建 `pkg/crypto/` 目录
    - 实现 AES-256-GCM 加密/解密函数
    - 实现密钥管理（从环境变量或自动生成）
    - _Requirements: 2.1, 3.1, 3.3, 9.2_

  - [x] 2.3 编写加密函数属性测试
    - **Property 3: Sensitive Data Encryption**
    - 验证加密后的值不等于明文
    - 验证解密后恢复原始值（往返测试）
    - **Validates: Requirements 2.1, 3.1, 3.3**

- [-] 3. 认证模块
  - [x] 3.1 实现认证服务
    - 创建 `internal/services/auth.go`
    - 实现凭据生成（随机或从环境变量）
    - 实现 JWT 生成和验证
    - 实现登录逻辑
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 3.2 实现认证中间件
    - 创建 `internal/middleware/auth.go`
    - 实现 JWT 验证中间件
    - 处理 token 过期
    - _Requirements: 1.5, 1.6_

  - [x] 3.3 实现认证 API 路由
    - 创建 `internal/handlers/auth.go`
    - 实现 POST /api/auth/login
    - 实现 POST /api/auth/logout
    - 实现 GET /api/auth/verify
    - _Requirements: 1.3, 1.4, 1.5_

  - [x] 3.4 编写认证属性测试
    - **Property 1: Authentication Response Correctness**
    - **Property 2: JWT Token Validation**
    - 验证有效凭据返回 token，无效凭据返回 401
    - 验证有效 token 通过验证，无效/过期 token 被拒绝
    - **Validates: Requirements 1.3, 1.4, 1.5, 1.6**

- [ ] 4. Checkpoint - 认证模块完成
  - 确保所有测试通过，如有问题请询问用户

- [-] 5. 配置管理模块
  - [x] 5.1 实现 GitHub 配置服务
    - 创建 `internal/services/github.go`
    - 实现 token 保存（加密存储）
    - 实现 token 读取（解密）
    - _Requirements: 2.1_

  - [x] 5.2 实现 Claude Code 配置服务
    - 创建 `internal/services/claude_config.go`
    - 实现配置保存（API Key, URL, 环境变量, 启动命令）
    - 实现环境变量格式验证（VAR_NAME=value）
    - 实现配置读取
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 5.3 实现配置 API 路由
    - 创建 `internal/handlers/settings.go`
    - 实现 GET/POST /api/settings/github
    - 实现 GET/POST /api/settings/claude
    - _Requirements: 3.11_

  - [x] 5.4 编写环境变量解析属性测试
    - **Property 5: Custom Environment Variable Parsing**
    - 验证有效格式被接受，无效格式被拒绝
    - **Validates: Requirements 3.4, 3.6**

- [-] 6. 仓库管理模块
  - [x] 6.1 实现仓库服务
    - 创建 `internal/services/repository.go`
    - 实现 GitHub API 调用（列出仓库）
    - 实现 git clone 功能
    - 实现本地仓库列表
    - 实现仓库删除
    - _Requirements: 2.2, 2.3, 2.5, 2.6_

  - [x] 6.2 实现仓库 API 路由
    - 创建 `internal/handlers/repository.go`
    - 实现 GET /api/repos/remote
    - 实现 POST /api/repos/clone
    - 实现 GET /api/repos/local
    - 实现 DELETE /api/repos/:id
    - _Requirements: 2.2, 2.3, 2.5, 2.6_

  - [x] 6.3 编写仓库列表属性测试
    - **Property 6: Repository Listing Completeness**
    - 验证返回的仓库包含所有必需字段
    - **Validates: Requirements 2.6**

- [ ] 7. Checkpoint - 配置和仓库模块完成
  - 确保所有测试通过，如有问题请询问用户

- [-] 8. 容器管理模块
  - [x] 8.1 实现 Docker 客户端封装
    - 创建 `internal/docker/client.go`
    - 初始化 Docker SDK 客户端
    - 实现基础镜像检查和构建
    - _Requirements: 4.7_

  - [x] 8.2 实现容器安全配置
    - 创建 `internal/docker/security.go`
    - 实现安全配置结构体
    - 配置：禁用特权、删除 capabilities、seccomp、资源限制
    - _Requirements: 5.2, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.9_

  - [x] 8.3 实现容器管理服务
    - 创建 `internal/services/container.go`
    - 实现容器创建（挂载仓库、注入环境变量）
    - 实现容器启动/停止/删除
    - 实现容器列表
    - _Requirements: 5.1, 5.3, 5.4, 5.5, 5.6, 5.7, 3.7_

  - [x] 8.4 实现容器 API 路由
    - 创建 `internal/handlers/container.go`
    - 实现 GET /api/containers
    - 实现 POST /api/containers
    - 实现 GET /api/containers/:id
    - 实现 POST /api/containers/:id/start
    - 实现 POST /api/containers/:id/stop
    - 实现 DELETE /api/containers/:id
    - _Requirements: 5.1, 5.4, 5.5, 5.6, 5.7_

  - [ ] 8.5 编写容器安全配置属性测试
    - **Property 11: Container Security Configuration**
    - 验证创建的容器具有正确的安全配置
    - **Validates: Requirements 5.2, 8.1, 8.2, 8.3, 8.6, 8.9**

  - [ ] 8.6 编写容器列表属性测试
    - **Property 7: Container Listing Completeness**
    - 验证返回的容器包含所有必需字段
    - **Validates: Requirements 5.7**

- [ ] 9. Checkpoint - 容器管理模块完成
  - 确保所有测试通过，如有问题请询问用户

- [ ] 10. 终端交互模块
  - [ ] 10.1 实现 PTY 管理
    - 创建 `internal/terminal/pty.go`
    - 实现容器 exec 和 PTY 附加
    - 实现 PTY 大小调整
    - _Requirements: 6.1, 6.6_

  - [ ] 10.2 实现 WebSocket 终端服务
    - 创建 `internal/terminal/websocket.go`
    - 实现 WebSocket 连接处理
    - 实现输入转发到容器
    - 实现输出流式传输到前端
    - 实现多客户端广播
    - _Requirements: 6.1, 6.2, 6.3, 6.5, 6.7_

  - [ ] 10.3 实现终端 WebSocket 路由
    - 创建 `internal/handlers/terminal.go`
    - 实现 GET /api/ws/terminal/:containerId
    - 处理连接升级和消息路由
    - _Requirements: 6.1, 6.4_

- [ ] 11. 文件管理模块
  - [ ] 11.1 实现路径验证工具
    - 创建 `pkg/pathutil/validate.go`
    - 实现路径清理和验证
    - 防止路径遍历攻击
    - _Requirements: 7.4, 7.6_

  - [ ] 11.2 实现文件服务
    - 创建 `internal/services/file.go`
    - 实现目录列表
    - 实现文件上传（通过 docker cp 或 exec）
    - 实现文件下载
    - 实现文件大小限制检查
    - _Requirements: 7.1, 7.2, 7.3, 7.5_

  - [ ] 11.3 实现文件 API 路由
    - 创建 `internal/handlers/file.go`
    - 实现 GET /api/files/:containerId/list
    - 实现 GET /api/files/:containerId/download
    - 实现 POST /api/files/:containerId/upload
    - _Requirements: 7.1, 7.2, 7.5_

  - [ ] 11.4 编写路径验证属性测试
    - **Property 9: Path Traversal Prevention**
    - 验证包含 .. 的路径被拒绝
    - 验证超出允许目录的路径被拒绝
    - **Validates: Requirements 7.4, 7.6**

  - [ ] 11.5 编写目录列表属性测试
    - **Property 10: Directory Listing Completeness**
    - 验证返回的文件信息包含所有必需字段
    - **Validates: Requirements 7.5**

- [ ] 12. Checkpoint - 后端核心功能完成
  - 确保所有测试通过，如有问题请询问用户


- [ ] 13. 前端 - 基础框架与认证
  - [ ] 13.1 实现前端路由和布局
    - 创建 `src/App.tsx` 路由配置
    - 创建 `src/layouts/MainLayout.tsx` 主布局
    - 配置 Ant Design 主题
    - _Requirements: 10.1_

  - [ ] 13.2 实现认证状态管理
    - 创建 `src/hooks/useAuth.ts`
    - 创建 `src/services/auth.ts` API 调用
    - 实现 token 存储和自动刷新
    - _Requirements: 1.3, 1.5_

  - [ ] 13.3 实现登录页面
    - 创建 `src/pages/Login.tsx`
    - 实现登录表单
    - 实现错误提示
    - _Requirements: 10.2_

- [ ] 14. 前端 - 设置页面
  - [ ] 14.1 实现 GitHub 设置组件
    - 创建 `src/components/Settings/GitHubSettings.tsx`
    - 实现 token 输入和保存
    - 实现保存状态反馈
    - _Requirements: 10.4_

  - [ ] 14.2 实现 Claude Code 设置组件
    - 创建 `src/components/Settings/ClaudeSettings.tsx`
    - 实现 API Key, URL 输入
    - 实现环境变量编辑器（支持多行 VAR=value 格式）
    - 实现启动命令配置
    - 显示默认启动命令模板
    - _Requirements: 3.10, 3.11, 10.4_

  - [ ] 14.3 实现设置页面
    - 创建 `src/pages/Settings.tsx`
    - 整合 GitHub 和 Claude Code 设置组件
    - _Requirements: 10.4_

- [ ] 15. 前端 - 仓库管理
  - [ ] 15.1 实现仓库列表组件
    - 创建 `src/components/Repository/RepoList.tsx`
    - 显示本地仓库列表
    - 实现删除功能
    - _Requirements: 10.5_

  - [ ] 15.2 实现克隆仓库模态框
    - 创建 `src/components/Repository/CloneRepoModal.tsx`
    - 显示远程仓库列表
    - 实现选择和克隆功能
    - _Requirements: 10.5_

- [ ] 16. 前端 - 容器管理
  - [ ] 16.1 实现容器卡片组件
    - 创建 `src/components/Dashboard/ContainerCard.tsx`
    - 显示容器状态、仓库信息
    - 实现启动/停止/删除按钮
    - _Requirements: 10.3_

  - [ ] 16.2 实现创建容器模态框
    - 创建 `src/components/Dashboard/CreateContainerModal.tsx`
    - 选择仓库创建容器
    - 显示创建进度
    - _Requirements: 10.3_

  - [ ] 16.3 实现仪表板页面
    - 创建 `src/pages/Dashboard.tsx`
    - 整合容器列表和创建功能
    - 实现状态自动刷新
    - _Requirements: 10.3_

- [ ] 17. 前端 - 终端组件
  - [ ] 17.1 实现 xterm.js 终端组件
    - 创建 `src/components/Terminal/XTerminal.tsx`
    - 初始化 xterm.js 实例
    - 配置终端样式和字体
    - _Requirements: 10.6_

  - [ ] 17.2 实现 WebSocket 连接管理
    - 创建 `src/services/websocket.ts`
    - 实现 WebSocket 连接和重连
    - 实现消息发送和接收
    - _Requirements: 6.4, 10.6_

  - [ ] 17.3 整合终端与 WebSocket
    - 连接 xterm.js 输入到 WebSocket
    - 连接 WebSocket 输出到 xterm.js
    - 实现终端大小调整事件
    - _Requirements: 6.2, 6.3, 6.6, 10.6_

- [ ] 18. 前端 - 文件管理
  - [ ] 18.1 实现文件浏览器组件
    - 创建 `src/components/FileManager/FileBrowser.tsx`
    - 显示目录树和文件列表
    - 实现目录导航
    - _Requirements: 10.7_

  - [ ] 18.2 实现文件上传组件
    - 创建 `src/components/FileManager/FileUpload.tsx`
    - 实现拖拽上传
    - 显示上传进度
    - _Requirements: 10.7_

  - [ ] 18.3 实现文件下载功能
    - 在文件浏览器中添加下载按钮
    - 实现文件下载
    - _Requirements: 10.7_

- [ ] 19. 前端 - 错误处理与优化
  - [ ] 19.1 实现全局错误处理
    - 创建 `src/utils/errorHandler.ts`
    - 实现 API 错误拦截
    - 显示用户友好的错误消息
    - _Requirements: 10.8_

  - [ ] 19.2 实现加载状态
    - 添加全局加载指示器
    - 添加按钮加载状态
    - _Requirements: 10.1_

- [ ] 20. Checkpoint - 前端功能完成
  - 确保前后端集成正常，如有问题请询问用户

- [ ] 21. 集成与部署
  - [ ] 21.1 创建 docker-compose.yml
    - 定义后端服务
    - 定义前端服务（或静态文件服务）
    - 配置网络和卷
    - _Requirements: 4.7_

  - [ ] 21.2 创建生产构建脚本
    - 前端生产构建
    - 后端二进制构建
    - 基础镜像构建
    - _Requirements: 4.7_

  - [ ] 21.3 编写 README 文档
    - 项目介绍
    - 安装和运行说明
    - 配置说明
    - _Requirements: 1.1, 1.2_

- [ ] 22. Final Checkpoint - 项目完成
  - 确保所有功能正常工作
  - 确保所有测试通过
  - 如有问题请询问用户

## Notes

- 所有任务都是必须完成的，包括属性测试
- 每个任务都引用了具体的需求编号以便追溯
- Checkpoint 任务用于阶段性验证
- 属性测试使用 Go 的 `testing/quick` 或 `gopter` 库
- 前端测试可使用 Vitest + React Testing Library
