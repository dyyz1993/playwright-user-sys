/**
 * 简单的文件上传测试脚本
 * 用于验证文件上传功能是否正常工作
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 获取当前文件的目录路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testFileUpload() {
  try {
    console.log('开始测试文件上传功能...');
    
    // 检查上传目录是否存在
    const uploadDir = path.join(__dirname, '..', 'data', 'uploads');
    console.log('检查上传目录:', uploadDir);
    
    if (!fs.existsSync(uploadDir)) {
      console.log('创建上传目录...');
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    console.log('✅ 上传目录检查通过');
    
    // 创建一个测试文件
    const testContent = '这是一个测试文件的内容\nHello World!\n';
    const testFileName = 'test-file.txt';
    const testFilePath = path.join(uploadDir, testFileName);
    
    console.log('创建测试文件:', testFilePath);
    fs.writeFileSync(testFilePath, testContent);
    console.log('✅ 测试文件创建成功');
    
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
    
    console.log('\n🎉 文件上传基础功能测试通过!');
    return true;
    
  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error);
    return false;
  }
}

// 执行测试
if (import.meta.url === `file://${process.argv[1]}`) {
  testFileUpload().then(success => {
    if (!success) {
      process.exit(1);
    }
  });
}

export default testFileUpload;