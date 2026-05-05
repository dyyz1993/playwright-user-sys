import { SessionModel } from '../models/session.model.js';
import { MachineModel } from '../models/machine.model.js';
import { UserModel } from '../models/user.model.js';
import { SessionStatus, SessionCreateOptions, WebhookEventType } from '@shared/types/index.js';
import { logger } from '@shared/utils/logger.js';
import { createWebhookEvent } from '../utils/webhook.js';
import { env } from '../config/env.js';

/**
 * 创建浏览器会话的核心服务
 * 从controller抽离出来，供API和WebSocket直连两种方式共同使用
 * @param userId 用户ID
 * @param options 会话选项
 * @param isWebSocketDirect 是否为WebSocket直连模式，默认为false
 */
export async function createBrowserSession(
  userId: number,
  options: SessionCreateOptions = {},
  isWebSocketDirect = false
) {
  // 检查用户是否存在
  const user = await UserModel.findById(userId);
  if (!user) {
    throw new Error('用户不存在');
  }

  // 检查用户点数是否足够
  if (user.credits <= 0) {
    throw new Error('点数不足，请联系管理员充值');
  }

  // 检查用户活跃会话数量是否超过限制
  const activeCount = await SessionModel.countActiveByUserId(user.id);
  const maxSessions = env.MAX_SESSIONS_PER_USER;
  if (activeCount >= maxSessions) {
    throw new Error(`Session limit reached: user has ${activeCount} active sessions, max is ${maxSessions}`);
  }

  // 确保至少有一个默认的viewport
  if (!options.viewport) {
    options.viewport = {
      width: 1280,
      height: 800,
    };
  }

  logger.info(`创建会话的选项: ${JSON.stringify(options)}`);

  // 查找可用的实例机器
  logger.info('开始查找可用的实例机器');
  const machine = await MachineModel.findAvailable();
  if (!machine) {
    logger.error('没有找到可用的实例机器');
    throw new Error('当前没有可用的实例机器，请稍后再试');
  }

  const machineId = machine.id;
  logger.info(`找到可用的实例机器: ${machineId}`);

  // 创建会话记录
  const session = await SessionModel.create({
    user_id: userId,
    options,
  });

  if (!session) {
    throw new Error('创建会话失败');
  }

  const sessionId = session.id;
  logger.info(`创建会话成功: ${sessionId}`);

  try {
    // 获取 connectionManager 并启动浏览器
    const { connectionManager } = await import('../services/machine-grpc.service.js');
    logger.info(`向机器 ${machineId} 发送启动浏览器请求 (sessionId: ${sessionId})`);

    // 将 userId 添加到 options 中，用于计算 userDataDir 路径
    const launchOptions = { ...options, userId };
    const result = await connectionManager.launchBrowser(machineId, sessionId, launchOptions);
    logger.info(`启动浏览器结果: ${JSON.stringify(result)}`);

    // 更新会话记录
    const now = new Date();
    await SessionModel.update(sessionId, {
      machine_id: machineId,
      port: result.port as number,
      status: isWebSocketDirect ? SessionStatus.CONNECTED : SessionStatus.CREATED,
      start_time: now,
    });

    // 增加机器实例计数
    await MachineModel.incrementInstanceCount(machineId);

    logger.info(`会话已更新并设置开始时间 (${sessionId}): ${now.toISOString()}`);

    // 触发 Webhook 事件
    await createWebhookEvent(userId, WebhookEventType.SESSION_CREATED, {
      session_id: sessionId,
      created_at: session.created_at,
    });

    logger.info(`原始 WebSocket 端点: ${result.browser_ws_endpoint}`);

    // 构建直连URL
    let directUrl;

    // 如果配置了公共访问的机器端点，优先使用该端点
    if (env.PUBLIC_MACHINE_ENDPOINT) {
      directUrl = `ws://${env.PUBLIC_MACHINE_ENDPOINT}?sessionId=${sessionId}`;
      logger.info(`使用公共端点构建 WebSocket 端点: ${directUrl}`);
    } else {
      // 测试环境中，机器端在本地运行，需要使用 127.0.0.1
      // 因为 getLocalIpAddress() 可能返回非 localhost 的 IP（如 192.168.x.x）
      // 但机器端实际监听的是 0.0.0.0:proxyPort，本地访问应该用 127.0.0.1
      const machineIp = process.env.NODE_ENV === 'test' ? '127.0.0.1' : machine.ip || 'localhost';
      // 使用机器的实际代理端口，如果没有则使用默认值8082
      const proxyPort = machine.proxyPort || 8082;
      directUrl = `ws://${machineIp}:${proxyPort}?sessionId=${sessionId}`;
      logger.info(`使用机器IP构建 WebSocket 端点: ${directUrl}`);
    }

    logger.info(`构建的直接 WebSocket 端点: ${directUrl}`);

    // 返回必要的信息
    return {
      sessionId,
      status: isWebSocketDirect ? SessionStatus.CONNECTED : SessionStatus.CREATED,
      browserWSEndpoint: result.browser_ws_endpoint, // 原生CDP端点
      directUrl, // 指向代理WebSocket的URL
      machineId,
      created_at: session.created_at,
    };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    // 检查是否是共享会话已存在的错误
    // 注意：gRPC 会将业务错误包装成 grpc.status.FAILED_PRECONDITION
    // 所以需要检查错误消息内容而不是 error.code
    const errorCode = (error as { code?: string }).code;
    if (
      errorCode === 'SHARED_SESSION_EXISTS' ||
      errMsg.includes('活跃的共享数据会话') ||
      errMsg.includes('每个用户同时只能有 1 个共享数据会话')
    ) {
      // 这是预期的业务错误，不需要更新数据库状态
      logger.warn(`共享会话冲突: ${errMsg}`);
      throw new Error(errMsg);
    }

    await SessionModel.update(sessionId, {
      status: SessionStatus.ERROR,
    });

    logger.error(`会话错误信息: ${errMsg}`);
    logger.error(`启动浏览器实例失败 (sessionId: ${sessionId}):`, error);

    throw new Error(`启动浏览器实例失败: ${errMsg}`);
  }
}

/**
 * 处理会话断开连接
 */
export async function handleSessionDisconnect(sessionId: string, userId: number, machineId: string) {
  try {
    logger.info(`处理会话断开连接 (sessionId: ${sessionId})`);

    // 查找会话记录
    const session = await SessionModel.findById(sessionId);
    if (!session) {
      logger.error(`会话不存在: ${sessionId}`);
      return;
    }

    // 检查会话状态，避免重复处理
    if (session.status === SessionStatus.DISCONNECTED || session.status === SessionStatus.ERROR) {
      logger.info(`会话已经处于断开状态: ${sessionId}`);
      return;
    }

    try {
      // 通知机器节点关闭浏览器
      const { connectionManager } = await import('../services/machine-grpc.service.js');
      logger.info(`向机器 ${machineId} 发送关闭浏览器请求 (sessionId: ${sessionId})`);
      await connectionManager.closeBrowser(machineId, sessionId);
    } catch (error) {
      logger.error(`关闭浏览器失败 (sessionId: ${sessionId}):`, error);
      // 即使关闭浏览器失败，仍然继续处理会话断开
    }

    // 计算会话持续时间
    const now = new Date();
    const startTime = new Date(session.start_time ?? 0);
    const duration = Math.floor((now.getTime() - startTime.getTime()) / 1000);
    logger.info(
      `计算会话持续时间 (${sessionId}): 开始时间=${startTime.toISOString()}, 结束时间=${now.toISOString()}, 持续时间=${duration}秒`
    );

    // 计算消耗的点数（每分钟1点，至少消耗1点）
    const minutes = duration > 0 ? Math.max(1, Math.ceil(duration / 60)) : 0;

    // 更新会话状态
    await SessionModel.markDisconnected(sessionId, duration);
    logger.info(`更新会话状态为已断开 (${sessionId}): 持续时间=${duration}秒, 消耗点数=${minutes}点`);

    await MachineModel.decrementInstanceCount(machineId);

    const disconnectedAt = new Date();
    await createWebhookEvent(userId, WebhookEventType.SESSION_DISCONNECTED, {
      session_id: sessionId,
      disconnected_at: disconnectedAt,
    });

    const updatedSession = await SessionModel.findById(sessionId);
    if (!updatedSession) {
      logger.error(`无法获取更新后的会话信息 (${sessionId})`);
      return;
    }

    if (updatedSession.credits_used === 0 && minutes > 0) {
      try {
        await UserModel.deductCredits(userId, minutes);
        logger.info(`已扣除用户 ${userId} 的点数: ${minutes} 点 (${sessionId})`);
      } catch (error) {
        logger.error('扣除点数失败:', error);
      }
    } else if (updatedSession.credits_used === 0 && minutes === 0) {
      logger.info(`会话无消耗点数，跳过扣除 (${sessionId})`);
    } else {
      logger.info(`会话已有消耗点数，不重复扣除 (${sessionId}): 消耗点数=${updatedSession.credits_used}点`);
    }
  } catch (error) {
    logger.error(`处理会话断开连接失败 (sessionId: ${sessionId}):`, error);
  }
}
