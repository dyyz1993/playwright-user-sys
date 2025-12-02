#!/usr/bin/env ts-node

/**
 * 文件上传测试脚本
 * 用于测试文件上传功能
 */

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

// 配置
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'REDACTED_ADMIN_PASS';

async function main() {
  try {
    console.log('开始测试文件上传功能...');
    
    // 1. 管理员登录
    console.log('\n1. 管理员登录...');
    const loginResponse = await fetch(`${API_BASE_URL}/api/admin/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: ADMIN_USERNAME,
        password: ADMIN_PASSWORD,
      }),
    });

    if (!loginResponse.ok) {
      throw new Error(`登录失败: ${loginResponse.status} ${await loginResponse.text()}`);
    }

    const loginData = await loginResponse.json();
    const token = loginData.data.token;
    console.log('✅ 登录成功');
    console.log('Token:', token.substring(0, 20) + '...');

    // 2. 创建一个测试文件
    console.log('\n2. 创建测试文件...');
    const testContent = '这是一个测试文件的内容\nHello World!\n';
    const testFileName = 'test-file.txt';
    const testFilePath = path.join(process.cwd(), testFileName);
    
    fs.writeFileSync(testFilePath, testContent);
    console.log('✅ 测试文件创建成功');

    // 3. 上传文件
    console.log('\n3. 上传文件...');
    
    // 创建表单数据
    const formData = new FormData();
    // 注意：在Node.js中使用FormData时，需要将文件作为Blob添加
    // 但在实际的Node.js环境中，我们需要使用不同的方法
    // 这里我们使用fetch的body直接发送文件
    
    const fileBuffer = fs.readFileSync(testFilePath);
    
    // 使用fetch直接上传文件
    const uploadResponse = await fetch(`${API_BASE_URL}/api/files/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: fileBuffer,
    });

    if (!uploadResponse.ok) {
      throw new Error(`文件上传失败: ${uploadResponse.status} ${await uploadResponse.text()}`);
    }

    const uploadData = await uploadResponse.json();
    console.log('✅ 文件上传成功');
    console.log('上传结果:', JSON.stringify(uploadData, null, 2));

    // 4. 获取文件列表
    console.log('\n4. 获取文件列表...');
    const listResponse = await fetch(`${API_BASE_URL}/api/files`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!listResponse.ok) {
      throw new Error(`获取文件列表失败: ${listResponse.status} ${await listResponse.text()}`);
    }

    const listData = await listResponse.json();
    console.log('✅ 获取文件列表成功');
    console.log('文件列表:', JSON.stringify(listData, null, 2));

    // 5. 清理测试文件
    console.log('\n5. 清理测试文件...');
    fs.unlinkSync(testFilePath);
    console.log('✅ 测试文件清理完成');

    console.log('\n🎉 所有测试完成!');
    
  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error);
    process.exit(1);
  }
}

// 执行主函数
if (require.main === module) {
  main();
}

export default main;