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

  // 初始化高级搜索（如果存在）
  initAdvancedSearch();
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
      row.classList.add('table-hover', 'table-row-animate');
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
        
        // 触发自定义事件，让页面脚本处理排序
        const event = new CustomEvent('table-sort', {
          detail: { key: sortKey, direction: newDirection }
        });
        document.dispatchEvent(event);
      });
    });
  });
}

// 初始化高级搜索
function initAdvancedSearch() {
  // 为所有搜索输入框添加防抖功能
  const searchInputs = document.querySelectorAll('[data-search-input]');
  
  searchInputs.forEach(input => {
    const debounceTime = parseInt(input.dataset.searchDebounce) || 500;
    const searchUrl = input.dataset.searchUrl || window.location.pathname;
    
    // 初始值
    input.addEventListener('input', window.appUtils.debounce(function() {
      const value = this.value.trim();
      const url = new URL(window.location.href);
      
      if (value) {
        url.searchParams.set('search', value);
      } else {
        url.searchParams.delete('search');
      }
      url.searchParams.set('page', '1'); // 搜索时重置到第一页
      
      window.location.href = url.toString();
    }, debounceTime));
  });

  // 为筛选下拉框添加即时筛选功能
  const filters = document.querySelectorAll('[data-filter-select]');
  
  filters.forEach(select => {
    select.addEventListener('change', function() {
      const url = new URL(window.location.href);
      const paramName = this.dataset.filterParam || this.id.replace('filter', '').toLowerCase();
      
      if (this.value) {
        url.searchParams.set(paramName, this.value);
      } else {
        url.searchParams.delete(paramName);
      }
      url.searchParams.set('page', '1'); // 筛选时重置到第一页
      
      window.location.href = url.toString();
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
function showNotification(message, type) {
  window.appUtils.Toast[type === 'success' ? 'success' : type === 'error' ? 'error' : type === 'warning' ? 'warning' : 'info'](message);
}

function confirmAction(message, callback) {
  window.appUtils.confirmAction(message, callback);
}

function formatDate(date) {
  return window.appUtils.formatDate(date);
}

function formatNumber(num) {
  return window.appUtils.formatNumber(num);
}

// 确认对话框
function confirmAction(message, callback) {
  window.appUtils.confirmAction(message, callback);
}

// 格式化日期
function formatDate(date) {
  if (!date) return '';
  
  const d = new Date(date);
  return d.toLocaleDateString('zh-CN') + ' ' + d.toLocaleTimeString('zh-CN');
}

// 格式化数字
function formatNumber(num) {
  return new Intl.NumberFormat('zh-CN').format(num);
}

// 导出工具函数
window.appUtils = window.appUtils || {};

Object.assign(window.appUtils, {
  showNotification,
  confirmAction,
  formatDate,
  formatNumber
});
