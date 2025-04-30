# 增强版重构与设计文档: src/machine - 迁移至 WebSocket (职责明确版)

## 1. 背景与目标

**当前状态:** `src/machine` 组件目前可能使用 gRPC 或其他通信方式，与上层系统交互紧密，职责边界可能不够清晰。

**核心目标:**
1.  **通信协议迁移:** 将主要的实时通信协议从 gRPC (或其他) 迁移至 **WebSocket**，并辅以 **HTTP API** 进行会话管理。
2.  **明确职责边界:** 清晰定义 `machine` 节点作为**底层核心能力提供者**的角色，专注于性能、稳定性和原子操作。将业务场景判断、复杂交互逻辑和上层 UI 控制权明确**移交**给**集成系统**（如聊天应用）。
3.  **优化交互模型:** 采用 URL 参数传递**初始**上下文（如 `clip`, `mode`），并结合 WebSocket 事件进行**动态**更新和状态通知，实现更灵活、响应更快的用户体验。
4.  **解决核心痛点:**
    *   **降低视频流延迟:** 将视频截图生成和推送放在离浏览器最近的 `machine` 节点处理，最大程度减少中转环节，**显著降低**用户感知的画面延迟。这是将视频流处理放在此层级的**关键必要性**。
    *   **提升事件响应速度:** 基础交互事件（点击、移动等）直接由 `machine` 节点接收并在本地浏览器模拟，避免了跨服务调用的额外延迟，保证操作的**即时性**。
    *   **解耦与复用:** 使 `machine` 节点更通用，不与特定业务逻辑耦合，便于被不同类型的上层应用集成和复用。

## 2. 核心设计原则与职责界限

### 2.1. `machine` 节点 (底层能力提供方)

*   **主要职责:**
    *   **视频流:** (核心) 提供稳定、低延迟的页面视频流。
    *   **事件模拟:** (核心) 快速、准确地模拟基础用户交互事件。
    *   **浏览器管理:** (基础) 管理 Puppeteer 生命周期。
    *   **配置接收与应用:** (接口) 接收并应用 `clip`, `interactionMode` 等配置。
    *   **状态通知:** (接口) 监测并发出浏览器内部关键状态通知。
    *   **程序化接口:** (接口) 提供 `fillInput` 等基础程序化操作能力。
    *   **代理处理:** (可选) 处理代理。
    *   **(可选) 辅助能力:** 提供 `extractForm` 等辅助功能。
*   **限制:** 不做业务决策，不控制上层 UI，不决定交互模式。

### 2.2. 集成系统 (上层业务逻辑与控制方)

*   **主要职责:**
    *   **会话请求:** 请求创建会话。
    *   **场景识别:** (核心) 分析页面内容，识别业务场景。
    *   **配置决策与设置:** (核心) 决定并设置 `interactionMode` 和 `clip`。
    *   **UI 响应:** (核心) 监听状态通知，更新自身 UI。
    *   **调用程序化接口:** 调用 `fillInput` 等接口。
    *   **用户交互传递:** 传递最终用户交互。

## 3. 建议的目录结构 (重构后)

```
src/machine/
├── browser.service.ts       # (保留并适配) 核心 Puppeteer 逻辑 (提供能力和通知)
├── proxy.service.ts         # (保留) 代理逻辑
├── socket_handlers/         # (新建) WebSocket 处理器模块
│   ├── event.handler.ts     # (新建) 处理 /ws/{sessionId}/events (接收指令, 发出通知)
│   └── video.handler.ts     # (新建) 处理 /ws/{sessionId}/video (推送视频流)
├── server.ts                # (新建) HTTP 和 WebSocket 服务器设置
├── config.ts                # (保留) 配置加载
├── machine.ts               # (保留, 可选) 机器状态逻辑
└── index.ts                 # (修改) 应用程序入口点
```

## 4. 通信协议详解 (HTTP API & WebSocket)

### 4.1. HTTP API

*   **`POST /sessions`**
    *   **目的:** 请求创建一个新的浏览器会话。
    *   **请求体:** `{"url": "string", "options": {...}}` (options 可包含代理、指纹等初始设置)。
    *   **响应:** `{ "success": true, "sessionId": "string" }` 或 `{ "success": false, "error": "string" }`。
    *   **必要性:** 提供一个标准的、非实时的入口点来启动会话。

### 4.2. WebSocket - Events Channel (`/ws/{sessionId}/events?clip=...&mode=...`)

*   **目的:** 处理双向的、低延迟的控制指令和状态通知。
*   **连接参数:**
    *   `sessionId` (路径参数): 标识要连接的会话。
    *   `clip` (查询参数, 可选): 初始裁剪区域，格式如 `x,y,width,height`。
    *   `mode` (查询参数, 可选): 初始交互模式，如 `general_navigation`。
*   **消息格式:** JSON

#### 4.2.1. 集成系统 -> Machine (指令性事件)

*   **`{ type: 'event', event: { type: 'click', x: number, y: number, ... } }`**
    *   **场景:** 用户在前端（可能是裁剪后的视图）点击。`x`, `y` 是相对于**可视区域**（如果是裁剪视图，则是相对于裁剪区域）的坐标。
    *   **处理:** `machine` 接收后，`BrowserService` 需要将坐标转换为页面绝对坐标（加上 `clip.x`, `clip.y`），然后模拟 `page.mouse.click()`。
    *   **必要性:** 基础交互的核心。
*   **`{ type: 'event', event: { type: 'mousemove', x: number, y: number, ... } }`** (类似还有 `mousedown`, `mouseup`)
    *   **场景:** 用户鼠标移动、按下或抬起。坐标同样是相对可视区域。
    *   **处理:** 坐标转换后模拟 `page.mouse.move/down/up()`。
    *   **必要性:** 实现拖动、选择等复杂交互的基础。
*   **`{ type: 'event', event: { type: 'scroll', deltaX: number, deltaY: number } }`**
    *   **场景:** 用户滚动页面（可能通过鼠标滚轮或触摸板）。
    *   **处理:** 模拟 `page.evaluate(() => window.scrollBy(deltaX, deltaY))`。
    *   **必要性:** 页面导航。
*   **`{ type: 'event', event: { type: 'keydown', key: string, code: string, ... } }`** (类似还有 `keyup`, `keypress`)
    *   **场景:** 用户键盘输入。
    *   **处理:** 模拟 `page.keyboard.down/up/press()`。
    *   **必要性:** 文本输入的基础。
*   **`{ type: 'event', event: { type: 'updateClip', x: number, y: number, width: number, height: number, keepRatio?: boolean } }`**
    *   **场景:** 集成系统检测到需要关注的区域发生变化（如弹窗移动），需要**动态更新**视频流的裁剪区域。
    *   **处理:** `machine` 调用 `BrowserService.updateViewConfig` 更新 `clip` 配置。后续视频流将应用新的裁剪区域。
    *   **必要性:** 解决动态 UI 变化下的聚焦问题，如验证码弹窗移动。
*   **`{ type: 'event', event: { type: 'resetView' } }`**
    *   **场景:** 集成系统认为不再需要裁剪视图（如验证完成），需要恢复全页面视频流。
    *   **处理:** `machine` 调用 `BrowserService.updateViewConfig` 清除 `clip` 配置。
    *   **必要性:** 恢复正常浏览视图。
*   **`{ type: 'event', event: { type: 'setInteractionMode', mode: string } }`**
    *   **场景:** 集成系统根据识别的页面场景（登录、滑块、普通），通知 `machine`（及其可能的前端组件）切换交互模式。
    *   **处理:** `machine` 调用 `BrowserService.updateViewConfig` 更新 `mode` 状态。这个状态会通过 `configSync` 发送回前端，供前端 SDK/WebView 调整显示的交互控件。
    *   **必要性:** 优化特定场景的用户体验，指导用户如何操作。
*   **`{ type: 'event', event: { type: 'fillInput', selector: string, text: string } }`**
    *   **场景:** 集成系统需要**程序化地**向页面上的某个输入框填充文本（例如，用户在聊天中提供了信息，或者系统需要自动填充）。
    *   **处理:** `machine` 找到 `selector` 对应的元素，并模拟 `elementHandle.type(text)`。
    *   **必要性:** 提供基本的自动化填充能力，响应非直接用户输入的场景。
*   **`{ type: 'event', event: { type: 'extractForm', selector?: string } }` (可选)**
    *   **场景:** 集成系统希望 `machine` 辅助提取指定区域或整个页面的表单信息。
    *   **处理:** `machine` 在浏览器上下文中执行表单提取逻辑并返回结果。
    *   **必要性:** 作为辅助能力，集成系统可以选择使用以简化表单解析。

#### 4.2.2. Machine -> 集成系统 (通知与响应)

*   **`{ success: true/false, error?: string }`**
    *   **场景:** 对收到的指令性事件（如 `click`, `fillInput` 等）的处理结果响应。
    *   **必要性:** 确认指令是否成功执行。
*   **`{ type: 'configSync', config: { clip?: object, mode?: string, ... } }`**
    *   **场景:** WebSocket 连接建立后，以及每次通过 `updateClip` 或 `setInteractionMode` 更新配置后发送。
    *   **目的:** 确保集成系统的前端了解当前的有效配置。
    *   **必要性:** 状态同步，驱动前端 UI（如交互控件的显示）。
*   **`{ type: 'notification', event: { type: 'elementFocused', selector: string, elementType: string } }`**
    *   **场景:** `machine` 内部监听到页面中有可输入元素（input, textarea 等）获得了焦点。
    *   **目的:** 通知集成系统哪个元素获得了焦点。
    *   **处理:** 集成系统接收后，可根据当前 `mode` 和业务逻辑决定是否显示本地输入框。
    *   **必要性:** 实现更自然的"点击即输入"体验，将焦点状态传递给上层。
*   **`{ type: 'notification', event: { type: 'navigationChanged', url: string } }`**
    *   **场景:** `machine` 内部监听到页面发生了导航（URL 变化）。
    *   **目的:** 通知集成系统页面已跳转。
    *   **处理:** 集成系统可以据此重新分析页面内容或更新自身状态。
    *   **必要性:** 同步页面状态。
*   **`{ type: 'form', formData: FormField[] }` (可选)**
    *   **场景:** 对 `extractForm` 指令的响应。
    *   **必要性:** 返回表单提取结果。

### 4.3. WebSocket - Video Channel (`/ws/{sessionId}/video`)

*   **目的:** 高效、低延迟地传输页面视频流（截图序列）。
*   **消息格式:**
    *   **Client -> Server (JSON):** `{ type: 'init' }` (请求开始), `{ type: 'stop' }` (请求停止)。
    *   **Server -> Client (Binary):** 原始截图数据 (`Uint8Array`, 通常是 webp 格式)。
*   **必要性:** 将视频流处理放在 `machine` 层级可以避免数据在集成系统和 `machine` 之间来回传输，显著减少画面延迟，这是提供流畅远程控制体验的关键。

## 5. 详细重构步骤

*(本节详细步骤与上一版类似，但在 Stage 4 和 Stage 5 中需要更细致地实现上述事件处理和状态通知逻辑)*

### 阶段 1-3: (基本同上) 准备、实现 HTTP/WS 服务器、实现 HTTP API

### 阶段 4: 实现 WebSocket 处理器 (`socket_handlers/`)

*   **`event.handler.ts`:**
    *   重点实现对 **4.2.1** 中所有指令性事件的接收和处理逻辑，调用 `BrowserService`。
    *   重点实现从 `BrowserService` 接收状态变化通知，并将其格式化为 **4.2.2** 中的通知事件发送出去。
    *   实现 `configSync` 的发送逻辑。
*   **`video.handler.ts`:**
    *   重点实现 `init`/`stop` 控制。
    *   确保 `captureAndSend` 调用 `BrowserService.captureScreenshot` 时，后者能自动应用当前 `clip` 配置。
    *   确保直接发送 **二进制** 截图数据。

### 阶段 5: 集成和适配 `BrowserService`

*   **核心:** 实现事件模拟、截图（支持 clip）、页面管理、`fillInput` 接口。
*   **关键:** **实现状态监测**（如 `focusin`, `framenavigated` 监听）并**建立通知机制**（如 `EventEmitter`）将这些状态变化**发出**给 `event.handler`。
*   确保坐标转换逻辑正确。

### 阶段 6-8: (基本同上) 修改入口点、清理、测试

*   **测试重点:** 增加对所有指令和通知事件的测试，特别是 `elementFocused` 的发出和 `fillInput` 的执行，以及带 `clip` 时的交互。

## 6. 结论

这份增强版的重构计划通过详细定义事件、阐述设计原理（特别是视频流和事件处理的低延迟优势）以及明确职责界限，为将 `src/machine` 成功迁移到职责清晰、高效灵活的 WebSocket 架构提供了更全面的指导。核心在于让 `machine` 专注于底层能力和状态通知，而将业务智能和 UI 控制交给上层集成系统。 