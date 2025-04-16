const { chromium } = require('playwright');

(async () => {
  console.log('启动 Playwright 测试...');
  
  // 启动浏览器
  const browser = await chromium.launch({
    headless: false, // 设置为 false 以便可以看到浏览器界面
    slowMo: 100 // 放慢操作速度，便于观察
  });
  
  // 创建新页面
  const page = await browser.newPage();
  
  try {
    // 访问登录页面
    console.log('访问登录页面...');
    await page.goto('http://localhost:3000/admin/login');
    
    // 输入用户名和密码
    console.log('输入登录信息...');
    await page.fill('input[name="username"]', 'admin');
    await page.fill('input[name="password"]', 'REDACTED_ADMIN_PASS');
    
    // 点击登录按钮
    console.log('点击登录按钮...');
    await page.click('button[type="submit"]');
    
    // 等待页面加载
    console.log('等待页面加载...');
    await page.waitForNavigation();
    
    // 验证是否成功登录（检查URL是否为仪表盘页面）
    const currentUrl = page.url();
    console.log('当前页面URL:', currentUrl);
    
    if (currentUrl.includes('/admin') && !currentUrl.includes('/login')) {
      console.log('登录成功！');
      
      // 访问用户管理页面
      console.log('访问用户管理页面...');
      await page.click('a[href="/admin/users"]');
      
      // 等待页面加载
      await page.waitForTimeout(1000);
      
      // 点击添加点数按钮（第一个用户）
      console.log('点击添加点数按钮...');
      await page.click('.add-credits-btn');
      
      // 等待模态框显示
      await page.waitForSelector('#add-credits-modal:not(.hidden)');
      
      // 输入点数
      console.log('输入点数...');
      await page.fill('input[name="amount"]', '100');
      await page.fill('input[name="reason"]', '测试添加点数');
      
      // 点击添加按钮
      console.log('点击添加按钮...');
      await page.click('#add-credits-form button[type="submit"]');
      
      // 等待响应
      await page.waitForTimeout(2000);
      
      // 检查是否有成功通知
      const successNotification = await page.$('.bg-green-500');
      if (successNotification) {
        console.log('添加点数成功！');
      } else {
        console.log('添加点数可能失败，未检测到成功通知。');
        
        // 检查是否有错误通知
        const errorNotification = await page.$('.bg-red-500');
        if (errorNotification) {
          const errorText = await errorNotification.textContent();
          console.log('错误信息:', errorText);
        }
      }
    } else {
      console.log('登录失败！');
    }
    
    // 等待一段时间，以便观察结果
    console.log('等待10秒后关闭浏览器...');
    await page.waitForTimeout(10000);
    
  } catch (error) {
    console.error('测试过程中出错:', error);
  } finally {
    // 关闭浏览器
    await browser.close();
    console.log('测试完成，浏览器已关闭。');
  }
})();
