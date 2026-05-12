/**
 * BrowserViewer — 极简版远程浏览器实时查看器 SDK
 *
 * 使用方式：
 *   方式1: 自动挂载
 *     <div id="viewer-container"></div>
 *     <script src="/browser-viewer/browser-viewer.js"></script>
 *     <script>
 *       const viewer = new BrowserViewer({
 *         containerId: 'viewer-container',
 *         sessionId: 'xxx',
 *       });
 *       viewer.connect();
 *     </script>
 *
 *   方式2: iframe 嵌入
 *     <iframe src="/browser-viewer/index.html?sessionId=xxx"
 *             style="width:100%;height:600px;border:none;">
 *     </iframe>
 */
class BrowserViewer {
  constructor(options) {
    this.containerId = options.containerId;
    this.sessionId = options.sessionId;
    this.wsHost = options.wsHost || location.host;
    this.token = options.token || '';
    this.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';

    this.streamWs = null;
    this.eventsWs = null;
    this.container = null;
    this.img = null;
    this.connected = false;
    this.frameCount = 0;
    this.lastBlobUrl = null;
    this.fpsFrameCount = 0;
    this.lastFpsTime = Date.now();
    this.currentFps = 0;
    this.bandwidthBytes = 0;
    this.lastBandwidthTime = Date.now();
    this.currentBandwidth = 0;
    this.cursor = document.createElement('div');
    this.cursor.style.cssText = 'position:absolute;width:20px;height:20px;border-radius:50%;background:rgba(255,0,0,0.5);border:2px solid rgba(255,0,0,0.8);pointer-events:none;transform:translate(-50%,-50%);display:none;z-index:9999;';

    this.hiddenInput = document.createElement('textarea');
    this.hiddenInput.style.cssText = 'position:fixed;top:-100px;left:-100px;width:1px;height:1px;opacity:0.01;font-size:16px;border:none;outline:none;resize:none;';
    this.hiddenInput.setAttribute('autocomplete', 'off');
    this.hiddenInput.setAttribute('autocorrect', 'off');
    this.hiddenInput.setAttribute('autocapitalize', 'off');
    this.hiddenInput.setAttribute('spellcheck', 'false');
    document.body.appendChild(this.hiddenInput);

    var self = this;
    var lastInputValue = '';
    this.hiddenInput.addEventListener('input', function(e) {
      var newValue = self.hiddenInput.value;
      if (newValue.length > lastInputValue.length) {
        var addedText = newValue.substring(lastInputValue.length);
        for (var i = 0; i < addedText.length; i++) {
          self.send({ type: 'event', event: { type: 'keydown', data: { key: addedText[i], code: 'Key' + addedText[i].toUpperCase() } } });
          self.send({ type: 'event', event: { type: 'keyup', data: { key: addedText[i], code: 'Key' + addedText[i].toUpperCase() } } });
        }
      } else if (newValue.length < lastInputValue.length) {
        var deletedCount = lastInputValue.length - newValue.length;
        for (var j = 0; j < deletedCount; j++) {
          self.send({ type: 'event', event: { type: 'keydown', data: { key: 'Backspace', code: 'Backspace' } } });
          self.send({ type: 'event', event: { type: 'keyup', data: { key: 'Backspace', code: 'Backspace' } } });
        }
      }
      lastInputValue = newValue;
    });

    this.hiddenInput.addEventListener('compositionend', function(e) {
      var composedText = e.data || '';
      if (composedText) {
        for (var k = 0; k < composedText.length; k++) {
          self.send({ type: 'event', event: { type: 'keydown', data: { key: composedText[k], code: 'Key' + composedText[k].toUpperCase() } } });
          self.send({ type: 'event', event: { type: 'keyup', data: { key: composedText[k], code: 'Key' + composedText[k].toUpperCase() } } });
        }
      }
    });
  }

  mount() {
    this.container = document.getElementById(this.containerId);
    if (!this.container) throw new Error('#' + this.containerId + ' not found');

    this.container.innerHTML =
      '<div style="width:100%;height:100%;position:relative;background:#000;">' +
        '<img id="bv-screen" style="width:100%;height:100%;object-fit:contain;" />' +
        '<div id="bv-status" style="position:absolute;top:10px;left:10px;color:#fff;font-size:12px;z-index:10;font-family:system-ui,-apple-system,sans-serif;background:rgba(0,0,0,0.5);padding:2px 8px;border-radius:4px;">连接中...</div>' +
      '</div>';
    this.img = this.container.querySelector('#bv-screen');
    if (this.container) {
      this.container.style.position = 'relative';
      this.container.appendChild(this.cursor);
    }

    this.kbBtn = document.createElement('div');
    this.kbBtn.style.cssText = 'position:absolute;bottom:10px;right:10px;width:44px;height:44px;border-radius:22px;background:rgba(0,122,255,0.8);color:white;display:flex;align-items:center;justify-content:center;font-size:20px;cursor:pointer;z-index:9999;user-select:none;';
    this.kbBtn.textContent = '\u2328';
    var self = this;
    this.kbBtn.addEventListener('click', function() {
      self.hiddenInput.focus();
      setTimeout(function() { self.hiddenInput.focus(); }, 100);
    });
    if (this.container) {
      this.container.appendChild(this.kbBtn);
    }

    return this;
  }

  connect() {
    if (!this.container) this.mount();

    var wsBase = this.protocol + '//' + this.wsHost;
    var statusEl = this.container.querySelector('#bv-status');
    var self = this;

    // Stream WS — 接收画面帧（arraybuffer 更可靠）
    var tokenQuery = this.token ? '?token=' + encodeURIComponent(this.token) : '';
    this.streamWs = new WebSocket(wsBase + '/ws/' + this.sessionId + '/stream' + tokenQuery);
    this.streamWs.binaryType = 'arraybuffer';

    this.streamWs.onmessage = function (e) {
      if (e.data instanceof ArrayBuffer) {
        self.frameCount++;
        self.fpsFrameCount++;
        self.bandwidthBytes += e.data.byteLength;
        var now = Date.now();
        if (now - self.lastFpsTime >= 1000) {
          self.currentFps = Math.round(self.fpsFrameCount * 1000 / (now - self.lastFpsTime));
          self.fpsFrameCount = 0;
          self.lastFpsTime = now;
        }
        if (now - self.lastBandwidthTime >= 1000) {
          self.currentBandwidth = Math.round(self.bandwidthBytes / 1024);
          self.bandwidthBytes = 0;
          self.lastBandwidthTime = now;
        }
        if (self.fpsFrameCount === 0 || self.frameCount <= 5 || self.frameCount % 30 === 0) {
          self._updateStatus(statusEl);
        }
        var mime = 'image/webp'; // default for CDP screencast
        if (e.data instanceof ArrayBuffer && e.data.byteLength >= 4) {
          var arr = new Uint8Array(e.data, 0, 4);
          // JPEG magic: FF D8 FF
          if (arr[0] === 0xFF && arr[1] === 0xD8 && arr[2] === 0xFF) mime = 'image/jpeg';
          // PNG magic: 89 50 4E 47
          else if (arr[0] === 0x89 && arr[1] === 0x50 && arr[2] === 0x4E && arr[3] === 0x47) mime = 'image/png';
          // WebP magic: RIFF....WEBP
          else if (arr[0] === 0x52 && arr[1] === 0x49 && arr[2] === 0x46 && arr[3] === 0x46) mime = 'image/webp';
        }
        var blob = new Blob([e.data], { type: mime });
        var url = URL.createObjectURL(blob);
        if (self.lastBlobUrl) URL.revokeObjectURL(self.lastBlobUrl);
        self.lastBlobUrl = url;
        self.img.src = url;
      } else if (typeof e.data === 'string') {
        try {
          var msg = JSON.parse(e.data);
          if (msg.type === 'session_ended') {
            statusEl.textContent = '会话结束: ' + (msg.data?.reason || '未知');
            statusEl.style.color = '#f87171';
          } else {
            statusEl.textContent = '文本: ' + String(e.data).substring(0, 50);
          }
        } catch {
          statusEl.textContent = '文本: ' + String(e.data).substring(0, 50);
        }
      }
    };

    this.streamWs.onopen = function () {
      statusEl.textContent = 'Stream 已连接...';
    };
    this.streamWs.onerror = function (e) {
      statusEl.textContent = 'Stream 错误';
      console.error('[BV] stream ws error', e);
    };
    this.streamWs.onclose = function (e) {
      statusEl.textContent = 'Stream 断开 (' + e.code + ')';
      console.log('[BV] stream ws close', e.code, e.reason);
    };

    // Events WS — 发送鼠标/键盘事件
    var tokenQuery = this.token ? '?token=' + encodeURIComponent(this.token) : '';
    this.eventsWs = new WebSocket(wsBase + '/ws/' + this.sessionId + '/events' + tokenQuery);

    this.eventsWs.onopen = function () {
      self.connected = true;
      statusEl.textContent = '✅ 已连接';
      statusEl.style.color = '#4ade80';
      self.send({ type: 'event', event: { type: 'init', data: {} } });
    };

    this.eventsWs.onmessage = function (e) {
      try {
        var msg = JSON.parse(e.data);
        if (msg.type === 'navigate') {
          console.log('[BV] navigate:', msg.data?.url);
        } else if (msg.type === 'configSync') {
          console.log('[V] configSync:', msg.data);
        }
      } catch {}
    };

    this.eventsWs.onclose = function () {
      self.connected = false;
      statusEl.textContent = '断开连接';
      statusEl.style.color = '#f87171';
    };

    this.eventsWs.onerror = function (e) {
      console.error('[BV] events ws error', e);
    };

    // 绑定鼠标/键盘事件
    this._bindMouseEvents();
  }

  _bindMouseEvents() {
    var self = this;
    var img = this.img;

    function getCoords(e) {
      var r = img.getBoundingClientRect();
      var imgRatio = 1280 / 800;
      var containerRatio = r.width / r.height;
      var renderWidth, renderHeight, offsetX, offsetY;

      if (containerRatio > imgRatio) {
        renderHeight = r.height;
        renderWidth = r.height * imgRatio;
        offsetX = r.left + (r.width - renderWidth) / 2;
        offsetY = r.top;
      } else {
        renderWidth = r.width;
        renderHeight = r.width / imgRatio;
        offsetX = r.left;
        offsetY = r.top + (r.height - renderHeight) / 2;
      }

      return {
        x: Math.round((e.clientX - offsetX) * (1280 / renderWidth)),
        y: Math.round((e.clientY - offsetY) * (800 / renderHeight)),
      };
    }

    img.addEventListener('mousemove', function (e) {
      var c = getCoords(e);
      self.send({ type: 'event', event: { type: 'mousemove', data: c } });
      self.cursor.style.display = 'block';
      self.cursor.style.left = (e.clientX - img.getBoundingClientRect().left) + 'px';
      self.cursor.style.top = (e.clientY - img.getBoundingClientRect().top) + 'px';
    });

    img.addEventListener('mouseleave', function () {
      self.cursor.style.display = 'none';
    });

    img.addEventListener('mousedown', function (e) {
      var c = getCoords(e);
      c.button = e.button;
      self.send({ type: 'event', event: { type: 'mousedown', data: c } });
    });

    img.addEventListener('mouseup', function (e) {
      var c = getCoords(e);
      c.button = e.button;
      self.send({ type: 'event', event: { type: 'mouseup', data: c } });
    });

    img.addEventListener('click', function (e) {
      e.preventDefault();
      var c = getCoords(e);
      c.button = e.button;
      self.send({ type: 'event', event: { type: 'click', data: c } });
    });

    img.addEventListener('wheel', function (e) {
      e.preventDefault();
      self.send({ type: 'event', event: { type: 'wheel', data: { deltaX: e.deltaX, deltaY: e.deltaY } } });
    }, { passive: false });

    img.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      var c = getCoords(e);
      c.button = 2;
      self.send({ type: 'event', event: { type: 'contextmenu', data: c } });
    });

    document.addEventListener('keydown', function (e) {
      self.send({ type: 'event', event: { type: 'keydown', data: { key: e.key, code: e.code } } });
      if (['Tab', 'Backspace', 'F5'].includes(e.key)) e.preventDefault();
    });

    document.addEventListener('keyup', function (e) {
      self.send({ type: 'event', event: { type: 'keyup', data: { key: e.key, code: e.code } } });
    });

    // === Touch events ===
    var touchStartTime = 0;
    var touchStartCoords = null;
    var longPressTimer = null;
    var isLongPress = false;

    img.addEventListener('touchstart', function (e) {
      e.preventDefault();
      var touch = e.touches[0];
      var c = getCoords(touch);
      touchStartTime = Date.now();
      touchStartCoords = c;
      isLongPress = false;

      self.cursor.style.display = 'block';
      var r = img.getBoundingClientRect();
      self.cursor.style.left = (touch.clientX - r.left) + 'px';
      self.cursor.style.top = (touch.clientY - r.top) + 'px';

      longPressTimer = setTimeout(function () {
        isLongPress = true;
        self.cursor.style.background = 'rgba(0,0,255,0.5)';
        self.cursor.style.borderColor = 'rgba(0,0,255,0.8)';
        var rc = getCoords(touchStartCoords || touch);
        rc.button = 2;
        self.send({ type: 'event', event: { type: 'mousedown', data: rc } });
        self.send({ type: 'event', event: { type: 'mouseup', data: rc } });
        self.send({ type: 'event', event: { type: 'contextmenu', data: rc } });
        setTimeout(function () {
          self.cursor.style.background = 'rgba(255,0,0,0.5)';
          self.cursor.style.borderColor = 'rgba(255,0,0,0.8)';
        }, 200);
      }, 500);

      c.button = 0;
      self.send({ type: 'event', event: { type: 'mousedown', data: c } });
    }, { passive: false });

    img.addEventListener('touchmove', function (e) {
      e.preventDefault();
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }

      var touch = e.touches[0];
      var c = getCoords(touch);

      var r = img.getBoundingClientRect();
      self.cursor.style.left = (touch.clientX - r.left) + 'px';
      self.cursor.style.top = (touch.clientY - r.top) + 'px';

      self.send({ type: 'event', event: { type: 'mousemove', data: c } });
    }, { passive: false });

    img.addEventListener('touchend', function (e) {
      e.preventDefault();
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }

      var touch = e.changedTouches[0];
      var c = getCoords(touch);

      if (!isLongPress) {
        c.button = 0;
        self.send({ type: 'event', event: { type: 'mouseup', data: c } });
        self.send({ type: 'event', event: { type: 'click', data: c } });
      }

      self.cursor.style.display = 'none';
    }, { passive: false });
  }

  _updateStatus(statusEl) {
    if (!statusEl) return;
    var parts = ['已连接'];
    if (this.currentFps > 0) parts.push(this.currentFps + ' FPS');
    if (this.currentBandwidth > 0) parts.push(this.currentBandwidth + ' KB/s');
    statusEl.textContent = parts.join(' · ');
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'bv-stats', fps: this.currentFps, bandwidth: this.currentBandwidth }, '*');
    }
  }

  send(msg) {
    if (this.eventsWs && this.eventsWs.readyState === WebSocket.OPEN) {
      this.eventsWs.send(JSON.stringify(msg));
    }
  }

  navigateTo(url) {
    this.send({ type: 'navigate', data: { url: url } });
  }

  disconnect() {
    if (this.streamWs) this.streamWs.close();
    if (this.eventsWs) this.eventsWs.close();
    if (this.lastBlobUrl) {
      URL.revokeObjectURL(this.lastBlobUrl);
      this.lastBlobUrl = null;
    }
  }

  destroy() {
    this.disconnect();
    if (this.container) this.container.innerHTML = '';
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = BrowserViewer;
} else if (typeof window !== 'undefined') {
  window.BrowserViewer = BrowserViewer;
}
