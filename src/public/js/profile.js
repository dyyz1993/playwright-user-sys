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
  var confirmButton = document.getElementById('confirm-regenerate-key');
  var originalText = window.appUtils.Loading.setButtonLoading(confirmButton);

  window.appUtils.API.post('/api/users/me/apikey/regenerate')
    .then(function(data) {
      if (data.success) {
        var apiKeyInput = document.getElementById('api-key');
        apiKeyInput.value = data.data.apiKey;
        var regenerateKeyModal = document.getElementById('regenerate-key-modal');
        regenerateKeyModal.classList.add('hidden');
        window.appUtils.Toast.success('API Key \u5df2\u6210\u529f\u91cd\u65b0\u751f\u6210');
        window.appUtils.Loading.restoreButton(confirmButton, originalText);
      } else {
        window.appUtils.Loading.restoreButton(confirmButton, originalText);
        window.appUtils.Toast.error('\u91cd\u65b0\u751f\u6210 API Key \u5931\u8d25: ' + data.message);
      }
    })
    .catch(function(error) {
      window.appUtils.Loading.restoreButton(confirmButton, originalText);
      window.appUtils.Toast.error('\u91cd\u65b0\u751f\u6210 API Key \u5931\u8d25: ' + error.message);
    });
}

// 更新个人资料
function updateProfile(form) {
  var formData = new FormData(form);
  var userData = {
    email: formData.get('email'),
    webhook_url: formData.get('webhook-url')
  };

  var submitButton = form.querySelector('button[type="submit"]');
  var originalText = window.appUtils.Loading.setButtonLoading(submitButton);

  window.appUtils.API.put('/api/users/me', userData)
    .then(function(data) {
      if (data.success) {
        window.appUtils.Toast.success('\u4e2a\u4eba\u8d44\u6599\u5df2\u6210\u529f\u66f4\u65b0');
        window.appUtils.Loading.restoreButton(submitButton, originalText);
      } else {
        window.appUtils.Loading.restoreButton(submitButton, originalText);
        window.appUtils.Toast.error('\u66f4\u65b0\u4e2a\u4eba\u8d44\u6599\u5931\u8d25: ' + data.message);
      }
    })
    .catch(function(error) {
      window.appUtils.Loading.restoreButton(submitButton, originalText);
      window.appUtils.Toast.error('\u66f4\u65b0\u4e2a\u4eba\u8d44\u6599\u5931\u8d25: ' + error.message);
    });
}

// 更新密码
function updatePassword(form) {
  var formData = new FormData(form);
  var currentPassword = formData.get('current-password');
  var newPassword = formData.get('new-password');
  var confirmPassword = formData.get('confirm-password');

  if (newPassword !== confirmPassword) {
    window.appUtils.Toast.error('\u65b0\u5bc6\u7801\u548c\u786e\u8ba4\u5bc6\u7801\u4e0d\u5339\u914d');
    return;
  }

  var submitButton = form.querySelector('button[type="submit"]');
  var originalText = window.appUtils.Loading.setButtonLoading(submitButton);

  window.appUtils.API.put('/api/users/me/password', {
    current_password: currentPassword,
    new_password: newPassword
  })
    .then(function(data) {
      if (data.success) {
        window.appUtils.Toast.success('\u5bc6\u7801\u5df2\u6210\u529f\u66f4\u65b0');
        form.reset();
        window.appUtils.Loading.restoreButton(submitButton, originalText);
      } else {
        window.appUtils.Loading.restoreButton(submitButton, originalText);
        window.appUtils.Toast.error('\u66f4\u65b0\u5bc6\u7801\u5931\u8d25: ' + data.message);
      }
    })
    .catch(function(error) {
      window.appUtils.Loading.restoreButton(submitButton, originalText);
      window.appUtils.Toast.error('\u66f4\u65b0\u5bc6\u7801\u5931\u8d25: ' + error.message);
    });
}
