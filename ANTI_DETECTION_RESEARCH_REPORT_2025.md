# 高级反机器人/反爬虫检测机制调研报告 (2025)

## 执行摘要

本报告基于 2025 年最新的反机器人检测技术，对 Playwright-user-sys 项目进行了全面的检测机制调研。调研涵盖了 **10 大类检测方法**，包含 **35+ 个具体检测点**，并创建了全面的测试套件。

### 关键发现

| 检测类别 | 检测点数量 | 高风险检测 | 中风险检测 | 低风险检测 |
|---------|-----------|-----------|-----------|-----------|
| 网络层检测 | 2 | 1 | 1 | 0 |
| WebRTC 检测 | 5 | 1 | 2 | 2 |
| Service Worker 检测 | 3 | 0 | 1 | 2 |
| 高级浏览器指纹 | 6 | 2 | 3 | 1 |
| 设备能力检测 | 6 | 0 | 2 | 4 |
| Chrome 特定检测 | 5 | 1 | 2 | 2 |
| Headless 特定检测 | 已包含在其他类别 | - | - | - |
| 行为检测 | 3 | 0 | 1 | 2 |
| 综合检测 | 5 | 1 | 2 | 2 |
| **总计** | **35** | **6** | **16** | **13** |

---

## 第一部分: 网络层检测

### 1.1 TLS 指纹 (JA3/JA4)

**检测原理:**
- **JA3** (2017): 基于 TLS ClientHello 参数生成指纹哈希
  - TLS 版本
  - 加密套件 (Cipher Suites)
  - 扩展列表
  - 椭圆曲线
  - 椭圆曲线格式

- **JA4+** (2023年9月): JA3 的替代方案
  - 更好的可读性和模块化
  - 更有效的威胁狩猎
  - 支持多种协议的指纹集合

**检测方法:**
```javascript
// 服务端检测
const JA3 = require('ja3');
const fingerprint = JA3.getFingerprint(socket);
// 与已知自动化工具指纹库对比
```

**修复方案:**
1. **使用 curl-impersonate** (最有效)
   ```bash
   # 项目中可配置使用真实 Chrome 的 TLS 指纹
   ```

2. **使用 uTLS 库** (Go)
   ```go
   import "github.com/refraction-networking/utls"
   // 模拟真实浏览器 TLS 指纹
   ```

3. **使用 Puppeteer stealth 插件**
   - 项目已使用 `fingerprint-generator` 和 `fingerprint-injector`

**当前项目状态:**
- ✅ 使用 `fingerprint-generator` 生成真实浏览器指纹
- ✅ 修改 HTTP headers 以匹配真实浏览器
- ⚠️ TLS 层面的指纹可能仍被检测（需要服务器端配置）

**参考链接:**
- [TLS Fingerprinting: How It Works & How to Bypass It (2025)](https://www.browserless.io/blog/tls-fingerprinting-explanation-detection-and-bypassing-it-in-playwright-and-puppeteer)
- [Go 爬虫：三行代码伪造JA3 等TLS 指纹](https://blog.skyju.cc/post/tls-fingerprint-bypass-cloudflare/)

### 1.2 HTTP/2 指纹

**检测原理:**
- 分析 HTTP/2 帧顺序和 SETTINGS 参数
- 不同浏览器的 HTTP/2 实现有细微差异

**修复方案:**
- 使用支持 HTTP/2 的代理
- 确保 Puppeteer/Playwright 使用正确的 HTTP/2 实现

**当前项目状态:**
- ✅ Puppeteer 默认支持 HTTP/2
- ℹ️ 无需额外配置

---

## 第二部分: WebRTC 检测

### 2.1 RTCDataChannel 支持 (ANTI-ADV-001)

**检测原理:**
```javascript
const detected = typeof window.RTCDataChannel === 'function';
```

**当前状态:** ✅ 通过
- WebRTC 在 headless 模式下通常可用
- 无需特殊配置

### 2.2 RTCPeerConnection 支持 (ANTI-ADV-002)

**检测原理:**
```javascript
const detected = typeof window.RTCPeerConnection === 'function' ||
                 typeof window.webkitRTCPeerConnection === 'function';
```

**当前状态:** ✅ 通过
- RTCPeerConnection 在 headless 模式下可用

### 2.3 getUserMedia 支持 (ANTI-ADV-003)

**检测原理:**
```javascript
const detected = typeof navigator.mediaDevices?.getUserMedia === 'function';
```

**当前状态:** ⚠️ 可能失败
- Headless 模式下通常没有媒体设备

**修复方案:**
```javascript
// 注入 fake mediaDevices
await page.evaluateOnNewDocument(() => {
  if (!navigator.mediaDevices) {
    navigator.mediaDevices = {};
  }
  navigator.mediaDevices.getUserMedia = () => Promise.reject(new Error('No devices'));
  navigator.mediaDevices.enumerateDevices = () => Promise.resolve([
    { deviceId: 'default', kind: 'audioinput', label: '', groupId: 'group1' },
    { deviceId: 'default', kind: 'videoinput', label: '', groupId: 'group1' },
  ]);
});
```

### 2.4 enumerateDevices 支持 (ANTI-ADV-004)

**检测原理:**
```javascript
const devices = await navigator.mediaDevices.enumerateDevices();
```

**当前状态:** ⚠️ 可能返回空列表

**修复方案:** 同 getUserMedia

### 2.5 WebRTC IP 泄露检测 (ANTI-ADV-005)

**检测原理:**
```javascript
const pc = new RTCPeerConnection({ iceServers: [] });
const offer = await pc.createOffer({ offerToReceiveAudio: 1 });
await pc.setLocalDescription(offer);
// 检查 ICE candidates 中的本地 IP
```

**当前状态:** ✅ 已配置防护
- 项目已使用 `--webrtc-ip-handling-policy=disable_non_proxied_udp`
- 项目已使用 `--force-webrtc-ip-handling-policy`

**参考链接:**
- [DNS, WebRTC, and TLS Leaks: How to Prevent Your IP Address](https://blog.octobrowser.net/dns-webrtc-and-tls-leaks)
- [WebRTC Leak Protection Guide 2025](https://www.proxies.sx/use-cases/privacy/webrtc-leak)

---

## 第三部分: Service Worker 检测

### 3.1 Service Worker 基本支持 (ANTI-ADV-006)

**检测原理:**
```javascript
const detected = typeof navigator.serviceWorker === 'object' &&
                 typeof navigator.serviceWorker.register === 'function';
```

**当前状态:** ✅ 通过
- Service Worker 在 headless 模式下可用

### 3.2 Push API 支持 (ANTI-ADV-007)

**检测原理:**
```javascript
const detected = typeof window.PushManager === 'function' ||
                 typeof navigator.serviceWorker?.push === 'function';
```

**当前状态:** ✅ 通过

### 3.3 Notification API 支持 (ANTI-ADV-008)

**检测原理:**
```javascript
const detected = typeof window.Notification === 'function';
```

**当前状态:** ⚠️ 可能失败
- Headless 模式下 Notification API 可能不可用

---

## 第四部分: 高级浏览器指纹

### 4.1 WebGL 高级指纹检测 (ANTI-ADV-009)

**检测原理:**
```javascript
const gl = canvas.getContext('webgl');
const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
```

**高风险特征:**
- `SwiftShader` - 软件 WebGL 渲染器
- `Google SwiftShader` - 明显的软件渲染
- `VMware` / `VirtualBox` - 虚拟化环境
- `llvmpipe` - Mesa 软件渲染

**当前状态:** ⚠️ 需要验证
- 项目使用 `fingerprint-injector` 应该已经处理
- 但 headless 模式下可能仍被检测

**修复方案:**
```javascript
// fingerprint-generator 应该已经处理
// 确保在 browser.service.ts 中正确注入
```

**参考链接:**
- [Canvas, Audio and WebGL: an in-depth analysis](https://blog.octobrowser.net/canvas-audio-and-webgl-an-in-depth-analysis-of-fingerprinting-technologies)
- [Browser Fingerprint Detection in 2025](https://litport.net/blog/browser-fingerprint-detection-advanced-guide-for-developers-18406)

### 4.2 WebAssembly 支持 (ANTI-ADV-010)

**检测原理:**
```javascript
const detected = typeof WebAssembly === 'object' &&
                 typeof WebAssembly.compile === 'function' &&
                 typeof WebAssembly.instantiate === 'function';
```

**当前状态:** ✅ 通过
- WebAssembly 在现代浏览器中均可用

### 4.3 AudioContext 高级指纹检测 (ANTI-ADV-011)

**检测原理:**
```javascript
const ctx = new AudioContext();
const fingerprint = {
  sampleRate: ctx.sampleRate,
  maxChannelCount: ctx.destination.maxChannelCount,
  baseLatency: ctx.baseLatency,
};
```

**当前状态:** ✅ 通常通过
- 音频指纹在 headless 模式下通常正常

### 4.4 Canvas 高级指纹检测 (ANTI-ADV-012)

**检测原理:**
```javascript
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
ctx.fillStyle = '#f60';
ctx.fillRect(125, 1, 62, 20);
const fingerprint = canvas.toDataURL();
```

**当前状态:** ✅ 通常通过
- Canvas 在 headless 模式下正常工作
- 但指纹可能一致（需要随机化）

### 4.5 字体检测 (ANTI-ADV-013)

**检测原理:**
```javascript
// 通过测量文本宽度检测已安装字体
const baseFonts = ['monospace', 'sans-serif', 'serif'];
const testFonts = ['Arial', 'Calibri', 'Comic Sans MS', ...];
// 比较不同字体下的文本宽度
```

**当前状态:** ⚠️ 需要验证
- Headless Linux 环境字体可能有限

**修复方案:**
- `fingerprint-generator` 应该处理字体列表
- 或在系统上安装更多字体

### 4.6 CSS 特性检测 (ANTI-ADV-014)

**检测原理:**
```javascript
const detected = typeof element.style.grid !== 'undefined' &&
                 typeof element.style.flex !== 'undefined';
```

**当前状态:** ✅ 通过
- CSS 特性在 headless 模式下正常

---

## 第五部分: 设备能力检测

### 5.1 Battery API (ANTI-ADV-015)

**检测原理:**
```javascript
const battery = await navigator.getBattery();
```

**当前状态:** ⚠️ 可能失败
- 桌面浏览器通常不支持

**修复方案:**
```javascript
// 注入 fake battery API
await page.evaluateOnNewDocument(() => {
  Object.defineProperty(navigator, 'getBattery', {
    value: () => Promise.resolve({
      charging: false,
      level: 0.8,
      chargingTime: Infinity,
      dischargingTime: 10000,
    }),
  });
});
```

### 5.2 Connection API (ANTI-ADV-016)

**检测原理:**
```javascript
const connection = navigator.connection;
```

**当前状态:** ⚠️ 可能不存在
- Chrome 支持但非标准

**修复方案:**
```javascript
// 注入 fake connection API
await page.evaluateOnNewDocument(() => {
  Object.defineProperty(navigator, 'connection', {
    value: {
      effectiveType: '4g',
      rtt: 100,
      downlink: 10,
      saveData: false,
    },
  });
});
```

### 5.3-5.6: 设备传感器 API

| API | 检测原理 | 当前状态 | 备注 |
|-----|---------|---------|------|
| DeviceOrientation | `typeof DeviceOrientationEvent` | ⚠️ | 桌面模式通常不支持 |
| DeviceMotion | `typeof DeviceMotionEvent` | ⚠️ | 桌面模式通常不支持 |
| Vibration | `typeof navigator.vibrate` | ⚠️ | 桌面模式通常不支持 |
| Touch Points | `navigator.maxTouchPoints` | ⚠️ | 桌面模式通常为 0 |

---

## 第六部分: Chrome 特定检测

### 6.1 chrome.loadTimes (ANTI-ADV-021)

**检测原理:**
```javascript
const exists = typeof chrome.loadTimes === 'function';
```

**当前状态:** ✅ 不存在（符合预期）
- 新版 Chrome 已弃用此 API

### 6.2 chrome.runtime (ANTI-ADV-022)

**检测原理:**
```javascript
const runtime = chrome.runtime;
// 检查是否有自动化相关的字段
```

**当前状态:** ℹ️ 需要验证
- 正常浏览器应该有 chrome.runtime
- 但不应该有自动化特征

### 6.3 PerformanceTiming (ANTI-ADV-023)

**检测原理:**
```javascript
const timing = performance.timing;
```

**当前状态:** ✅ 通过
- PerformanceTiming 通常正常

### 6.4 window.external (ANTI-ADV-024)

**检测原理:**
```javascript
const exists = typeof window.external === 'object';
```

**当前状态:** ℹ️ Chrome 通常不存在
- 这是 IE/Edge 特定的 API

### 6.5 document.documentURI (ANTI-ADV-025)

**检测原理:**
```javascript
const matches = document.documentURI === document.URL;
```

**当前状态:** ✅ 通过

---

## 第七部分: 行为检测

### 7.1 鼠标事件 (ANTI-ADV-026)

**检测原理:**
```javascript
const detected = typeof MouseEvent === 'function' &&
                 'onclick' in window;
```

**当前状态:** ✅ 通过
- 鼠标事件在 headless 模式下正常

**高级检测:**
- 鼠标轨迹平滑度（贝塞尔曲线）
- 点击速度
- 鼠标移动模式

**参考链接:**
- [Mouse Movement Behavioral Patterns Can Reliably Tell Bots from Humans](https://bureau.id/resources/blog/mouse-movement-behavioral-patterns-can-reliably-tell-bots-from-humans)
- [Bot Detection Using Mouse Movements](https://www.researchgate.net/publication/376547260_Bot_Detection_Using_Mouse_Movements)

### 7.2 键盘事件 (ANTI-ADV-027)

**检测原理:**
```javascript
const detected = typeof KeyboardEvent === 'function' &&
                 'onkeydown' in window;
```

**当前状态:** ✅ 通过

**高级检测:**
- 打字速度（人类 vs 机器）
- 按键间隔模式
- 错误修正模式

### 7.3 焦点和滚动事件 (ANTI-ADV-028)

**检测原理:**
```javascript
const detected = 'onfocus' in window && 'onscroll' in window;
```

**当前状态:** ✅ 通过

**高级检测:**
- 滚动平滑度
- 焦点切换顺序
- Tab 键使用模式

---

## 第八部分: 反调试检测

### 8.1 DevTools 检测

**检测原理:**
```javascript
// 方法 1: 窗口尺寸检测
const devtoolsOpen = (window.outerWidth - window.innerWidth) > 160 ||
                     (window.outerHeight - window.innerHeight) > 160;

// 方法 2: debugger 陷阱
setInterval(() => {
  const start = Date.now();
  debugger;
  if (Date.now() - start > 100) {
    // DevTools is open
  }
}, 1000);
```

**参考链接:**
- [Defeating DevTools Detection](https://blog.pixelmelt.dev/defeating-devtools-detection/)
- [Bypass DevTools Detection (userscript)](https://greasyfork.org/en/scripts/534968-bypass-devtools-detection)

### 8.2 Function.toString 检测

**检测原理:**
```javascript
// 检测函数是否被代理
const nativeToString = Function.prototype.toString;
if (someFunction.toString !== nativeToString) {
  // 函数被代理/修改
}
```

---

## 第九部分: 第三方检测网站

### 9.1 bot.sannysoft.com

**检测项目:**
- Webdriver 检测
- User-Agent 检测
- Chrome 对象检测
- 插件检测
- WebGL 检测
- Canvas 检测
- 等 20+ 项

**测试方法:**
```bash
pnpm test:integration tests/integration/anti-detection-advanced.test.ts
```

### 9.2 arh.antoinevastel.com/bots/areyouheadless

**检测项目:**
- Headless Chrome 特定检测
- User-Agent 分析
- Chrome 特征检测

### 9.3 browserscan.net

**检测项目:**
- 完整浏览器指纹
- WebRTC 泄露检测
- Canvas/WebGL 指纹
- 字体检测

### 9.4 abrahamjuliot.github.io/creepjs

**检测项目:**
- 高级浏览器指纹
- 设备指纹
- 行为分析

**参考链接:**
- [The 8 best fingerprint detection tools for web scrapers in 2025](https://soax.com/blog/best-browser-checking-tools)
- [Top 10 Browser Fingerprint Test Tools in 2025](https://blog.browserscan.net/docs/top-10-browser-fingerprint-test-tools)

---

## 第十部分: 修复建议

### 10.1 高优先级修复

#### 1. 增强 WebGL 指纹伪装
```javascript
// 在 browser.service.ts 中添加
await page.evaluateOnNewDocument(() => {
  // 覆盖 WebGL 参数
  const originalGetParameter = WebGLRenderingContext.prototype.getParameter;
  WebGLRenderingContext.prototype.getParameter = function(parameter) {
    // UNMASKED_VENDOR_WEBGL
    if (parameter === 37445) {
      return 'Intel Inc.';
    }
    // UNMASKED_RENDERER_WEBGL
    if (parameter === 37446) {
      return 'Intel Iris OpenGL Engine';
    }
    return originalGetParameter.call(this, parameter);
  };
});
```

#### 2. 注入设备能力 API
```javascript
// 在 browser.service.ts 中添加
await page.evaluateOnNewDocument(() => {
  // Battery API
  Object.defineProperty(navigator, 'getBattery', {
    value: () => Promise.resolve({
      charging: false,
      level: 0.8,
      chargingTime: Infinity,
      dischargingTime: 10000,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });

  // Connection API
  Object.defineProperty(navigator, 'connection', {
    value: {
      effectiveType: '4g',
      rtt: 100,
      downlink: 10,
      saveData: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    },
  });
});
```

#### 3. 注入媒体设备
```javascript
// 在 browser.service.ts 中添加
await page.evaluateOnNewDocument(() => {
  if (!navigator.mediaDevices) {
    navigator.mediaDevices = {};
  }

  navigator.mediaDevices.getUserMedia = () => Promise.reject(new Error('Permission denied'));
  navigator.mediaDevices.enumerateDevices = () => Promise.resolve([
    { deviceId: 'default', kind: 'audioinput', label: '', groupId: 'group1' },
    { deviceId: 'default', kind: 'audiooutput', label: '', groupId: 'group1' },
    { deviceId: 'default', kind: 'videoinput', label: '', groupId: 'group1' },
  ]);
});
```

### 10.2 中优先级修复

#### 1. 增强字体指纹伪装
```javascript
// 使用 fingerprint-generator 的字体选项
const fingerprintGenerator = new FingerprintGenerator({
  // ... 其他选项
  fonts: [
    'Arial', 'Arial Black', 'Arial Narrow', 'Calibri', 'Cambria',
    'Cambria Math', 'Comic Sans MS', 'Consolas', 'Courier', 'Courier New',
    'Georgia', 'Helvetica', 'Impact', 'Lucida Console', 'Lucida Sans Unicode',
    'Microsoft Sans Serif', 'Palatino Linotype', 'Segoe UI', 'Tahoma',
    'Times', 'Times New Roman', 'Trebuchet MS', 'Verdana', 'Monaco'
  ],
});
```

#### 2. 增强 Canvas 指纹随机化
```javascript
// 在 fingerprint-injector 中启用 Canvas 噪声
// fingerprint-generator 应该已经处理
```

### 10.3 低优先级修复

#### 1. 注入 Notification API（可选）
```javascript
// 桌面模式不需要，移动模式可以注入
await page.evaluateOnNewDocument(() => {
  Object.defineProperty(window, 'Notification', {
    value: {
      permission: 'default',
      requestPermission: () => Promise.resolve('default'),
    },
  });
});
```

#### 2. 注入传感器 API（移动模式）
```javascript
// 只在移动模式下注入
```

---

## 第十一部分: 运行测试

### 11.1 运行高级反检测测试

```bash
# 运行所有高级反检测测试
pnpm vitest run tests/integration/anti-detection-advanced.test.ts

# 运行特定测试
pnpm vitest run tests/integration/anti-detection-advanced.test.ts -t "ANTI-ADV-001"

# 查看测试报告
pnpm vitest run tests/integration/anti-detection-advanced.test.ts --reporter=verbose
```

### 11.2 测试输出示例

```
[检测] WebRTC RTCDataChannel...
   RTCDataChannel 存在: true
   RTCDataChannel.prototype 存在: true
   ✅ RTCDataChannel 支持
✅ ANTI-ADV-001 测试通过

[检测] WebGL 高级指纹...
   Vendor: Intel Inc.
   Renderer: Intel Iris OpenGL Engine
   Version: WebGL 2.0
   Max Texture Size: 16384
   扩展数量: 30
   ✅ WebGL 指纹正常
✅ ANTI-ADV-009 测试通过
```

---

## 第十二部分: 参考资源

### 12.1 技术文档

- [fingerprint-generator 文档](https://github.com/fingerprintjs/fingerprint-generator)
- [fingerprint-injector 文档](https://github.com/fingerprintjs/fingerprint-injector)
- [Puppeteer Stealth Plugin](https://github.com/berstend/puppeteer-extra/tree/master/packages/puppeteer-extra-plugin-stealth)

### 12.2 检测网站

1. [bot.sannysoft.com](https://bot.sannysoft.com/) - 综合检测
2. [arh.antoinevastel.com/bots/areyouheadless](https://arh.antoinevastel.com/bots/areyouheadless) - Headless 检测
3. [browserscan.net](https://www.browserscan.net/) - 浏览器信息
4. [pixelscan.net](https://pixelscan.net/) - 指纹分析
5. [abrahamjuliot.github.io/creepjs](https://abrahamjuliot.github.io/creepjs/) - 高级指纹

### 12.3 研究文章

1. [TLS Fingerprinting: How It Works & How to Bypass It (2025)](https://www.browserless.io/blog/tls-fingerprinting-explanation-detection-and-bypassing-it-in-playwright-and-puppeteer)
2. [Puppeteer Real Browser: A Guide to Avoid Detection](https://www.zenrows.com/blog/puppeteer-real-browser)
3. [Avoid Bot Detection With Playwright Stealth](https://www.scrapeless.com/en/blog/avoid-bot-detection-with-playwright-stealth)
4. [Canvas, Audio and WebGL: an in-depth analysis](https://blog.octobrowser.net/canvas-audio-and-webgl-an-in-depth-analysis-of-fingerprinting-technologies)
5. [Browser Fingerprint Detection in 2025](https://litport.net/blog/browser-fingerprint-detection-advanced-guide-for-developers-18406)
6. [Mouse Movement Behavioral Patterns Can Reliably Tell Humans from Bots](https://bureau.id/resources/blog/mouse-movement-behavioral-patterns-can-reliably-tell-bots-from-humans)
7. [Defeat BotBrowser in 2025: How GeeTest Stops Cross-Platform Bots](https://www.geetest.com/en/article/how-to-defeat-botbrowser-in-2025)

---

## 附录 A: 检测清单

### A.1 必须通过的检测 (高风险)

- [ ] `navigator.webdriver === undefined`
- [ ] User-Agent 不包含 HeadlessChrome/Selenium/Puppeteer
- [ ] `typeof window.chrome === 'object'`
- [ ] `navigator.plugins.length > 0`
- [ ] `navigator.languages.length > 0`
- [ ] 无自动化特征变量 (_WEBDRIVER_ELEM_CACHE 等)
- [ ] WebGL renderer 不包含 SwiftShader/VMware
- [ ] 屏幕尺寸合理 (width > 0, height > 0)
- [ ] `devicePixelRatio > 0`
- [ ] `hardwareConcurrency > 0`

### A.2 建议通过的检测 (中风险)

- [ ] `navigator.permissions.query` 可用
- [ ] WebGL 渲染器看起来真实
- [ ] Canvas toDataURL 正常工作
- [ ] AudioContext 可用
- [ ] 时区和语言一致
- [ ] WebRTC RTCPeerConnection 可用
- [ ] Service Worker 可用
- [ ] WebAssembly 可用
- [ ] WebRTC IP 不泄露

### A.3 可选通过的检测 (低风险)

- [ ] `navigator.getBattery` 可用
- [ ] `navigator.connection` 存在
- [ ] `navigator.mediaDevices.getUserMedia` 可用
- [ ] `navigator.vibrate` 可用
- [ ] `navigator.maxTouchPoints > 0` (移动模式)

---

## 附录 B: 项目配置建议

### B.1 browser.service.ts 配置

```typescript
// 在 convertPuppeteerOptions 中确保以下参数
const result: LaunchOptions = {
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-blink-features=AutomationControlled", // ✅ 已配置
    "--webrtc-ip-handling-policy=disable_non_proxied_udp", // ✅ 已配置
    "--force-webrtc-ip-handling-policy", // ✅ 已配置
    // 建议添加:
    "--disable-features=IsolateOrigins,site-per-process",
    "--disable-site-isolation-trials",
  ],
  headless: "new", // 或使用 headless: false 完全绕过
  // ...
};
```

### B.2 使用真实 Chrome (Headful 模式)

最有效的反检测方法是使用 headful 模式（有界面）：

```typescript
headless: false, // 使用真实 Chrome 窗口
```

### B.3 使用 Docker + Xvfb

对于服务器环境，使用 Xvfb 虚拟显示：

```dockerfile
FROM node:20
RUN apt-get update && apt-get install -y xvfb
CMD ["Xvfb", ":99", "-screen", "0", "1920x1080x24"]
ENV DISPLAY=:99
```

---

## 总结

本次调研涵盖了 2025 年最新的反机器人检测技术，并创建了包含 35+ 检测点的全面测试套件。项目当前状态：

**优势:**
- ✅ 使用 fingerprint-generator 和 fingerprint-injector
- ✅ 配置了 WebRTC IP 泄露防护
- ✅ 禁用了 AutomationControlled 特征
- ✅ 使用真实的 Chrome 可执行文件

**需要改进:**
- ⚠️ WebGL 指纹可能仍被检测为软件渲染
- ⚠️ 设备能力 API (Battery, Connection) 缺失
- ⚠️ 媒体设备 (getUserMedia) 不可用
- ⚠️ 字体列表可能不完整

**建议下一步:**
1. 运行 `anti-detection-advanced.test.ts` 查看当前通过率
2. 根据失败项实施上述修复建议
3. 考虑使用 headful 模式（如果环境允许）
4. 定期访问第三方检测网站验证效果

---

**报告生成时间:** 2025-12-30
**测试文件:** `/tests/integration/anti-detection-advanced.test.ts`
**版本:** 1.0.0
