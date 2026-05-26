# 会话管理

## 会话生命周期

```
创建 (create) → 激活 (active) → 释放 (release)
                      │
                      ├── 自动释放（断开连接/超时）
                      └── 手动释放（调用 API）
```

### 1. 创建

客户端请求创建浏览器会话，系统分配可用机器节点并启动浏览器实例。

```typescript
const session = await client.sessions.create({
  headless: true,
  viewport: { width: 1280, height: 720 },
});
```

### 2. 激活

浏览器实例启动完成，返回 WebSocket 连接地址，客户端可开始使用。

```typescript
const browser = await chromium.connectOverCDP(session.directUrl);
```

### 3. 释放

使用完毕主动释放，系统回收资源并计算费用。

```typescript
await client.sessions.release(session.id);
```

## 会话状态

| 状态 | 说明 |
|------|------|
| `pending` | 等待分配机器 |
| `active` | 浏览器已就绪，可使用 |
| `releasing` | 正在释放 |
| `released` | 已释放 |
| `failed` | 创建失败 |

## 自动释放机制

系统会在以下情况自动释放会话：

- **WebSocket 连接断开**：客户端断连后自动清理
- **超时未使用**：超过 `INSTANCE_TIMEOUT`（默认 60s）无活动
- **积分不足**：余额不足时强制回收
- **机器离线**：所在机器节点失联

## 积分扣费

```typescript
// 查询积分余额
const balance = await client.request('GET', '/api/credits/balance');
console.log(`当前积分: ${balance.data.balance}`);

// 查看历史扣费记录
const history = await client.request('GET', '/api/credits/history');
```

扣费规则：
- 按秒计费
- 最小计费单位：1 秒
- 费率：由管理员配置

## 获取会话列表

```typescript
// 获取所有会话（分页）
const sessions = await client.sessions.list(1, 10);

// 获取单个会话详情
const session = await client.sessions.get('sess_abc123');
```

## 最佳实践

::: tip 使用建议
1. **及时释放**：使用完毕后立即调用 `release()`，避免浪费积分
2. **错误处理**：在 `try/catch` 中释放会话，确保异常时也能回收资源
3. **复用连接**：尽量复用同一个会话完成多个操作
4. **监控状态**：定期检查会话状态，处理异常断开
5. **超时处理**：设置合理的操作超时，避免长时间占用
:::

### 安全释放模式

```typescript
async function safeExecute(apiKey: string, task: (session: Session) => Promise<void>) {
  const client = new Client({ apiKey });
  let session: Session | null = null;

  try {
    session = await client.sessions.createAndConnect();
    await task(session);
  } catch (error) {
    console.error('执行失败:', error);
  } finally {
    if (session) {
      await client.sessions.release(session.id).catch(console.error);
    }
  }
}
```
