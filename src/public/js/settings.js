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
  // 显示加载状态
  const confirmButton = document.getElementById('confirm-clear-logs');
  const originalText = confirmButton.innerHTML;
  confirmButton.innerHTML = '<div class="spinner inline-block mr-2"></div> 处理中...';
  confirmButton.disabled = true;
  
  // 发送请求清理旧日志
  fetch('/api/admin/logs/clear', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      // 关闭模态框
      const clearLogsModal = document.getElementById('clear-logs-modal');
      clearLogsModal.classList.add('hidden');
      
      // 显示成功消息
      window.appUtils.showNotification('旧日志已成功清理', 'success');
      
      // 恢复按钮状态
      confirmButton.innerHTML = originalText;
      confirmButton.disabled = false;
    } else {
      // 恢复按钮状态
      confirmButton.innerHTML = originalText;
      confirmButton.disabled = false;
      
      // 显示错误消息
      window.appUtils.showNotification(`清理日志失败: ${data.message}`, 'error');
    }
  })
  .catch(error => {
    // 恢复按钮状态
    confirmButton.innerHTML = originalText;
    confirmButton.disabled = false;
    
    // 显示错误消息
    window.appUtils.showNotification(`清理日志失败: ${error.message}`, 'error');
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
  // 获取表单数据
  const formData = new FormData(form);
  const settings = {
    email_notifications: formData.get('email-notifications') === 'on',
    webhook_notifications: formData.get('webhook-notifications') === 'on',
    session_timeout: parseInt(formData.get('session-timeout')),
    max_sessions: parseInt(formData.get('max-sessions')),
    ip_restriction: formData.get('ip-restriction') === 'on',
    ip_whitelist: formData.get('ip-restriction') === 'on' ? formData.get('ip-whitelist') : '',
    rate_limiting: formData.get('rate-limiting') === 'on'
  };
  
  // 显示加载状态
  const submitButton = form.querySelector('button[type="submit"]');
  const originalText = submitButton.innerHTML;
  submitButton.innerHTML = '<div class="spinner inline-block mr-2"></div> 处理中...';
  submitButton.disabled = true;
  
  // 发送请求保存设置
  fetch('/api/admin/settings', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(settings)
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      // 显示成功消息
      window.appUtils.showNotification('设置已成功保存', 'success');
      
      // 恢复按钮状态
      submitButton.innerHTML = originalText;
      submitButton.disabled = false;
    } else {
      // 恢复按钮状态
      submitButton.innerHTML = originalText;
      submitButton.disabled = false;
      
      // 显示错误消息
      window.appUtils.showNotification(`保存设置失败: ${data.message}`, 'error');
    }
  })
  .catch(error => {
    // 恢复按钮状态
    submitButton.innerHTML = originalText;
    submitButton.disabled = false;
    
    // 显示错误消息
    window.appUtils.showNotification(`保存设置失败: ${error.message}`, 'error');
  });
}
