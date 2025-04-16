// 登录测试脚本

// 服务器地址
const SERVER_URL = 'http://localhost:3000';

// 测试用户凭据
const TEST_ADMIN = {
  username: 'admin',
  password: 'REDACTED_ADMIN_PASS'
};

// 发送登录请求
async function testLogin() {
  const url = `${SERVER_URL}/api/auth/login`;

  try {
    console.log(`测试登录: ${url}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(TEST_ADMIN)
    });

    console.log(`状态码: ${response.status}`);

    const contentType = response.headers.get('content-type') || '';
    console.log(`内容类型: ${contentType}`);

    if (contentType.includes('application/json')) {
      try {
        const data = await response.json();
        console.log('响应数据:', JSON.stringify(data, null, 2));

        if (data.success && data.data && data.data.token) {
          console.log('登录成功，获取到令牌');
          return data.data.token;
        } else {
          console.log('登录失败，未获取到令牌');
        }
      } catch (e) {
        console.log('无法解析 JSON 响应:', e.message);
      }
    } else {
      console.log('非 JSON 响应');
    }
  } catch (error) {
    console.error(`请求失败: ${error.message}`);
  }

  return null;
}

// 测试获取当前用户信息
async function testGetCurrentUser(token) {
  if (!token) {
    console.log('没有令牌，跳过获取用户信息测试');
    return;
  }

  const url = `${SERVER_URL}/api/auth/me`;

  try {
    console.log(`\n测试获取当前用户信息: ${url}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    console.log(`状态码: ${response.status}`);

    const contentType = response.headers.get('content-type') || '';
    console.log(`内容类型: ${contentType}`);

    if (contentType.includes('application/json')) {
      try {
        const data = await response.json();
        console.log('响应数据:', JSON.stringify(data, null, 2));
      } catch (e) {
        console.log('无法解析 JSON 响应:', e.message);
      }
    } else {
      console.log('非 JSON 响应');
    }
  } catch (error) {
    console.error(`请求失败: ${error.message}`);
  }
}

// 主测试函数
async function runTests() {
  console.log('开始测试登录...');

  // 测试登录
  const token = await testLogin();

  // 测试获取当前用户信息
  await testGetCurrentUser(token);

  console.log('\n测试完成');
}

// 运行测试
runTests();
