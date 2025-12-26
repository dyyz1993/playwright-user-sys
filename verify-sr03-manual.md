# SR-03 Bug Fix Verification

## Bug Description
When a user has insufficient credits (credits <= 0) and tries to create a session, the API was returning a 500 error instead of a 400 client error.

## Root Cause
1. `session.service.ts` throws an Error with message "点数不足，请联系管理员充值" when `user.credits <= 0`
2. `session.controller.ts` was catching all errors from `createBrowserSession()` and returning 500
3. The "点数不足" error was not being handled specially

## Fix Applied

### File: `/Users/xuyingzhou/Project/study-node-ts/playwright-user-sys/src/controllers/session.controller.ts`

**Before (lines 65-68):**
```typescript
} catch (machineError: any) {
  request.log.error(`启动浏览器实例失败:`, machineError);
  return sendError(reply, '启动浏览器实例失败: ' + machineError.message, 500);
}
```

**After (lines 65-75):**
```typescript
} catch (serviceError: any) {
  request.log.error(`创建会话服务错误:`, serviceError);

  // 检查是否是点数不足错误
  if (serviceError.message && serviceError.message.includes('点数不足')) {
    return sendError(reply, serviceError.message, 400);
  }

  // 其他错误返回 500
  return sendError(reply, '启动浏览器实例失败: ' + serviceError.message, 500);
}
```

## Key Changes
1. Renamed `machineError` to `serviceError` for clarity
2. Added specific check for "点数不足" in error message
3. Return 400 status code when credits are insufficient
4. Keep 500 for other service errors
5. Improved log message for better debugging

## Test Update

### File: `/Users/xuyingzhou/Project/study-node-ts/playwright-user-sys/src/tests/integration/routes/session.routes.test.ts`

**Before (line 153):**
```typescript
it.skip('Bug记录: SR-03 - 创建会话 - 点数不足应该返回400 (当前返回500)', async () => {
```

**After (line 153):**
```typescript
it('SR-03: 创建会话 - 点数不足应该返回400', async () => {
```

Removed `.skip()` and cleaned up the test description to reflect the fix.

## How to Verify the Fix

### Option 1: Manual API Test
1. Start the development server: `pnpm dev`
2. Create a user with 0 credits:
   ```bash
   curl -X POST http://localhost:3000/api/users/register \
     -H "Content-Type: application/json" \
     -d '{"username":"pooruser","password":"password123","credits":0}'
   ```
3. Copy the API key from response
4. Try to create a session:
   ```bash
   curl -X POST http://localhost:3000/api/sessions \
     -H "Content-Type: application/json" \
     -H "X-API-Key: YOUR_API_KEY" \
     -d '{"userAgent":"test"}'
   ```
5. **Expected Result**: 400 status with error "点数不足"

### Option 2: Run Integration Tests
```bash
pnpm test:unit src/tests/integration/routes/session.routes.test.ts
```
Look for test "SR-03: 创建会话 - 点数不足应该返回400"

## Expected Behavior After Fix

### Request:
```http
POST /api/sessions
X-API-Key: user-with-zero-credits-api-key
Content-Type: application/json

{
  "userAgent": "test"
}
```

### Response:
```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "success": false,
  "error": "点数不足，请联系管理员充值"
}
```

## Summary
- **Status**: Fixed
- **Files Changed**: 2
  - `src/controllers/session.controller.ts` (added error handling)
  - `src/tests/integration/routes/session.routes.test.ts` (removed .skip())
- **Impact**: Users with insufficient credits now get proper 400 error instead of 500
- **Backwards Compatible**: Yes, only affects error handling for a specific error case
