import type {
  MachineMessage,
  ManagerMessage,
  MachineProtoPackage,
  MachineServiceClient,
} from '../../shared/types/grpc.js';

export type { MachineMessage, ManagerMessage, MachineProtoPackage, MachineServiceClient };

export function withDeadline<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`gRPC call timeout: ${label} (${ms}ms)`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}
