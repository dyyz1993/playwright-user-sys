import { MachineModel } from '../../models/machine.model.js';

export async function getMachinesPageData(query: { status?: string }) {
  let machines;

  if (query.status) {
    const result = await MachineModel.findByStatus(query.status);
    machines = result.items;
  } else {
    machines = await MachineModel.getAll();
  }

  const formattedMachines = machines.map((machine) => ({
    id: machine.id,
    name: machine.hostname,
    ip_address: machine.ip,
    grpc_port: machine.grpcPort,
    last_heartbeat: machine.lastSeen,
    active_sessions: machine.instanceCount,
    max_sessions: machine.maxInstances,
    cpu_usage: machine.cpuUsage,
    memory_usage: machine.memoryUsage,
    disk_usage: machine.diskUsage,
    status: machine.status,
    load: Math.round(((machine.instanceCount || 0) / (machine.maxInstances || 1)) * 100),
  }));

  const totalMachines = formattedMachines.length;

  return {
    machines: formattedMachines,
    page: 1,
    limit: totalMachines,
    totalMachines,
    filters: {
      status: query.status || '',
    },
  };
}
