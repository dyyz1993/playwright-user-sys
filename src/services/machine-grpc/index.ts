import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '@shared/utils/logger.js';
import { MachineConnectionManager } from './connection-manager.js';
import { serviceImplementation } from './service-handlers.js';
import type { RegisterRequest, RegisterResponse, MachineStatusResponse } from '../../shared/types/grpc.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const protoPath = path.resolve(__dirname, '../../shared/protos/machine_service.proto');
const packageDefinition = protoLoader.loadSync(protoPath, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

interface MachineServiceClient {
  Register(
    request: RegisterRequest,
    metadata: grpc.Metadata,
    callback: (err: unknown, response: RegisterResponse) => void
  ): void;
  LaunchBrowser(request: any, metadata: grpc.Metadata, callback: (err: unknown, response: any) => void): void;
  CloseBrowser(request: any, metadata: grpc.Metadata, callback: (err: unknown, response: any) => void): void;
  GetMachineStatus(
    request: any,
    metadata: grpc.Metadata,
    callback: (err: unknown, response: MachineStatusResponse) => void
  ): void;
}

const proto = grpc.loadPackageDefinition(packageDefinition).machine as unknown as {
  MachineService: {
    service: grpc.ServiceDefinition;
    new (address: string, credentials: grpc.ChannelCredentials, options?: object): MachineServiceClient;
  };
};

export const connectionManager = new MachineConnectionManager();
connectionManager.setProto(proto);

export function startGrpcServer(port: number = 50051): void {
  const server = new grpc.Server();
  server.addService(proto.MachineService.service, serviceImplementation);

  server.bindAsync(`0.0.0.0:${port}`, grpc.ServerCredentials.createInsecure(), (bindErr) => {
    if (bindErr) {
      logger.error('绑定 gRPC 服务器失败:', bindErr);
      return;
    }

    logger.info(`gRPC 服务器已启动并绑定到端口 ${port}`);
  });
}

export default {
  connectionManager,
  startGrpcServer,
};
