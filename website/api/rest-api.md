# REST API 参考

Base URL: `http://localhost:3000/api`

## 认证方式

接口需要认证时，通过 Header 传递：

```bash
# Bearer Token
Authorization: Bearer <JWT_TOKEN>

# 或 API Key
x-api-key: <API_KEY>
```

## 接口列表

### Auth 认证

#### 登录

```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin123"
}
```

**响应：**

```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": 1,
      "username": "admin",
      "role": "admin",
      "credits": 1000
    }
  }
}
```

#### 注册

```http
POST /api/auth/register
Content-Type: application/json

{
  "username": "newuser",
  "password": "password123"
}
```

### Users 用户管理

需要管理员权限。

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/users` | 获取用户列表（分页） |
| `GET` | `/api/users/:id` | 获取用户详情 |
| `PUT` | `/api/users/:id` | 更新用户信息 |
| `DELETE` | `/api/users/:id` | 删除用户 |

**获取用户列表：**

```bash
curl -H "Authorization: Bearer <TOKEN>" \
  "http://localhost:3000/api/users?page=1&limit=10"
```

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": 1,
        "username": "admin",
        "role": "admin",
        "credits": 1000,
        "created_at": "2024-01-01T00:00:00Z"
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 10
  }
}
```

### Sessions 会话管理

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/sessions` | 创建浏览器会话 |
| `GET` | `/api/sessions` | 获取会话列表 |
| `GET` | `/api/sessions/:id` | 获取会话详情 |
| `POST` | `/api/sessions/:id/release` | 释放会话 |
| `GET` | `/api/sessions/:id/screenshot` | 获取会话截图 |

#### 创建会话

```http
POST /api/sessions
Authorization: Bearer <TOKEN>
Content-Type: application/json

{
  "options": {
    "headless": true,
    "viewport": { "width": 1280, "height": 720 }
  }
}
```

**响应：**

```json
{
  "success": true,
  "data": {
    "id": "sess_abc123",
    "status": "active",
    "browserWSEndpoint": "ws://host:port/devtools/browser/...",
    "directUrl": "ws://host:8082/ws/proxy?session=sess_abc123",
    "viewerUrl": "http://host:3000/viewer/sess_abc123",
    "machine_id": "machine-1",
    "created_at": "2024-01-01T00:00:00Z"
  }
}
```

#### 释放会话

```http
POST /api/sessions/:id/release
Authorization: Bearer <TOKEN>
```

```json
{
  "success": true,
  "data": {
    "id": "sess_abc123",
    "status": "released",
    "duration": 120.5
  }
}
```

### Credits 积分管理

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/credits/balance` | 查询积分余额 |
| `POST` | `/api/credits/recharge` | 积分充值（管理接口） |
| `GET` | `/api/credits/history` | 积分变动记录 |

### Machines 机器管理

需要管理员权限。

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/machines` | 获取机器列表 |
| `GET` | `/api/machines/:id` | 获取机器详情 |
| `POST` | `/api/machines/:id/disable` | 禁用机器 |

```json
{
  "success": true,
  "data": [
    {
      "id": "machine-1",
      "status": "online",
      "host": "192.168.1.100",
      "port": 8082,
      "load": 3,
      "max_instances": 10,
      "last_heartbeat": "2024-01-01T00:00:00Z"
    }
  ]
}
```

### Files 文件管理

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/files/upload` | 上传文件 |
| `GET` | `/api/files/:id` | 下载文件 |
| `DELETE` | `/api/files/:id` | 删除文件 |

#### 上传文件

```http
POST /api/files/upload
Authorization: Bearer <TOKEN>
Content-Type: multipart/form-data

file: <binary>
```

```json
{
  "success": true,
  "data": {
    "id": "file_xyz789",
    "filename": "screenshot.png",
    "size": 102400,
    "url": "/api/files/file_xyz789"
  }
}
```
