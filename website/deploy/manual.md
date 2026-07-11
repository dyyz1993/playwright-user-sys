# 手动部署

## 前置要求

- Node.js 20+
- pnpm
- MySQL 8.0+（可选，开发可用 SQLite）
- Nginx（反向代理）

## 构建

```bash
# 克隆代码
git clone https://github.com/dyyz1993/playwright-user-sys.git
cd playwright-user-sys

# 安装依赖
pnpm install

# 构建
pnpm build
```

构建产物在 `dist/` 目录。

## 数据库设置

### SQLite（开发环境）

无需额外配置，默认自动创建。

### MySQL（生产环境）

```bash
# 创建数据库
mysql -u root -p -e "CREATE DATABASE playwright_user_sys CHARACTER SET utf8mb4;"

# 创建用户
mysql -u root -p -e "
  CREATE USER 'playwright'@'%' IDENTIFIED BY 'your-password';
  GRANT ALL PRIVILEGES ON playwright_user_sys.* TO 'playwright'@'%';
  FLUSH PRIVILEGES;
"
```

## 环境变量配置

```bash
# 复制模板
cp .env.example .env.production

# 编辑配置（至少修改以下项）
# JWT_SECRET=your-strong-secret
# ADMIN_PASSWORD=your-strong-password
# DB_TYPE=mysql    # 如使用 MySQL
# DB_HOST=localhost
# DB_PASSWORD=your-db-password
```

## 启动管理服务器

```bash
# 使用 tsx 直接运行（开发/调试）
NODE_ENV=production dotenv -e .env.production -- tsx src/manager/server.ts

# 使用构建产物（生产）
NODE_ENV=production node dist/manager/server.js
```

## 启动机器服务

```bash
# 配置机器环境变量
export MACHINE_ID=machine-1
export MANAGEMENT_SERVER_URL=http://localhost:3000
export MANAGER_HOST=localhost:50051

# 启动
NODE_ENV=production tsx src/machine/server.ts
```

## Nginx 反向代理

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 可选：重定向到 HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # 管理服务器
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;

        # WebSocket 支持
        proxy_read_timeout 86400s;
    }

    # 文件上传大小限制
    client_max_body_size 100m;
}
```

## Systemd 服务

### 管理服务器

```ini
[Unit]
Description=Playwright User Sys - Manager Server
After=network.target

[Service]
Type=simple
User=playwright
WorkingDirectory=/opt/playwright-user-sys
ExecStart=/usr/bin/node dist/manager/server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=JWT_SECRET=your-secret
Environment=ADMIN_PASSWORD=your-password

[Install]
WantedBy=multi-user.target
```

### 机器服务

```ini
[Unit]
Description=Playwright User Sys - Machine Service
After=network.target playwright-manager.service

[Service]
Type=simple
User=playwright
WorkingDirectory=/opt/playwright-user-sys
ExecStart=/usr/bin/node dist/machine/server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=MACHINE_ID=machine-1
Environment=MANAGEMENT_SERVER_URL=http://localhost:3000
Environment=MANAGER_HOST=localhost:50051

[Install]
WantedBy=multi-user.target
```

```bash
# 安装服务
sudo cp manager.service /etc/systemd/system/
sudo cp machine.service /etc/systemd/system/
sudo systemctl daemon-reload

# 启动服务
sudo systemctl enable --now playwright-manager
sudo systemctl enable --now playwright-machine

# 查看状态
sudo systemctl status playwright-manager
```
