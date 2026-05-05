import { MachineModel } from '../../models/machine.model.js';
import { SessionModel } from '../../models/session.model.js';

function generateMockHistoryData(type: string) {
  const now = Date.now();
  const data: { time: string; value: number }[] = [];
  for (let i = 23; i >= 0; i--) {
    const time = new Date(now - i * 3600000);
    let value;
    switch (type) {
      case 'cpu':
        value = Math.floor(Math.random() * 40) + 20;
        break;
      case 'memory':
        value = Math.floor(Math.random() * 30) + 40;
        break;
      case 'disk':
        value = Math.floor(Math.random() * 20) + 30;
        break;
      case 'sessions':
        value = Math.floor(Math.random() * 5) + 1;
        break;
      default:
        value = 0;
    }
    data.push({ time: time.toISOString(), value });
  }
  return data;
}

export async function getMachineDetailPageData(machineId: string) {
  const machine = await MachineModel.findById(machineId);
  if (!machine) return null;

  const sessions = await SessionModel.findByMachineId(machineId);

  const historyData = {
    cpu: generateMockHistoryData('cpu'),
    memory: generateMockHistoryData('memory'),
    disk: generateMockHistoryData('disk'),
    sessions: generateMockHistoryData('sessions'),
  };

  const machineData = {
    id: machine.id,
    name: machine.hostname,
    ip: machine.ip,
    status: machine.status,
    cpuUsage: machine.cpuUsage || 0,
    memoryUsage: machine.memoryUsage || 0,
    diskUsage: machine.diskUsage || 0,
    activeSessions: machine.instanceCount || 0,
    maxSessions: machine.maxInstances || 10,
    lastSeen: machine.lastSeen,
    grpcPort: machine.grpcPort,
  };

  return {
    machine: machineData,
    sessions,
    historyData,
  };
}
