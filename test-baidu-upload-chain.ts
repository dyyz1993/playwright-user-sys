import { chromium } from 'playwright';
import { execSync } from 'child_process';
import * as fs from 'fs';

const MANAGER_URL = 'http://192.168.0.29:3011';
const SSH_CMD = 'ssh -o StrictHostKeyChecking=no -p 10000 root@192.168.0.29';

async function getMachineLogs() {
  try {
    const logs = execSync(
      `${SSH_CMD} "docker logs playwright-machine-1-prod --tail 20 2>&1"`,
      { encoding: 'utf-8', timeout: 10000 }
    );
    return logs;
  } catch (e: any) {
    return `Error getting logs: ${e.message}`;
  }
}

async function main() {
  // 创建测试图片
  const testImagePath = '/tmp/test-upload-100x100.png';
  execSync(`python3 -c "
import struct, zlib
def create_png(w, h):
    def chunk(ctype, data):
        c = ctype + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
    raw = b''
    for y in range(h):
        raw += b'\\x00' + b'\\xff\\x00\\x00' * w
    return b'\\x89PNG\\r\\n\\x1a\\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b'')
with open('${testImagePath}', 'wb') as f:
    f.write(create_png(100, 100))
"`);
  console.log(`✅ 测试图片: ${testImagePath} (${fs.statSync(testImagePath).size} bytes)`);

  // 1. 登录
  console.log('\n📋 Step 1: 登录...');
  const loginRes = await fetch(`${MANAGER_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' })
  });
  const loginJson = await loginRes.json();
  const token = loginJson.data.token;
  console.log('  Login OK');

  // 2. 创建会话
  console.log('\n📋 Step 2: 创建会话...');
  const sessionRes = await fetch(`${MANAGER_URL}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ userId: 1, duration: 30 })
  });
  const sessionJson = await sessionRes.json();
  const sessionId = sessionJson.data.id;
  const wsUrl = sessionJson.data.browserWSEndpoint;
  console.log(`  Session: ${sessionId}`);
  console.log(`  WS URL: ${wsUrl}`);

  // 3. 连接远程浏览器（替换内网 IP 为公网 IP）
  console.log('\n📋 Step 3: 连接远程浏览器...');
  // 提取端口并在主机上使用相同端口（host:container 是 1:1 映射）
  const portMatch = wsUrl.match(/:(\d+)/);
  const wsPort = portMatch ? portMatch[1] : '8082';
  const publicWsUrl = wsUrl.replace(/\/\/[\d.]+:\d+/, `//192.168.0.29:${wsPort}`);
  console.log(`  连接: ${publicWsUrl}`);
  const browser = await chromium.connectOverCDP(publicWsUrl);
  const page = browser.contexts()[0]?.pages()[0] || await browser.contexts()[0].newPage();

  // 4. 导航到百度
  console.log('\n📋 Step 4: 导航到百度...');
  await page.goto('https://www.baidu.com', { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(3000);
  console.log(`  标题: ${await page.title()}`);

  // 5. 检查 __fileInputClickEvent 拦截器是否已注入
  console.log('\n📋 Step 5: 检查文件上传拦截器是否已注入...');
  const interceptorCheck = await page.evaluate(() => {
    const results: any = {};
    
    // 检查 prototype.click 是否被修改
    const origClick = HTMLInputElement.prototype.click.toString();
    results.clickPatched = origClick.includes('__fileInputClickEvent') || origClick.length > 100;
    results.clickSnippet = origClick.substring(0, 200);
    
    // 检查 __fileInputClickEvent 是否存在
    results.fileInputClickEvent = typeof (window as any).__fileInputClickEvent;
    results.fileInputClickEventValue = (window as any).__fileInputClickEvent;
    
    // 列出所有 file inputs
    const fileInputs = document.querySelectorAll('input[type="file"]');
    results.fileInputCount = fileInputs.length;
    results.fileInputs = Array.from(fileInputs).map((el: any) => ({
      id: el.id,
      name: el.name,
      accept: el.accept,
      display: getComputedStyle(el).display,
      rect: el.getBoundingClientRect()
    }));
    
    return results;
  });
  console.log('  拦截器检查结果:');
  console.log(`    click 被 patch: ${interceptorCheck.clickPatched}`);
  console.log(`    click 代码片段: ${interceptorCheck.clickSnippet.substring(0, 150)}...`);
  console.log(`    __fileInputClickEvent: ${interceptorCheck.fileInputClickEvent} = ${JSON.stringify(interceptorCheck.fileInputClickEventValue)}`);
  console.log(`    file input 数量: ${interceptorCheck.fileInputCount}`);
  if (interceptorCheck.fileInputs.length > 0) {
    console.log(`    file inputs: ${JSON.stringify(interceptorCheck.fileInputs)}`);
  }

  // 6. 尝试点击百度搜索框旁边的相机图标
  console.log('\n📋 Step 6: 查找相机/图片搜索入口...');
  
  // 先截图当前状态
  await page.screenshot({ path: '/tmp/baidu-upload-step6.png' });
  
  // 百度首页可能有 "百度一下" 按钮旁边有相机图标
  const cameraBtn = await page.evaluate(() => {
    const elements = document.querySelectorAll('*');
    for (const el of elements) {
      const text = (el as HTMLElement).textContent?.trim() || '';
      const cls = ((el as HTMLElement).className || '').toString();
      const title = (el as HTMLElement).title || '';
      if (text === '相机' || title.includes('相机') || title.includes('图片') || 
          cls.includes('camera') || cls.includes('soutu') || cls.includes('photo') ||
          cls.includes('image')) {
        const rect = (el as HTMLElement).getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          return {
            tag: el.tagName,
            text: text.substring(0, 50),
            cls,
            title,
            id: el.id,
            rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height }
          };
        }
      }
    }
    return null;
  });
  
  if (cameraBtn) {
    console.log(`  找到相机按钮: ${JSON.stringify(cameraBtn)}`);
  } else {
    console.log('  未找到相机按钮');
  }

  // 7. 导航到百度图片搜索页面（更直接）
  console.log('\n📋 Step 7: 导航到百度图片搜索页面...');
  await page.goto('https://image.baidu.com', { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(3000);
  console.log(`  标题: ${await page.title()}`);
  console.log(`  URL: ${page.url()}`);
  
  await page.screenshot({ path: '/tmp/baidu-upload-step7-image.png' });
  
  // 检查拦截器是否还在（SPA 导航不影响 prototype patch）
  const interceptorAfterNav = await page.evaluate(() => {
    return {
      clickPatched: HTMLInputElement.prototype.click.toString().includes('__fileInputClickEvent') || HTMLInputElement.prototype.click.toString().length > 100,
      fileInputCount: document.querySelectorAll('input[type="file"]').length,
    };
  });
  console.log(`  拦截器仍在: ${interceptorAfterNav.clickPatched}`);
  console.log(`  file input 数量: ${interceptorAfterNav.fileInputCount}`);

  // 8. 查找上传按钮
  console.log('\n📋 Step 8: 查找上传入口...');
  
  const uploadElements = await page.evaluate(() => {
    const uploadResults: any[] = [];
    document.querySelectorAll('*').forEach((el: any) => {
      const text = el.textContent?.trim() || '';
      const cls = (el.className || '').toString();
      const title = el.title || '';
      if ((text.includes('上传') || text.includes('本地上传') || text.includes('选择图片') ||
           cls.includes('upload') || title.includes('上传')) && 
          el.offsetWidth > 0 && el.offsetHeight > 0) {
        results.push({
          tag: el.tagName,
          text: text.substring(0, 100),
          cls: cls.substring(0, 100),
          title,
          id: el.id,
          rect: el.getBoundingClientRect()
        });
      }
    });
    return uploadResults.slice(0, 10);
  });
  console.log(`  上传相关元素 (${uploadElements.length} 个):`);
  uploadElements.forEach((el: any, i: number) => {
    console.log(`    [${i}] <${el.tag}> text="${el.text}" cls="${el.cls}" id="${el.id}"`);
  });

  // 9. 尝试点击上传按钮，看 file input 是否被动态创建
  console.log('\n📋 Step 9: 点击上传入口，观察 file input 变化...');
  
  // 记录点击前的 file input 数量
  const beforeCount = await page.evaluate(() => document.querySelectorAll('input[type="file"]').length);
  console.log(`  点击前 file input 数: ${beforeCount}`);
  
  // 找到并点击上传按钮
  let clicked = false;
  for (const el of uploadElements) {
    if (el.text.includes('上传') || el.text.includes('选择') || el.cls.includes('upload')) {
      try {
        await page.mouse.click(el.rect.x + el.rect.width / 2, el.rect.y + el.rect.height / 2);
        console.log(`  点击了: "${el.text}" @ (${el.rect.x + el.rect.width / 2}, ${el.rect.y + el.rect.height / 2})`);
        clicked = true;
        break;
      } catch {}
    }
  }
  
  if (!clicked) {
    console.log('  没找到可点击的上传按钮');
  }
  
  await page.waitForTimeout(2000);
  
  // 检查点击后的变化
  const afterResult = await page.evaluate(() => {
    const fileInputs = document.querySelectorAll('input[type="file"]');
    const results = Array.from(fileInputs).map((el: any) => ({
      id: el.id,
      name: el.name,
      accept: el.accept,
      multiple: el.multiple,
      display: getComputedStyle(el).display,
      visibility: getComputedStyle(el).visibility,
      opacity: getComputedStyle(el).opacity,
      parentTag: el.parentElement?.tagName,
      parentCls: (el.parentElement?.className || '').toString().substring(0, 50),
      rect: el.getBoundingClientRect()
    }));
    
    // 也检查 __fileInputClickEvent
    const fileEvent = (window as any).__fileInputClickEvent;
    
    return {
      fileInputCount: fileInputs.length,
      fileInputs: results,
      fileInputClickEvent: fileEvent
    };
  });
  console.log(`\n  点击后 file input 数: ${afterResult.fileInputCount}`);
  console.log(`  __fileInputClickEvent: ${JSON.stringify(afterResult.fileInputClickEvent)}`);
  if (afterResult.fileInputs.length > 0) {
    console.log(`  file input 详情:`);
    afterResult.fileInputs.forEach((fi: any, i: number) => {
      console.log(`    [${i}] id="${fi.id}" accept="${fi.accept}" display="${fi.display}" rect=${JSON.stringify(fi.rect)}`);
    });
  }

  await page.screenshot({ path: '/tmp/baidu-upload-step9-after-click.png' });

  // 10. 如果找到了 file input，尝试直接通过 Puppeteer 上传
  console.log('\n📋 Step 10: 尝试通过 Puppeteer 上传文件...');
  
  const fileInputs = await page.locator('input[type="file"]').all();
  if (fileInputs.length > 0) {
    try {
      // 找到最近创建的那个（通常是最后一个）
      const targetInput = fileInputs[fileInputs.length - 1];
      
      // 设置文件
      await targetInput.setInputFiles(testImagePath);
      console.log('  ✅ setInputFiles 成功！');
      
      await page.waitForTimeout(3000);
      await page.screenshot({ path: '/tmp/baidu-upload-step10-after-set.png' });
      
      const uploadResult = {
        url: page.url(),
        title: await page.title()
      };
      console.log(`  URL: ${uploadResult.url}`);
      console.log(`  标题: ${uploadResult.title}`);
    } catch (e: any) {
      console.log(`  ❌ setInputFiles 失败: ${e.message}`);
    }
  } else {
    console.log('  ❌ 没有找到 file input');
  }

  // 11. 查看服务端日志
  console.log('\n📋 Step 11: 查看服务端日志...');
  const logs = await getMachineLogs();
  console.log('  最近的 machine 日志:');
  logs.split('\n').filter(l => l.trim()).forEach(l => {
    if (l.includes('file') || l.includes('upload') || l.includes('inject') || l.includes('filechooser') || l.includes('error') || l.includes('Error')) {
      console.log(`    ${l}`);
    }
  });

  await browser.close();
  console.log('\n🔌 已断开连接');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
