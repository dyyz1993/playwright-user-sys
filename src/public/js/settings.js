// 系统设置页面的 JavaScript

// 当文档加载完成时执行
document.addEventListener('DOMContentLoaded', function() {
  // 初始化设置功能
  initSettingsFunctions();
});

// 初始化设置功能
function initSettingsFunctions() {
  // IP 地址限制切换
  const ipRestrictionCheckbox = document.getElementById('ip-restriction');
  const ipWhitelistContainer = document.getElementById('ip-whitelist-container');
  
  if (ipRestrictionCheckbox && ipWhitelistContainer) {
    ipRestrictionCheckbox.addEventListener('change', function() {
      if (this.checked) {
        ipWhitelistContainer.classList.remove('hidden');
      } else {
        ipWhitelistContainer.classList.add('hidden');
      }
    });
  }
  
  // 清理日志模态框
  const clearLogsBtn = document.getElementById('clear-logs-btn');
  const clearLogsModal = document.getElementById('clear-logs-modal');
  const closeLogsModal = document.getElementById('close-logs-modal');
  const cancelClearLogs = document.getElementById('cancel-clear-logs');
  const confirmClearLogs = document.getElementById('confirm-clear-logs');
  
  if (clearLogsBtn && clearLogsModal) {
    clearLogsBtn.addEventListener('click', function() {
      clearLogsModal.classList.remove('hidden');
    });
    
    closeLogsModal?.addEventListener('click', function() {
      clearLogsModal.classList.add('hidden');
    });
    
    cancelClearLogs?.addEventListener('click', function() {
      clearLogsModal.classList.add('hidden');
    });
    
    confirmClearLogs?.addEventListener('click', function() {
      clearOldLogs();
    });
    
    // 点击模态框背景关闭模态框
    clearLogsModal.addEventListener('click', function(e) {
      if (e.target === this) {
        this.classList.add('hidden');
      }
    });
  }
  
  // 备份数据库
  const backupBtn = document.getElementById('backup-btn');
  
  if (backupBtn) {
    backupBtn.addEventListener('click', function() {
      backupDatabase();
    });
  }
  
  // 设置表单提交
  const settingsForm = document.getElementById('settings-form');
  
  if (settingsForm) {
    settingsForm.addEventListener('submit', function(e) {
      e.preventDefault();
      saveSettings(this);
    });
  }
}

// 清理旧日志
function clearOldLogs() {
  var confirmButton = document.getElementById('confirm-clear-logs');
  var originalText = window.appUtils.Loading.setButtonLoading(confirmButton);

  window.appUtils.API.post('/api/admin/logs/clear')
    .then(function(data) {
      if (data.success) {
        var clearLogsModal = document.getElementById('clear-logs-modal');
        clearLogsModal.classList.add('hidden');
        window.appUtils.Toast.success('\u65e7\u65e5\u5fd7\u5df2\u6210\u529f\u6e05\u7406');
        window.appUtils.Loading.restoreButton(confirmButton, originalText);
      } else {
        window.appUtils.Loading.restoreButton(confirmButton, originalText);
        window.appUtils.Toast.error('\u6e05\u7406\u65e5\u5fd7\u5931\u8d25: ' + data.message);
      }
    })
    .catch(function(error) {
      window.appUtils.Loading.restoreButton(confirmButton, originalText);
      window.appUtils.Toast.error('\u6e05\u7406\u65e5\u5fd7\u5931\u8d25: ' + error.message);
    });
}

// 备份数据库
function backupDatabase() {
  // 显示加载状态
  const backupBtn = document.getElementById('backup-btn');
  const originalText = backupBtn.innerHTML;
  backupBtn.innerHTML = '<div class="spinner inline-block mr-2"></div> 处理中...';
  backupBtn.disabled = true;
  
  // 发送请求备份数据库
  fetch('/api/admin/backup', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  })
  .then(response => {
    if (response.ok) {
      return response.blob().then(blob => {
        // 创建下载链接
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        
        // 获取当前日期作为文件名
        const date = new Date();
        const fileName = `backup-${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}.sql`;
        
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        
        // 显示成功消息
        window.appUtils.showNotification('数据库备份已成功下载', 'success');
        
        // 恢复按钮状态
        backupBtn.innerHTML = originalText;
        backupBtn.disabled = false;
      });
    } else {
      return response.json().then(data => {
        throw new Error(data.message || '备份数据库失败');
      });
    }
  })
  .catch(error => {
    // 恢复按钮状态
    backupBtn.innerHTML = originalText;
    backupBtn.disabled = false;
    
    // 显示错误消息
    window.appUtils.showNotification(`备份数据库失败: ${error.message}`, 'error');
  });
}

// 保存设置
function saveSettings(form) {
  var formData = new FormData(form);
  var settings = {
    email_notifications: formData.get('email-notifications') === 'on',
    webhook_notifications: formData.get('webhook-notifications') === 'on',
    session_timeout: parseInt(formData.get('session-timeout')),
    max_sessions: parseInt(formData.get('max-sessions')),
    ip_restriction: formData.get('ip-restriction') === 'on',
    ip_whitelist: formData.get('ip-restriction') === 'on' ? formData.get('ip-whitelist') : '',
    rate_limiting: formData.get('rate-limiting') === 'on'
  };

  var submitButton = form.querySelector('button[type="submit"]');
  var originalText = window.appUtils.Loading.setButtonLoading(submitButton);

  window.appUtils.API.put('/api/admin/settings', settings)
    .then(function(data) {
      if (data.success) {
        window.appUtils.Toast.success('\u8bbe\u7f6e\u5df2\u6210\u529f\u4fdd\u5b58');
        window.appUtils.Loading.restoreButton(submitButton, originalText);
      } else {
        window.appUtils.Loading.restoreButton(submitButton, originalText);
        window.appUtils.Toast.error('\u4fdd\u5b58\u8bbe\u7f6e\u5931\u8d25: ' + data.message);
      }
    })
    .catch(function(error) {
      window.appUtils.Loading.restoreButton(submitButton, originalText);
      window.appUtils.Toast.error('\u4fdd\u5b58\u8bbe\u7f6e\u5931\u8d25: ' + error.message);
    });
}
