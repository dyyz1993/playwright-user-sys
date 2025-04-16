// 测试管理后台脚本

// 服务器地址
const SERVER_URL = 'http://localhost:3000';

// 测试端点
const TEST_ENDPOINTS = [
  '/',                // 根路径（应该重定向到 /admin）
  '/admin',           // 管理后台首页（应该重定向到 /admin/login）
  '/admin/login',     // 登录页面
  '/docs',            // Swagger UI
  '/public/css'       // 静态文件目录
];

// 发送请求并处理响应
async function testEndpoint(endpoint) {
  const url = `${SERVER_URL}${endpoint}`;
  
  try {
    console.log(`测试端点: ${url}`);
    
    const startTime = Date.now();
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'text/html,application/json'
      },
      redirect: 'manual' // 不自动跟随重定向
    });
    const endTime = Date.now();
    
    const responseTime = endTime - startTime;
    const contentType = response.headers.get('content-type') || '';
    const location = response.headers.get('location') || '';
    
    console.log(`状态码: ${response.status}`);
    console.log(`响应时间: ${responseTime}ms`);
    console.log(`内容类型: ${contentType}`);
    
    if (response.status >= 300 && response.status < 400) {
      console.log(`重定向到: ${location}`);
    } else if (contentType.includes('application/json')) {
      try {
        const data = await response.json();
        console.log('响应数据:', JSON.stringify(data, null, 2).substring(0, 200) + '...');
      } catch (e) {
        console.log('无法解析 JSON 响应');
      }
    } else if (contentType.includes('text/html')) {
      const text = await response.text();
      console.log('HTML 响应长度:', text.length);
      console.log('HTML 响应片段:', text.substring(0, 200) + '...');
    } else {
      console.log('非 HTML/JSON 响应');
    }
    
    return {
      endpoint,
      status: response.status,
      responseTime,
      contentType,
      location,
      success: response.status < 500
    };
  } catch (error) {
    console.error(`请求失败: ${error.message}`);
    return {
      endpoint,
      status: 0,
      responseTime: 0,
      contentType: '',
      location: '',
      success: false,
      error: error.message
    };
  }
}

// 主测试函数
async function runTests() {
  console.log('开始测试管理后台...');
  console.log(`服务器地址: ${SERVER_URL}`);
  
  const results = [];
  
  for (const endpoint of TEST_ENDPOINTS) {
    console.log('\n------------------------------');
    const result = await testEndpoint(endpoint);
    results.push(result);
    console.log('------------------------------\n');
  }
  
  // 打印测试结果摘要
  console.log('\n===== 测试结果摘要 =====');
  const successCount = results.filter(r => r.success).length;
  console.log(`总测试: ${results.length}`);
  console.log(`成功: ${successCount}`);
  console.log(`失败: ${results.length - successCount}`);
  
  console.log('\n端点状态:');
  results.forEach(r => {
    const statusSymbol = r.success ? '✅' : '❌';
    let statusInfo = `${r.status}`;
    if (r.status >= 300 && r.status < 400) {
      statusInfo += ` → ${r.location}`;
    }
    console.log(`${statusSymbol} ${r.endpoint} - ${statusInfo} (${r.responseTime}ms)`);
  });
}

// 运行测试
runTests();
