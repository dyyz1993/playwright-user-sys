/**
 * 临时文件上传测试脚本
 * 用于验证临时文件上传功能是否正常工作
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 获取当前文件的目录路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testTempFileUpload() {
  try {
    console.log('开始测试临时文件上传功能...');
    
    // 检查临时目录是否存在
    const tempDir = path.join(__dirname, '..', 'data', 'temp');
    console.log('检查临时目录:', tempDir);
    
    if (!fs.existsSync(tempDir)) {
      console.log('创建临时目录...');
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    console.log('✅ 临时目录检查通过');
    
    // 创建一个测试文件
    const testContent = '这是一个临时测试文件的内容\nHello World!\n';
    const testFileName = 'temp-test-file.txt';
    const testFilePath = path.join(tempDir, testFileName);
    
    console.log('创建临时测试文件:', testFilePath);
    fs.writeFileSync(testFilePath, testContent);
    console.log('✅ 临时测试文件创建成功');
    
    // 检查文件是否创建成功
    if (fs.existsSync(testFilePath)) {
      const fileContent = fs.readFileSync(testFilePath, 'utf8');
      console.log('文件内容:', fileContent);
      console.log('✅ 文件读取测试通过');
    } else {
      console.error('❌ 文件创建失败');
      return false;
    }
    
    // 清理测试文件
    console.log('清理测试文件...');
    fs.unlinkSync(testFilePath);
    console.log('✅ 测试文件清理完成');
    
    console.log('\n🎉 临时文件上传基础功能测试通过!');
    return true;
    
  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error);
    return false;
  }
}

// 执行测试
if (import.meta.url === `file://${process.argv[1]}`) {
  testTempFileUpload().then(success => {
    if (!success) {
      process.exit(1);
    }
  });
}

export default testTempFileUpload;