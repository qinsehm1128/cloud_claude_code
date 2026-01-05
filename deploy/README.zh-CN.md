# 📦 部署指南

<p align="center">
  <a href="README.md">English</a> | <a href="README.zh-CN.md">简体中文</a>
</p>

---

## ⚡ 快速开始

### 🚀 一键部署 (推荐)

使用全新的统一部署脚本，通过渐进式向导完成部署：

```bash
./deploy.sh
```

就这么简单！脚本会自动引导您完成所有步骤。

---

## ✨ 部署脚本特点

### 🎯 渐进式引导流程

```
第 1 步：环境检查 ✓
├─ 检测依赖 (Node.js, Go, Docker)
├─ 检查磁盘空间
├─ 检查端口占用
└─ 智能建议和修复

第 2 步：配置向导 ✓
├─ 检测现有配置
├─ 智能默认值
├─ 配置验证
└─ 安全密钥生成

第 3 步：选择部署模式
  1. 🚀 快速一键部署 (推荐)
  2. 💻 开发环境模式
  3. 📦 生产环境模式
  4. ⚙️  自定义部署步骤

第 4 步：确认部署计划
├─ 显示即将执行的操作
├─ 预计耗时
└─ 用户确认

第 5 步：执行部署 ⏳
├─ [▓▓▓▓▓▓▓▓░░] 80%
├─ 实时进度显示
└─ 自动错误处理

第 6 步：部署验证 ✅
├─ 服务状态检查
├─ 端口监听检查
├─ API 健康检查
└─ 文件完整性检查

第 7 步：完成提示
├─ 访问地址
├─ 下一步建议
└─ 常用命令
```

### 💡 核心功能

✅ **智能环境检查** - 自动检测缺失依赖并提供安装建议
✅ **配置向导** - 交互式配置生成，带验证和默认值
✅ **多种部署模式** - 适应不同场景需求
✅ **部署验证** - 自动健康检查和问题诊断
✅ **回滚机制** - 部署失败自动回滚到之前版本
✅ **进度提示** - 实时显示部署进度
✅ **备份管理** - 自动备份，保留最近 3 次部署

---

## 📖 使用指南

### 基本用法

```bash
# 启动交互式部署向导
./deploy.sh

# 显示帮助信息
./deploy.sh --help

# 显示版本信息
./deploy.sh --version
```

### 部署模式说明

#### 1. 🚀 快速一键部署（推荐）

适合：首次部署、快速上线

包含：
- 构建前端和后端
- 安装到部署目录
- 配置 systemd 服务
- 启动并验证服务

预计时间：3-5 分钟

#### 2. 💻 开发环境模式

适合：开发调试

包含：
- 仅构建前端和后端
- 生成 dist 和 bin 目录

不包含：
- 不部署到系统目录
- 不配置服务

预计时间：2-3 分钟

#### 3. 📦 生产环境模式

适合：正式环境

包含：
- 部署前自动备份
- 完整构建和部署
- 失败自动回滚
- 完整验证

预计时间：3-5 分钟

#### 4. ⚙️ 自定义部署步骤

适合：高级用户

可选步骤：
- 构建前端/后端
- 清理构建产物
- 安装文件
- 配置服务
- 启动/停止/重启服务

---

## 📁 目录结构

部署后的文件结构：

```
前端目录 (默认: /var/www/example.com)
├── index.html
├── assets/
└── ...

后端目录 (默认: /opt/cc-platform)
├── cc-server           # 可执行文件
├── .env                # 配置文件
├── data/               # 数据目录
│   └── cc-platform.db
├── logs/               # 日志目录
│   └── backend.log
└── docker/             # Docker 相关
    └── build-base.sh

备份目录 (.deploy-backups)
├── backup_20260105_120000/
├── backup_20260105_130000/
└── backup_20260105_140000/
```

---

## ⚙️ 配置说明

### 环境变量 (.env)

配置向导会自动生成 `.env` 文件，包含以下配置：

```bash
# 基础配置
PORT=8080                           # 后端端口
FRONTEND_PORT=3000                  # 前端开发端口

# 管理员账户
ADMIN_USERNAME=admin                # 管理员用户名
ADMIN_PASSWORD=your_password        # 管理员密码

# 安全配置
JWT_SECRET=your_jwt_secret          # JWT 密钥

# Docker 配置
AUTO_START_TRAEFIK=false            # 是否自动启动 Traefik
CODE_SERVER_BASE_DOMAIN=            # Code-Server 域名
```

### 部署目录 (.deploy-config)

```bash
FRONTEND_DIR=/var/www/example.com   # 前端部署目录
BACKEND_DIR=/opt/cc-platform        # 后端部署目录
```

---

## 🌐 Nginx 配置

部署完成后，需要配置 Nginx：

```bash
# 复制示例配置
sudo cp deploy/nginx.conf /etc/nginx/sites-available/example.com.conf

# 编辑配置
sudo vim /etc/nginx/sites-available/example.com.conf

# 创建软链接
sudo ln -s /etc/nginx/sites-available/example.com.conf /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 重载 Nginx
sudo nginx -s reload
```

关键配置项：
- 前端静态文件: `root /var/www/example.com;`
- 后端代理: `proxy_pass http://127.0.0.1:8080;`

---

## 🔧 服务管理

### 使用 systemctl

```bash
# 查看状态
sudo systemctl status cc-platform

# 启动服务
sudo systemctl start cc-platform

# 停止服务
sudo systemctl stop cc-platform

# 重启服务
sudo systemctl restart cc-platform

# 查看日志
sudo journalctl -u cc-platform -f

# 或查看文件日志
tail -f /opt/cc-platform/logs/backend.log
```

---

## 🔄 更新部署

```bash
# 拉取最新代码
git pull

# 重新运行部署脚本
./deploy.sh

# 选择 "快速一键部署" 或 "生产环境模式"
```

系统会自动：
- 创建备份
- 构建新版本
- 停止旧服务
- 部署新版本
- 启动服务
- 验证部署

如果失败，可以回滚到备份。

---

## ❓ 常见问题

### 部署失败怎么办？

1. 查看错误信息
2. 检查日志：`sudo journalctl -u cc-platform -n 50`
3. 验证配置：`cat /opt/cc-platform/.env`
4. 如有备份，可以回滚

### 如何回滚部署？

备份位于 `.deploy-backups/` 目录：

```bash
# 查看可用备份
ls -la .deploy-backups/

# 手动回滚（在部署脚本中选择）
# 或手动恢复文件
```

### 服务无法启动？

```bash
# 查看详细错误
sudo systemctl status cc-platform
sudo journalctl -u cc-platform -n 100

# 检查端口是否被占用
sudo lsof -i :8080

# 手动运行查看错误
cd /opt/cc-platform
./cc-server
```

### 前端 502 错误？

1. 检查后端服务是否运行
2. 检查 Nginx 配置
3. 检查端口号是否正确
4. 查看 Nginx 错误日志

---

## 🐳 Docker 基础镜像

首次部署需要构建 Docker 基础镜像：

```bash
cd /opt/cc-platform/docker
./build-base.sh
```

---

## 📚 更多信息

- 项目文档：[README.zh-CN.md](../README.zh-CN.md)
- 部署脚本源码：`deploy/`
- 问题反馈：[GitHub Issues](https://github.com/qinsehm1128/cloud_claude_code/issues)

---

<p align="center">
  <a href="../README.zh-CN.md">← 返回主文档</a>
</p>
