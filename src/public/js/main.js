// 主要 JavaScript 文件

// 当文档加载完成时执行
document.addEventListener('DOMContentLoaded', function() {
  // 设置当前活跃的侧边栏链接
  setActiveSidebarLink();
  
  // 初始化数据表格（如果存在）
  initDataTables();
  
  // 初始化图表（如果存在）
  initCharts();
  
  // 设置表单验证
  setupFormValidation();
});

// 设置当前活跃的侧边栏链接
function setActiveSidebarLink() {
  const currentPath = window.location.pathname;
  const sidebarLinks = document.querySelectorAll('.sidebar-link');
  
  sidebarLinks.forEach(link => {
    const href = link.getAttribute('href');
    
    // 检查当前路径是否与链接匹配
    if (currentPath === href || (href !== '/admin' && currentPath.startsWith(href))) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });
}

// 初始化数据表格
function initDataTables() {
  const dataTables = document.querySelectorAll('.data-table');
  
  if (dataTables.length === 0) return;
  
  dataTables.forEach(table => {
    // 添加表格悬停效果
    const rows = table.querySelectorAll('tbody tr');
    rows.forEach(row => {
      row.classList.add('table-hover');
    });
    
    // 添加排序功能
    const headers = table.querySelectorAll('thead th[data-sort]');
    headers.forEach(header => {
      header.addEventListener('click', function() {
        const sortKey = this.getAttribute('data-sort');
        const sortDirection = this.getAttribute('data-direction') || 'asc';
        
        // 切换排序方向
        const newDirection = sortDirection === 'asc' ? 'desc' : 'asc';
        this.setAttribute('data-direction', newDirection);
        
        // 更新排序图标
        headers.forEach(h => h.classList.remove('sorting-asc', 'sorting-desc'));
        this.classList.add(`sorting-${newDirection}`);
        
        // 这里可以添加实际的排序逻辑，或者通过 AJAX 请求服务器排序
        console.log(`Sorting by ${sortKey} in ${newDirection} order`);
      });
    });
  });
}

// 初始化图表
function initCharts() {
  // 检查是否有图表容器
  const chartContainers = document.querySelectorAll('[data-chart]');
  
  if (chartContainers.length === 0) return;
  
  // 这里可以添加图表库的初始化代码
  // 例如使用 Chart.js 或其他图表库
  console.log('Charts initialization would go here');
}

// 设置表单验证
function setupFormValidation() {
  const forms = document.querySelectorAll('form[data-validate]');
  
  forms.forEach(form => {
    form.addEventListener('submit', function(e) {
      const requiredFields = form.querySelectorAll('[required]');
      let isValid = true;
      
      requiredFields.forEach(field => {
        if (!field.value.trim()) {
          isValid = false;
          
          // 添加错误样式
          field.classList.add('border-red-500');
          
          // 查找或创建错误消息元素
          let errorMsg = field.nextElementSibling;
          if (!errorMsg || !errorMsg.classList.contains('error-message')) {
            errorMsg = document.createElement('p');
            errorMsg.classList.add('error-message', 'text-red-500', 'text-xs', 'mt-1');
            field.parentNode.insertBefore(errorMsg, field.nextSibling);
          }
          
          errorMsg.textContent = '此字段是必填的';
        } else {
          // 移除错误样式
          field.classList.remove('border-red-500');
          
          // 移除错误消息
          const errorMsg = field.nextElementSibling;
          if (errorMsg && errorMsg.classList.contains('error-message')) {
            errorMsg.remove();
          }
        }
      });
      
      if (!isValid) {
        e.preventDefault();
      }
    });
  });
}

// 显示通知
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `fixed top-4 right-4 p-4 rounded-lg shadow-lg z-50 ${
    type === 'success' ? 'bg-green-500' :
    type === 'error' ? 'bg-red-500' :
    type === 'warning' ? 'bg-yellow-500' : 'bg-blue-500'
  } text-white`;
  
  notification.innerHTML = `
    <div class="flex items-center">
      <i class="fas fa-${
        type === 'success' ? 'check-circle' :
        type === 'error' ? 'exclamation-circle' :
        type === 'warning' ? 'exclamation-triangle' : 'info-circle'
      } mr-3"></i>
      <span>${message}</span>
    </div>
  `;
  
  document.body.appendChild(notification);
  
  // 3秒后自动消失
  setTimeout(() => {
    notification.classList.add('opacity-0', 'transition-opacity');
    setTimeout(() => {
      notification.remove();
    }, 300);
  }, 3000);
}

// 确认对话框
function confirmAction(message, callback) {
  if (confirm(message)) {
    callback();
  }
}

// 格式化日期
function formatDate(date) {
  if (!date) return '';
  
  const d = new Date(date);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
}

// 格式化数字
function formatNumber(num) {
  return new Intl.NumberFormat().format(num);
}

// 导出工具函数
window.appUtils = {
  showNotification,
  confirmAction,
  formatDate,
  formatNumber
};
