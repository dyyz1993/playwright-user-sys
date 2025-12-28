# S-ERROR-04 测试失败根本原因分析报告

## 测试概述

**测试用例**: S-ERROR-04: 无效JSON格式的options验证
**期望结果**: 400 或 422 (Bad Request / Unprocessable Entity)
**实际结果**: 201 (Created)
**问题描述**: 发送包含未知字段 `options` 的请求时，应该被拒绝但实际成功创建了会话

## 1. 问题确认

### 1.1 测试场景
```javascript
// 测试代码 (src/tests/integration/routes/session-api.routes.test.ts:2087-2113)
it('S-ERROR-04: 无效JSON格式的options', async () => {
  const user = await createTestUser();

  const response = await app.inject({
    method: 'POST',
    url: '/api/sessions',
    headers: {
      'x-api-key': user.api_key,
      'Content-Type': 'application/json',
    },
    payload: {
      options: { userAgent: 'test' },  // ❌ 未知字段，应被拒绝
    },
  });

  expect([400, 422]).toContain(response.statusCode);  // ❌ 实际返回 201
});
```

### 1.2 Zod Schema 定义
```typescript
// src/schemas/session.schema.ts:17-26
export const createSessionRequestSchema = z.object({
  userAgent: z.string().optional(),
  proxy: z.string().optional(),
  cookies: z.record(z.string()).optional(),
  localStorage: z.record(z.string()).optional(),
  viewport: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }).optional(),
}).strict();  // ✅ 严格模式：拒绝未知字段
```

### 1.3 验证结果
- ✅ **Zod strict() 模式工作正常**: 独立测试证实 Zod 会正确拒绝未知字段
- ✅ **JSON Schema 转换正确**: `zodToJsonSchema()` 生成的 schema 包含 `"additionalProperties": false`
- ❌ **Fastify 验证层失效**: 未知字段未被拒绝，而是被静默移除

## 2. 根本原因

### 2.1 Fastify 的默认 AJV 配置

Fastify 使用 **AJV (Another JSON Schema Validator)** 进行 JSON Schema 验证，其默认配置包括:

```javascript
{
  coerceTypes: true,
  useDefaults: true,
  removeAdditional: true,  // ⚠️ 关键配置
  allErrors: false
}
```

### 2.2 `removeAdditional: true` 的行为

这个配置的行为是:
- 当 JSON Schema 中设置了 `additionalProperties: false` 时
- AJV 会**自动删除**未知字段，而不是**拒绝**请求
- 请求会继续处理，Controller 收到的 `request.body` 已被清理

### 2.3 实际执行流程

```
1. 客户端发送: { options: { userAgent: 'test' } }
   ↓
2. Fastify 接收请求
   ↓
3. AJV 验证 (removeAdditional: true)
   - 检测到 "options" 不在 schema 中
   - 删除 "options" 字段 ✅
   - request.body 变成: {}
   ↓
4. Controller 收到已清理的 request.body: {}
   ↓
5. Zod 验证: createSessionRequestSchema.parse({})
   - 通过！因为空对象是有效的
   ↓
6. 返回 201 Created
```

## 3. 证据

### 3.1 独立测试结果

```bash
$ node test-fastify-validation.js

=== Test 2: Request with unknown field "options" ===
Status: 200
Body: {"success":true,"data":{}}

Request received in handler:
request.body: {}  # ⚠️ "options" 字段已被删除！
```

### 3.2 Fastify 文档确认

根据 [Fastify Validation and Serialization Documentation](https://fastify.io/docs/latest/Reference/Validation-and-Serialization/):
> The `removeAdditional: true` setting is active by default in Fastify's AJV configuration
> This means additional properties are REMOVED, not rejected

## 4. 可能原因列表及评估

| 可能原因 | 可能性 | 说明 |
|---------|--------|------|
| **Fastify 默认 AJV 配置 `removeAdditional: true`** | ✅ **95%** | 已确认！这是根本原因 |
| Fastify 在 Controller 之前过滤未知字段 | ✅ **95%** | 与上述原因同一问题 |
| zodToJsonSchema 未正确转换 strict() 模式 | ❌ **5%** | 已验证转换正确，`additionalProperties: false` 存在 |
| Zod strict() 模式未工作 | ❌ **0%** | 独立测试证实 Zod strict() 工作正常 |
| 测试环境配置问题 | ❌ **5%** | Fastify 的默认行为，与测试环境无关 |

## 5. 修复建议

### 5.1 方案 1: 自定义 Fastify ValidatorCompiler (推荐)

**原理**: 覆盖 Fastify 的默认 AJV 配置，禁用 `removeAdditional`

**优点**:
- 在 Fastify 层面就拒绝无效请求
- Controller 不需要处理已清理的数据
- 符合 RESTful API 最佳实践

**缺点**:
- 需要修改 Fastify 初始化代码
- 可能影响其他路由

**实现**:

```typescript
// src/manager/app.ts
export async function buildManager(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: ...,
  });

  // 覆盖默认的 validatorCompiler
  app.setValidatorCompiler(({ schema }) => {
    const Ajv = require('ajv');
    const ajv = new Ajv({
      removeAdditional: false,  // ✅ 不删除未知字段，而是拒绝
      coerceTypes: true,
      useDefaults: true,
      allErrors: false,
    });
    return ajv.compile(schema);
  });

  // ... 其他配置
}
```

### 5.2 方案 2: 在 Controller 中进行严格 Zod 验证

**原理**: 依赖 Zod 的 strict() 模式在 Controller 中验证

**优点**:
- 不影响 Fastify 全局配置
- 实现简单，只需确保 Controller 中的 Zod 验证生效

**缺点**:
- 验证发生在 Controller 层，不如在路由层高效
- Fastify 的 JSON Schema 验证变成冗余

**实现**:

```typescript
// src/controllers/session.controller.ts
export async function createSession(request: FastifyRequest, reply: FastifyReply) {
  // 直接使用 Zod 验证，不依赖 Fastify
  const options = createSessionRequestSchema.parse(request.body);

  // 如果 request.body 被清理过，Zod 会接受空对象
  // 但如果发送了未知字段，Fastify 会删除它们，然后 Zod 接受清理后的对象
  // 这样无法检测到原始请求中的未知字段！
}
```

**问题**: 此方案无法工作，因为 Fastify 已经在 Controller 之前删除了未知字段！

### 5.3 方案 3: 移除 Fastify Schema 验证，仅使用 Zod

**原理**: 不在路由中使用 `schema`，完全依赖 Controller 中的 Zod 验证

**优点**:
- 简单直接
- Zod strict() 模式可以正常工作

**缺点**:
- 失去 Fastify Schema 验证的优势
- 失去自动生成的 API 文档

**实现**:

```typescript
// src/routes/session.routes.ts
fastify.post('/', {
  onRequest: [fastify.verifyApiKey],
  // ❌ 移除 schema 配置
}, sessionController.createSession);
```

### 5.4 方案 4: 使用 Fastify Hook 在验证前记录原始 Body

**原理**: 在 `onRequest` hook 中保存原始请求体，在 Zod 验证时使用

**优点**:
- 可以检测到未知字段
- 不影响 Fastify 默认行为

**缺点**:
- 绕过 Fastify 的验证机制
- 需要额外的代码来比较原始和清理后的 body

## 6. 推荐方案

**推荐使用方案 1: 自定义 Fastify ValidatorCompiler**

### 理由

1. **符合最佳实践**: JSON Schema 验证应该在路由层面完成，而不是 Controller 层
2. **性能最优**: 请求在进入 Controller 之前就被拒绝，避免不必要的处理
3. **保持一致性**: 所有使用 Fastify schema 验证的路由都会受益
4. **安全**: 确保 API 只接受预期的字段，防止意外数据注入

### 实施步骤

1. 修改 `src/manager/app.ts`，添加自定义 validatorCompiler
2. 更新 Fastify 实例配置
3. 运行测试验证修复效果
4. 更新相关文档

### 代码示例

```typescript
// src/manager/app.ts
import Ajv from 'ajv';

export async function buildManager(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: process.env.NODE_ENV !== 'test' ? {...} : false,
  });

  // ✅ 设置自定义 validatorCompiler
  app.setValidatorCompiler(({ schema }) => {
    const ajv = new Ajv({
      removeAdditional: false,  // 不删除未知字段
      coerceTypes: true,
      useDefaults: true,
      allErrors: false,
    });
    return ajv.compile(schema);
  });

  // ... 其他配置
}
```

## 7. 验证方法

修复后，运行以下测试验证:

```bash
# 运行集成测试
pnpm test src/tests/integration/routes/session-api.routes.test.ts

# 预期结果: S-ERROR-04 测试通过，返回 400
```

## 8. 参考资料

- [Fastify Validation and Serialization](https://fastify.io/docs/latest/Reference/Validation-and-Serialization/)
- [Fastify GitHub Issue #3426: Validation defaults like `removeAdditional` no longer set](https://github.com/fastify/fastify/issues/3426)
- [AJV Documentation: removeAdditional option](https://ajv.js.org/options.html#removeadditional)
- [zod-to-json-schema Documentation](https://www.npmjs.com/package/zod-to-json-schema)

## 9. 总结

**根本原因**: Fastify 的默认 AJV 配置 `removeAdditional: true` 导致未知字段被静默删除而不是拒绝请求。

**解决方案**: 覆盖 Fastify 的默认 `validatorCompiler`，设置 `removeAdditional: false`，使包含未知字段的请求被正确拒绝。

**影响范围**: 此修复将影响所有使用 Fastify schema 验证的路由，确保所有 API 都严格遵循 schema 定义。
