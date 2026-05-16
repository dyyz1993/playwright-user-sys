import * as grpc from '@grpc/grpc-js';
import { logger } from '@shared/utils/logger.js';
import { MachineModel } from '../../models/machine.model.js';
import type {
  RegisterRequest,
  RegisterResponse,
  LaunchBrowserRequest,
  SessionResponse,
  CloseBrowserRequest,
  SessionStatusUpdate,
  MachineStatusRequest,
  MachineStatusResponse,
  MachineMessage,
  ManagerMessage,
} from '../../shared/types/grpc.js';
import type { ServerUnaryCall, sendUnaryData, ServerDuplexStream } from '@grpc/grpc-js';

function getConnectionManager() {
  return import('./index.js').then((m) => m.connectionManager);
}

export const serviceImplementation = {
  Register: async (
    call: ServerUnaryCall<RegisterRequest, RegisterResponse>,
    callback: sendUnaryData<RegisterResponse>
  ) => {
    try {
      const request = call.request;
      logger.info('收到机器注册请求:', request);

      const existingMachine = await MachineModel.findById(request.machine_id);

      if (existingMachine) {
        await MachineModel.update(request.machine_id, {
          hostname: request.name,
          ip: request.ip_address,
          grpcPort: request.grpc_port,
          proxyPort: request.proxy_port,
          maxInstances: request.max_sessions,
          status: 'online',
        });

        logger.info(
          `机器更新数据: ${JSON.stringify({
            hostname: request.name,
            ip: request.ip_address,
            grpcPort: request.grpc_port,
            proxyPort: request.proxy_port,
            maxInstances: request.max_sessions,
          })}`
        );

        logger.info(`机器已更新: ${request.machine_id}`);
      } else {
        await MachineModel.register({
          id: request.machine_id,
          hostname: request.name,
          ip: request.ip_address,
          grpcPort: request.grpc_port,
          proxyPort: request.proxy_port,
          maxInstances: request.max_sessions,
        });

        logger.info(
          `新机器数据: ${JSON.stringify({
            id: request.machine_id,
            hostname: request.name,
            ip: request.ip_address,
            grpcPort: request.grpc_port,
            proxyPort: request.proxy_port,
            maxInstances: request.max_sessions,
          })}`
        );

        logger.info(`机器已创建: ${request.machine_id}`);
      }

      const { memoryStore } = await import('../memory-store.service.js');
      memoryStore.updateMachineStatus({
        machine_id: request.machine_id,
        name: request.name,
        ip: request.ip_address,
        grpc_port: request.grpc_port,
        proxy_port: request.proxy_port || 8080,
        cpu_usage: 0,
        memory_usage: 0,
        disk_space: 0,
        active_sessions: 0,
        max_sessions: request.max_sessions || 10,
        last_heartbeat: new Date(),
      });
      logger.info(`内存状态已更新: ${request.machine_id}, grpc_port=${request.grpc_port}`);

      callback(null, { success: true, message: '注册成功' });
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : '机器注册失败';
      logger.error('机器注册失败:', error);
      callback({ code: grpc.status.INTERNAL, message: errMsg });
    }
  },

  Connect: (call: grpc.ServerDuplexStream<MachineMessage, ManagerMessage>) => {
    getConnectionManager().then((connectionManager) => {
      try {
        logger.info('收到新的 Connect 请求');

        logger.debug(`call 对象类型: ${typeof call}`);
        try {
          logger.debug(`call 对象方法: ${Object.getOwnPropertyNames(Object.getPrototypeOf(call)).join(', ')}`);
        } catch (error) {
          logger.error(`获取 call 对象方法失败:`, error);
        }

        const dataHandler = async (message: MachineMessage) => {
          logger.info('收到第一条消息:', message);

          try {
            logger.debug(`消息类型: ${typeof message}, 字段: ${Object.keys(message).join(', ')}`);
          } catch (error) {
            logger.error('解析消息字段失败:', error);
          }

          const machineId = message.machine_id;
          logger.info(`提取的机器 ID: ${machineId}`);

          if (!machineId) {
            logger.warn('收到的消息中缺少机器 ID');
            try {
              call.write({ error: { message: '缺少机器 ID' } });
              logger.info('已发送错误响应');
            } catch (writeError) {
              logger.error('发送错误响应失败:', writeError);
            }
            call.end();
            return;
          }

          try {
            const machine = await MachineModel.findById(machineId);
            if (!machine) {
              logger.warn(`未注册的机器尝试连接，已拒绝: ${machineId}`);
              try {
                call.write({ error: { message: `机器未注册: ${machineId}` } });
              } catch (writeError) {
                logger.error('发送错误响应失败:', writeError);
              }
              call.end();
              return;
            }
            logger.info(`机器注册验证通过: ${machineId}`);
          } catch (error) {
            logger.error(`验证机器注册状态时出错 (${machineId}):`, error);
            call.end();
            return;
          }

          logger.info(`移除数据监听器，转由连接管理器处理 (machineId: ${machineId})`);
          call.removeListener('data', dataHandler);

          logger.info(`添加机器连接: ${machineId}`);
          connectionManager.addConnection(machineId, call);
        };

        call.on('data', dataHandler);

        call.on('error', (error: unknown) => {
          logger.error('gRPC 连接错误:', error);
        });

        call.on('end', () => {
          logger.info('gRPC 连接结束');
        });
      } catch (error: unknown) {
        logger.error('处理 Connect 请求失败:', error);
        call.end();
      }
    });
  },

  LaunchBrowser: async (
    call: ServerUnaryCall<LaunchBrowserRequest, SessionResponse>,
    callback: sendUnaryData<SessionResponse>
  ) => {
    const connectionManager = await getConnectionManager();
    try {
      const request = call.request;
      logger.info(`收到启动浏览器请求:`, request);

      const { session_id, options } = request;

      const machineId = (call.metadata.get('machine_id')?.[0] as string) || '';

      if (!machineId) {
        logger.error(`启动浏览器请求缺少机器 ID`);
        callback({
          code: grpc.status.INVALID_ARGUMENT,
          message: '缺少机器 ID',
        });
        return;
      }

      if (!connectionManager.isConnected(machineId)) {
        logger.error(`机器未连接: ${machineId}`);
        callback({
          code: grpc.status.FAILED_PRECONDITION,
          message: `机器未连接: ${machineId}`,
        });
        return;
      }

      try {
        const result = await connectionManager.launchBrowser(machineId, session_id, options ?? {});
        logger.info(`浏览器启动成功 (${machineId}, ${session_id})`);
        callback(null, result);
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : '启动浏览器失败';
        logger.error(`启动浏览器失败 (${machineId}, ${session_id}):`, error);
        callback({
          code: grpc.status.INTERNAL,
          message: errMsg,
        });
      }
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : '处理启动浏览器请求失败';
      logger.error('处理启动浏览器请求失败:', error);
      callback({
        code: grpc.status.INTERNAL,
        message: errMsg,
      });
    }
  },

  CloseBrowser: async (
    call: ServerUnaryCall<CloseBrowserRequest, SessionStatusUpdate>,
    callback: sendUnaryData<SessionStatusUpdate>
  ) => {
    const connectionManager = await getConnectionManager();
    try {
      const request = call.request;
      logger.info(`收到关闭浏览器请求:`, request);

      const { session_id } = request;

      const machineId = (call.metadata.get('machine_id')?.[0] as string) || '';

      if (!machineId) {
        logger.error(`关闭浏览器请求缺少机器 ID`);
        callback({
          code: grpc.status.INVALID_ARGUMENT,
          message: '缺少机器 ID',
        });
        return;
      }

      if (!connectionManager.isConnected(machineId)) {
        logger.error(`机器未连接: ${machineId}`);
        callback({
          code: grpc.status.FAILED_PRECONDITION,
          message: `机器未连接: ${machineId}`,
        });
        return;
      }

      try {
        const success = await connectionManager.closeBrowser(machineId, session_id);
        logger.info(`浏览器关闭${success ? '成功' : '失败'} (${machineId}, ${session_id})`);
        callback(null, {
          session_id,
          status: success ? 'closed' : 'error',
          error: success ? '' : '关闭浏览器失败',
          duration: 0,
        });
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : '关闭浏览器失败';
        logger.error(`关闭浏览器失败 (${machineId}, ${session_id}):`, error);
        callback({
          code: grpc.status.INTERNAL,
          message: errMsg,
        });
      }
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : '处理关闭浏览器请求失败';
      logger.error('处理关闭浏览器请求失败:', error);
      callback({
        code: grpc.status.INTERNAL,
        message: errMsg,
      });
    }
  },

  GetMachineStatus: async (
    call: ServerUnaryCall<MachineStatusRequest, MachineStatusResponse>,
    callback: sendUnaryData<MachineStatusResponse>
  ) => {
    const connectionManager = await getConnectionManager();
    try {
      const request = call.request;
      logger.info(`收到获取机器状态请求:`, request);

      const { machine_id } = request;

      if (!machine_id) {
        logger.error(`获取机器状态请求缺少机器 ID`);
        callback({
          code: grpc.status.INVALID_ARGUMENT,
          message: '缺少机器 ID',
        });
        return;
      }

      if (!connectionManager.isConnected(machine_id)) {
        logger.error(`机器未连接: ${machine_id}`);
        callback(null, {
          machine_id,
          online: false,
          cpu_usage: 0,
          memory_usage: 0,
          active_sessions: 0,
          max_sessions: 0,
          timestamp: Date.now(),
        });
        return;
      }

      try {
        const heartbeat = await connectionManager.getMachineStatus(machine_id);

        const machine = await MachineModel.findById(machine_id);

        logger.info(`成功获取机器状态 (${machine_id})`);
        callback(null, {
          machine_id,
          online: true,
          cpu_usage: heartbeat.cpu_usage,
          memory_usage: heartbeat.memory_usage,
          active_sessions: heartbeat.active_sessions,
          max_sessions: machine?.maxInstances || 0,
          timestamp: heartbeat.timestamp || Date.now(),
        });
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : '获取机器状态失败';
        logger.error(`获取机器状态失败 (${machine_id}):`, error);

        callback(null, {
          machine_id,
          online: false,
          cpu_usage: 0,
          memory_usage: 0,
          active_sessions: 0,
          max_sessions: 0,
          timestamp: Date.now(),
          error: errMsg,
        });
      }
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : '处理获取机器状态请求失败';
      logger.error('处理获取机器状态请求失败:', error);
      callback({
        code: grpc.status.INTERNAL,
        message: errMsg,
      });
    }
  },
};
