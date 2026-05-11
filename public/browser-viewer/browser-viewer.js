/**
 * BrowserViewer — 远程浏览器实时查看器 SDK
 * 
 * 使用方式：
 *   方式1: 自动挂载
 *     <div id="viewer-container"></div>
 *     <script src="/browser-viewer/browser-viewer.js"></script>
 *     <script>
 *       const viewer = new BrowserViewer({
 *         containerId: 'viewer-container',
 *         sessionId: 'xxx',
 *         wsHost: 'ws://192.168.0.29:3011'
 *       });
 *       viewer.connect();
 *     </script>
 *   
 *   方式2: iframe 嵌入
 *     <iframe src="/browser-viewer/index.html?sessionId=xxx&wsHost=ws://192.168.0.29:3011" 
 *             style="width:100%;height:600px;border:none;">
 *     </iframe>
 */
class BrowserViewer {
  constructor(options) {
    this.containerId = options.containerId;
    this.sessionId = options.sessionId;
    this.wsHost = options.wsHost || window.location.host;
    this.wsProtocol = options.wsProtocol || (window.location.protocol === 'https:' ? 'wss:' : 'ws:');
    
    this.streamWs = null;
    this.eventsWs = null;
    this.connected = false;
    this.onConnect = options.onConnect || (() => {});
    this.onDisconnect = options.onDisconnect || (() => {});
    this.onNavigate = options.onNavigate || (() => {});
    this.onScreenshot = options.onScreenshot || (() => {});
    this.onActivity = options.onActivity || (() => {});
    
    this.container = null;
    this.screenElement = null;
    this.overlayElement = null;
    this.addressBar = null;
    this.activityLog = [];
    
    this._boundHandlers = {};
  }

  mount() {
    this.container = document.getElementById(this.containerId);
    if (!this.container) throw new Error(`Container #${this.containerId} not found`);
    
    this.container.innerHTML = `
      <div class="bv-wrapper">
        <div class="bv-toolbar">
          <div class="bv-address-bar">
            <span class="bv-nav-btn" data-action="back">◀</span>
            <span class="bv-nav-btn" data-action="forward">▶</span>
            <span class="bv-nav-btn" data-action="refresh">⟳</span>
            <input type="text" class="bv-url-input" placeholder="输入网址..." />
            <button class="bv-go-btn">前往</button>
          </div>
          <div class="bv-status">
            <span class="bv-status-dot"></span>
            <span class="bv-status-text">未连接</span>
          </div>
        </div>
        <div class="bv-screen-container">
          <img class="bv-screen" alt="Browser Screen" />
          <div class="bv-overlay">
            <div class="bv-loading">
              <div class="bv-spinner"></div>
              <p>正在连接远程浏览器...</p>
            </div>
          </div>
        </div>
      </div>
    `;
    
    this.screenElement = this.container.querySelector('.bv-screen');
    this.overlayElement = this.container.querySelector('.bv-overlay');
    this.addressBar = this.container.querySelector('.bv-url-input');
    
    this._bindEvents();
    this._injectStyles();
    
    return this;
  }

  _injectStyles() {
    if (document.getElementById('bv-styles')) return;
    const link = document.createElement('link');
    link.id = 'bv-styles';
    link.rel = 'stylesheet';
    link.href = '/browser-viewer/browser-viewer.css';
    document.head.appendChild(link);
  }

  _bindEvents() {
    this.addressBar.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._navigateToUrl();
    });
    
    this.container.querySelector('.bv-go-btn').addEventListener('click', () => this._navigateToUrl());
    
    this.container.querySelectorAll('.bv-nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        if (action === 'back') this.sendEvent('goBack', {});
        else if (action === 'forward') this.sendEvent('goForward', {});
        else if (action === 'refresh') this.sendEvent('reload', {});
      });
    });
    
    const screen = this.screenElement;
    
    this._boundHandlers.mousemove = (e) => {
      const coords = this._getCoordinates(e);
      this.sendEvent('mousemove', coords);
    };
    this._boundHandlers.mousedown = (e) => {
      const coords = this._getCoordinates(e);
      this.sendEvent('mousedown', { ...coords, button: e.button });
    };
    this._boundHandlers.mouseup = (e) => {
      const coords = this._getCoordinates(e);
      this.sendEvent('mouseup', { ...coords, button: e.button });
    };
    this._boundHandlers.click = (e) => {
      e.preventDefault();
      const coords = this._getCoordinates(e);
      this.sendEvent('click', { ...coords, button: e.button });
    };
    this._boundHandlers.wheel = (e) => {
      e.preventDefault();
      this.sendEvent('wheel', { deltaX: e.deltaX, deltaY: e.deltaY });
    };
    this._boundHandlers.contextmenu = (e) => e.preventDefault();
    
    screen.addEventListener('mousemove', this._boundHandlers.mousemove);
    screen.addEventListener('mousedown', this._boundHandlers.mousedown);
    screen.addEventListener('mouseup', this._boundHandlers.mouseup);
    screen.addEventListener('click', this._boundHandlers.click);
    screen.addEventListener('wheel', this._boundHandlers.wheel);
    screen.addEventListener('contextmenu', this._boundHandlers.contextmenu);
    
    this._boundHandlers.keydown = (e) => {
      if (document.activeElement === this.addressBar) return;
      this.sendEvent('keydown', { key: e.key, code: e.code, modifiers: this._getModifiers(e) });
      if (['Tab', 'Backspace', 'F5'].includes(e.key)) e.preventDefault();
    };
    this._boundHandlers.keyup = (e) => {
      if (document.activeElement === this.addressBar) return;
      this.sendEvent('keyup', { key: e.key, code: e.code, modifiers: this._getModifiers(e) });
    };
    
    document.addEventListener('keydown', this._boundHandlers.keydown);
    document.addEventListener('keyup', this._boundHandlers.keyup);
  }

  _getCoordinates(e) {
    const rect = this.screenElement.getBoundingClientRect();
    const scaleX = 1280 / rect.width;
    const scaleY = 800 / rect.height;
    return {
      x: Math.round((e.clientX - rect.left) * scaleX),
      y: Math.round((e.clientY - rect.top) * scaleY),
    };
  }

  _getModifiers(e) {
    return {
      alt: e.altKey,
      ctrl: e.ctrlKey,
      meta: e.metaKey,
      shift: e.shiftKey,
    };
  }

  _navigateToUrl() {
    let url = this.addressBar.value.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    this.navigateTo(url);
  }

  connect() {
    if (!this.container) this.mount();
    
    const wsBase = `${this.wsProtocol}//${this.wsHost}`;
    
    this.streamWs = new WebSocket(`${wsBase}/ws/${this.sessionId}/stream`);
    this.streamWs.binaryType = 'blob';
    
    this.streamWs.onmessage = (event) => {
      if (event.data instanceof Blob) {
        const url = URL.createObjectURL(event.data);
        if (this.screenElement.src.startsWith('blob:')) {
          URL.revokeObjectURL(this.screenElement.src);
        }
        this.screenElement.src = url;
        this.onScreenshot(url);
      }
    };
    
    this.streamWs.onerror = (err) => {
      console.error('Stream WS error:', err);
    };
    
    this.eventsWs = new WebSocket(`${wsBase}/ws/${this.sessionId}/events`);
    
    this.eventsWs.onopen = () => {
      this._setConnected(true);
      this.sendEvent('init', {});
      this.onConnect();
    };
    
    this.eventsWs.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'configSync') {
        } else if (msg.type === 'navigate') {
          this.addressBar.value = msg.data.url || '';
          this.onNavigate(msg.data.url);
        } else if (msg.type === 'notification') {
          this.logActivity(msg.data.message);
        }
      } catch {}
    };
    
    this.eventsWs.onclose = () => {
      this._setConnected(false);
      this.onDisconnect();
    };
  }

  navigateTo(url) {
    this.sendEvent('navigate', { url });
    this.addressBar.value = url;
  }

  sendEvent(type, data) {
    if (this.eventsWs && this.eventsWs.readyState === WebSocket.OPEN) {
      this.eventsWs.send(JSON.stringify({ type, data }));
    }
  }

  logActivity(message) {
    const time = new Date().toLocaleTimeString();
    this.activityLog.unshift({ time, message });
    this.onActivity({ time, message });
  }

  _setConnected(connected) {
    this.connected = connected;
    const dot = this.container.querySelector('.bv-status-dot');
    const text = this.container.querySelector('.bv-status-text');
    
    if (connected) {
      dot.classList.add('bv-connected');
      text.textContent = '已连接';
      this.overlayElement.classList.add('bv-hidden');
    } else {
      dot.classList.remove('bv-connected');
      text.textContent = '未连接';
      this.overlayElement.classList.remove('bv-hidden');
    }
  }

  disconnect() {
    if (this.streamWs) this.streamWs.close();
    if (this.eventsWs) this.eventsWs.close();
    this._setConnected(false);
  }

  destroy() {
    this.disconnect();
    
    document.removeEventListener('keydown', this._boundHandlers.keydown);
    document.removeEventListener('keyup', this._boundHandlers.keyup);
    
    if (this.container) this.container.innerHTML = '';
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = BrowserViewer;
} else if (typeof window !== 'undefined') {
  window.BrowserViewer = BrowserViewer;
}
