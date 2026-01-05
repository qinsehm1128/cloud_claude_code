# 🚀 快速入门指南

> Claude Code Container Platform 交互式部署快速入门

---

## 📋 目录

1. [系统要求](#-系统要求)
2. [快速部署](#-快速部署-3-分钟)
3. [配置说明](#-配置说明)
4. [常见问题](#-常见问题)
5. [下一步](#-下一步)

---

## 💻 系统要求

### 必需
- **Node.js** >= 18.0 (前端构建)
- **Go** >= 1.20 (后端构建)
- **Linux** 系统 (推荐 Ubuntu 20.04+)

### 可选
- **Docker** (用于容器管理功能)
- **Nginx** (生产环境反向代理)

---

## ⚡ 快速部署 (3 分钟)

### 方式一: 交互式一键部署 (推荐新手)

```bash
# 1. 进入项目目录
cd cloud_claude_code

# 2. 运行交互式部署向导
./deploy-interactive.sh

# 3. 在主菜单选择 "1. 快速一键部署"
# 4. 按提示确认配置并等待完成
```

**就这么简单!** 🎉

### 方式二: 分步部署

```bash
# 步骤 1: 配置环境变量
./config-wizard.sh
# 选择 "1. 运行完整配置向导"
# 按提示输入管理员用户名、密码等

# 步骤 2: 运行部署
./deploy-interactive.sh
# 选择 "3. 生产环境部署" -> "1. 完整部署"
```

### 方式三: 命令行部署 (高级用户)

```bash
# 一键部署
./deploy.sh --full-deploy

# 或分步执行
./deploy.sh --build              # 构建
./deploy.sh --install            # 安装
./deploy.sh --setup-service      # 配置服务
./deploy.sh --start-service      # 启动服务
```

---

## ⚙️ 配置说明

### 必需配置项

在 `.env` 文件中设置以下参数:

```bash
# 后端端口 (默认 8080)
PORT=8080

# 管理员账户
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_secure_password

# JWT 密钥 (使用命令生成: openssl rand -hex 32)
JWT_SECRET=your_jwt_secret_key_here
```

### 可选配置项

```bash
# 自动启动 Traefik (容器路由)
AUTO_START_TRAEFIK=true

# Code-Server 子域名 (用于通过子域名访问容器)
CODE_SERVER_BASE_DOMAIN=code.example.com
```

### 使用配置向导

交互式配置工具让配置变得简单:

```bash
./config-wizard.sh
```

**配置向导功能:**
- ✅ 自动生成 JWT 密钥
- ✅ 验证端口和域名格式
- ✅ 提供默认值建议
- ✅ 自动备份现有配置

---

## 🌐 Nginx 配置

### 复制配置文件

```bash
# 复制示例配置
sudo cp deploy/nginx.conf /etc/nginx/sites-available/cc-platform.conf

# 修改域名和路径
sudo vim /etc/nginx/sites-available/cc-platform.conf

# 启用配置
sudo ln -s /etc/nginx/sites-available/cc-platform.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo nginx -s reload
```

### 需要修改的配置

1. `server_name` - 改为你的域名
2. `root` - 前端静态文件目录 (默认 `/var/www/example.com`)
3. `proxy_pass` - 后端端口 (与 `.env` 中 `PORT` 一致)

---

## 🔧 服务管理

### 使用交互式菜单

```bash
./deploy-interactive.sh
# 选择 "6. 服务管理"
```

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
```

---

## ❓ 常见问题

### Q1: 502 Bad Gateway 错误

**原因:** 后端服务未运行

**解决:**
```bash
# 检查服务状态
sudo systemctl status cc-platform

# 启动服务
sudo systemctl start cc-platform

# 查看错误日志
sudo journalctl -u cc-platform -n 50
```

### Q2: 端口已被占用

**解决:**
```bash
# 查看占用端口的进程
sudo lsof -i :8080

# 修改配置使用其他端口
vim /opt/cc-platform/.env
# 修改 PORT=8081

# 重启服务
sudo systemctl restart cc-platform
```

### Q3: 权限错误 (Docker)

**原因:** 运行用户不在 docker 组

**解决:**
```bash
# 添加用户到 docker 组
sudo usermod -aG docker $USER

# 重新登录或重启
sudo reboot
```

### Q4: 前端页面打不开

**检查清单:**
- [ ] Nginx 是否运行: `sudo systemctl status nginx`
- [ ] 前端文件是否存在: `ls /var/www/example.com`
- [ ] Nginx 配置是否正确: `sudo nginx -t`
- [ ] 域名 DNS 是否解析正确

### Q5: WebSocket 连接失败

**解决:** 确保 Nginx 配置包含 WebSocket 支持

```nginx
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

---

## 🎯 下一步

### 1. 配置 Code-Server 子域名 (可选)

如果你想通过子域名访问容器 (如 `my-container.code.example.com`):

```bash
# 1. 配置 DNS 泛域名记录
*.code.example.com -> 你的服务器IP

# 2. 在 .env 中设置
CODE_SERVER_BASE_DOMAIN=code.example.com

# 3. 配置 Nginx (参考 deploy/nginx.conf 第二个 server 块)

# 4. 启用 Traefik
AUTO_START_TRAEFIK=true
```

### 2. 构建 Docker 基础镜像

首次使用容器功能前需要构建镜像:

```bash
cd /opt/cc-platform/docker
./build-base.sh
```

### 3. 配置 HTTPS (推荐)

使用 Let's Encrypt 免费证书:

```bash
# 安装 certbot
sudo apt install certbot python3-certbot-nginx

# 申请证书
sudo certbot --nginx -d example.com

# 自动续期
sudo certbot renew --dry-run
```

### 4. 查看完整文档

- [部署指南](deploy/README.zh-CN.md) - 详细部署文档
- [主文档](README.zh-CN.md) - 项目完整文档

---

## 📞 获取帮助

### 交互式帮助

```bash
./deploy-interactive.sh
# 选择 "8. 帮助文档"
```

### 查看日志

```bash
# 服务日志
sudo journalctl -u cc-platform -f

# 或查看文件
tail -f /opt/cc-platform/logs/backend.log
```

### 系统状态检查

```bash
./deploy-interactive.sh
# 选择 "7. 查看系统状态"
```

---

## ✨ 部署成功!

访问你的应用:

- **前端**: `http://your-domain.com` 或 `http://your-ip`
- **后端 API**: `http://your-domain.com/api`

使用配置的管理员账户登录即可开始使用! 🎉

---

<p align="center">
  <a href="README.zh-CN.md">← 返回主文档</a> |
  <a href="deploy/README.zh-CN.md">查看完整部署指南</a>
</p>
