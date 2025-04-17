import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

// 获取当前文件的目录路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 获取当前平台信息
const platform = os.platform();
const arch = os.arch();

// 映射平台和架构到目录名
function mapToDirectoryName(platform, arch) {
  let osName;
  let archName;

  // 映射操作系统
  switch (platform) {
    case 'linux':
      osName = 'linux';
      break;
    case 'darwin':
      osName = 'darwin';
      break;
    case 'win32':
      osName = 'windows';
      break;
    default:
      throw new Error(`不支持的操作系统: ${platform}`);
  }

  // 映射架构
  switch (arch) {
    case 'x64':
      archName = 'amd64';
      break;
    case 'arm64':
      archName = 'arm64';
      break;
    default:
      throw new Error(`不支持的架构: ${arch}`);
  }

  return `${osName}-${archName}`;
}

// 主函数
function main() {
  try {
    const directoryName = mapToDirectoryName(platform, arch);
    console.log(`检测到平台: ${platform}, 架构: ${arch}, 目录名: ${directoryName}`);

    // 检查不同的目录结构
    let sourceDir;
    let nodePath;

    // 尝试第一种目录结构：./prebuilt-sqlite3/<platform>/better-sqlite3-build
    const sourceDir1 = path.join(__dirname, 'prebuilt-sqlite3', directoryName, 'better-sqlite3-build');
    const nodePath1 = path.join(sourceDir1, 'better_sqlite3.node');

    // 尝试第二种目录结构：./prebuilt-sqlite3/<platform>
    const sourceDir2 = path.join(__dirname, 'prebuilt-sqlite3', directoryName);
    const nodePath2 = path.join(sourceDir2, 'better_sqlite3.node');

    // 尝试第三种目录结构：./prebuilt-sqlite3/better-sqlite3-build
    const sourceDir3 = path.join(__dirname, 'prebuilt-sqlite3', 'better-sqlite3-build');
    const nodePath3 = path.join(sourceDir3, 'better_sqlite3.node');

    // 检查哪个目录存在
    if (fs.existsSync(nodePath1)) {
      sourceDir = sourceDir1;
      nodePath = nodePath1;
    } else if (fs.existsSync(nodePath2)) {
      sourceDir = sourceDir2;
      nodePath = nodePath2;
    } else if (fs.existsSync(nodePath3)) {
      sourceDir = sourceDir3;
      nodePath = nodePath3;
    } else {
      console.error(`错误: 找不到平台 ${directoryName} 的预编译文件`);
      console.error(`请确保预编译文件存在于以下目录之一：`);
      console.error(`- ${nodePath1}`);
      console.error(`- ${nodePath2}`);
      console.error(`- ${nodePath3}`);
      process.exit(1);
    }

    console.log(`✅ 找到平台 ${directoryName} 的预编译文件`);
    console.log(`📁 文件位置: ${nodePath}`);

    // 尝试加载模块（仅在 Node.js 环境中）
    try {
      // 创建临时目录
      const tempDir = path.join(os.tmpdir(), 'sqlite3-check');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      // 复制文件到临时目录
      const tempNodePath = path.join(tempDir, 'better_sqlite3.node');
      fs.copyFileSync(nodePath, tempNodePath);

      // 尝试加载模块
      console.log(`🔍 尝试加载模块...`);

      // 创建一个简单的测试脚本
      const testScriptPath = path.join(tempDir, 'test.cjs');
      fs.writeFileSync(testScriptPath, `
        try {
          process.dlopen(module, "${tempNodePath.replace(/\\/g, '\\\\')}");
          console.log('✅ 模块加载成功，与当前环境兼容');
          process.exit(0);
        } catch (error) {
          console.error('❌ 模块加载失败:', error.message);
          process.exit(1);
        }
      `);

      // 执行测试脚本（使用 CommonJS）
      execSync(`node "${testScriptPath}"`, { stdio: 'inherit' });

      // 清理临时文件
      fs.unlinkSync(testScriptPath);
      fs.unlinkSync(tempNodePath);
      fs.rmdirSync(tempDir);

    } catch (error) {
      console.error(`❌ 兼容性检查失败: ${error.message}`);
      console.error('请确保预编译文件与当前环境兼容');
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ 错误:', error.message);
    process.exit(1);
  }
}

// 执行主函数
main();
