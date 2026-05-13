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
    this.cursorOffset = /Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent) ? 40 : 0;
    this._frameCount = 0;
    this._reconnectAttempts = 0;
    this._maxReconnectAttempts = 3;

    this.loadingIndicator = document.createElement('div');
    this.loadingIndicator.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;color:#666;font-size:14px;z-index:10;pointer-events:none;';
    this.loadingIndicator.innerHTML = '<div style="font-size:32px;margin-bottom:8px;">⏳</div><div>正在连接远程浏览器...</div>';

    this.errorIndicator = document.createElement('div');
    this.errorIndicator.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;padding:24px;background:white;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,0.15);z-index:20;display:none;width:80%;max-width:320px;';
    this.errorIndicator.innerHTML = '<div style="font-size:40px;margin-bottom:8px;">😵</div><div id="error-text" style="font-size:15px;color:#333;margin-bottom:12px;">连接失败</div><button onclick="location.reload()" style="padding:10px 24px;background:#007AFF;color:white;border:none;border-radius:8px;font-size:14px;cursor:pointer;">重新连接</button>';

    this.hiddenInput = document.createElement('textarea');
    this.hiddenInput.style.cssText = 'position:fixed;top:-100px;left:-100px;width:1px;height:1px;opacity:0.01;font-size:16px;border:none;outline:none;resize:none;';
    this.hiddenInput.setAttribute('autocomplete', 'off');
    this.hiddenInput.setAttribute('autocorrect', 'off');
    this.hiddenInput.setAttribute('autocapitalize', 'off');
    this.hiddenInput.setAttribute('spellcheck', 'false');
    document.body.appendChild(this.hiddenInput);

    var self = this;
    var isComposing = false;
    var lastInputValue = '';

    this.hiddenInput.addEventListener('compositionstart', function() {
      isComposing = true;
    });

    this.hiddenInput.addEventListener('compositionend', function(e) {
      isComposing = false;
      var composedText = e.data || '';
      if (composedText) {
        self.send({ type: 'event', event: { type: 'input', data: { value: composedText } } });
      }
      setTimeout(function() { self.hiddenInput.value = ''; lastInputValue = ''; }, 50);
    });

    this.hiddenInput.addEventListener('input', function(e) {
      if (isComposing) return;
      var newValue = self.hiddenInput.value;
      if (newValue.length > lastInputValue.length) {
        var addedText = newValue.substring(lastInputValue.length);
        for (var i = 0; i < addedText.length; i++) {
          var ch = addedText[i];
          self.send({ type: 'event', event: { type: 'keydown', data: { key: ch, code: 'Key' + ch.toUpperCase() } } });
          self.send({ type: 'event', event: { type: 'keyup', data: { key: ch, code: 'Key' + ch.toUpperCase() } } });
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
  }

  mount() {
    this.container = document.getElementById(this.containerId);
    if (!this.container) throw new Error('#' + this.containerId + ' not found');

    this.container.innerHTML =
      '<div style="width:100%;height:100%;position:relative;background:#000;">' +
        '<img id="bv-screen" alt="远程浏览器画面" crossOrigin="anonymous" draggable="false" style="width:100%;height:100%;object-fit:contain;display:block;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;touch-action:none;pointer-events:auto;" />' +
        '<div id="bv-status" style="position:absolute;top:10px;left:10px;color:#fff;font-size:12px;z-index:10;font-family:system-ui,-apple-system,sans-serif;background:rgba(0,0,0,0.5);padding:2px 8px;border-radius:4px;">连接中...</div>' +
      '</div>';
    this.img = this.container.querySelector('#bv-screen');
    this.img.draggable = false;
    if (this.container) {
      this.container.appendChild(this.loadingIndicator);
      this.container.appendChild(this.errorIndicator);
    }
    this.img.style.userSelect = 'none';
    this.img.style.webkitUserSelect = 'none';
    this.img.style.webkitTouchCallout = 'none';
    this.img.style.touchAction = 'none';
    var imgEl = this.img;
    imgEl.addEventListener('dragstart', function(e) { e.preventDefault(); });
    imgEl.addEventListener('selectstart', function(e) { e.preventDefault(); });
    imgEl.addEventListener('contextmenu', function(e) { e.preventDefault(); });
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

    var isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
    if (isMobile && this.container) {
      var mobileBar = document.createElement('div');
      mobileBar.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:rgba(0,0,0,0.92);padding:8px 12px;display:flex;gap:6px;align-items:center;z-index:10000;backdrop-filter:blur(10px);';

      var urlInput = document.createElement('input');
      urlInput.type = 'url';
      urlInput.placeholder = '输入网址...';
      urlInput.style.cssText = 'flex:1;padding:8px 12px;border:1px solid rgba(255,255,255,0.2);border-radius:8px;background:rgba(255,255,255,0.1);color:white;font-size:14px;outline:none;';
      var navigateForm = document.createElement('form');
      navigateForm.style.cssText = 'flex:1;display:flex;margin:0;padding:0;';
      navigateForm.addEventListener('submit', function(e) {
        e.preventDefault();
        var url = urlInput.value.trim();
        if (!url) return;
        if (!url.startsWith('http')) url = 'http://' + url;
        self.send({ type: 'navigate', data: { url: url } });
        urlInput.blur();
      });
      navigateForm.appendChild(urlInput);

      var backBtn = document.createElement('button');
      backBtn.textContent = '\u2190';
      backBtn.style.cssText = 'width:36px;height:36px;border:none;border-radius:8px;background:rgba(255,255,255,0.15);color:white;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;';
      backBtn.onclick = function() { self.send({ type: 'navigate', data: { action: 'goBack' } }); };

      var fwdBtn = document.createElement('button');
      fwdBtn.textContent = '\u2192';
      fwdBtn.style.cssText = backBtn.style.cssText;
      fwdBtn.onclick = function() { self.send({ type: 'navigate', data: { action: 'goForward' } }); };

      var homeBtn = document.createElement('button');
      homeBtn.textContent = '\uD83C\uDFE0';
      homeBtn.style.cssText = backBtn.style.cssText;
      homeBtn.onclick = function() {
        urlInput.value = '';
        self.send({ type: 'navigate', data: { url: 'https://www.baidu.com' } });
      };

      mobileBar.appendChild(backBtn);
      mobileBar.appendChild(fwdBtn);
      mobileBar.appendChild(homeBtn);
      mobileBar.appendChild(navigateForm);
      document.body.appendChild(mobileBar);

      var topBar = document.createElement('div');
      topBar.style.cssText = 'position:fixed;top:0;left:0;right:0;background:rgba(0,0,0,0.7);padding:6px 12px;display:flex;justify-content:space-between;align-items:center;z-index:10000;font-size:12px;color:white;backdrop-filter:blur(10px);';

      var statusText = document.createElement('span');
      statusText.textContent = '连接中...';
      statusText.style.color = '#fbbf24';

      var backToDemo = document.createElement('a');
      backToDemo.href = '/demo';
      backToDemo.textContent = '返回 Demo';
      backToDemo.style.cssText = 'color:#60a5fa;text-decoration:none;font-weight:600;';

      topBar.appendChild(statusText);
      topBar.appendChild(backToDemo);
      document.body.appendChild(topBar);

      this._mobileStatus = statusText;

      this.container.style.marginTop = '30px';
      this.container.style.marginBottom = '52px';
      this.container.style.height = (window.innerHeight - 82) + 'px';
    }

    return this;
  }

  _connectStream() {
    var wsBase = this.protocol + '//' + this.wsHost;
    var statusEl = this.container.querySelector('#bv-status');
    var self = this;

    var tokenQuery = this.token ? '?token=' + encodeURIComponent(this.token) : '';
    this.streamWs = new WebSocket(wsBase + '/ws/' + this.sessionId + '/stream' + tokenQuery);
    this.streamWs.binaryType = 'arraybuffer';

    this.streamWs.onmessage = function (e) {
      if (e.data instanceof ArrayBuffer) {
        self.frameCount++;
        self._frameCount++;
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
      if (self.loadingIndicator) {
        self.loadingIndicator.style.display = 'none';
      }
      if (self._mobileStatus) {
        self._mobileStatus.textContent = '已连接';
        self._mobileStatus.style.color = '#4ade80';
      }
    };
    this.streamWs.onerror = function (e) {
      statusEl.textContent = 'Stream 错误';
      console.error('[BV] stream ws error', e);
      if (self.errorIndicator && self._frameCount === 0) {
        self.errorIndicator.style.display = 'block';
        var errorText = self.errorIndicator.querySelector('#error-text');
        if (errorText) errorText.textContent = '连接失败，请检查网络';
      }
      if (self.loadingIndicator) { self.loadingIndicator.style.display = 'none'; }
    };
    this.streamWs.onclose = function (e) {
      statusEl.textContent = 'Stream 断开 (' + e.code + ')';
      console.log('[BV] stream ws close', e.code, e.reason);
      if (self.loadingIndicator) { self.loadingIndicator.style.display = 'none'; }

      if (!self._frameCount && self._reconnectAttempts < self._maxReconnectAttempts) {
        self._reconnectAttempts++;
        if (self.errorIndicator) {
          self.errorIndicator.style.display = 'block';
          var et = self.errorIndicator.querySelector('#error-text');
          if (et) et.textContent = '连接失败，' + (self._maxReconnectAttempts - self._reconnectAttempts + 1) + ' 秒后自动重试... (' + (e.code || '?') + ')';
        }
        setTimeout(function() {
          self._connectStream();
        }, 2000 * self._reconnectAttempts);
      } else if (self.errorIndicator && self._frameCount === 0) {
        self.errorIndicator.style.display = 'block';
        var errText = self.errorIndicator.querySelector('#error-text');
        if (errText) errText.textContent = e.code === 1006 ? '网络断开，请检查连接' : e.code === 1005 ? '协议版本不支持' : '连接失败 (' + (e.code || '?') + ')';
      }
    };
  }

  connect() {
    if (!this.container) this.mount();

    this._connectStream();

    var wsBase = this.protocol + '//' + this.wsHost;
    var statusEl = this.container.querySelector('#bv-status');
    var self = this;

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
      self.cursor.style.top = (e.clientY - img.getBoundingClientRect().top - self.cursorOffset) + 'px';
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
      self.cursor.style.top = (touch.clientY - r.top - self.cursorOffset) + 'px';

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
      self.cursor.style.top = (touch.clientY - r.top - self.cursorOffset) + 'px';

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
    if (this._mobileStatus) {
      this._mobileStatus.textContent = '已连接 · ' + this.currentFps + ' FPS';
    }
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
