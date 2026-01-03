# 部署指南

## 快速开始

### 开发模式
```bash
# 启动前端开发服务器 + 后端
./start-dev.sh

# 仅启动后端
./start-dev.sh --backend

# 仅启动前端
./start-dev.sh --frontend
```

### 生产模式（打包前端 + 运行后端）
```bash
# 打包前端到指定目录，然后运行后端
./start-dev.sh --prod --deploy-dir /var/www/example.com
```

这种模式会：
1. 构建前端生产版本
2. 复制到指定目录
3. 直接运行后端（go run，非二进制）

适合在服务器上快速测试，nginx 指向前端目录即可。

---

## 目录结构

部署支持前后端分离：
- **前端目录**: nginx 静态文件目录 (默认: `/var/www/example.com`)
- **后端目录**: 后端程序和配置 (默认: `/opt/cc-platform`)

```
/var/www/example.com/   # 前端
├── index.html
├── assets/
└── ...

/opt/cc-platform/                   # 后端
├── cc-server                       # 可执行文件
├── .env                            # 配置文件
├── data/                           # 数据目录
│   └── cc-platform.db
├── logs/                           # 日志目录
│   └── backend.log
└── docker/                         # Docker 相关
    └── build-base.sh
```

## 快速部署

### 一键完整部署

```bash
# 构建 + 安装 + 配置服务 + 启用 + 启动
./deploy.sh --full-deploy

# 使用自定义目录
./deploy.sh --full-deploy \
    --frontend-dir /var/www/mysite.com \
    --backend-dir /opt/myapp
```

### 分步部署

```bash
# 1. 构建
./deploy.sh --build

# 2. 安装文件
./deploy.sh --install

# 3. 配置 systemd 服务
./deploy.sh --setup-service

# 4. 启用并启动服务
./deploy.sh --enable-service --start-service
```

## 命令参考

### 构建选项
```bash
./deploy.sh --build              # 构建前端和后端
./deploy.sh --frontend           # 仅构建前端
./deploy.sh --backend            # 仅构建后端
./deploy.sh --clean              # 清理构建产物
```

### 部署选项
```bash
./deploy.sh --install                        # 安装到默认目录
./deploy.sh --frontend-dir /path --install   # 指定前端目录
./deploy.sh --backend-dir /path --install    # 指定后端目录
```

### 服务管理
```bash
./deploy.sh --setup-service      # 生成 systemd service 文件
./deploy.sh --enable-service     # 设置开机自启
./deploy.sh --start-service      # 启动服务
./deploy.sh --stop-service       # 停止服务
./deploy.sh --restart-service    # 重启服务
./deploy.sh --status             # 查看服务状态
```

### 组合命令
```bash
./deploy.sh --deploy             # 构建 + 安装 + 配置服务
./deploy.sh --full-deploy        # 构建 + 安装 + 配置 + 启用 + 启动
```

## 环境变量

可以通过环境变量预设目录：

```bash
export FRONTEND_DIR=/var/www/mysite.com
export BACKEND_DIR=/opt/myapp
./deploy.sh --deploy
```

## Nginx 配置

将 `deploy/nginx.conf` 内容添加到你的 nginx 配置中。

关键配置：
- 前端静态文件: `root /var/www/example.com;`
- 后端代理: `proxy_pass http://127.0.0.1:8080;`

```bash
# 宝塔面板
vim /www/server/panel/vhost/nginx/example.com.conf

# 重载 nginx
nginx -s reload
```

## 配置文件

编辑 `/opt/cc-platform/.env`:

```bash
# 必须配置
PORT=8080
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_secure_password
JWT_SECRET=your_jwt_secret_key

# 可选配置
AUTO_START_TRAEFIK=false
```

生成安全密钥：
```bash
openssl rand -hex 32
```

## 服务管理

### 使用 systemctl

```bash
# 查看状态
sudo systemctl status cc-platform

# 启动/停止/重启
sudo systemctl start cc-platform
sudo systemctl stop cc-platform
sudo systemctl restart cc-platform

# 查看日志
sudo journalctl -u cc-platform -f
# 或
tail -f /opt/cc-platform/logs/backend.log
```

### 手动运行（调试用）

```bash
cd /opt/cc-platform
./cc-server
```

## Docker 基础镜像

首次部署需要构建 Docker 基础镜像：

```bash
cd /opt/cc-platform/docker
./build-base.sh
```

这会创建：
- `cc-base:latest` - 基础镜像
- `cc-base:with-code-server` - 包含 code-server 的镜像

## 常见问题

### 1. 502 Bad Gateway
- 检查后端是否运行: `systemctl status cc-platform`
- 检查端口配置是否一致

### 2. WebSocket 连接失败
- 确保 nginx 配置包含 WebSocket 支持
- 检查 `proxy_set_header Upgrade` 设置

### 3. 权限问题
- 后端需要访问 Docker: 确保运行用户在 docker 组
- 或使用 root 用户运行

### 4. 服务启动失败
```bash
# 查看详细日志
journalctl -u cc-platform -n 100 --no-pager

# 手动运行查看错误
cd /opt/cc-platform && ./cc-server
```

## 更新部署

```bash
# 拉取最新代码
git pull

# 重新部署
./deploy.sh --deploy --restart-service
```
