import { SessionModel } from '../models/session.model.js';
import { MachineModel } from '../models/machine.model.js';
import { v4 as uuidv4 } from 'uuid';

export async function createTestSessions(count: number, userId: number) {
  const sessions: Awaited<ReturnType<typeof SessionModel.create>>[] = [];

  for (let i = 0; i < count; i++) {
    const session = await SessionModel.create({ user_id: userId });
    if (session) {
      sessions.push(session);
    }
  }

  return sessions;
}

export async function createTestMachines(count: number) {
  const machines: Awaited<ReturnType<typeof MachineModel.register>>[] = [];

  for (let i = 0; i < count; i++) {
    const machineId = uuidv4();
    const machine = await MachineModel.register({
      id: machineId,
      hostname: `test-machine-${Date.now()}-${i}`,
      ip: `192.168.1.${100 + i}`,
      grpcPort: 50051 + i,
      proxyPort: 8080 + i,
      maxInstances: 10,
      instanceCount: 0,
    });

    if (machine) {
      machines.push(machine);
    }
  }

  return machines;
}
