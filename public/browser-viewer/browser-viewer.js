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
    this._pendingLocalCopy = false;

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

    this.uploadBtn = document.createElement('div');
    this.uploadBtn.textContent = '\uD83D\uDCC1';
    this.uploadBtn.title = '上传文件到远程浏览器';
    this.uploadBtn.style.cssText = 'position:absolute;bottom:60px;right:10px;width:40px;height:40px;border-radius:50%;background:#FF9500;color:white;display:flex;align-items:center;justify-content:center;font-size:18px;cursor:pointer;z-index:9999;box-shadow:0 2px 8px rgba(0,0,0,0.3);user-select:none;';
    this.uploadBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      self._showFileManager();
    });
    if (this.container) {
      this.container.appendChild(this.uploadBtn);
    }

    this.pasteBtn = document.createElement('div');
    this.pasteBtn.style.cssText = 'position:absolute;bottom:108px;right:10px;width:40px;height:40px;border-radius:50%;background:rgba(0,0,0,0.6);color:white;display:flex;align-items:center;justify-content:center;font-size:18px;cursor:pointer;z-index:9999;user-select:none;box-shadow:0 2px 8px rgba(0,0,0,0.3);';
    this.pasteBtn.textContent = '\uD83D\uDCCE';
    this.pasteBtn.title = '粘贴 (Ctrl+V) - 粘贴本地剪贴板内容到远程浏览器';
    this.pasteBtn.addEventListener('click', async function() {
      try {
        var text = await navigator.clipboard.readText();
        if (text) {
          self.send({ type: 'paste', text: text });
          self.pasteBtn.style.background = 'rgba(76,175,80,0.8)';
          setTimeout(function() { self.pasteBtn.style.background = 'rgba(0,0,0,0.6)'; }, 1000);
        }
      } catch(e) {
        console.warn('[BV] Paste failed:', e);
        self.pasteBtn.style.background = 'rgba(255,59,48,0.8)';
        setTimeout(function() { self.pasteBtn.style.background = 'rgba(0,0,0,0.6)'; }, 1000);
      }
    });
    if (this.container) {
      this.container.appendChild(this.pasteBtn);
    }

    this.copyBtn = document.createElement('div');
    this.copyBtn.style.cssText = 'position:absolute;bottom:156px;right:10px;width:40px;height:40px;border-radius:50%;background:rgba(0,0,0,0.6);color:white;display:flex;align-items:center;justify-content:center;font-size:18px;cursor:pointer;z-index:9999;user-select:none;box-shadow:0 2px 8px rgba(0,0,0,0.3);';
    this.copyBtn.textContent = '\uD83D\uDCCB';
    this.copyBtn.title = '复制 (Ctrl+C) - 复制远程浏览器选中内容到本地';
    this.copyBtn.addEventListener('click', function() {
      self.send({ type: 'keydown', key: 'c', ctrlKey: true });
      self.send({ type: 'keyup', key: 'c', ctrlKey: true });
      self.copyBtn.style.background = 'rgba(76,175,80,0.8)';
      setTimeout(function() { self.copyBtn.style.background = 'rgba(0,0,0,0.6)'; }, 1000);
      self._pendingLocalCopy = true;
    });
    if (this.container) {
      this.container.appendChild(this.copyBtn);
    }

    this.tabBar = document.createElement('div');
    this.tabBar.style.cssText = 'position:absolute;top:0;left:0;right:0;background:rgba(0,0,0,0.85);display:flex;align-items:center;overflow-x:auto;z-index:9998;padding:0 4px;height:32px;gap:2px;backdrop-filter:blur(4px);';
    this.tabBar.id = 'bv-tab-bar';
    if (this.container) {
      this.container.style.paddingTop = '32px';
      this.container.appendChild(this.tabBar);
    }
    this._updateTabs([{ id: 'default', title: '当前页面', active: true }]);

    var self = this;

    // --- Notification bell & panel ---
    this._notifBtn = document.createElement('div');
    this._notifBtn.style.cssText = 'position:absolute;top:4px;right:4px;width:28px;height:28px;border-radius:50%;background:rgba(0,0,0,0.6);color:white;display:flex;align-items:center;justify-content:center;font-size:14px;cursor:pointer;z-index:9999;user-select:none;';
    this._notifBtn.textContent = '\uD83D\uDD14';
    this._notifBtn.title = '剪贴板 & 通知';

    this._notifBadge = document.createElement('span');
    this._notifBadge.style.cssText = 'position:absolute;top:-2px;right:-2px;background:#FF3B30;color:white;font-size:10px;min-width:14px;height:14px;border-radius:7px;display:none;align-items:center;justify-content:center;padding:0 3px;line-height:14px;';
    this._notifBtn.appendChild(this._notifBadge);
    if (this.container) this.container.appendChild(this._notifBtn);

    this._notifPanel = document.createElement('div');
    this._notifPanel.style.cssText = 'position:absolute;top:36px;right:4px;width:320px;max-height:300px;background:white;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.2);z-index:10000;display:none;overflow-y:auto;';
    this._notifPanel.innerHTML = '<div style="padding:12px 16px;border-bottom:1px solid #eee;font-size:14px;font-weight:600;">\uD83D\uDCCB 剪贴板 & 通知</div><div id="bv-notif-list" style="padding:8px;"></div>';
    if (this.container) this.container.appendChild(this._notifPanel);

    this._notifCount = 0;
    this._notifications = [];

    this._notifBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      var panel = self._notifPanel;
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
      self._notifCount = 0;
      self._notifBadge.style.display = 'none';
    });

    document.addEventListener('click', function(e) {
      if (!self._notifPanel.contains(e.target) && e.target !== self._notifBtn && !self._notifBtn.contains(e.target)) {
        self._notifPanel.style.display = 'none';
      }
    });

    this._addNotification = function(text) {
      self._notifications.unshift({ text: text, time: new Date().toLocaleTimeString() });
      if (self._notifications.length > 20) self._notifications.pop();
      self._notifCount++;
      self._notifBadge.textContent = self._notifCount;
      self._notifBadge.style.display = 'flex';

      var list = self._notifPanel.querySelector('#bv-notif-list');
      if (list) {
        var item = document.createElement('div');
        item.style.cssText = 'padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:13px;cursor:pointer;';
        item.innerHTML = '<div style="color:#333;word-break:break-all;">' + text.replace(/</g, '&lt;') + '</div><div style="color:#999;font-size:11px;margin-top:2px;">' + new Date().toLocaleTimeString() + ' \u00B7 \u70B9\u51FB\u590D\u5236\u5230\u672C\u5730</div>';
        item.addEventListener('click', function() {
          var pureText = text.replace(/^\uD83D\uDCCB \u590D\u5236: /, '');
          navigator.clipboard.writeText(pureText).then(function() {
            item.style.background = '#e8f8ee';
            var lastDiv = item.querySelector('div:last-child');
            if (lastDiv) lastDiv.textContent = '\u2705 \u5DF2\u590D\u5236\u5230\u672C\u5730';
          });
        });
        list.insertBefore(item, list.firstChild);
      }
    };

    this._tabPollInterval = setInterval(function() {
      if (self.eventsWs && self.eventsWs.readyState === 1) {
        self.send({ type: 'tab', action: 'list' });
      }
    }, 5000);

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

      var uploadMbBtn = document.createElement('button');
      uploadMbBtn.textContent = '\uD83D\uDCC1';
      uploadMbBtn.title = '上传文件';
      uploadMbBtn.style.cssText = 'width:36px;height:36px;border:none;border-radius:8px;background:rgba(255,149,0,0.7);color:white;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;';
      uploadMbBtn.onclick = function(e) {
        e.stopPropagation();
        self._showFileManager();
      };

      var copyMbBtn = document.createElement('button');
      copyMbBtn.textContent = '\uD83D\uDCCB';
      copyMbBtn.title = '复制到本地';
      copyMbBtn.style.cssText = 'width:36px;height:36px;border:none;border-radius:8px;background:rgba(255,255,255,0.15);color:white;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;';
      copyMbBtn.onclick = function() {
        self.send({ type: 'keydown', key: 'c', ctrlKey: true });
        self.send({ type: 'keyup', key: 'c', ctrlKey: true });
        self._pendingLocalCopy = true;
      };

      var pasteMbBtn = document.createElement('button');
      pasteMbBtn.textContent = '\uD83D\uDCCE';
      pasteMbBtn.title = '粘贴到远程';
      pasteMbBtn.style.cssText = 'width:36px;height:36px;border:none;border-radius:8px;background:rgba(255,255,255,0.15);color:white;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;';
      pasteMbBtn.onclick = async function() {
        try {
          var t = await navigator.clipboard.readText();
          if (t) self.send({ type: 'paste', text: t });
        } catch(e) { console.warn('[BV] paste:', e); }
      };

      mobileBar.appendChild(backBtn);
      mobileBar.appendChild(fwdBtn);
      mobileBar.appendChild(homeBtn);
      mobileBar.appendChild(uploadMbBtn);
      mobileBar.appendChild(copyMbBtn);
      mobileBar.appendChild(pasteMbBtn);
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

  showUploadModal() {
    if (this._uploadModal) { this._uploadModal.style.display = 'flex'; return; }
    var self = this;
    var modal = document.createElement('div');
    modal.id = 'bv-upload-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:99999;display:flex;justify-content:center;align-items:center;padding:16px;';

    modal.innerHTML =
      '<div style="background:white;border-radius:16px;padding:24px;width:380px;max-width:95vw;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">' +
          '<h3 style="font-size:18px;margin:0;color:#1e293b;">\uD83D\uDCC1 上传文件到远程浏览器</h3>' +
          '<button id="bv-upload-close" style="background:none;border:none;font-size:24px;color:#999;cursor:pointer;line-height:1;padding:4px;">&times;</button>' +
        '</div>' +
        '<div id="bv-upload-dropzone" style="border:2px dashed #cbd5e1;border-radius:12px;padding:30px;text-align:center;cursor:pointer;transition:border-color 0.2s;">' +
          '<div style="font-size:36px;margin-bottom:8px;">\uD83D\uDCC4</div>' +
          '<div style="color:#64748b;font-size:14px;">点击选择或拖拽文件到这里</div>' +
          '<div style="color:#94a3b8;font-size:12px;margin-top:4px;">支持图片、文档、视频等常见格式</div>' +
          '<input type="file" id="bv-upload-input" multiple accept=".txt,.jpg,.jpeg,.png,.gif,.webp,.pdf,.csv,.json,.doc,.docx,.xls,.xlsx,.mp4,.mp3,.zip,.html,.css,.js" style="display:none;">' +
        '</div>' +
        '<div id="bv-upload-preview" style="max-height:150px;overflow-y:auto;margin-top:12px;"></div>' +
        '<div id="bv-upload-status" style="margin-top:12px;font-size:13px;display:none;padding:8px 10px;border-radius:8px;"></div>' +
        '<div style="display:flex;gap:10px;margin-top:16px;">' +
          '<button id="bv-upload-confirm" style="flex:1;padding:12px;background:#007AFF;color:white;border:none;border-radius:10px;font-size:15px;cursor:pointer;font-weight:600;display:none;">\u2705 确认上传</button>' +
          '<button id="bv-upload-cancel" style="padding:12px;background:#f1f5f9;color:#475569;border:none;border-radius:10px;font-size:15px;cursor:pointer;">取消</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(modal);
    this._uploadModal = modal;

    var dropzone = modal.querySelector('#bv-upload-dropzone');
    var input = modal.querySelector('#bv-upload-input');
    var preview = modal.querySelector('#bv-upload-preview');
    var confirmBtn = modal.querySelector('#bv-upload-confirm');
    var cancelBtn = modal.querySelector('#bv-upload-cancel');
    var statusEl = modal.querySelector('#bv-upload-status');
    var closeBtn = modal.querySelector('#bv-upload-close');
    var pendingFiles = null;

    closeBtn.addEventListener('click', function() { modal.style.display = 'none'; });
    cancelBtn.addEventListener('click', function() { modal.style.display = 'none'; });

    dropzone.addEventListener('dragover', function(e) { e.preventDefault(); dropzone.style.borderColor = '#007AFF'; });
    dropzone.addEventListener('dragleave', function() { dropzone.style.borderColor = '#cbd5e1'; });
    dropzone.addEventListener('drop', function(e) {
      e.preventDefault();
      dropzone.style.borderColor = '#cbd5e1';
      handleFiles(e.dataTransfer.files);
    });
    input.addEventListener('change', function() { handleFiles(this.files); });

    function handleFiles(files) {
      if (!files || !files.length) return;
      pendingFiles = files;
      preview.innerHTML = '';
      for (var i = 0; i < files.length; i++) {
        var f = files[i];
        var ext = f.name.split('.').pop().toLowerCase();
        var icon = ['jpg','jpeg','png','gif','webp'].includes(ext) ? '\uD83D\uDCF7' : ext === 'pdf' ? '\uD83D\uDCD5' : ext === 'mp4' || ext === 'mp3' ? '\uD83C\uDFA5' : ext === 'zip' ? '\uD83D\uDC86' : '\uD83D\uDCC4';
        var size = f.size < 1024 ? f.size+'B' : f.size<1048576 ? (f.size/1024).toFixed(1)+'KB' : (f.size/1048576).toFixed(1)+'MB';
        preview.innerHTML += '<div style="display:flex;align-items:center;gap:8px;padding:8px;background:#f8fafc;border-radius:8px;margin-bottom:6px;font-size:13px;"><span style="font-size:18px;">'+icon+'</span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#1e293b;">'+f.name+'</span><span style="color:#94a3b8;font-size:11px;shrink:0;">'+size+'</span></div>';
      }
      confirmBtn.style.display = 'block';
    }

    window.__bvUploadConfirm = async function() {
      if (!pendingFiles || !pendingFiles.length) return;

      statusEl.style.display = 'block';
      statusEl.style.background = '#eff6ff';
      statusEl.style.color = '#007AFF';
      statusEl.textContent = '\u23F3 正在上传...';
      confirmBtn.disabled = true;
      confirmBtn.textContent = '上传中...';
      confirmBtn.style.opacity = '0.6';

      try {
        for (var i = 0; i < pendingFiles.length; i++) {
          var f = pendingFiles[i];
          statusEl.textContent = '\u23F3 ('+(i+1)+'/'+pendingFiles.length+') '+f.name;

          var formData = new FormData();
          formData.append('file', f, f.name);
          formData.append('sessionId', self.sessionId);

          var resp = await fetch('/api/files/upload-session', {
            method: 'POST',
            headers: { 'x-api-key': self.token },
            body: formData
          });
          var data = await resp.json();
          if (!resp.ok || !data.success) throw new Error(data.message || data.error || '上传失败');

          statusEl.textContent = '\u23F3 注入文件到远程浏览器...';
          var selectors = ['input[type="file"]', '#fileInput', 'input[accept]'];
          var injSuccess = false;
          var lastError = '';
          for (var si = 0; si < selectors.length; si++) {
            var injResp = await fetch('/api/sessions/' + self.sessionId + '/inject-file', {
              method: 'POST',
              headers: { 'x-api-key': self.token, 'content-type': 'application/json' },
              body: JSON.stringify({ machineFilePath: data.data.machineFilePath, selector: selectors[si] })
            });
            var injData = await injResp.json();
            if (injResp.ok && injData.data && injData.data.success) {
              injSuccess = true;
              break;
            }
            lastError = injData.message || injData.error || '注入失败';
          }
          if (!injSuccess) throw new Error(lastError);
        }

        statusEl.style.background = '#f0fdf4';
        statusEl.style.color = '#16a34a';
        statusEl.textContent = '\u2705 全部上传并注入成功！';

        setTimeout(function() {
          modal.style.display = 'none';
          pendingFiles = null;
          preview.innerHTML = '';
          confirmBtn.style.display = 'none';
          confirmBtn.disabled = false;
          confirmBtn.textContent = '\u2705 确认上传';
          confirmBtn.style.opacity = '1';
          statusEl.style.display = 'none';
        }, 2000);

      } catch(err) {
        statusEl.style.background = '#fef2f2';
        statusEl.style.color = '#dc2626';
        statusEl.textContent = '\u274C ' + err.message;
        confirmBtn.disabled = false;
        confirmBtn.textContent = '\u2705 确认上传';
        confirmBtn.style.opacity = '1';
      }
    };

    confirmBtn.addEventListener('click', window.__bvUploadConfirm);
  }

  _showFileManager() {
    if (this._fmModal) { this._fmModal.style.display = 'flex'; this._fmRefreshList(); return; }
    var self = this;

    var modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;';
    modal.innerHTML =
      '<div style="background:#1e1e2e;border-radius:16px;width:90%;max-width:600px;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,0.5);color:#fff;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.1);flex-shrink:0;">' +
          '<span style="font-size:16px;font-weight:600;">\uD83D\uDCC1 文件管理器</span>' +
          '<span id="bv-fm-close" style="font-size:22px;cursor:pointer;color:rgba(255,255,255,0.6);line-height:1;">&times;</span>' +
        '</div>' +
        '<div style="flex:1;overflow-y:auto;padding:16px;">' +
          '<div id="bv-fm-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:12px;"></div>' +
        '</div>' +
        '<div style="display:flex;justify-content:flex-end;gap:10px;padding:12px 20px;border-top:1px solid rgba(255,255,255,0.1);flex-shrink:0;">' +
          '<button id="bv-fm-cancel" style="padding:8px 20px;border:none;border-radius:8px;background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.7);font-size:13px;cursor:pointer;">取消</button>' +
          '<button id="bv-fm-inject" style="padding:8px 20px;border:none;border-radius:8px;background:#4caf50;color:white;font-size:13px;cursor:pointer;font-weight:600;opacity:0.4;pointer-events:none;">选择并注入</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);
    this._fmModal = modal;

    var grid = modal.querySelector('#bv-fm-grid');
    var injectBtn = modal.querySelector('#bv-fm-inject');
    var closeBtn = modal.querySelector('#bv-fm-close');
    var cancelBtn = modal.querySelector('#bv-fm-cancel');

    closeBtn.addEventListener('click', function() { modal.style.display = 'none'; });
    cancelBtn.addEventListener('click', function() { modal.style.display = 'none'; });

    this._fmGrid = grid;
    this._fmInjectBtn = injectBtn;
    this._fmSelected = null;

    var fmInput = document.createElement('input');
    fmInput.type = 'file';
    fmInput.multiple = true;
    fmInput.style.display = 'none';
    fmInput.addEventListener('change', function() { self._fmUploadHandler(this.files); });
    document.body.appendChild(fmInput);
    this._fmInput = fmInput;

    injectBtn.addEventListener('click', async function() {
      var filePath = self._fmSelected;
      if (!filePath) return;
      injectBtn.textContent = '注入中...';
      injectBtn.style.opacity = '0.6';
      injectBtn.style.pointerEvents = 'none';
      var selectors = ['input[type="file"]', '#fileInput', 'input[accept]'];
      var success = false;
      for (var si = 0; si < selectors.length; si++) {
        try {
          var r = await fetch('/api/sessions/' + self.sessionId + '/inject-file', {
            method: 'POST',
            headers: { 'x-api-key': self.token, 'content-type': 'application/json' },
            body: JSON.stringify({ machineFilePath: filePath, selector: selectors[si] })
          });
          var d = await r.json();
          if (r.ok && d.data && d.data.success) { success = true; break; }
        } catch(e) {}
      }
      if (success) {
        injectBtn.textContent = '\u2705 注入成功';
        setTimeout(function() { modal.style.display = 'none'; }, 800);
      } else {
        injectBtn.textContent = '\u274C 注入失败';
        injectBtn.style.opacity = '1';
        injectBtn.style.pointerEvents = 'auto';
      }
    });

    var uploadCard = document.createElement('div');
    uploadCard.style.cssText = 'background:#2a2a3e;border-radius:8px;padding:12px;text-align:center;cursor:pointer;transition:all 0.2s;border:2px dashed rgba(255,255,255,0.2);display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100px;';
    uploadCard.innerHTML = '<div style="font-size:24px;margin-bottom:6px;">＋</div><div style="font-size:11px;color:rgba(255,255,255,0.5);">上传文件</div>';
    uploadCard.addEventListener('click', function() { self._fmUploadNew(); });
    grid.appendChild(uploadCard);

    this._fmRefreshList();
  }

  _fmRefreshList() {
    var self = this;
    var grid = this._fmGrid;
    while (grid.children.length > 1) {
      grid.removeChild(grid.lastChild);
    }
    self._fmSelected = null;
    self._fmInjectBtn.style.opacity = '0.4';
    self._fmInjectBtn.style.pointerEvents = 'none';
    self._fmInjectBtn.textContent = '选择并注入';

    if (!self.eventsWs || self.eventsWs.readyState !== WebSocket.OPEN) {
      var empty = document.createElement('div');
      empty.style.cssText = 'grid-column:1/-1;text-align:center;padding:40px 16px;color:rgba(255,255,255,0.4);font-size:13px;';
      empty.textContent = '暂无文件，点击"＋"上传';
      grid.appendChild(empty);
      return;
    }

    self._fmListCallback = function(files) {
      if (files.length === 0) {
        var empty = document.createElement('div');
        empty.style.cssText = 'grid-column:1/-1;text-align:center;padding:40px 16px;color:rgba(255,255,255,0.4);font-size:13px;';
        empty.textContent = '暂无文件，点击"＋"上传';
        grid.appendChild(empty);
      } else {
        files.forEach(function(f) { self._fmAddCard(f); });
      }
    };

    self.send({ type: 'fileList' });
  }

  _fmAddCard(file) {
    var self = this;
    var card = document.createElement('div');
    card.style.cssText = 'background:#2a2a3e;border-radius:8px;padding:12px;text-align:center;cursor:pointer;transition:all 0.2s;border:2px solid transparent;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100px;';
    var fileName = file.fileName || file.name || '未知';
    var filePath = file.machineFilePath || file.path || file.url || '';
    var ext = fileName.split('.').pop().toLowerCase();
    var icon = ['jpg','jpeg','png','gif','webp','svg'].includes(ext) ? '\uD83D\uDDBC\uFE0F' : ['mp4','webm','mov'].includes(ext) ? '\uD83C\uDFA5' : ['pdf'].includes(ext) ? '\uD83D\uDCD5' : '\uD83D\uDCC4';
    var size = file.size || file.fileSize || 0;
    var sizeStr = size < 1024 ? size+'B' : size < 1048576 ? (size/1024).toFixed(1)+'KB' : (size/1048576).toFixed(1)+'MB';
    card.innerHTML = '<div style="font-size:28px;margin-bottom:4px;line-height:1.2;">'+icon+'</div><div style="font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:rgba(255,255,255,0.8);max-width:76px;">'+fileName+'</div><div style="font-size:10px;color:rgba(255,255,255,0.4);margin-top:2px;">'+sizeStr+'</div>';
    card.dataset.fmPath = filePath;
    card.addEventListener('click', function() {
      var cards = self._fmGrid.querySelectorAll('[data-fm-path]');
      cards.forEach(function(c) { c.style.borderColor = 'transparent'; c.style.background = '#2a2a3e'; });
      card.style.borderColor = '#4caf50';
      card.style.background = '#1a3a2e';
      self._fmSelected = filePath;
      self._fmInjectBtn.style.opacity = '1';
      self._fmInjectBtn.style.pointerEvents = 'auto';
      self._fmInjectBtn.textContent = '选择并注入: ' + fileName;
    });
    card.addEventListener('mouseenter', function() {
      if (card.style.borderColor !== '#4caf50') card.style.borderColor = '#7b68ee';
    });
    card.addEventListener('mouseleave', function() {
      if (card.style.borderColor !== '#4caf50') card.style.borderColor = 'transparent';
    });
    this._fmGrid.appendChild(card);
  }

  _fmUploadNew() {
    if (this._fmInput) { this._fmInput.value = ''; this._fmInput.click(); }
  }

  _fmUploadHandler(files) {
    if (!files || !files.length) return;
    var self = this;
    var grid = this._fmGrid;
    var statusEl = document.createElement('div');
    statusEl.style.cssText = 'grid-column:1/-1;text-align:center;padding:20px;color:rgba(255,255,255,0.6);font-size:13px;';
    statusEl.textContent = '\u23F3 上传中...';
    grid.appendChild(statusEl);

    var pending = [];
    for (var i = 0; i < files.length; i++) {
      (function(file) {
        var fd = new FormData();
        fd.append('file', file);
        fd.append('sessionId', self.sessionId);
        pending.push(
          fetch('/api/files/upload-session', {
            method: 'POST',
            headers: { 'x-api-key': self.token },
            body: fd
          }).then(function(r) {
            if (!r.ok) throw new Error('Upload failed');
            return r.json();
          })
        );
      })(files[i]);
    }

    Promise.all(pending)
    .then(function() {
      statusEl.textContent = '\u2705 上传完成';
      self._fmRefreshList();
    })
    .catch(function(err) {
      statusEl.textContent = '\u274C ' + (err.message || '上传失败');
      statusEl.style.color = '#ef4444';
      setTimeout(function() { if (statusEl.parentNode) statusEl.parentNode.removeChild(statusEl); }, 3000);
    });
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
        } else if (msg.type === 'tabList') {
          if (msg.tabs && msg.tabs.length > 0) {
            self._updateTabs(msg.tabs);
          }
        } else if (msg.type === 'clipboard') {
          var clipText = (msg.event && msg.event.text) || (msg.data && msg.data.text) || '';
          if (clipText) {
            self._addNotification('\uD83D\uDCCB \u590D\u5236: ' + clipText.substring(0, 100));
            if (self._pendingLocalCopy) {
              self._pendingLocalCopy = false;
              navigator.clipboard.writeText(clipText).then(function() {
                if (self.copyBtn) {
                  self.copyBtn.style.background = 'rgba(76,175,80,0.8)';
                  self.copyBtn.textContent = '\u2705';
                  setTimeout(function() {
                    if (self.copyBtn) {
                      self.copyBtn.style.background = 'rgba(0,0,0,0.6)';
                      self.copyBtn.textContent = '\uD83D\uDCCB';
                    }
                  }, 1500);
                }
              });
            }
          }
        } else if (msg.type === 'filechooser') {
          self._showFileManager();
        } else if (msg.type === 'response' && msg.requestType === 'fileList') {
          if (self._fmListCallback) {
            self._fmListCallback(msg.data && msg.data.files ? msg.data.files : []);
            self._fmListCallback = null;
          }
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
      self.send({ type: 'event', event: { type: 'keydown', data: { 
        key: e.key, 
        code: e.code,
        ctrlKey: e.ctrlKey || e.metaKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey
      } } });
      if (['Tab', 'Backspace', 'F5'].includes(e.key)) e.preventDefault();
    });

    document.addEventListener('keyup', function (e) {
      self.send({ type: 'event', event: { type: 'keyup', data: { 
        key: e.key, 
        code: e.code,
        ctrlKey: e.ctrlKey || e.metaKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey
      } } });
    });

    // === Touch events ===
    var touchStartTime = 0;
    var touchStartCoords = null;
    var longPressTimer = null;
    var isLongPress = false;
    var lastTouch1 = null;
    var lastTouch2 = null;

    img.addEventListener('touchstart', function (e) {
      e.preventDefault();
      var touch = e.touches[0];
      var c = getCoords(touch);
      touchStartTime = Date.now();
      touchStartCoords = c;
      isLongPress = false;

      if (e.touches.length >= 2) {
        lastTouch1 = e.touches[0];
        lastTouch2 = e.touches[1];
      }

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

      if (e.touches.length === 2 && lastTouch1 && lastTouch2) {
        var t1 = e.touches[0];
        var t2 = e.touches[1];
        var prevDist = Math.hypot(lastTouch1.clientX - lastTouch2.clientX, lastTouch1.clientY - lastTouch2.clientY);
        var currDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        var deltaY = (prevDist - currDist) * 2;
        var prevMidX = (lastTouch1.clientX + lastTouch2.clientX) / 2;
        var prevMidY = (lastTouch1.clientY + lastTouch2.clientY) / 2;
        var currMidX = (t1.clientX + t2.clientX) / 2;
        var currMidY = (t1.clientY + t2.clientY) / 2;
        var deltaX = (currMidX - prevMidX) * 2;
        self.send({ type: 'event', event: { type: 'wheel', data: { deltaX: Math.round(deltaX), deltaY: Math.round(deltaY) } } });
        lastTouch1 = t1;
        lastTouch2 = t2;
        return;
      }

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

      if (!isLongPress && touchStartCoords) {
        var dx = c.x - touchStartCoords.x;
        var dy = c.y - touchStartCoords.y;
        var dt = Date.now() - touchStartTime;
        var velocity = Math.sqrt(dx * dx + dy * dy) / (dt || 1);

        if (velocity > 0.5 && Math.abs(dy) > 30) {
          self.send({ type: 'event', event: { type: 'wheel', data: { deltaX: Math.round(dx * 3), deltaY: Math.round(dy * 3) } } });
        } else {
          c.button = 0;
          self.send({ type: 'event', event: { type: 'mouseup', data: c } });
          self.send({ type: 'event', event: { type: 'click', data: c } });
        }
      } else if (!isLongPress) {
        c.button = 0;
        self.send({ type: 'event', event: { type: 'mouseup', data: c } });
        self.send({ type: 'event', event: { type: 'click', data: c } });
      }

      self.cursor.style.display = 'none';
      lastTouch1 = null;
      lastTouch2 = null;
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

  _updateTabs(tabs) {
    if (!this.tabBar) return;
    var self = this;
    this.tabBar.innerHTML = '';
    tabs.forEach(function(tab) {
      var el = document.createElement('div');
      el.style.cssText = 'padding:4px 12px;border-radius:6px;font-size:12px;cursor:pointer;white-space:nowrap;max-width:120px;overflow:hidden;text-overflow:ellipsis;flex-shrink:0;' +
        (tab.active ? 'background:rgba(255,255,255,0.2);color:white;' : 'color:rgba(255,255,255,0.6);');
      el.textContent = tab.title || tab.url || '新标签';
      el.title = tab.url || '';
      el.addEventListener('click', function() {
        self.send({ type: 'tab', action: 'switch', tabId: tab.id });
      });
      if (tabs.length > 1) {
        var closeBtn = document.createElement('span');
        closeBtn.textContent = ' ×';
        closeBtn.style.cssText = 'margin-left:4px;color:rgba(255,255,255,0.4);cursor:pointer;';
        closeBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          self.send({ type: 'tab', action: 'close', tabId: tab.id });
        });
        el.appendChild(closeBtn);
      }
      self.tabBar.appendChild(el);
    });
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
    if (this._tabPollInterval) {
      clearInterval(this._tabPollInterval);
      this._tabPollInterval = null;
    }
    if (this._notifPanel) {
      this._notifPanel.style.display = 'none';
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
