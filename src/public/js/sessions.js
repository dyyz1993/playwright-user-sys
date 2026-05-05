// 会话管理页面的 JavaScript

// 当文档加载完成时执行
document.addEventListener('DOMContentLoaded', function() {
  // 初始化会话管理功能
  initSessionManagement();
});

// 初始化会话管理功能
function initSessionManagement() {
  // 绑定结束会话按钮事件
  const endSessionButtons = document.querySelectorAll('.end-session-btn');
  
  endSessionButtons.forEach(button => {
    button.addEventListener('click', function(e) {
      e.preventDefault();
      
      const sessionId = this.getAttribute('data-session-id');
      const sessionName = this.getAttribute('data-session-name') || sessionId;
      
      // 显示确认对话框
      window.appUtils.confirmAction(`确定要结束会话 "${sessionName}" 吗？`, function() {
        endSession(sessionId);
      });
    });
  });
  
  // 绑定查看会话详情按钮事件
  const viewSessionButtons = document.querySelectorAll('.view-session-btn');
  
  viewSessionButtons.forEach(button => {
    button.addEventListener('click', function(e) {
      e.preventDefault();
      
      const sessionId = this.getAttribute('data-session-id');
      viewSessionDetails(sessionId);
    });
  });
  
  // 绑定刷新会话列表按钮事件
  const refreshButton = document.getElementById('refresh-sessions');
  
  if (refreshButton) {
    refreshButton.addEventListener('click', function(e) {
      e.preventDefault();
      refreshSessionsList();
    });
  }
  
  // 绑定筛选会话状态事件
  const statusFilter = document.getElementById('status-filter');
  
  if (statusFilter) {
    statusFilter.addEventListener('change', function() {
      filterSessions();
    });
  }
}

// 结束会话
function endSession(sessionId) {
  var button = document.querySelector('.end-session-btn[data-session-id="' + sessionId + '"]');
  var originalText = window.appUtils.Loading.setButtonLoading(button);

  window.appUtils.API.post('/api/sessions/' + sessionId + '/release')
    .then(function(data) {
      if (data.success) {
        var statusCell = button.closest('tr').querySelector('.session-status');
        statusCell.innerHTML = '<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">\u5df2\u7ed3\u675f</span>';
        button.innerHTML = '<i class="fas fa-check"></i> \u5df2\u7ed3\u675f';
        button.classList.remove('bg-red-600', 'hover:bg-red-700');
        button.classList.add('bg-gray-400', 'cursor-not-allowed');
        window.appUtils.Toast.success('\u4f1a\u8bdd\u5df2\u6210\u529f\u7ed3\u675f');
      } else {
        window.appUtils.Loading.restoreButton(button, originalText);
        window.appUtils.Toast.error('\u7ed3\u675f\u4f1a\u8bdd\u5931\u8d25: ' + data.message);
      }
    })
    .catch(function(error) {
      window.appUtils.Loading.restoreButton(button, originalText);
      window.appUtils.Toast.error('\u7ed3\u675f\u4f1a\u8bdd\u5931\u8d25: ' + error.message);
    });
}

// 查看会话详情
function viewSessionDetails(sessionId) {
  // 显示加载状态
  const modal = document.getElementById('session-details-modal');
  const modalContent = modal.querySelector('.modal-content');
  const modalBody = modal.querySelector('.modal-body');
  
  modalBody.innerHTML = `
    <div class="flex justify-center items-center py-8">
      <div class="spinner mr-3"></div>
      <span>加载会话详情...</span>
    </div>
  `;
  
  // 显示模态框
  modal.classList.remove('hidden');
  
  window.appUtils.API.get('/api/sessions/' + sessionId)
    .then(function(data) {
      if (data.success) {
        const session = data.data;
        
        // 格式化日期
        const createdAt = window.appUtils.formatDate(session.created_at);
        const endedAt = session.ended_at ? window.appUtils.formatDate(session.ended_at) : '尚未结束';
        
        // 计算持续时间
        let duration = '计算中...';
        if (session.ended_at) {
          const durationMs = new Date(session.ended_at) - new Date(session.created_at);
          const durationMin = Math.round(durationMs / 60000);
          duration = `${durationMin} 分钟`;
        } else {
          const durationMs = new Date() - new Date(session.created_at);
          const durationMin = Math.round(durationMs / 60000);
          duration = `${durationMin} 分钟（进行中）`;
        }
        
        // 更新模态框内容
        modalBody.innerHTML = `
          <div class="space-y-4">
            <div>
              <h4 class="text-sm font-medium text-gray-500">会话 ID</h4>
              <p class="mt-1 text-sm text-gray-900">${session.id}</p>
            </div>
            
            <div>
              <h4 class="text-sm font-medium text-gray-500">用户</h4>
              <p class="mt-1 text-sm text-gray-900">${session.username || '未知'}</p>
            </div>
            
            <div>
              <h4 class="text-sm font-medium text-gray-500">状态</h4>
              <p class="mt-1 text-sm">
                ${
                  session.status === 'active' 
                    ? '<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">活跃</span>'
                    : session.status === 'ended'
                      ? '<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">已结束</span>'
                      : `<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">${session.status}</span>`
                }
              </p>
            </div>
            
            <div>
              <h4 class="text-sm font-medium text-gray-500">机器</h4>
              <p class="mt-1 text-sm text-gray-900">${session.machine_name || '未知'}</p>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h4 class="text-sm font-medium text-gray-500">开始时间</h4>
                <p class="mt-1 text-sm text-gray-900">${createdAt}</p>
              </div>
              
              <div>
                <h4 class="text-sm font-medium text-gray-500">结束时间</h4>
                <p class="mt-1 text-sm text-gray-900">${endedAt}</p>
              </div>
            </div>
            
            <div>
              <h4 class="text-sm font-medium text-gray-500">持续时间</h4>
              <p class="mt-1 text-sm text-gray-900">${duration}</p>
            </div>
            
            ${session.screenshot ? `
              <div>
                <h4 class="text-sm font-medium text-gray-500">屏幕截图</h4>
                <div class="mt-2 border border-gray-200 rounded-md overflow-hidden">
                  <img src="${session.screenshot}" alt="会话截图" class="w-full">
                </div>
              </div>
            ` : ''}
            
            <div>
              <h4 class="text-sm font-medium text-gray-500">配置</h4>
              <div class="mt-2 bg-gray-50 p-3 rounded-md">
                <pre class="text-xs text-gray-700 overflow-auto">${JSON.stringify(session.config || {}, null, 2)}</pre>
              </div>
            </div>
          </div>
        `;
      } else {
        modalBody.innerHTML = `
          <div class="text-center py-8">
            <i class="fas fa-exclamation-circle text-red-500 text-4xl mb-4"></i>
            <p class="text-gray-700">获取会话详情失败: ${data.message}</p>
          </div>
        `;
      }
    })
    .catch(error => {
      modalBody.innerHTML = `
        <div class="text-center py-8">
          <i class="fas fa-exclamation-circle text-red-500 text-4xl mb-4"></i>
          <p class="text-gray-700">获取会话详情失败: ${error.message}</p>
        </div>
      `;
    });
}

// 刷新会话列表
function refreshSessionsList() {
  // 重新加载页面
  window.location.reload();
}

// 筛选会话
function filterSessions() {
  const statusFilter = document.getElementById('status-filter');
  const selectedStatus = statusFilter.value;
  
  const rows = document.querySelectorAll('tbody tr');
  
  rows.forEach(row => {
    const statusCell = row.querySelector('.session-status');
    const statusText = statusCell.textContent.trim().toLowerCase();
    
    if (selectedStatus === 'all' || statusText.includes(selectedStatus)) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  });
}
