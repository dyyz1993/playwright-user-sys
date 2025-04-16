// 简单测试服务器脚本

// 服务器地址
const SERVER_URL = 'http://localhost:3000';

// 测试端点
const TEST_ENDPOINTS = [
  '/',                // 根路径
  '/auth/login',      // 登录端点
  '/docs/json',       // Swagger JSON
  '/docs'             // Swagger UI
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
        'Accept': 'application/json'
      }
    });
    const endTime = Date.now();
    
    const responseTime = endTime - startTime;
    const contentType = response.headers.get('content-type') || '';
    
    console.log(`状态码: ${response.status}`);
    console.log(`响应时间: ${responseTime}ms`);
    console.log(`内容类型: ${contentType}`);
    
    if (contentType.includes('application/json')) {
      try {
        const data = await response.json();
        console.log('响应数据:', JSON.stringify(data, null, 2).substring(0, 200) + '...');
      } catch (e) {
        console.log('无法解析 JSON 响应');
      }
    } else {
      console.log('非 JSON 响应');
    }
    
    return {
      endpoint,
      status: response.status,
      responseTime,
      contentType,
      success: response.status >= 200 && response.status < 400
    };
  } catch (error) {
    console.error(`请求失败: ${error.message}`);
    return {
      endpoint,
      status: 0,
      responseTime: 0,
      contentType: '',
      success: false,
      error: error.message
    };
  }
}

// 主测试函数
async function runTests() {
  console.log('开始测试服务器...');
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
    console.log(`${statusSymbol} ${r.endpoint} - ${r.status} (${r.responseTime}ms)`);
  });
}

// 运行测试
runTests();
