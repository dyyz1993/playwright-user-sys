// 个人资料页面的 JavaScript

// 当文档加载完成时执行
document.addEventListener('DOMContentLoaded', function() {
  // 初始化个人资料功能
  initProfileFunctions();
});

// 初始化个人资料功能
function initProfileFunctions() {
  // 复制 API Key 按钮
  const copyApiKeyBtn = document.getElementById('copy-api-key');
  const apiKeyInput = document.getElementById('api-key');
  
  if (copyApiKeyBtn && apiKeyInput) {
    copyApiKeyBtn.addEventListener('click', function() {
      // 选择输入框内容
      apiKeyInput.select();
      
      // 复制到剪贴板
      try {
        document.execCommand('copy');
        
        // 显示复制成功提示
        const originalText = copyApiKeyBtn.innerHTML;
        copyApiKeyBtn.innerHTML = '<i class="fas fa-check"></i>';
        copyApiKeyBtn.classList.add('bg-green-100', 'text-green-700');
        
        setTimeout(() => {
          copyApiKeyBtn.innerHTML = originalText;
          copyApiKeyBtn.classList.remove('bg-green-100', 'text-green-700');
        }, 2000);
        
        // 显示成功通知
        window.appUtils.showNotification('API Key 已复制到剪贴板', 'success');
      } catch (err) {
        // 显示错误通知
        window.appUtils.showNotification('复制失败，请手动复制', 'error');
      }
    });
  }
  
  // 重新生成 API Key 按钮
  const regenerateKeyBtn = document.getElementById('regenerate-api-key');
  const regenerateKeyModal = document.getElementById('regenerate-key-modal');
  const closeKeyModal = document.getElementById('close-key-modal');
  const cancelRegenerateKey = document.getElementById('cancel-regenerate-key');
  const confirmRegenerateKey = document.getElementById('confirm-regenerate-key');
  
  if (regenerateKeyBtn && regenerateKeyModal) {
    regenerateKeyBtn.addEventListener('click', function() {
      regenerateKeyModal.classList.remove('hidden');
    });
    
    closeKeyModal?.addEventListener('click', function() {
      regenerateKeyModal.classList.add('hidden');
    });
    
    cancelRegenerateKey?.addEventListener('click', function() {
      regenerateKeyModal.classList.add('hidden');
    });
    
    confirmRegenerateKey?.addEventListener('click', function() {
      regenerateApiKey();
    });
    
    // 点击模态框背景关闭模态框
    regenerateKeyModal.addEventListener('click', function(e) {
      if (e.target === this) {
        this.classList.add('hidden');
      }
    });
  }
  
  // 个人资料表单提交
  const profileForm = document.getElementById('profile-form');
  
  if (profileForm) {
    profileForm.addEventListener('submit', function(e) {
      e.preventDefault();
      updateProfile(this);
    });
  }
  
  // 密码表单提交
  const passwordForm = document.getElementById('password-form');
  
  if (passwordForm) {
    passwordForm.addEventListener('submit', function(e) {
      e.preventDefault();
      updatePassword(this);
    });
  }
}

// 重新生成 API Key
function regenerateApiKey() {
  // 显示加载状态
  const confirmButton = document.getElementById('confirm-regenerate-key');
  const originalText = confirmButton.innerHTML;
  confirmButton.innerHTML = '<div class="spinner inline-block mr-2"></div> 处理中...';
  confirmButton.disabled = true;
  
  // 发送请求重新生成 API Key
  fetch('/api/users/me/apikey/regenerate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      // 更新页面上的 API Key
      const apiKeyInput = document.getElementById('api-key');
      apiKeyInput.value = data.data.apiKey;
      
      // 关闭模态框
      const regenerateKeyModal = document.getElementById('regenerate-key-modal');
      regenerateKeyModal.classList.add('hidden');
      
      // 显示成功消息
      window.appUtils.showNotification('API Key 已成功重新生成', 'success');
      
      // 恢复按钮状态
      confirmButton.innerHTML = originalText;
      confirmButton.disabled = false;
    } else {
      // 恢复按钮状态
      confirmButton.innerHTML = originalText;
      confirmButton.disabled = false;
      
      // 显示错误消息
      window.appUtils.showNotification(`重新生成 API Key 失败: ${data.message}`, 'error');
    }
  })
  .catch(error => {
    // 恢复按钮状态
    confirmButton.innerHTML = originalText;
    confirmButton.disabled = false;
    
    // 显示错误消息
    window.appUtils.showNotification(`重新生成 API Key 失败: ${error.message}`, 'error');
  });
}

// 更新个人资料
function updateProfile(form) {
  // 获取表单数据
  const formData = new FormData(form);
  const userData = {
    email: formData.get('email'),
    webhook_url: formData.get('webhook-url')
  };
  
  // 显示加载状态
  const submitButton = form.querySelector('button[type="submit"]');
  const originalText = submitButton.innerHTML;
  submitButton.innerHTML = '<div class="spinner inline-block mr-2"></div> 处理中...';
  submitButton.disabled = true;
  
  // 发送请求更新个人资料
  fetch('/api/users/me', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(userData)
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      // 显示成功消息
      window.appUtils.showNotification('个人资料已成功更新', 'success');
      
      // 恢复按钮状态
      submitButton.innerHTML = originalText;
      submitButton.disabled = false;
    } else {
      // 恢复按钮状态
      submitButton.innerHTML = originalText;
      submitButton.disabled = false;
      
      // 显示错误消息
      window.appUtils.showNotification(`更新个人资料失败: ${data.message}`, 'error');
    }
  })
  .catch(error => {
    // 恢复按钮状态
    submitButton.innerHTML = originalText;
    submitButton.disabled = false;
    
    // 显示错误消息
    window.appUtils.showNotification(`更新个人资料失败: ${error.message}`, 'error');
  });
}

// 更新密码
function updatePassword(form) {
  // 获取表单数据
  const formData = new FormData(form);
  const currentPassword = formData.get('current-password');
  const newPassword = formData.get('new-password');
  const confirmPassword = formData.get('confirm-password');
  
  // 验证新密码和确认密码是否匹配
  if (newPassword !== confirmPassword) {
    window.appUtils.showNotification('新密码和确认密码不匹配', 'error');
    return;
  }
  
  // 显示加载状态
  const submitButton = form.querySelector('button[type="submit"]');
  const originalText = submitButton.innerHTML;
  submitButton.innerHTML = '<div class="spinner inline-block mr-2"></div> 处理中...';
  submitButton.disabled = true;
  
  // 发送请求更新密码
  fetch('/api/users/me/password', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword
    })
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      // 显示成功消息
      window.appUtils.showNotification('密码已成功更新', 'success');
      
      // 重置表单
      form.reset();
      
      // 恢复按钮状态
      submitButton.innerHTML = originalText;
      submitButton.disabled = false;
    } else {
      // 恢复按钮状态
      submitButton.innerHTML = originalText;
      submitButton.disabled = false;
      
      // 显示错误消息
      window.appUtils.showNotification(`更新密码失败: ${data.message}`, 'error');
    }
  })
  .catch(error => {
    // 恢复按钮状态
    submitButton.innerHTML = originalText;
    submitButton.disabled = false;
    
    // 显示错误消息
    window.appUtils.showNotification(`更新密码失败: ${error.message}`, 'error');
  });
}
