const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

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

    // 尝试第一种目录结构：./prebuilt-sqlite3/<platform>/better-sqlite3-build
    const sourceDir1 = path.join(__dirname, 'prebuilt-sqlite3', directoryName, 'better-sqlite3-build');

    // 尝试第二种目录结构：./prebuilt-sqlite3/<platform>
    const sourceDir2 = path.join(__dirname, 'prebuilt-sqlite3', directoryName);

    // 尝试第三种目录结构：./prebuilt-sqlite3/better-sqlite3-build
    const sourceDir3 = path.join(__dirname, 'prebuilt-sqlite3', 'better-sqlite3-build');

    // 检查哪个目录存在
    if (fs.existsSync(sourceDir1) && fs.existsSync(path.join(sourceDir1, 'better_sqlite3.node'))) {
      sourceDir = sourceDir1;
    } else if (fs.existsSync(sourceDir2) && fs.existsSync(path.join(sourceDir2, 'better_sqlite3.node'))) {
      sourceDir = sourceDir2;
    } else if (fs.existsSync(sourceDir3) && fs.existsSync(path.join(sourceDir3, 'better_sqlite3.node'))) {
      sourceDir = sourceDir3;
    } else {
      console.error(`错误: 找不到平台 ${directoryName} 的预编译文件`);
      console.error(`请确保预编译文件存在于以下目录之一：`);
      console.error(`- ${sourceDir1}`);
      console.error(`- ${sourceDir2}`);
      console.error(`- ${sourceDir3}`);
      process.exit(1);
    }

    const targetDir = path.join(__dirname, 'node_modules', 'better-sqlite3', 'build', 'Release');

    // 确保目标目录存在
    if (!fs.existsSync(path.dirname(targetDir))) {
      fs.mkdirSync(path.dirname(targetDir), { recursive: true });
    }

    // 复制文件
    console.log(`复制 ${sourceDir} 到 ${targetDir}`);

    // 在 Linux/macOS 上使用 cp 命令
    if (platform === 'linux' || platform === 'darwin') {
      execSync(`cp -r "${sourceDir}" "${path.dirname(targetDir)}"`);
    }
    // 在 Windows 上使用 xcopy 命令
    else if (platform === 'win32') {
      execSync(`xcopy "${sourceDir}" "${targetDir}" /E /I /Y`);
    }

    console.log('✅ 成功复制预编译的 SQLite3 文件');
  } catch (error) {
    console.error('❌ 错误:', error.message);
    process.exit(1);
  }
}

// 执行主函数
main();
