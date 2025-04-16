import fetch from 'node-fetch';

// 管理服务器 URL
const API_URL = process.env.API_URL || 'http://localhost:3000';

// 管理员凭据
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'REDACTED_ADMIN_PASS';

// 存储 JWT Token
let token = '';

/**
 * 发送 API 请求
 */
async function request(method, path, body) {
  const url = `${API_URL}${path}`;
  
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };
  
  if (token) {
    options.headers.Authorization = `Bearer ${token}`;
  }
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  const response = await fetch(url, options);
  
  if (!response.ok) {
    let errorMessage = `API 请求失败: ${response.status} ${response.statusText}`;
    
    try {
      const errorData = await response.json();
      if (errorData.error) {
        errorMessage = errorData.error;
      }
    } catch (e) {
      // 忽略解析错误
    }
    
    throw new Error(errorMessage);
  }
  
  return response.json();
}

/**
 * 管理员登录
 */
async function login() {
  const response = await request('POST', '/api/auth/login', {
    username: ADMIN_USERNAME,
    password: ADMIN_PASSWORD,
  });
  
  token = response.data.token;
  return response.data.user;
}

/**
 * 创建用户
 */
async function createUser(userData) {
  const response = await request('POST', '/api/users', userData);
  return response.data;
}

/**
 * 获取所有用户
 */
async function getUsers() {
  const response = await request('GET', '/api/users');
  return response.data;
}

/**
 * 添加点数
 */
async function addCredits(userId, amount) {
  const response = await request('POST', `/api/users/${userId}/add-credits`, {
    amount,
  });
  return response.data;
}

/**
 * 获取所有机器
 */
async function getMachines() {
  const response = await request('GET', '/api/machines');
  return response.data;
}

/**
 * 获取所有会话
 */
async function getSessions() {
  const response = await request('GET', '/api/sessions/admin/all');
  return response.data;
}

async function main() {
  try {
    // 登录
    console.log('管理员登录...');
    const admin = await login();
    console.log('登录成功:', admin);
    
    // 创建用户
    console.log('创建用户...');
    const user = await createUser({
      username: 'testuser',
      password: 'password123',
      email: 'test@example.com',
      credits: 100,
    });
    console.log('用户已创建:', user);
    
    // 获取所有用户
    console.log('获取所有用户...');
    const users = await getUsers();
    console.log('用户列表:', users);
    
    // 添加点数
    console.log('添加点数...');
    const updatedUser = await addCredits(user.id, 50);
    console.log('点数已添加:', updatedUser);
    
    // 获取所有机器
    console.log('获取所有机器...');
    const machines = await getMachines();
    console.log('机器列表:', machines);
    
    // 获取所有会话
    console.log('获取所有会话...');
    const sessions = await getSessions();
    console.log('会话列表:', sessions);
  } catch (error) {
    console.error('错误:', error.message);
  }
}

main();
