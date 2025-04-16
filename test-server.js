// 测试服务器脚本
const { setTimeout } = require('node:timers/promises');

// 服务器地址
const SERVER_URL = 'http://localhost:3000';

// 测试用户凭据
const TEST_ADMIN = {
  username: 'admin',
  password: 'REDACTED_ADMIN_PASS'
};

// 测试用户凭据
const TEST_USER = {
  username: 'user',
  password: 'user123'
};

// 存储认证令牌
let adminToken = '';
let userToken = '';
let userApiKey = '';

// 发送请求并处理响应
async function sendRequest(endpoint, options = {}) {
  const url = `${SERVER_URL}${endpoint}`;
  
  try {
    console.log(`请求: ${options.method || 'GET'} ${url}`);
    
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.token ? { 'Authorization': `Bearer ${options.token}` } : {}),
        ...(options.apiKey ? { 'X-API-Key': options.apiKey } : {}),
        ...options.headers
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {})
    });
    
    const data = await response.json().catch(() => ({}));
    
    console.log(`状态码: ${response.status}`);
    console.log('响应数据:', JSON.stringify(data, null, 2));
    
    return { status: response.status, data };
  } catch (error) {
    console.error(`请求失败: ${error.message}`);
    return { status: 500, data: { success: false, error: error.message } };
  }
}

// 测试登录
async function testLogin() {
  console.log('\n===== 测试管理员登录 =====');
  const adminLoginResult = await sendRequest('/auth/login', {
    method: 'POST',
    body: TEST_ADMIN
  });
  
  if (adminLoginResult.status === 200 && adminLoginResult.data.success) {
    adminToken = adminLoginResult.data.data.token;
    console.log('管理员登录成功，获取到令牌');
  } else {
    console.error('管理员登录失败');
  }
  
  console.log('\n===== 测试用户登录 =====');
  const userLoginResult = await sendRequest('/auth/login', {
    method: 'POST',
    body: TEST_USER
  });
  
  if (userLoginResult.status === 200 && userLoginResult.data.success) {
    userToken = userLoginResult.data.data.token;
    console.log('用户登录成功，获取到令牌');
  } else {
    console.error('用户登录失败');
  }
}

// 测试获取当前用户信息
async function testGetCurrentUser() {
  console.log('\n===== 测试获取管理员信息 =====');
  await sendRequest('/auth/me', {
    token: adminToken
  });
  
  console.log('\n===== 测试获取用户信息 =====');
  await sendRequest('/auth/me', {
    token: userToken
  });
}

// 测试获取用户 API Key
async function testGetUserApiKey() {
  if (!userToken) {
    console.error('用户未登录，无法获取 API Key');
    return;
  }
  
  console.log('\n===== 测试获取用户 API Key =====');
  const result = await sendRequest('/users/me/apikey', {
    token: userToken
  });
  
  if (result.status === 200 && result.data.success) {
    userApiKey = result.data.data.apiKey;
    console.log('获取用户 API Key 成功');
  } else {
    console.error('获取用户 API Key 失败');
  }
}

// 测试创建会话
async function testCreateSession() {
  if (!userApiKey) {
    console.error('没有用户 API Key，无法创建会话');
    return;
  }
  
  console.log('\n===== 测试创建会话 =====');
  await sendRequest('/sessions', {
    method: 'POST',
    apiKey: userApiKey,
    body: {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      viewport: {
        width: 1280,
        height: 720
      }
    }
  });
}

// 测试获取用户会话列表
async function testGetUserSessions() {
  if (!userApiKey) {
    console.error('没有用户 API Key，无法获取会话列表');
    return;
  }
  
  console.log('\n===== 测试获取用户会话列表 =====');
  await sendRequest('/sessions', {
    apiKey: userApiKey
  });
}

// 测试获取机器列表
async function testGetMachines() {
  if (!adminToken) {
    console.error('管理员未登录，无法获取机器列表');
    return;
  }
  
  console.log('\n===== 测试获取机器列表 =====');
  await sendRequest('/machines', {
    token: adminToken
  });
}

// 测试获取用户列表
async function testGetUsers() {
  if (!adminToken) {
    console.error('管理员未登录，无法获取用户列表');
    return;
  }
  
  console.log('\n===== 测试获取用户列表 =====');
  await sendRequest('/users', {
    token: adminToken
  });
}

// 主测试函数
async function runTests() {
  console.log('开始测试服务器...');
  
  try {
    // 测试服务器是否在线
    console.log('\n===== 测试服务器是否在线 =====');
    const rootResponse = await sendRequest('/');
    
    if (rootResponse.status !== 200) {
      console.error('服务器可能未启动或不可访问');
      return;
    }
    
    // 执行测试
    await testLogin();
    await testGetCurrentUser();
    await testGetUserApiKey();
    await testGetUsers();
    await testGetMachines();
    await testCreateSession();
    await testGetUserSessions();
    
    console.log('\n===== 测试完成 =====');
  } catch (error) {
    console.error('测试过程中发生错误:', error);
  }
}

// 运行测试
runTests();
