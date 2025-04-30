# WebSocket 协议文档 (src/machine 模块)

本文档详细描述了 `src/machine` 模块通过 WebSocket 代理暴露的接口协议。客户端通过连接到代理服务器的指定路径与特定的浏览器会话进行通信。所有 WebSocket 连接 URL 都需要包含 `sessionId` **查询参数**，例如 `ws://<proxy_host>:<proxy_port>/ws/events?sessionId=<session_id>`。

## 1. 交互事件端点: `/ws/events`

此端点用于客户端与浏览器页面进行**双向交互**，发送用户操作指令并接收页面事件通知。

- **连接 URL:** `ws://<proxy_host>:<proxy_port>/ws/events?sessionId=<session_id>`
- **处理程序:** `src/machine/session_handlers/events.handler.ts`
- **格式:** JSON
- **消息结构:** 所有消息遵循 `{ "type": "...", "data": { ... } }` 结构。

### 1.1 客户端 -> 服务端消息

客户端通过发送以下类型的消息来模拟用户操作或控制会话：

| Type             | Data 结构                                                                   | 说明                                                                 |
| :--------------- | :-------------------------------------------------------------------------- | :------------------------------------------------------------------- |
| `mouseMove`      | `{ "x": number, "y": number }`                                              | 移动鼠标指针到指定页面坐标 (x, y)。                                 |
| `click`          | `{ "x": number, "y": number, "button": "left"\|"right"\|"middle" }`        | 在指定坐标 (x, y) 执行鼠标点击。`button` 可选，默认为 `left`。       |
| `keyPress`       | `{ "key": string }`                                                         | 模拟按下并释放一个按键。`key` 可以是单个字符或 Puppeteer 支持的按键名（如 `Enter`, `ArrowLeft`）。 |
| `scroll`         | `{ "deltaX": number, "deltaY": number }`                                     | 模拟鼠标滚轮滚动。`deltaX` 为水平滚动量，`deltaY` 为垂直滚动量。       |
| `textInput`      | `{ "text": string }`                                                        | 在当前聚焦的元素中输入文本。                                           |
| `setViewport`    | `{ "width": number, "height": number }`                                     | 调整浏览器页面的视口大小。                                           |
| `setConfig`      | `{ "fps"?: number, "clip"?: { "x": number, "y": number, "width": number, "height": number } \| null, "interactionMode"?: string, "touchMode"?: "touchpad"\|"touch" }` | 更新会话配置。`fps` 控制 `/stream` 端点截图帧率；`clip` 定义截图区域 (null 表示全屏)；`interactionMode` 和 `touchMode` 可能影响事件处理方式。 |
| `focusElement`   | `{ "selector": string }`                                                    | 尝试将焦点设置到匹配 CSS 选择器的元素上。                          |

**示例 (Client -> Server):**

```json
{
  "type": "click",
  "data": {
    "x": 150,
    "y": 300,
    "button": "left"
  }
}
```

```json
{
  "type": "setConfig",
  "data": {
    "fps": 30,
    "clip": null
  }
}
```

### 1.2 服务端 -> 客户端消息

服务端通过发送以下类型的消息向客户端同步状态或通知事件：

| Type                | Data 结构                                                                 | 说明                                                                                    |
| :------------------ | :------------------------------------------------------------------------ | :-------------------------------------------------------------------------------------- |
| `configSync`        | `SessionConfig` (包含 `fps`, `clip`, `interactionMode`, `touchMode` 等) | 连接建立或配置更新时，服务端主动同步当前的完整会话配置。                                     |
| `navigationChanged` | `{ "url": string }`                                                       | 浏览器主框架导航到新的 URL 时发送通知。                                                |
| `elementFocused`    | `{ "selector": string, "elementType": string }`                           | 当页面内某个可输入元素（如 INPUT, TEXTAREA）获得焦点时发送通知。`selector` 是一个尽可能精确的 CSS 选择器。 |
| `response`          | `{ "success": boolean, "error"?: string, ... }` (根据请求类型可能包含额外字段) | 对客户端发送的某些请求（如 `setViewport`, `setConfig`, `focusElement`）进行响应，告知操作是否成功。 |
| `session_ended`     | `{ "reason": "browser_closed" \| "browser_crashed" \| string }`             | 当浏览器会话因故结束（如浏览器关闭、崩溃）时发送通知，之后 WebSocket 连接会被关闭。       |

**示例 (Server -> Client):**

```json
{
  "type": "configSync",
  "data": {
    "fps": 15,
    "clip": null,
    "interactionMode": "general_navigation",
    "touchMode": "touchpad"
  }
}
```

```json
{
  "type": "navigationChanged",
  "data": {
    "url": "https://new.example.com"
  }
}
```

```json
{
  "type": "response",
  "requestType": "setViewport",
  "data": {
    "success": true
  }
}
```

## 2. 视频流端点: `/ws/stream`

此端点用于服务端向客户端**单向传输**浏览器页面的实时截图流。

- **连接 URL:** `ws://<proxy_host>:<proxy_port>/ws/stream?sessionId=<session_id>`
- **处理程序:** `src/machine/session_handlers/stream.handler.ts`
- **格式:**
    - 主要为 **二进制流 (Binary)**
    - 连接结束时会发送一条 **JSON** 消息

### 2.1 服务端 -> 客户端消息

- **二进制 JPEG 流:**
    - 服务端根据当前会话配置中的 `fps` 和 `clip` 设置，定期（`1000 / fps` 毫秒）截取浏览器页面（或指定区域）的 JPEG 图片，并通过 WebSocket 以二进制格式发送给客户端。
    - 客户端需要能够接收并处理连续的二进制帧来渲染视频流。
- **JSON 结束消息 (可选):**
    - 在 WebSocket 连接因会话结束（如浏览器关闭/崩溃）而准备关闭**之前**，服务端会尝试发送一条 JSON 消息：
      ```json
      {
        "type": "session_ended",
        "data": {
          "reason": "browser_closed" | "browser_crashed" | string
        }
      }
      ```
    - 这条消息用于告知客户端流中断的原因。发送后，WebSocket 连接会被服务端关闭。

### 2.2 客户端 -> 服务端消息

- **无:** 此 WebSocket 连接是单向的（服务端到客户端），客户端不应向此端点发送任何消息。

## 3. Fallback: Chrome DevTools Protocol (CDP) 代理

如果 WebSocket 连接的路径**不是** `/ws/events` 或 `/ws/stream`，并且 URL **查询参数中包含 `sessionId`**，代理服务会回退到标准的 CDP 代理模式。

- **作用:** 将客户端的 WebSocket 连接直接转发到对应浏览器实例的 Chrome DevTools Protocol 端点。
- **协议:** 标准的 [Chrome DevTools Protocol over WebSocket](https://chromedevtools.github.io/devtools-protocol/)。
- **格式:** JSON。
- **说明:** 允许客户端使用完整的 CDP 功能与浏览器进行底层交互。协议细节请参考官方 CDP 文档。 