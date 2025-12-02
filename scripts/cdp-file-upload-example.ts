#!/usr/bin/env ts-node

/**
 * CDP 文件上传示例脚本
 * 演示如何在云端浏览器中使用本地文件
 */

import puppeteer from 'puppeteer-core';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

// 配置
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const API_KEY = process.env.API_KEY || 'your-api-key';

async function main() {
  try {
    console.log('开始演示 CDP 文件上传功能...');
    
    // 1. 创建会话
    console.log('\n1. 创建浏览器会话...');
    const sessionResponse = await fetch(`${API_BASE_URL}/api/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
      },
      body: JSON.stringify({
        viewport: {
          width: 1280,
          height: 800,
        },
      }),
    });

    if (!sessionResponse.ok) {
      throw new Error(`创建会话失败: ${sessionResponse.status} ${await sessionResponse.text()}`);
    }

    const sessionData = await sessionResponse.json();
    const { browserWSEndpoint } = sessionData.data;
    console.log('✅ 会话创建成功');
    console.log('浏览器 WebSocket 端点:', browserWSEndpoint);

    // 2. 连接到浏览器
    console.log('\n2. 连接到浏览器...');
    const browser = await puppeteer.connect({
      browserWSEndpoint,
      defaultViewport: { width: 1280, height: 800 },
    });
    console.log('✅ 浏览器连接成功');

    // 3. 打开页面
    console.log('\n3. 打开测试页面...');
    const page = await browser.newPage();
    
    // 创建一个简单的文件上传测试页面
    await page.setContent(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>文件上传测试</title>
      </head>
      <body>
        <h1>文件上传测试</h1>
        <form id="uploadForm">
          <input type="file" id="fileInput" name="file" />
          <br><br>
          <input type="submit" value="上传文件" />
        </form>
        <div id="result"></div>
      </body>
      </html>
    `);
    
    console.log('✅ 测试页面加载成功');

    // 4. 创建并上传测试文件
    console.log('\n4. 创建并上传测试文件...');
    const testContent = '这是一个测试文件的内容\nHello World!\nCDP 文件上传演示';
    const testFileName = 'cdp-test-file.txt';
    
    // 在本地创建测试文件
    const localTestFilePath = path.join(process.cwd(), testFileName);
    fs.writeFileSync(localTestFilePath, testContent);
    console.log('✅ 本地测试文件创建成功');

    // 5. 上传文件到服务器临时目录
    console.log('\n5. 上传文件到服务器...');
    
    // 创建表单数据
    const formData = new FormData();
    formData.append('file', new Blob([testContent], { type: 'text/plain' }), testFileName);
    
    const uploadResponse = await fetch(`${API_BASE_URL}/api/files/upload-temp`, {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY,
      },
      body: formData,
    });

    if (!uploadResponse.ok) {
      throw new Error(`文件上传失败: ${uploadResponse.status} ${await uploadResponse.text()}`);
    }

    const uploadData = await uploadResponse.json();
    const serverFilePath = uploadData.data.filepath; // 服务器上的文件路径
    console.log('✅ 文件上传成功');
    console.log('服务器文件路径:', serverFilePath);

    // 6. 使用 CDP 设置文件输入
    console.log('\n6. 使用 CDP 设置文件输入...');
    
    // 获取页面的 CDPSession
    const cdp = await page.target().createCDPSession();
    
    // 查找文件输入元素
    const fileInput = await page.$('#fileInput');
    if (!fileInput) {
      throw new Error('未找到文件输入元素');
    }
    
    // 获取元素的 objectId
    const { objectId } = await cdp.send('DOM.resolveNode', {
      backendNodeId: (await fileInput.backendNodeId()) as any
    });
    
    // 使用 CDP 设置文件输入的值
    await cdp.send('DOM.setFileInputFiles', {
      objectId,
      files: [serverFilePath] // 使用服务器上的文件路径
    });
    
    console.log('✅ CDP 文件输入设置成功');

    // 7. 验证文件是否设置成功
    console.log('\n7. 验证文件输入...');
    const fileName = await page.evaluate(() => {
      const input = document.getElementById('fileInput') as HTMLInputElement;
      return input.files?.[0]?.name || '未选择文件';
    });
    
    console.log('文件输入值:', fileName);

    // 8. 提交表单（模拟）
    console.log('\n8. 提交表单...');
    await page.evaluate(() => {
      const form = document.getElementById('uploadForm') as HTMLFormElement;
      // 这里只是演示，实际应用中可能需要处理文件上传逻辑
      document.getElementById('result')!.innerHTML = '<p>文件已通过 CDP 成功设置!</p>';
    });
    
    console.log('✅ 表单提交完成');

    // 9. 清理本地测试文件
    console.log('\n9. 清理本地测试文件...');
    fs.unlinkSync(localTestFilePath);
    console.log('✅ 本地测试文件清理完成');

    // 10. 关闭浏览器
    console.log('\n10. 关闭浏览器...');
    await browser.close();
    console.log('✅ 浏览器已关闭');

    console.log('\n🎉 CDP 文件上传演示完成!');
    
  } catch (error) {
    console.error('❌ 演示过程中发生错误:', error);
    process.exit(1);
  }
}

// 执行主函数
if (require.main === module) {
  main();
}

export default main;