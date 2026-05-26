# 认证机制

系统提供两种认证方式：JWT Token 和 API Key。

## JWT Token 认证

适用于用户交互场景（Web 前端、CLI 工具等）。

### 获取 Token

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin123"}'
```

**响应：**

```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "expiresIn": "1d",
    "user": {
      "id": 1,
      "username": "admin",
      "role": "admin"
    }
  }
}
```

### 使用 Token

```bash
curl -H "Authorization: Bearer <JWT_TOKEN>" \
  http://localhost:3000/api/sessions
```

### Token 刷新

Token 过期后需要重新登录获取新 Token。建议在客户端检测 401 状态码后自动跳转登录页。

## API Key 认证

适用于自动化脚本、CI/CD 等场景。

### 获取 API Key

在管理后台的用户设置页面生成，或通过管理员创建。

### 使用 API Key

```bash
curl -H "x-api-key: <API_KEY>" \
  http://localhost:3000/api/sessions
```

API Key 的优势：
- 不过期（可手动撤销）
- 可独立管理权限范围
- 适合服务端到服务端的调用

## 角色系统

| 角色 | 权限 |
|------|------|
| **admin** | 全部权限：用户管理、机器管理、积分管理、系统配置 |
| **user** | 基本权限：创建会话、文件操作、查看自己信息 |

### 角色检查

```bash
# 查看当前用户信息（包含角色）
curl -H "Authorization: Bearer <TOKEN>" \
  http://localhost:3000/api/auth/me
```

## 安全最佳实践

::: tip 推荐做法
1. **HTTPS**：生产环境务必配置 HTTPS
2. **密钥强度**：`JWT_SECRET` 至少 32 位随机字符串
3. **过期时间**：根据安全需求设置 Token 过期时间（建议 1-7 天）
4. **API Key 管理**：定期轮换，及时撤销不需要的 Key
5. **密码策略**：使用 bcryptjs 加密存储，不记录明文
6. **速率限制**：登录接口做了速率限制，防止暴力破解
:::

::: warning 安全警告
- 不要在前端代码中硬编码 API Key
- 不要在日志中输出 Token 或 API Key
- Token 丢失无法恢复，请妥善保管
- API Key 泄露后立即在后台撤销并重新生成
:::

## Header 对照表

| Header | 说明 | 示例 |
|--------|------|------|
| `Authorization` | Bearer Token | `Bearer eyJhbGciOiJIUzI1NiIs...` |
| `x-api-key` | API Key | `x-api-key: pwk_abc123def456` |
