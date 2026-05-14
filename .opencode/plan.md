# 移动端 Viewer 改进计划

## 会话信息
- 创建时间: 2026-05-15
- 最后更新: 2026-05-15

## 概述
修改文件集中在 `public/browser-viewer/browser-viewer.js`（前端）和 `src/machine/session_handlers/events.handler.ts`（后端），分 4 个模块实施。

## 手势识别系统参考文档

### 五种手势的触发条件与物理对应

| 手势 | 物理动作 | 手指数 | 时间条件 | 距离条件 | 映射到远程 |
|------|---------|--------|---------|---------|-----------|
| **Tap** | 短触 | 1 | 无 | < 5px | click 事件 |
| **Double Tap** | 两次短触间隔<300ms | 1 | 间隔<300ms | < 5px | click(clickCount:2) |
| **Move** | 滑动(光标) | 1 | <800ms未长按 | >10px | 光标移动(带加速度) |
| **Drag** | 长按后滑动(拖拽) | 1 | >800ms | >5px | mousedown→mousemove→mouseup(松手不发click) |
| **Pinch Zoom** | 双指捏合/张开 | 2 | >150ms采样期 | 距离变化>20px | wheel事件(zoom) |
| **Two-Finger Scroll** | 双指同向滑动 | 2 | >150ms采样期 | 中心移动>50px | wheel事件(scroll) |

### 手势互斥与模式锁定机制

```
activeGestureMode = null  // 初始状态
     ↓ pointerdown
[未锁定，等待判断]
     ↓
     ├── 单指移动 > 10px → activeGestureMode = 'move'
     ├── 长按 800ms + 移动 → activeGestureMode = 'drag'  
     ├── 双指 + 缩放条件 → activeGestureMode = 'zoom'
     └── 双指 + 滚动条件 → activeGestureMode = 'scroll'
     ↓ 锁定后不可切换
所有手指抬起 → activeGestureMode = null（重置）
```

### Move 加速度模型
```js
speed = 距离 / 时间差  // px/ms
accelerationFactor = 1.0 + min(speed * 0.5, 3.0)  // 最大4倍加速
cursorX += deltaX * accelerationFactor
```

---

## 模块1：手势识别系统重写（最高优先级）

### 现状问题
- 使用 touchstart/touchmove/touchend 事件
- 只有长按800ms=click，没有 Tap
- 没有 activeGestureMode 模式锁定，手势之间可冲突
- 光标移动没有加速度模型

### 改动范围
**文件**: `browser-viewer.js` 的 `_bindMouseEvents()` 方法（L1151-1268）

### 核心改动
1. 新增 `activeGestureMode` 状态变量（null | 'move' | 'drag' | 'zoom' | 'scroll'）
2. 新增 Tap 检测：touchend 时判断移动距离<5px 且未长按 → 发送 click
3. 新增 Double Tap 检测：记录 lastTapTime，300ms 内再次 Tap → click(clickCount:2)
4. Move 增加加速度模型：speed = dist/dt; factor = 1 + min(speed*0.5, 3.0)
5. Drag 松手改为：只发 mouseup，不发 click
6. Pinch Zoom 增加 150ms 采样期后再锁定模式
7. 新增 Two-Finger Scroll：双指中心移动>50px → 发 wheel
8. 所有手势互斥：锁定后不可切换，手指全部抬起才重置

### 不改动
- PC 端鼠标事件（L1081-1149）保持不变

### 伪代码
```
touchstart:
  if (2 fingers) → 记录 lastTouch1/2, pinchSampleStart=now
  else → 记录起点, hasMoved=false, 启动 800ms longPressTimer
  activeGestureMode = null

touchmove:
  if (2 fingers):
    if (activeGestureMode === null && now - pinchSampleStart < 150):
      → 采样, return
    if (activeGestureMode === null):
      → 判断: 缩放速度>0.3且距离变化>20px → 'zoom'
      → 否则如果中心移动>50px → 'scroll'
      → 锁定 activeGestureMode
    if (activeGestureMode === 'zoom'): → wheel(deltaY)
    if (activeGestureMode === 'scroll'): → wheel(deltaX, deltaY)
  else (1 finger):
    dx = touch.clientX - lastFingerX
    dy = touch.clientY - lastFingerY
    if (距离>10px && !activeGestureMode && !isLongPress):
      activeGestureMode = 'move'
    if (activeGestureMode === 'move'):
      → 加速度模型更新光标
    if (isLongPress):
      hasMoved = true
      activeGestureMode = 'drag'
      → 发送 mousemove
    hasMoved = true

touchend:
  清除 longPressTimer
  if (activeGestureMode === null && !hasMoved):
    // Tap
    if (now - lastTapTime < 300): → Double Tap: click(clickCount:2)
    else: → Tap: click(clickCount:1)
    lastTapTime = now
  if (activeGestureMode === 'drag'):
    → 只发 mouseup，不发 click
  activeGestureMode = null
```

---

## 模块2：中文输入修复（高优先级）

### 现状问题
- 移动端中文无法输入
- hiddenInput position:fixed;top:-100px 在移动端可能无法正确触发键盘
- compositionend 后 input 事件可能重复触发

### 改动范围
**文件**: `browser-viewer.js` 构造函数（L63-106）

### 核心改动
1. 移动端 hiddenInput 可见性调整：增加 `inputmode="text"` 属性确保弹出完整键盘
2. compositionend 后防重复：清空输入框 BEFORE 处理
   ```js
   compositionend:
     isComposing = false
     var text = e.data
     self.hiddenInput.value = ''
     lastInputValue = ''
     if (text) → 发送 { type: 'event', event: { type: 'input', data: { value: text } } }
   ```
3. input 事件防重：增加 lastSentText 对比，避免 compositionend + input 重复发送
4. 服务端确认：`{ type: 'input', data: { value } }` 无 selector 时走 `page.keyboard.type(value)` (events.handler.ts L765-768 已有此分支)

---

## 模块3：上传功能 - accept 类型传递（高优先级）

### 现状
已基本实现，流程完整。

### 需要修复
1. `_showFileManager()` 每次调用时更新 `this._fmInput.accept`（当前只在创建时设置一次）
2. `_fmUploadHandler()` 上传前用 `matchesAccept()` 校验文件类型，不匹配的提示用户

---

## 模块4：复制粘贴交互优化（中优先级）

### PC 端
已OK，无需改动。

### 移动端改动
1. 复制按钮：保持当前行为，优化反馈（按钮显示"复制中..."→"已复制"→复原）
2. 粘贴按钮：clipboard.readText() 失败时 fallback 到 hiddenInput 粘贴模式

---

## 执行顺序

```
阶段1: 手势识别系统（模块1）— 重写 touch 事件
阶段2: 中文输入修复（模块2）— 修复 composition + input
阶段3: 上传 accept 限制（模块3）— 修复 accept 传递
阶段4: 复制粘贴优化（模块4）— 移动端粘贴 fallback
```

## 文件路径参考

| 文件 | 用途 |
|------|------|
| `public/browser-viewer/browser-viewer.js` | 前端 viewer SDK（1348行） |
| `src/machine/session_handlers/events.handler.ts` | 服务端事件处理（1056行） |
| `src/machine/browser.service.ts` | Puppeteer 浏览器服务，注入 __fileInputClickEvent / __clipboardContent |
| `src/machine/services/browser-inject.service.ts` | 文件注入服务 |

## 关键代码位置

| 功能 | 文件 | 行号 |
|------|------|------|
| touch 事件处理 | browser-viewer.js | L1151-1268 |
| PC 鼠标事件 | browser-viewer.js | L1081-1149 |
| hiddenInput + composition | browser-viewer.js | L63-106 |
| 移动端底部工具栏 | browser-viewer.js | L291-387 |
| 文件管理器 | browser-viewer.js | L568-844 |
| filechooser 轮询 | events.handler.ts | L80-121 |
| injectFile 处理 | events.handler.ts | L546-576 |
| input 事件处理 | events.handler.ts | L762-811 |
| 坐标转换 | browser.service.ts | L1453-1465 |
