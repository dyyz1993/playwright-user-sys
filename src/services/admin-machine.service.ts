import { MachineModel } from '../models/machine.model.js';
import { OperationLogModel } from '../models/operation-log.model.js';
import { v4 as uuidv4 } from 'uuid';

export async function addMachine(
  body: { hostname: string; ip: string; grpcPort?: number; proxyPort?: number; maxInstances?: number },
  adminId: number
) {
  const existingMachines = await MachineModel.getAll();
  const ipExists = existingMachines.some((m) => m.ip === body.ip);
  if (ipExists) {
    throw new Error('该IP地址的机器已存在');
  }

  const machineId = uuidv4();

  const machineData = {
    id: machineId,
    hostname: body.hostname,
    ip: body.ip,
    grpcPort: body.grpcPort,
    proxyPort: body.proxyPort,
    maxInstances: body.maxInstances || 10,
    instanceCount: 0,
  };

  const machine = await MachineModel.register(machineData);
  if (!machine) {
    throw new Error('创建机器失败');
  }

  OperationLogModel.create({
    admin_id: adminId,
    action: '添加机器',
    details: {
      hostname: body.hostname,
      ip: body.ip,
      grpcPort: body.grpcPort,
      proxyPort: body.proxyPort,
    },
  }).catch(() => {});

  return machine;
}

export async function batchRestartMachines(
  machineIds: string[],
  adminId: number
): Promise<{ restarted: string[]; failed: Array<{ machineId: string; error: string }> }> {
  const { connectionManager } = await import('./machine-grpc.service.js');

  const restarted: string[] = [];
  const failed: Array<{ machineId: string; error: string }> = [];

  for (const machineId of machineIds) {
    try {
      const machine = await MachineModel.findById(machineId);
      if (!machine) {
        failed.push({ machineId, error: '机器不存在' });
        continue;
      }

      if (!connectionManager.isConnected(machineId)) {
        failed.push({ machineId, error: '机器未连接，无法发送重启命令' });
        continue;
      }

      connectionManager.sendRestartCommand(machineId);

      await MachineModel.update(machineId, { status: 'offline' });

      restarted.push(machineId);

      OperationLogModel.create({
        admin_id: adminId,
        action: '批量重启机器',
        details: { hostname: machine.hostname },
      }).catch(() => {});
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '重启失败';
      failed.push({ machineId, error: message });
    }
  }

  return { restarted, failed };
}

export async function getMachineDetail(machineId: string) {
  return MachineModel.getDetailById(machineId);
}

export async function updateMachineConfig(
  machineId: string,
  body: { hostname?: string; ip?: string; grpcPort?: number; proxyPort?: number; maxInstances?: number },
  adminId: number
) {
  const existingMachine = await MachineModel.findById(machineId);
  if (!existingMachine) {
    throw new Error('机器不存在');
  }

  const updatedMachine = await MachineModel.update(machineId, body);
  if (!updatedMachine) {
    throw new Error('更新机器失败');
  }

  OperationLogModel.create({
    admin_id: adminId,
    action: '更新机器配置',
    details: {
      hostname: body.hostname,
      ip: body.ip,
      maxInstances: body.maxInstances,
    },
  }).catch(() => {});

  return updatedMachine;
}

export async function healthCheckMachine(machineId: string) {
  return MachineModel.healthCheck(machineId);
}

export async function batchHealthCheck(machineIds: string[]) {
  return MachineModel.batchHealthCheck(machineIds);
}
