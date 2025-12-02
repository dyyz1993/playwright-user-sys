import { v4 as uuidv4 } from 'uuid';
import os from 'os';
import path from 'path';
import fs from 'fs';

// 加载环境变量
const env = process.env;

// 确保数据目录存在
const dataDir = env.DATA_DIR || path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// 确保临时文件目录存在
const tempDir = path.join(dataDir, 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

export const CONFIG = {
  // 机器标识
  machineId: env.MACHINE_ID || uuidv4(),
  machineName: env.MACHINE_NAME || os.hostname(),

  // 网络配置
  managerHost: env.MANAGER_HOST || 'localhost:50051', // 管理端的地址
  grpcPort: parseInt(env.MACHINE_GRPC_PORT || '50052', 10),  // 机器端的 gRPC 端口
  proxyPort: parseInt(env.PROXY_PORT || env.HTTP_PORT || '8082', 10), // 代理服务器端口

  // 浏览器配置
  maxSessions: parseInt(env.MAX_SESSIONS || '10', 10),
  sessionTimeout: parseInt(env.SESSION_TIMEOUT || '300000', 10), // 5分钟
  chromePath: env.CHROME_PATH || '/Applications/Google Chrome 2.app/Contents/MacOS/Google Chrome',
  // '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',

  // 心跳配置
  heartbeatInterval: parseInt(env.HEARTBEAT_INTERVAL || '30000', 10), // 30秒

  // 断开连接超时（如果用户断开连接后多长时间内没有重连，则关闭浏览器实例）
  disconnectionTimeout: parseInt(env.DISCONNECTION_TIMEOUT || '10000', 10), // 10秒

  // 活动报告间隔（多久向管理端报告一次会话活动）
  activityReportInterval: parseInt(env.ACTIVITY_REPORT_INTERVAL || '3000', 10), // 3秒

  // 会话活动超时（如果超过这个时间没有收到活动，则认为会话已断开）
  sessionActivityTimeout: parseInt(env.SESSION_ACTIVITY_TIMEOUT || '10000', 10), // 10秒

  // 数据目录
  dataDir: dataDir,
  
  // 临时文件目录（用于文件上传）
  tempDir: tempDir
};

export default CONFIG;