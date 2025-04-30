# 远程浏览器控制节点 (Machine) 设计文档

## 1. 概述

本文档描述了远程浏览器控制节点（Machine）后端系统的设计。该系统部署在独立的机器上，负责接收来自中心控制服务的指令，通过 gRPC 协议管理 Puppeteer 浏览器实例和会话，并流式传输事件和视频数据。

与 `exmaple/bancked` 中的示例系统（使用 Koa 和 WebSocket）不同，本系统采用 gRPC 作为主要的通信协议，并包含一个代理服务层。本文档将详细描述 `src/machine` 目录下的组件及其交互。

## 2. 系统架构

Machine 节点主要由以下几个核心组件构成：

*   **gRPC 服务器 (`grpc.service.ts`):** 作为主要的通信接口，接收来自中心服务的 RPC 调用，处理会话管理、事件流和视频流等请求。
*   **浏览器服务 (`browser.service.ts`):** 负责管理 Puppeteer 浏览器的生命周期、页面创建、截图、事件执行和指纹模拟。类似于 `exmaple/bancked` 中的 `BrowserManager`，但通过 gRPC 接口暴露功能。
*   **代理服务 (`proxy.service.ts`):** 可能负责处理浏览器发出的网络请求，实现代理转发、认证或流量统计等功能。这是与 `exmaple/bancked` 示例的一个显著区别。
*   **会话处理器 (`session_handlers/`):** 可能包含处理特定 gRPC 流（如事件流、视频流）的具体逻辑，负责与 `BrowserService` 和客户端流进行交互。
*   **配置 (`config.ts`):** 加载和管理节点的配置信息。
*   **Machine 状态 (`machine.ts`):** 可能定义和维护节点自身的状态信息（如 CPU、内存、活动会话数等）。
*   **入口点 (`index.ts`):** 初始化所有服务（gRPC、Browser、Proxy），启动 gRPC 服务器，并可能包含心跳或注册到中心服务的逻辑。

**架构对比 (`src/machine` vs `exmaple/bancked`):**

| 特性           | `src/machine` (实际系统)              | `exmaple/bancked` (示例)          |
| -------------- | ------------------------------------- | ----------------------------------- |
| **通信协议**   | gRPC                                  | HTTP (Koa) + WebSocket (ws)         |
| **服务接口**   | gRPC Service Definitions (Protobuf) | HTTP API + WebSocket 事件/视频接口 |
| **核心管理**   | `BrowserService` (`browser.service.ts`) | `BrowserManager` (`browser-manager.ts`) |
| **代理**       | 显式 `ProxyService` (`proxy.service.ts`) | 无显式代理服务                    |
| **会话处理**   | 可能在 `session_handlers/` 中细化     | 直接在 WebSocket Handler 中处理     |
| **入口点**     | 启动 gRPC 服务器                      | 启动 Koa HTTP/WebSocket 服务器     |

## 3. 核心组件详解

### 3.1. 入口点 (`index.ts`)

*   负责应用的初始化流程。
*   实例化 `BrowserService`, `ProxyService`, `GrpcService` 等核心服务。
*   加载配置 (`config.ts`)。
*   启动 gRPC 服务器，使其开始监听端口。
*   可能包含向中心服务注册自身或发送心跳的逻辑，以报告节点状态 (`machine.ts`)。

### 3.2. gRPC 服务 (`grpc.service.ts`)

*   基于 `@grpc/grpc-js` 实现 gRPC 服务器。
*   定义 Protobuf 服务（例如 `MachineService`, `BrowserSessionService`）。
*   实现服务定义的 RPC 方法，将请求路由到相应的服务（主要是 `BrowserService`）。
*   **关键 RPC 方法 (推测):**
    *   `CreateSession(request) returns (SessionResponse)`: 类似于 `/api/create-page`，用于请求创建一个新的浏览器会话。
    *   `EventStream(stream Request) returns (stream Response)`: 双向流，用于处理事件交互。客户端发送控制事件，服务器返回处理结果或状态同步。替代 `event-socket.ts`。
    *   `VideoStream(Request) returns (stream VideoChunk)`: 服务器流，用于将页面截图流式传输给客户端。替代 `video-socket.ts`。
    *   `GetMachineStatus(request) returns (StatusResponse)`: 获取节点状态。
    *   `CloseSession(request) returns (Response)`: 关闭指定会话。
    *   其他可能的 RPC 用于更新配置、提取/填充表单等。
*   管理 gRPC 连接和流的生命周期。

### 3.3. 浏览器服务 (`browser.service.ts`)

*   功能上与 `exmaple/bancked/BrowserManager` 非常相似，但设计为被 `GrpcService` 调用。
*   **核心职责:**
    *   管理 Puppeteer 浏览器和页面实例 (`pages` Map)。
    *   维护页面配置 (`viewConfigs` Map) 和鼠标状态 (`mousePositions` Map)。
    *   处理页面创建 (`createPage`)、导航、视口设置。
    *   应用浏览器指纹 (`generateFingerprint`, `evaluateOnNewDocument`)。
    *   执行具体的用户事件 (`executeEvent`)：模拟鼠标、键盘、滚动。
    *   捕获页面截图 (`captureScreenshot`)，支持裁剪和动态质量。
    *   提取 (`extractForm`) 和填充 (`fillForm`) 表单。
    *   注入辅助脚本 (`injectMouseTrackingScript`, `setupPageNavigationListener`)。
*   提供接口供 `GrpcService` 或 `SessionHandlers` 调用。

### 3.4. 代理服务 (`proxy.service.ts`)

*   拦截由 Puppeteer 浏览器发出的网络请求。
*   可能的功能：
    *   将请求通过配置的外部代理服务器转发。
    *   注入认证头。
    *   记录网络流量。
    *   根据规则阻止或修改请求/响应。
*   需要与 `BrowserService` 集成，在创建页面时配置 Puppeteer 使用此代理逻辑。

### 3.5. 会话处理器 (`session_handlers/`)

*   **推测:** 此目录包含用于处理特定 gRPC 流（如 `EventStream`, `VideoStream`）的模块化代码。
*   例如，`event_stream_handler.ts` 可能负责处理 `EventStream` RPC 的双向消息，管理事件队列（类似于 `event-socket.ts` 中的逻辑），调用 `BrowserService` 的 `executeEvent` 等方法，并将结果写回流。
*   `video_stream_handler.ts` 可能负责处理 `VideoStream` RPC，启动截图循环（类似于 `video-socket.ts` 中的 `startVideoStream`），从 `BrowserService` 获取截图，并将数据块写入流。
*   这种分离有助于保持 `GrpcService` 的简洁性。

### 3.6. 配置与状态 (`config.ts`, `machine.ts`)

*   `config.ts`: 定义和加载节点配置，如监听端口、中心服务地址、代理设置、Puppeteer 路径等。
*   `machine.ts`: 定义节点状态的数据结构，并可能提供获取系统资源（CPU、内存）和活动会话数的方法。

## 4. 通信协议 (gRPC)

系统使用 gRPC 进行通信。需要定义 `.proto` 文件来描述服务和消息类型。

*   **主要服务 (推测):**
    *   `MachineService`: 可能包含管理节点本身状态的 RPC。
    *   `BrowserSessionService`: 包含管理浏览器会话的 RPC。
*   **关键 RPC 方法 (对应 `exmaple/bancked` 功能):**
    *   `rpc CreateSession(CreateSessionRequest) returns (CreateSessionResponse)`: 创建新会话，返回 session ID。
    *   `rpc EventStream(stream EventRequest) returns (stream EventResponse)`: 双向流处理控制事件和响应。
    *   `rpc VideoStream(VideoStreamRequest) returns (stream VideoChunk)`: 服务器流传输视频截图块。
    *   `rpc ExtractForm(FormRequest) returns (FormResponse)`: 提取表单。
    *   `rpc FillForm(FillRequest) returns (SimpleResponse)`: 填充表单。
    *   `rpc UpdateConfig(UpdateConfigRequest) returns (SimpleResponse)`: 更新会话配置（FPS、Clip 等）。
    *   `rpc CloseSession(CloseRequest) returns (SimpleResponse)`: 关闭会话。
*   **消息类型 (推测):** Protobuf 定义了各种 `Request`, `Response`, `Event`, `VideoChunk`, `Config`, `Form` 等消息结构。

## 5. 数据流与时序图 (基于 gRPC)

```mermaid
sequenceDiagram
    participant CentralService as Central Service / Client
    participant MachineNode as Machine Node (gRPC Server)
    participant BrowserService
    participant ProxyService
    participant PuppeteerPage as Puppeteer Page

    CentralService->>+MachineNode: CreateSession RPC (url, options)
    MachineNode->>+BrowserService: createPage(sessionId, url, options)
    BrowserService->>+PuppeteerPage: newPage() & setup()
    Note over BrowserService, PuppeteerPage: Configure proxy via ProxyService (details omitted)
    PuppeteerPage-->>-BrowserService: Page instance ready
    BrowserService-->>-MachineNode: Session created
    MachineNode-->>-CentralService: CreateSessionResponse (sessionId, status)

    CentralService->>+MachineNode: EventStream RPC Bi-directional Stream
    MachineNode->>MachineNode: Handle Event Stream (e.g., EventStreamHandler)
    MachineNode-->>-CentralService: Stream Opened, Send Initial Config

    CentralService->>+MachineNode: VideoStream RPC Server Stream
    MachineNode->>MachineNode: Handle Video Stream (e.g., VideoStreamHandler)
    MachineNode-->>-CentralService: Stream Opened

    loop Video Stream
        Note over MachineNode: VideoStreamHandler requests screenshot
        MachineNode->>+BrowserService: captureScreenshot(sessionId)
        BrowserService->>+PuppeteerPage: screenshot()
        PuppeteerPage-->>-BrowserService: Screenshot Data (binary)
        BrowserService-->>-MachineNode: Screenshot Data (binary)
        MachineNode->>CentralService: Send VideoChunk (binary data)
    end

    loop User Interaction
        CentralService->>MachineNode: EventRequest (e.g., click event) (via EventStream)
        MachineNode->>+BrowserService: executeEvent(sessionId, event)
        BrowserService->>+PuppeteerPage: mouse.click(x, y)
        PuppeteerPage-->>-BrowserService: Event Executed
        BrowserService-->>-MachineNode: Result
        MachineNode->>CentralService: EventResponse (success/failure) (via EventStream)
    end

    CentralService->>MachineNode: CloseSession RPC (sessionId)
    MachineNode->>+BrowserService: closePage(sessionId)
    BrowserService->>+PuppeteerPage: close()
    PuppeteerPage-->>-BrowserService: Closed
    BrowserService-->>-MachineNode: Session Closed
    MachineNode-->>-CentralService: CloseSessionResponse (status)
    Note over MachineNode: Cleanup gRPC Streams
```

**数据流说明:**

1.  **创建会话:** 客户端（可能是中心服务）调用 `CreateSession` RPC。Machine 节点委托 `BrowserService` 创建 Puppeteer 页面（配置代理），并返回会话 ID。
2.  **建立流:** 客户端分别发起 `EventStream`（双向）和 `VideoStream`（服务器流）RPC 调用。
3.  **视频流:** `VideoStreamHandler` 定期从 `BrowserService` 获取截图，并将 `VideoChunk` 消息写入流。
4.  **事件交互:**
    *   客户端通过 `EventStream` 发送 `EventRequest` 消息。
    *   `EventStreamHandler` 调用 `BrowserService` 执行事件。
    *   结果通过 `EventStream` 的 `EventResponse` 返回。
5.  **关闭会话:** 客户端调用 `CloseSession` RPC，触发页面关闭和资源清理。

## 6. 关键特性总结

*   **gRPC 通信:** 使用高效、强类型的 gRPC 协议进行所有交互。
*   **远程浏览器控制:** 通过 gRPC 事件流实时传递用户输入。
*   **视频流传输:** 通过 gRPC 服务器流高效传输页面截图。
*   **代理集成:** 内置代理服务层，可用于请求转发、监控或修改。
*   **动态配置:** 支持通过 gRPC 更新会话参数（FPS、Clip 等）。
*   **浏览器指纹模拟:** 增强隐蔽性。
*   **表单智能交互:** 支持自动提取和填充表单。

## 7. 主要依赖 (推测)

*   `@grpc/grpc-js`, `@grpc/proto-loader`: gRPC 服务器和 Protobuf 处理。
*   `puppeteer-core`: 核心浏览器自动化库。
*   `sharp` (可选): 可能用于截图处理。
*   `fingerprint-generator` (可选): 如果使用指纹生成。
*   `uuid` (可选): 生成唯一 ID。
*   配置库 (e.g., `dotenv`)。
*   日志库 (e.g., `winston`, `pino`)。

## 8. 现存问题与优化建议 (基于架构推测)

*   **安全性:**
    *   **问题:** Puppeteer 启动参数（`--no-sandbox` 等）仍然是主要风险点。gRPC 接口需要认证和授权。
    *   **优化:** 移除危险参数或在隔离环境运行。为 gRPC 服务添加认证（如 TLS、Token）。严格验证 RPC 输入。
*   **健壮性与错误处理:**
    *   **问题:** 需要健壮地处理 Puppeteer 崩溃、gRPC 流错误和网络中断。`ProxyService` 的错误处理也需考虑。
    *   **优化:** 实现详细的错误监听和恢复逻辑（如 `BrowserService` 监听 `disconnected`）。为 gRPC 流添加心跳和重试机制。明确 `ProxyService` 的错误传递。使用结构化日志。
*   **性能与资源管理:**
    *   **问题:** `extractForm` 的浏览器端开销。高并发下 gRPC 流的管理。截图生成和传输可能成为瓶颈。缺乏会话超时。
    *   **优化:** 优化 `extractForm` 逻辑。考虑 gRPC 连接/流池化。优化截图策略（质量、差分）。实现会话超时清理。监控节点资源。
*   **可扩展性:**
    *   **问题:** 单个 Machine 节点的承载能力有限。
    *   **优化:** 该架构本身就是分布式的节点。中心服务需要负责负载均衡，根据 Machine 节点的状态 (`GetMachineStatus` RPC) 分配新会话。
*   **gRPC 特定:**
    *   **问题:** Protobuf 设计需要仔细考虑，以平衡性能和灵活性。流的管理（特别是错误和关闭）需要严谨处理。
    *   **优化:** 优化 Protobuf 消息大小。确保所有流都有明确的生命周期管理和错误处理路径。
*   **功能:**
    *   **问题:** 与 `exmaple/bancked` 类似，可能缺少音频、文件传输、剪贴板等功能。
    *   **优化:** 通过添加新的 gRPC RPC 或扩展现有流来支持这些功能。 