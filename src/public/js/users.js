// 用户管理页面的 JavaScript

// 当文档加载完成时执行
document.addEventListener('DOMContentLoaded', function() {
  // 初始化用户管理功能
  initUserManagement();
});

// 初始化用户管理功能
function initUserManagement() {
  // 绑定添加用户按钮事件
  const addUserButton = document.getElementById('add-user-btn');

  if (addUserButton) {
    addUserButton.addEventListener('click', function() {
      const modal = document.getElementById('add-user-modal');
      modal.classList.remove('hidden');
    });
  }

  // 绑定关闭模态框按钮事件
  const closeModalButtons = document.querySelectorAll('.close-modal');

  closeModalButtons.forEach(button => {
    button.addEventListener('click', function() {
      const modal = this.closest('.modal');
      modal.classList.add('hidden');
    });
  });

  // 点击模态框背景关闭模态框
  const modals = document.querySelectorAll('.modal');

  modals.forEach(modal => {
    modal.addEventListener('click', function(e) {
      if (e.target === this) {
        this.classList.add('hidden');
      }
    });
  });

  // 绑定添加用户表单提交事件
  const addUserForm = document.getElementById('add-user-form');

  if (addUserForm) {
    addUserForm.addEventListener('submit', function(e) {
      e.preventDefault();
      addUser(this);
    });
  }

  // 绑定编辑用户按钮事件
  const editUserButtons = document.querySelectorAll('.edit-user-btn');
  console.log('找到编辑按钮数量:', editUserButtons.length);

  editUserButtons.forEach(button => {
    console.log('绑定编辑按钮事件:', button);
    button.addEventListener('click', function() {
      const userId = this.getAttribute('data-user-id');
      console.log('点击编辑按钮, userId:', userId);
      openEditUserModal(userId);
    });
  });

  // 直接在文档上绑定委托事件
  document.addEventListener('click', function(e) {
    const button = e.target.closest('.edit-user-btn');
    if (button) {
      const userId = button.getAttribute('data-user-id');
      console.log('通过委托点击编辑按钮, userId:', userId);
      openEditUserModal(userId);
    }
  });

  // 绑定编辑用户表单提交事件
  const editUserForm = document.getElementById('edit-user-form');

  if (editUserForm) {
    editUserForm.addEventListener('submit', function(e) {
      e.preventDefault();
      updateUser(this);
    });
  }

  // 绑定删除用户按钮事件
  const deleteUserButtons = document.querySelectorAll('.delete-user-btn');

  deleteUserButtons.forEach(button => {
    button.addEventListener('click', function() {
      const userId = this.getAttribute('data-user-id');
      const username = this.getAttribute('data-username');

      window.appUtils.confirmAction(`确定要删除用户 "${username}" 吗？此操作不可撤销。`, function() {
        deleteUser(userId);
      });
    });
  });

  // 绑定添加点数按钮事件
  const addCreditsButtons = document.querySelectorAll('.add-credits-btn');

  addCreditsButtons.forEach(button => {
    button.addEventListener('click', function() {
      const userId = this.getAttribute('data-user-id');
      const username = this.getAttribute('data-username');

      openAddCreditsModal(userId, username);
    });
  });

  // 绑定添加点数表单提交事件
  const addCreditsForm = document.getElementById('add-credits-form');

  if (addCreditsForm) {
    addCreditsForm.addEventListener('submit', function(e) {
      e.preventDefault();
      addCredits(this);
    });
  }
}

// 添加用户
function addUser(form) {
  // 获取表单数据
  const formData = new FormData(form);
  const userData = {
    username: formData.get('username'),
    email: formData.get('email'),
    password: formData.get('password'),
    role: formData.get('role'),
    credits: parseInt(formData.get('credits')) || 0
  };

  // 显示加载状态
  const submitButton = form.querySelector('button[type="submit"]');
  const originalText = submitButton.innerHTML;
  submitButton.innerHTML = '<div class="spinner inline-block mr-2"></div> 处理中...';
  submitButton.disabled = true;

  // 发送请求添加用户
  fetch('/api/users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || ''
    },
    body: JSON.stringify(userData),
    credentials: 'same-origin'
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      // 关闭模态框
      const modal = document.getElementById('add-user-modal');
      modal.classList.add('hidden');

      // 显示成功通知
      window.appUtils.showNotification('用户已成功添加', 'success');

      // 重新加载页面以显示新用户
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } else {
      // 恢复按钮状态
      submitButton.innerHTML = originalText;
      submitButton.disabled = false;

      // 显示错误通知
      window.appUtils.showNotification(`添加用户失败: ${data.message}`, 'error');
    }
  })
  .catch(error => {
    // 恢复按钮状态
    submitButton.innerHTML = originalText;
    submitButton.disabled = false;

    // 显示错误通知
    window.appUtils.showNotification(`添加用户失败: ${error.message}`, 'error');
  });
}

// 打开编辑用户模态框
function openEditUserModal(userId) {
  // 显示加载状态
  const modal = document.getElementById('edit-user-modal');
  const modalBody = modal.querySelector('.modal-body');

  modalBody.innerHTML = `
    <div class="flex justify-center items-center py-8">
      <div class="spinner mr-3"></div>
      <span>加载用户信息...</span>
    </div>
  `;

  // 显示模态框
  modal.classList.remove('hidden');

  // 获取用户信息
  fetch(`/api/admin/users/${userId}`, {
    credentials: 'same-origin',
    headers: {
      'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || ''
    }
  })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        const user = data.data;

        // 更新模态框内容
        modalBody.innerHTML = `
          <form id="edit-user-form" class="space-y-4">
            <input type="hidden" name="user_id" value="${user.id}">

            <div>
              <label for="edit-username" class="block text-sm font-medium text-gray-700 mb-1">用户名</label>
              <input type="text" id="edit-username" name="username" value="${user.username}" readonly
                class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-gray-50 focus:outline-none focus:ring-primary-500 focus:border-primary-500">
              <p class="mt-1 text-xs text-gray-500">用户名不可更改</p>
            </div>

            <div>
              <label for="edit-email" class="block text-sm font-medium text-gray-700 mb-1">邮箱</label>
              <input type="email" id="edit-email" name="email" value="${user.email || ''}" required
                class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500">
            </div>

            <div>
              <label for="edit-role" class="block text-sm font-medium text-gray-700 mb-1">角色</label>
              <select id="edit-role" name="role" required
                class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500">
                <option value="user" ${user.role === 'user' ? 'selected' : ''}>普通用户</option>
                <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>管理员</option>
              </select>
            </div>

            <div>
              <label for="edit-status" class="block text-sm font-medium text-gray-700 mb-1">状态</label>
              <select id="edit-status" name="status" required
                class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500">
                <option value="active" ${user.status === 'active' ? 'selected' : ''}>活跃</option>
                <option value="inactive" ${user.status === 'inactive' ? 'selected' : ''}>禁用</option>
              </select>
            </div>

            <div>
              <label for="edit-password" class="block text-sm font-medium text-gray-700 mb-1">新密码</label>
              <input type="password" id="edit-password" name="password"
                class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500">
              <p class="mt-1 text-xs text-gray-500">留空表示不修改密码</p>
            </div>

            <div>
              <label for="edit-webhook-url" class="block text-sm font-medium text-gray-700 mb-1">Webhook URL</label>
              <input type="url" id="edit-webhook-url" name="webhook_url" value="${user.webhook_url || ''}"
                class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                placeholder="https://example.com/webhook">
              <p class="mt-1 text-xs text-gray-500">当会话结束时，系统将发送通知到此 URL</p>
            </div>

            <div>
              <label for="edit-api-key" class="block text-sm font-medium text-gray-700 mb-1">API Key</label>
              <div class="flex">
                <input type="text" id="edit-api-key" value="${user.api_key || ''}" readonly
                  class="block w-full px-3 py-2 border border-gray-300 rounded-l-md shadow-sm bg-gray-50 focus:outline-none focus:ring-primary-500 focus:border-primary-500">
                <button type="button" class="copy-api-key bg-gray-100 px-3 py-2 border border-l-0 border-gray-300 rounded-r-md text-gray-700 hover:bg-gray-200">
                  <i class="fas fa-copy"></i>
                </button>
              </div>
              <p class="mt-1 text-xs text-gray-500">用户的 API Key，用于调用 API</p>
              <div class="mt-2">
                <button type="button" class="reset-api-key text-sm text-primary-600 hover:text-primary-800" data-user-id="${user.id}">
                  <i class="fas fa-sync-alt mr-1"></i> 重置 API Key
                </button>
              </div>
            </div>

            <div class="flex justify-end pt-4">
              <button type="button" class="close-modal bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 mr-3">
                取消
              </button>
              <button type="submit" class="bg-primary-600 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500">
                保存更改
              </button>
            </div>
          </form>
        `;

        // 重新绑定事件
        const editUserForm = document.getElementById('edit-user-form');
        editUserForm.addEventListener('submit', function(e) {
          e.preventDefault();
          updateUser(this);
        });

        const closeModalButtons = modalBody.querySelectorAll('.close-modal');
        closeModalButtons.forEach(button => {
          button.addEventListener('click', function() {
            const modal = this.closest('.modal');
            modal.classList.add('hidden');
          });
        });

        // 绑定复制 API Key 按钮
        const copyApiKeyBtn = modalBody.querySelector('.copy-api-key');
        const apiKeyInput = modalBody.querySelector('#edit-api-key');

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

        // 绑定重置 API Key 按钮
        const resetApiKeyBtn = modalBody.querySelector('.reset-api-key');

        if (resetApiKeyBtn) {
          resetApiKeyBtn.addEventListener('click', function() {
            const userId = this.getAttribute('data-user-id');

            // 确认重置
            window.appUtils.confirmAction('确定要重置此用户的 API Key 吗？这将使当前的 API Key 失效。', function() {
              resetApiKey(userId, apiKeyInput);
            });
          });
        }
      } else {
        modalBody.innerHTML = `
          <div class="text-center py-8">
            <i class="fas fa-exclamation-circle text-red-500 text-4xl mb-4"></i>
            <p class="text-gray-700">获取用户信息失败: ${data.message}</p>
            <button type="button" class="close-modal mt-4 bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500">
              关闭
            </button>
          </div>
        `;

        const closeModalButtons = modalBody.querySelectorAll('.close-modal');
        closeModalButtons.forEach(button => {
          button.addEventListener('click', function() {
            const modal = this.closest('.modal');
            modal.classList.add('hidden');
          });
        });
      }
    })
    .catch(error => {
      modalBody.innerHTML = `
        <div class="text-center py-8">
          <i class="fas fa-exclamation-circle text-red-500 text-4xl mb-4"></i>
          <p class="text-gray-700">获取用户信息失败: ${error.message}</p>
          <button type="button" class="close-modal mt-4 bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500">
            关闭
          </button>
        </div>
      `;

      const closeModalButtons = modalBody.querySelectorAll('.close-modal');
      closeModalButtons.forEach(button => {
        button.addEventListener('click', function() {
          const modal = this.closest('.modal');
          modal.classList.add('hidden');
        });
      });
    });
}

// 更新用户
function updateUser(form) {
  // 获取表单数据
  const formData = new FormData(form);
  const userId = formData.get('user_id');
  const userData = {
    email: formData.get('email'),
    role: formData.get('role'),
    status: formData.get('status'),
    webhook_url: formData.get('webhook_url')
  };

  // 如果提供了密码，则添加到请求数据中
  const password = formData.get('password');
  if (password) {
    userData.password = password;
  }

  // 显示加载状态
  const submitButton = form.querySelector('button[type="submit"]');
  const originalText = submitButton.innerHTML;
  submitButton.innerHTML = '<div class="spinner inline-block mr-2"></div> 处理中...';
  submitButton.disabled = true;

  // 发送请求更新用户
  fetch(`/api/admin/users/${userId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || ''
    },
    body: JSON.stringify(userData),
    credentials: 'same-origin'
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      // 关闭模态框
      const modal = document.getElementById('edit-user-modal');
      modal.classList.add('hidden');

      // 显示成功通知
      window.appUtils.showNotification('用户信息已成功更新', 'success');

      // 重新加载页面以显示更新后的用户信息
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } else {
      // 恢复按钮状态
      submitButton.innerHTML = originalText;
      submitButton.disabled = false;

      // 显示错误通知
      window.appUtils.showNotification(`更新用户失败: ${data.message}`, 'error');
    }
  })
  .catch(error => {
    // 恢复按钮状态
    submitButton.innerHTML = originalText;
    submitButton.disabled = false;

    // 显示错误通知
    window.appUtils.showNotification(`更新用户失败: ${error.message}`, 'error');
  });
}

// 删除用户
function deleteUser(userId) {
  // 显示加载状态
  const button = document.querySelector(`.delete-user-btn[data-user-id="${userId}"]`);
  const originalText = button.innerHTML;
  button.innerHTML = '<div class="spinner inline-block mr-2"></div> 处理中...';
  button.disabled = true;

  // 发送请求删除用户
  fetch(`/api/admin/users/${userId}`, {
    method: 'DELETE',
    headers: {
      'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || ''
    },
    credentials: 'same-origin'
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      // 显示成功通知
      window.appUtils.showNotification('用户已成功删除', 'success');

      // 从表格中移除用户行
      const row = button.closest('tr');
      row.classList.add('opacity-0', 'transition-opacity');
      setTimeout(() => {
        row.remove();
      }, 300);
    } else {
      // 恢复按钮状态
      button.innerHTML = originalText;
      button.disabled = false;

      // 显示错误通知
      window.appUtils.showNotification(`删除用户失败: ${data.message}`, 'error');
    }
  })
  .catch(error => {
    // 恢复按钮状态
    button.innerHTML = originalText;
    button.disabled = false;

    // 显示错误通知
    window.appUtils.showNotification(`删除用户失败: ${error.message}`, 'error');
  });
}

// 打开添加点数模态框
function openAddCreditsModal(userId, username) {
  const modal = document.getElementById('add-credits-modal');
  const userIdInput = modal.querySelector('input[name="user_id"]');
  const usernameSpan = modal.querySelector('#credits-username');

  userIdInput.value = userId;
  usernameSpan.textContent = username;

  modal.classList.remove('hidden');
}

// 重置 API Key
function resetApiKey(userId, apiKeyInput) {
  // 显示加载状态
  const resetButton = document.querySelector(`.reset-api-key[data-user-id="${userId}"]`);
  const originalText = resetButton.innerHTML;
  resetButton.innerHTML = '<div class="spinner inline-block mr-2"></div> 处理中...';
  resetButton.disabled = true;

  console.log('重置 API Key, userId:', userId);

  // 发送请求重置 API Key
  fetch(`/api/admin/users/${userId}/reset-api-key`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || ''
    },
    credentials: 'same-origin'
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      // 更新输入框中的 API Key
      apiKeyInput.value = data.data.api_key;

      // 显示成功通知
      window.appUtils.showNotification('API Key 已成功重置', 'success');

      // 恢复按钮状态
      resetButton.innerHTML = originalText;
      resetButton.disabled = false;
    } else {
      // 恢复按钮状态
      resetButton.innerHTML = originalText;
      resetButton.disabled = false;

      // 显示错误通知
      window.appUtils.showNotification(`重置 API Key 失败: ${data.message}`, 'error');
    }
  })
  .catch(error => {
    // 恢复按钮状态
    resetButton.innerHTML = originalText;
    resetButton.disabled = false;

    // 显示错误通知
    window.appUtils.showNotification(`重置 API Key 失败: ${error.message}`, 'error');
  });
}

// 添加点数
function addCredits(form) {
  // 获取表单数据
  const formData = new FormData(form);
  const userId = formData.get('user_id');
  const amount = parseInt(formData.get('amount'));
  const reason = formData.get('reason');

  if (!amount || amount <= 0) {
    window.appUtils.showNotification('请输入有效的点数金额', 'error');
    return;
  }

  // 显示加载状态
  const submitButton = form.querySelector('button[type="submit"]');
  const originalText = submitButton.innerHTML;
  submitButton.innerHTML = '<div class="spinner inline-block mr-2"></div> 处理中...';
  submitButton.disabled = true;

  // 发送请求添加点数
  fetch(`/api/admin/users/${userId}/credits`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || ''
    },
    body: JSON.stringify({
      amount,
      reason
    }),
    credentials: 'same-origin'
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      // 关闭模态框
      const modal = document.getElementById('add-credits-modal');
      modal.classList.add('hidden');

      // 显示成功通知
      window.appUtils.showNotification(`已成功添加 ${amount} 点数`, 'success');

      // 更新用户点数显示
      const creditsCell = document.querySelector(`tr[data-user-id="${userId}"] .user-credits`);
      if (creditsCell) {
        const currentCredits = parseInt(creditsCell.textContent);
        creditsCell.textContent = currentCredits + amount;
      }
    } else {
      // 恢复按钮状态
      submitButton.innerHTML = originalText;
      submitButton.disabled = false;

      // 显示错误通知
      window.appUtils.showNotification(`添加点数失败: ${data.message}`, 'error');
    }
  })
  .catch(error => {
    // 恢复按钮状态
    submitButton.innerHTML = originalText;
    submitButton.disabled = false;

    // 显示错误通知
    window.appUtils.showNotification(`添加点数失败: ${error.message}`, 'error');
  });
}
