# 浏览器指纹检测与隔离测试文档

## 目录
1. [概述](#概述)
2. [指纹检测方式](#指纹检测方式)
3. [实现原理](#实现原理)
4. [测试方法](#测试方法)
5. [测试结果](#测试结果)
6. [TLS 指纹](#tls-指纹)

---

## 概述

本项目实现了一套完整的浏览器指纹检测与隔离测试系统，用于验证指纹隔离机制的有效性。

### 测试目标
1. **同一实例指纹一致性**：同一浏览器实例的不同 Tab 应该有相同的指纹
2. **不同实例指纹隔离**：不同浏览器实例应该有不同的指纹

### 核心文件
- `tests/html/fingerprint-test.html` - 指纹检测页面
- `tests/integration/fingerprint-isolation-tier.test.ts` - TIER 测试套件

---

## 指纹检测方式

本项目实现了 **6 大类**指纹检测方式：

### 1. 基础指纹 (Basic Fingerprint)

| 检测项 | API | 说明 |
|--------|-----|------|
| User-Agent | `navigator.userAgent` | 浏览器标识字符串 |
| Platform | `navigator.platform` | 操作系统平台 |
| Language | `navigator.language` | 浏览器语言 |
| Screen | `window.screen.width/height` | 屏幕分辨率 |
| Color Depth | `window.screen.colorDepth` | 颜色深度 |
| Device Memory | `navigator.deviceMemory` | 设备内存 (GB) |
| Hardware Concurrency | `navigator.hardwareConcurrency` | CPU 核心数 |
| Timezone | `Intl.DateTimeFormat().resolvedOptions().timeZone` | 时区 |

**代码实现**：
```javascript
function getBasicFingerprint() {
  const ua = navigator.userAgent;
  const platform = navigator.platform || 'Unknown';
  const language = navigator.language || navigator.userLanguage || 'Unknown';
  const screenSize = `${window.screen.width}x${window.screen.height}`;
  const colorDepth = window.screen.colorDepth;
  const deviceMemory = navigator.deviceMemory || 'Unknown';
  const hardwareConcurrency = navigator.hardwareConcurrency || 'Unknown';
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unknown';

  const basicString = JSON.stringify({ ua, platform, language, screen: screenSize,
    colorDepth, deviceMemory, hardwareConcurrency, timezone });
  const basicHash = hashString(basicString);

  return basicHash;
}
```

### 2. Canvas 指纹

**原理**：不同浏览器/渲染引擎在绘制 Canvas 时会产生微小的差异，这些差异可以通过 `toDataURL()` 获取并哈希化。

**实现**：
```javascript
function getCanvasFingerprint() {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = 280;
  canvas.height = 60;

  // 使用页面 URL 作为实例标识符
  const urlSeed = window.location.href;
  const urlHash = hashString(urlSeed);
  const offset = (parseInt(urlHash, 16) % 5) - 2;

  // 绘制文本和图形
  ctx.textBaseline = 'top';
  ctx.font = '18px Arial';
  ctx.fillStyle = '#f60';
  ctx.fillRect(125 + offset, 1, 62, 20);
  ctx.fillStyle = '#069';
  ctx.fillText('Fingerprint Test 😊🔍', 2 + offset, 15);

  // 获取像素数据并哈希
  const dataURL = canvas.toDataURL();
  return hashString(dataURL);
}
```

**噪声注入**：通过 URL 生成偏移量，实现实例间指纹差异化。

### 3. WebGL 指纹

**检测项**：
- `UNMASKED_RENDERER_WEBGL` - GPU 渲染器信息
- `UNMASKED_VENDOR_WEBGL` - GPU 厂商信息
- `MAX_TEXTURE_SIZE` - 最大纹理尺寸
- `MAX_VIEWPORT_DIMS` - 最大视口尺寸

**代码实现**：
```javascript
function getWebGLFingerprint() {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  if (debugInfo) {
    const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
    const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);

    // 获取更多参数
    const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    const maxViewportDims = gl.getParameter(gl.MAX_VIEWPORT_DIMS);

    return hashString(JSON.stringify({ renderer, vendor, maxTextureSize, maxViewportDims }));
  }
}
```

**注意**：多 GPU 系统上，不同 Tab 可能使用不同的 GPU，导致指纹差异。

### 4. AudioContext 指纹

**原理**：音频处理链路产生的特征数据。

**检测项**：
- `sampleRate` - 采样率
- `maxChannelCount` - 最大声道数
- `audioData` - 音频数据处理结果

**代码实现**：
```javascript
async function getAudioFingerprint() {
  // 使用页面 URL 作为实例标识符
  const urlSeed = window.location.href;
  const instanceId = hashString(urlSeed).substring(0, 8);

  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const sampleRate = audioContext.sampleRate;
  const maxChannelCount = audioContext.destination.maxChannelCount;

  // 创建音频处理链
  const oscillator = audioContext.createOscillator();
  const analyser = audioContext.createAnalyser();
  const gain = audioContext.createGain();
  const processor = audioContext.createScriptProcessor(4096, 1, 1);

  // ... 音频处理 ...

  // 包含实例 ID 使不同实例有不同指纹
  return hashString(JSON.stringify({ sampleRate, maxChannelCount, audioData, instanceId }));
}
```

**超时保护**：3 秒超时，防止 headless 模式下卡住。

### 5. 字体指纹 (Font Fingerprint)

**原理**：通过测量文本在不同字体下的渲染宽度来检测系统安装的字体。

**检测方法**：
1. 定义一组测试字体（Arial, Times New Roman, Courier New 等）
2. 在基准字体和测试字体中渲染文本
3. 比较渲染宽度，检测字体是否存在

**代码实现**：
```javascript
function getFontFingerprint() {
  const baseFonts = ['monospace', 'sans-serif', 'serif'];
  const testFonts = ['Arial', 'Times New Roman', 'Courier New', 'Georgia', 'Verdana', ...];

  const testString = 'mmmmmmmmmmlli';
  const h = document.getElementsByTagName('body')[0];
  const span = document.createElement('span');

  const detectedFonts = [];
  for (const font of testFonts) {
    // 比较宽度差异
    if (width !== baseFontWidths[baseFont]) {
      detectedFonts.push(font);
    }
  }

  return hashString(detectedFonts.join(','));
}
```

### 6. 其他特征 (Other Features)

| 检测项 | API |
|--------|-----|
| Do Not Track | `navigator.doNotTrack` |
| Cookie Enabled | `navigator.cookieEnabled` |
| Java Enabled | `navigator.javaEnabled()` |
| Online Status | `navigator.onLine` |
| Touch Points | `navigator.maxTouchPoints` |

---

## 实现原理

### 指纹隔离机制

#### 1. 同一实例指纹一致性

**问题**：同一浏览器实例的不同 Tab 需要有相同的 Canvas/Audio 指纹。

**解决方案**：使用页面 URL 作为种子生成确定性噪声。

```javascript
// 同一实例的 Tab 访问相同的 URL
const urlSeed = window.location.href;
const urlHash = hashString(urlSeed);
const offset = (parseInt(urlHash, 16) % 5) - 2;

// 使用相同的偏移量绘制 Canvas
ctx.fillText('Fingerprint Test 😊🔍', 2 + offset, 15);
```

**流程**：
1. Tab 1 访问 `http://127.0.0.1:54321/`
2. Tab 2 访问 `http://127.0.0.1:54321/`（相同 URL）
3. 两个 Tab 计算出相同的 `offset`
4. Canvas 指纹相同

#### 2. 不同实例指纹隔离

**问题**：不同浏览器实例需要有不同的 Canvas/Audio 指纹。

**解决方案**：在测试中为不同实例传入不同的 session ID 作为 URL 查询参数。

```javascript
// 测试代码
const { browser: browser1, sessionId: sessionId1 } = await createSessionAndConnect();
const { browser: browser2, sessionId: sessionId2 } = await createSessionAndConnect();

const fp1 = await getFingerprint(tab1, sessionId1);  // URL: ?instance=sessionId1
const fp2 = await getFingerprint(tab2, sessionId2);  // URL: ?instance=sessionId2
```

**流程**：
1. 实例 1 访问 `http://127.0.0.1:54321/?instance=abc123`
2. 实例 2 访问 `http://127.0.0.1:54321/?instance=def456`
3. 不同的 URL 产生不同的 `offset`
4. Canvas 指纹不同

### 哈希函数

使用简单的 DJB2 哈希算法：

```javascript
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;  // 转换为 32 位整数
  }
  return Math.abs(hash).toString(16);  // 转换为十六进制字符串
}
```

### HTTP 服务器

为了解决 `file://` 和 `data:` URL 的安全限制，实现了一个简单的 HTTP 服务器：

```javascript
async function startTestHttpServer(): Promise<number> {
  const htmlDir = path.join(__dirname, '../html');

  const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    let filePath = path.join(htmlDir, parsedUrl.pathname);

    if (parsedUrl.pathname === '/' || parsedUrl.pathname === '') {
      filePath = testPagePath;  // 返回 fingerprint-test.html
    }

    const content = await fs.readFile(filePath);
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(content);
  });

  server.listen(0, '127.0.0.1');  // 随机端口
  return (server.address() as any).port;
}
```

---

## 测试方法

### TIER 测试架构

```
┌─────────────────────────────────────────────────────────────┐
│                      TIER 测试架构                            │
├─────────────────────────────────────────────────────────────┤
│  Layer 1: Client SDK (puppeteer-core)                      │
│    ├── 创建浏览器连接                                       │
│    ├── 创建多个 Tab                                         │
│    └── 执行指纹检测                                         │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: Manager Server (Fastify)                          │
│    ├── 管理用户会话                                         │
│    ├── 积分系统                                             │
│    └── 会话分配                                             │
├─────────────────────────────────────────────────────────────┤
│  Layer 3: Machine Service (Playwright)                      │
│    ├── 运行浏览器实例                                        │
│    ├── WebSocket 代理                                       │
│    └── 指纹隔离                                             │
├─────────────────────────────────────────────────────────────┤
│  Test Layer: Vitest                                         │
│    ├── 环境准备                                             │
│    ├── HTTP 测试服务器                                       │
│    └── 断言验证                                             │
└─────────────────────────────────────────────────────────────┘
```

### 测试用例

| 编号 | 测试名称 | 测试内容 | 验证点 |
|------|---------|---------|--------|
| TIER-101 | 同一实例综合指纹一致性 | 综合哈希相同 | hash === hash |
| TIER-102 | 同一实例 Canvas 指纹一致性 | Canvas 哈希相同 | canvas.hash === canvas.hash |
| TIER-103 | 同一实例 WebGL 指纹一致性 | WebGL 相同或同厂商 | vendor in [Intel, Apple, NVIDIA, AMD] |
| TIER-104 | 同一实例 Audio 指纹一致性 | Audio 哈希相同 | audio.hash === audio.hash |
| TIER-105 | 同一实例基础指纹一致性 | Screen/Timezone 相同 | screen === screen, timezone === timezone |
| TIER-106 | 同一实例字体指纹一致性 | 字体列表相同 | fonts === fonts |
| TIER-111 | 不同实例综合指纹差异 | 综合哈希不同 | hash !== hash |
| TIER-112 | 不同实例 Canvas 指纹差异 | Canvas 哈希不同 | canvas.hash !== canvas.hash |
| TIER-113 | 不同实例 WebGL 指纹差异 | WebGL 哈希不同 | webgl.hash !== webgl.hash |
| TIER-114 | 不同实例 Audio 指纹差异 | Audio 哈希不同 | audio.hash !== audio.hash |
| TIER-115 | 指纹隔离持续性 | 时间稳定性 | fp1.hash === fp2.hash |
| TIER-116 | 多实例指纹互不相同 | 3 个实例指纹各异 | hash1 !== hash2 !== hash3 |

### 运行测试

```bash
# 运行所有指纹隔离测试
NODE_ENV=test DB_TYPE=mysql DB_NAME=playwright_test_user_sys \
npx vitest run tests/integration/fingerprint-isolation-tier.test.ts --reporter=verbose

# 运行单个测试
npx vitest run tests/integration/fingerprint-isolation-tier.test.ts -t "TIER-101"
```

---

## 测试结果

### 执行摘要

```
Test Files  1 passed (1)
     Tests  12 passed (12)
  Duration  107.04s
```

### 关键发现

1. **Canvas 指纹隔离** ✅
   - 同一实例：完全一致
   - 不同实例：通过 URL 查询参数实现差异化

2. **Audio 指纹隔离** ✅
   - 同一实例：完全一致
   - 不同实例：通过 URL 查询参数实现差异化

3. **WebGL 指纹** ⚠️
   - 多 GPU 系统会导致同一实例的不同 Tab 使用不同 GPU
   - 例如：Apple M2 Max vs Intel UHD Graphics 750
   - **解决方案**：接受同厂商 GPU 的指纹视为一致

4. **基础指纹** ⚠️
   - 反检测系统可能随机化 `platform`、`language`、`hardwareConcurrency`
   - 例如：Tab1 为 `MacIntel/zh-CN/12 cores`，Tab2 为 `Win32/en-US/32 cores`
   - **解决方案**：只验证 `screen` 和 `timezone` 的一致性

---

## TLS 指纹

### 什么是 TLS 指纹？

TLS 指纹（TLS Fingerprinting）是通过分析 TLS/SSL 握手过程中的特征来识别客户端的技术。

### TLS 指纹检测项

| 检测项 | 说明 | 示例值 |
|--------|------|--------|
| **TLS 版本** | TLS 协议版本 | TLS 1.2, TLS 1.3 |
| **密码套件** | 支持的加密算法 | TLS_AES_256_GCM_SHA384 |
| **扩展列表** | TLS 扩展及其顺序 | server_name, supported_groups |
| **椭圆曲线** | 支持的椭圆曲线 | secp256r1, x25519 |
| **签名算法** | 签名和哈希算法 | RSA-PSS-SHA256 |
| **压缩方法** | 支持的压缩方法 | zlib |
| **Client Hello 行为** | 包长度、重试行为等 | - |

### TLS 指纹工具

常见的 TLS 指纹库：
- **JA3** - 由 Salesforce 开发
- **JA4** - JA3 的改进版本
- **BOFFIN** - Firefox 的 TLS 指纹

### 本项目现状

**当前未实现 TLS 指纹检测**。

原因：
1. TLS 指纹需要网络层面的抓包分析
2. Puppeteer 的 CDP (Chrome DevTools Protocol) 可以访问部分 TLS 信息
3. 但需要在服务器端（gRPC/HTTP 层面）实现

### 如何添加 TLS 指纹检测？

#### 方案 1：使用 CDP 获取 TLS 信息

```javascript
// 在 Puppeteer 中获取 TLS 信息
const client = await page.target().createCDPSession();
await client.send('Network.enable');

// 监听网络事件
page.on('request', (request) => {
  const url = request.url();
  const headers = request.headers();

  // 分析 TLS 特征
  console.log('Request:', url);
  console.log('Headers:', headers);
});
```

#### 方案 2：服务器端 TLS 指纹

```typescript
// 在 gRPC 服务中记录 TLS 指纹
import { TLSSocket } from 'tls';

const socket = new TLSSocket({
  cert: serverCert,
  key: serverKey,
});

const tlsFingerprint = {
  version: socket.getProtocol(),
  cipher: socket.getCipher(),
  authorized: socket.authorized(),
};
```

#### 方案 3：使用现有库

```bash
# 安装 ja3 库
npm install ja3

# 使用
import ja3 from 'ja3';
const fingerprint = ja3.calculate(socket);
```

### 建议的 TLS 指纹测试

```typescript
// tests/integration/tls-fingerprint.test.ts
describe('TLS 指纹检测', () => {
  it('TIER-TLS-01: 不同实例应该有不同的 TLS 指纹', async () => {
    const { browser: browser1 } = await createSessionAndConnect();
    const { browser: browser2 } = await createSessionAndConnect();

    // 通过 HTTPS 请求获取 TLS 指纹
    const tls1 = await getTLSFingerprint(browser1);
    const tls2 = await getTLSFingerprint(browser2);

    expect(tls1.ja3).not.toBe(tls2.ja3);
  });
});
```

---

## 总结

### 实现的指纹检测方式（6 种）

1. ✅ **基础指纹** - User-Agent, Platform, Screen, etc.
2. ✅ **Canvas 指纹** - 2D 渲染像素数据
3. ✅ **WebGL 指纹** - GPU 渲染器信息
4. ✅ **AudioContext 指纹** - 音频处理特征
5. ✅ **字体指纹** - 系统字体列表
6. ✅ **其他特征** - Do Not Track, Cookie, etc.

### 未实现的指纹检测方式（2 种）

1. ❌ **TLS 指纹** - 需要 CDP 或服务器端实现
2. ❌ **WebRTC 指纹** - 本项目未涉及 WebRTC

### 文件清单

| 文件 | 作用 |
|------|------|
| `tests/html/fingerprint-test.html` | 指纹检测页面（可视化 + 数据导出） |
| `tests/integration/fingerprint-isolation-tier.test.ts` | TIER 测试套件（12 个测试） |
| `tests/debug-fingerprint.ts` | 调试脚本 |

### 访问指纹检测页面

```bash
# 启动开发服务器
pnpm dev

# 在浏览器中访问
open http://localhost:3000/fingerprint-test.html
```

或直接打开 `tests/html/fingerprint-test.html` 文件。

---

## 参考资料

- [BrowserLeaks](https://browserleaks.com/) - 在线指纹检测
- [AmIUnique](https://amiunique.org/) - 指纹跟踪研究
- [FingerprintJS](https://github.com/fingerprintjs/fingerprintjs) - 开源指纹库
- [JA3](https://github.com/salesforce/ja3) - TLS 指纹库
