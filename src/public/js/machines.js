// 机器管理页面的 JavaScript

// 当文档加载完成时执行
document.addEventListener('DOMContentLoaded', function() {
  // 初始化机器管理功能
  initMachineManagement();
});

// 初始化机器管理功能
function initMachineManagement() {
  // 绑定查看机器详情按钮事件
  const viewMachineButtons = document.querySelectorAll('.view-machine-btn');
  
  viewMachineButtons.forEach(button => {
    button.addEventListener('click', function() {
      const machineId = this.getAttribute('data-machine-id');
      viewMachineDetails(machineId);
    });
  });
  
  // 绑定刷新机器列表按钮事件
  const refreshButton = document.getElementById('refresh-machines');
  
  if (refreshButton) {
    refreshButton.addEventListener('click', function(e) {
      e.preventDefault();
      refreshMachinesList();
    });
  }
  
  // 绑定筛选机器状态事件
  const statusFilter = document.getElementById('status-filter');
  
  if (statusFilter) {
    statusFilter.addEventListener('change', function() {
      filterMachines();
    });
  }
  
  // 绑定关闭模态框按钮事件
  window.appUtils.Modal.initCloseHandlers();
}

// 查看机器详情
function viewMachineDetails(machineId) {
  // 显示加载状态
  const modal = document.getElementById('machine-details-modal');
  const modalBody = modal.querySelector('.modal-body');
  
  modalBody.innerHTML = `
    <div class="flex justify-center items-center py-8">
      <div class="spinner mr-3"></div>
      <span>加载机器详情...</span>
    </div>
  `;
  
  // 显示模态框
  modal.classList.remove('hidden');
  
  window.appUtils.API.get('/api/machines/' + machineId)
    .then(function(data) {
      if (data.success) {
        const machine = data.data;
        
        // 格式化日期
        const lastHeartbeat = window.appUtils.formatDate(machine.last_heartbeat);
        const registeredAt = window.appUtils.formatDate(machine.created_at);
        
        // 计算负载百分比
        const loadPercentage = Math.round((machine.active_sessions / machine.max_sessions) * 100);
        
        // 更新模态框内容
        modalBody.innerHTML = `
          <div class="space-y-4">
            <div>
              <h4 class="text-sm font-medium text-gray-500">机器 ID</h4>
              <p class="mt-1 text-sm text-gray-900">${machine.id}</p>
            </div>
            
            <div>
              <h4 class="text-sm font-medium text-gray-500">名称</h4>
              <p class="mt-1 text-sm text-gray-900">${machine.name}</p>
            </div>
            
            <div>
              <h4 class="text-sm font-medium text-gray-500">IP 地址</h4>
              <p class="mt-1 text-sm text-gray-900">${machine.ip_address}</p>
            </div>
            
            <div>
              <h4 class="text-sm font-medium text-gray-500">状态</h4>
              <p class="mt-1 text-sm">
                ${
                  machine.status === 'online' 
                    ? '<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">在线</span>'
                    : '<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">离线</span>'
                }
              </p>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h4 class="text-sm font-medium text-gray-500">最后心跳时间</h4>
                <p class="mt-1 text-sm text-gray-900">${lastHeartbeat}</p>
              </div>
              
              <div>
                <h4 class="text-sm font-medium text-gray-500">注册时间</h4>
                <p class="mt-1 text-sm text-gray-900">${registeredAt}</p>
              </div>
            </div>
            
            <div>
              <h4 class="text-sm font-medium text-gray-500">负载情况</h4>
              <div class="mt-2">
                <div class="flex justify-between mb-1">
                  <span class="text-xs font-medium text-gray-700">${machine.active_sessions} / ${machine.max_sessions} 会话</span>
                  <span class="text-xs font-medium text-gray-700">${loadPercentage}%</span>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-2">
                  <div class="bg-${loadPercentage > 80 ? 'red' : loadPercentage > 50 ? 'yellow' : 'green'}-600 h-2 rounded-full" style="width: ${loadPercentage}%"></div>
                </div>
              </div>
            </div>
            
            ${machine.system_info ? `
              <div>
                <h4 class="text-sm font-medium text-gray-500">系统信息</h4>
                <div class="mt-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p class="text-xs text-gray-500">操作系统</p>
                    <p class="text-sm text-gray-900">${machine.system_info.os || '未知'}</p>
                  </div>
                  <div>
                    <p class="text-xs text-gray-500">CPU</p>
                    <p class="text-sm text-gray-900">${machine.system_info.cpu || '未知'}</p>
                  </div>
                  <div>
                    <p class="text-xs text-gray-500">内存</p>
                    <p class="text-sm text-gray-900">${machine.system_info.memory || '未知'}</p>
                  </div>
                  <div>
                    <p class="text-xs text-gray-500">磁盘</p>
                    <p class="text-sm text-gray-900">${machine.system_info.disk || '未知'}</p>
                  </div>
                </div>
              </div>
            ` : ''}
            
            <div>
              <h4 class="text-sm font-medium text-gray-500">活跃会话</h4>
              ${machine.active_sessions > 0 ? `
                <div class="mt-2 overflow-x-auto">
                  <table class="min-w-full divide-y divide-gray-200">
                    <thead>
                      <tr>
                        <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">会话 ID</th>
                        <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">用户</th>
                        <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">开始时间</th>
                        <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">持续时间</th>
                      </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">
                      ${machine.sessions.map(session => `
                        <tr>
                          <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-900">${session.id.substring(0, 8)}...</td>
                          <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-900">${session.username || '未知'}</td>
                          <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-500">${window.appUtils.formatDate(session.created_at)}</td>
                          <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-500">${session.duration} 分钟</td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>
              ` : `
                <div class="mt-2 text-sm text-gray-500">
                  暂无活跃会话
                </div>
              `}
            </div>
          </div>
        `;
      } else {
        modalBody.innerHTML = `
          <div class="text-center py-8">
            <i class="fas fa-exclamation-circle text-red-500 text-4xl mb-4"></i>
            <p class="text-gray-700">获取机器详情失败: ${data.message}</p>
          </div>
        `;
      }
    })
    .catch(error => {
      modalBody.innerHTML = `
        <div class="text-center py-8">
          <i class="fas fa-exclamation-circle text-red-500 text-4xl mb-4"></i>
          <p class="text-gray-700">获取机器详情失败: ${error.message}</p>
        </div>
      `;
    });
}

// 刷新机器列表
function refreshMachinesList() {
  // 重新加载页面
  window.location.reload();
}

// 筛选机器
function filterMachines() {
  const statusFilter = document.getElementById('status-filter');
  const selectedStatus = statusFilter.value;
  
  const rows = document.querySelectorAll('tbody tr');
  
  rows.forEach(row => {
    const statusCell = row.querySelector('.machine-status');
    const statusText = statusCell.textContent.trim().toLowerCase();
    
    if (selectedStatus === 'all' || statusText.includes(selectedStatus)) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  });
}
