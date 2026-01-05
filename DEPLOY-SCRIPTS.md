# 📋 部署脚本使用说明

## 🎯 新增的交互式部署工具

本项目现在提供了两种部署方式:

### 1. 交互式部署 (推荐新手) 🌟

#### `deploy-interactive.sh` - 主部署向导

友好的菜单驱动界面,提供完整的部署流程:

```bash
./deploy-interactive.sh
```

**主要功能:**
- 🚀 快速一键部署
- 💻 开发环境启动
- 🏭 生产环境部署
- ⚙️ 配置管理
- 🔨 构建管理
- 🔧 服务管理
- 📊 系统状态检查
- 📚 内置帮助文档

#### `config-wizard.sh` - 配置向导

轻松配置 .env 环境文件:

```bash
./config-wizard.sh
```

**特色功能:**
- 📝 渐进式配置引导
- ✅ 自动验证输入
- 🔑 自动生成安全密钥
- 💾 自动备份配置
- 🎯 智能默认值建议

---

### 2. 命令行部署 (高级用户)

保留原有的命令行工具,提供更多灵活性:

#### `deploy.sh` - 传统部署脚本

```bash
# 完整部署
./deploy.sh --full-deploy

# 分步部署
./deploy.sh --build
./deploy.sh --install
./deploy.sh --setup-service
./deploy.sh --start-service
```

#### `start-dev.sh` - 开发环境脚本

```bash
# 启动完整开发环境
./start-dev.sh

# 仅启动后端
./start-dev.sh --backend

# 生产模式 (构建+部署前端+运行后端)
./start-dev.sh --prod --deploy-dir /var/www/example.com
```

---

## 🚀 快速开始

### 首次部署 (3 步)

```bash
# 1. 配置环境
./config-wizard.sh

# 2. 一键部署
./deploy-interactive.sh
# 选择 "1. 快速一键部署"

# 3. 配置 Nginx 并启动
sudo cp deploy/nginx.conf /etc/nginx/sites-available/cc-platform.conf
# 修改域名和路径后
sudo nginx -s reload
```

### 开发环境

```bash
# 方式 1: 使用交互式菜单
./deploy-interactive.sh
# 选择 "2. 开发环境部署"

# 方式 2: 使用命令行
./start-dev.sh
```

---

## 📚 完整文档

- **快速入门**: [QUICKSTART.zh-CN.md](QUICKSTART.zh-CN.md)
- **详细部署指南**: [deploy/README.zh-CN.md](deploy/README.zh-CN.md)
- **项目文档**: [README.zh-CN.md](README.zh-CN.md)

---

## 🎨 交互式部署的优势

与传统命令行部署相比:

| 特性 | 交互式部署 | 命令行部署 |
|------|-----------|-----------|
| 易用性 | ✅ 菜单选择,无需记忆参数 | ❌ 需要记住命令参数 |
| 引导性 | ✅ 渐进式步骤引导 | ❌ 需要自己规划步骤 |
| 验证 | ✅ 自动验证配置 | ⚠️ 需要手动检查 |
| 状态检查 | ✅ 实时系统状态显示 | ❌ 需要手动查询 |
| 错误处理 | ✅ 友好的错误提示 | ⚠️ 命令行错误信息 |
| 适合人群 | 新手、快速部署 | 高级用户、自动化 |

---

## ⚙️ 配置文件说明

### .env 文件

使用配置向导自动生成,或手动编辑:

```bash
# 基础配置
PORT=8080
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_password
JWT_SECRET=your_jwt_secret

# Docker 配置
AUTO_START_TRAEFIK=true
CODE_SERVER_BASE_DOMAIN=code.example.com
```

### .deploy-config 文件

部署脚本自动生成,保存部署目录配置:

```bash
FRONTEND_DIR=/var/www/example.com
BACKEND_DIR=/opt/cc-platform
```

---

## 🔧 脚本文件一览

```
cloud_claude_code/
├── deploy-interactive.sh    # 🌟 新: 交互式部署向导
├── config-wizard.sh         # 🌟 新: 配置向导
├── deploy.sh                # 传统: 命令行部署脚本
├── start-dev.sh             # 传统: 开发环境启动脚本
├── QUICKSTART.zh-CN.md      # 🌟 新: 快速入门指南
├── DEPLOY-SCRIPTS.md        # 🌟 新: 本文件
└── deploy/
    ├── README.zh-CN.md      # 更新: 包含交互式部署说明
    ├── README.md            # 更新: 英文版
    └── nginx.conf           # Nginx 配置示例
```

---

## 💡 使用建议

### 新手用户

1. 使用 `config-wizard.sh` 配置环境
2. 使用 `deploy-interactive.sh` 一键部署
3. 遇到问题查看交互式菜单的帮助文档

### 开发者

1. 使用 `start-dev.sh` 快速启动开发环境
2. 使用 `deploy-interactive.sh` 的构建管理功能
3. 需要自动化时使用 `deploy.sh` 命令行参数

### 运维人员

1. 生产环境使用 `deploy.sh --full-deploy`
2. 服务管理使用 systemctl 命令
3. 自动化脚本中调用 `deploy.sh` 的各种参数

---

## 🎯 选择合适的部署方式

```
首次部署?
├─ 是 → 使用 deploy-interactive.sh
│        (快速上手,友好引导)
└─ 否 → 已经熟悉流程?
         ├─ 是 → 使用 deploy.sh
         │        (快速命令,适合自动化)
         └─ 否 → 使用 deploy-interactive.sh
                  (查看系统状态,分步操作)

需要配置 .env?
├─ 首次配置 → 使用 config-wizard.sh 完整向导
├─ 修改密码 → 使用 config-wizard.sh 快速选项
└─ 熟悉配置 → 直接编辑 .env 文件

开发环境?
├─ 快速启动 → ./start-dev.sh
├─ 选择性启动 → deploy-interactive.sh → 开发环境部署
└─ 生产模式测试 → ./start-dev.sh --prod --deploy-dir /path
```

---

## 📞 获取帮助

### 方式 1: 交互式帮助

```bash
./deploy-interactive.sh
# 选择 "8. 帮助文档"
```

### 方式 2: 查看文档

```bash
# 快速入门
cat QUICKSTART.zh-CN.md

# 完整部署指南
cat deploy/README.zh-CN.md
```

### 方式 3: 命令行帮助

```bash
./deploy.sh --help
./start-dev.sh --help
./config-wizard.sh --help
```

---

<p align="center">
  Made with ❤️ for easier deployment
</p>
