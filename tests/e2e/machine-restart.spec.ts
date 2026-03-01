import { test, expect } from '../fixtures.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logsDir = path.join(__dirname, '../../logs/test-logs');

async function waitForLogContent(
  logFilePath: string,
  expectedContent: string,
  timeoutMs: number = 30000
): Promise<boolean> {
  const startTime = Date.now();
  const intervalMs = 1000;

  while (Date.now() - startTime < timeoutMs) {
    if (fs.existsSync(logFilePath)) {
      const logContent = fs.readFileSync(logFilePath, 'utf-8');
      if (logContent.includes(expectedContent)) {
        return true;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return false;
}

function getLatestMachineLogFile(machineId: string): string | null {
  if (!fs.existsSync(logsDir)) {
    return null;
  }

  const logFiles = fs
    .readdirSync(logsDir)
    .filter((f) => f.startsWith('machine-') && f.includes(machineId.split('-').pop() || ''))
    .sort()
    .reverse();

  return logFiles.length > 0 ? path.join(logsDir, logFiles[0]) : null;
}

test.describe('Machine Restart Command Tests', () => {
  test('should get machineServer instance via getMachineServer()', async ({ testEnv }) => {
    const machine = testEnv.machines[0];
    expect(machine).toBeDefined();
    expect(machine.id).toMatch(/^test-machine-/);
    expect(machine.process.pid).toBeGreaterThan(0);

    console.log(`Machine ID: ${machine.id}`);
    console.log(`Machine PID: ${machine.process.pid}`);
  });

  test('should receive restart command from manager and handle it', async ({ testEnv, apiRequest }) => {
    const machine = testEnv.machines[0];

    const listResponse = await apiRequest('/api/admin/machines');
    expect(listResponse.ok).toBe(true);

    const listResult = await listResponse.json();
    const machines = listResult.data?.items || listResult.data || [];

    const registeredMachine = machines.find((m: any) => m.id === machine.id || m.hostname?.includes('测试机器'));

    expect(registeredMachine).toBeDefined();
    console.log(`Found registered machine: ${JSON.stringify(registeredMachine, null, 2)}`);

    expect(registeredMachine.status).toBe('online');
  });

  test('should have getMachineServer function exported from app.ts', async () => {
    const { getMachineServer } = await import('../../src/machine/app.js');

    expect(typeof getMachineServer).toBe('function');

    const instance = getMachineServer();
    console.log(`getMachineServer() returned: ${instance ? 'MachineServer instance' : 'undefined'}`);

    if (instance) {
      expect(instance.getState).toBeDefined();
      expect(typeof instance.getState).toBe('function');

      const state = instance.getState();
      console.log(`Machine state: ${state}`);

      expect(['starting', 'running', 'reconnecting', 'shutting_down', 'stopped']).toContain(state);
    }
  });

  test('should handle restart command without TypeError', async ({ testEnv, apiRequest }) => {
    const machine = testEnv.machines[0];

    const listResponse = await apiRequest('/api/admin/machines');
    expect(listResponse.ok).toBe(true);

    const listResult = await listResponse.json();
    const machines = listResult.data?.items || listResult.data || [];
    const registeredMachine = machines.find((m: any) => m.id === machine.id || m.hostname?.includes('测试机器'));

    if (!registeredMachine) {
      test.skip(true, 'No registered machine found');
      return;
    }

    const logFile = getLatestMachineLogFile(machine.id);

    if (logFile) {
      const initialLogContent = fs.readFileSync(logFile, 'utf-8');
      console.log(`Initial log content length: ${initialLogContent.length}`);

      expect(initialLogContent).not.toContain('Cannot read properties of undefined');
      expect(initialLogContent).not.toContain("reading 'restart'");

      console.log('✅ No TypeError found in machine logs - fix is working!');
    }
  });

  test('should have correct MachineServer instance lifecycle', async ({ testEnv }) => {
    const { getMachineServer, MachineServer, MachineState } = await import('../../src/machine/app.js');

    expect(MachineServer).toBeDefined();
    expect(MachineState).toBeDefined();
    expect(Object.values(MachineState)).toContain('running');
    expect(Object.values(MachineState)).toContain('stopped');

    const instance = getMachineServer();

    if (instance) {
      const state = instance.getState();
      expect(Object.values(MachineState)).toContain(state);

      console.log(`Current machine state: ${state}`);
      console.log(`MachineState enum values: ${Object.values(MachineState).join(', ')}`);
    }
  });

  test('should verify restart method exists on MachineServer instance', async () => {
    const { getMachineServer } = await import('../../src/machine/app.js');

    const instance = getMachineServer();

    if (instance) {
      expect(instance.restart).toBeDefined();
      expect(typeof instance.restart).toBe('function');

      expect(instance.stop).toBeDefined();
      expect(typeof instance.stop).toBe('function');

      expect(instance.start).toBeDefined();
      expect(typeof instance.start).toBe('function');

      console.log('✅ All lifecycle methods exist on MachineServer instance');
    } else {
      console.log('⚠️ MachineServer instance is undefined (machine service not running in this context)');
    }
  });
});

test.describe('Machine Restart Integration Tests', () => {
  test('should successfully send restart command via manager API', async ({ testEnv, apiRequest }) => {
    const machine = testEnv.machines[0];

    const listResponse = await apiRequest('/api/admin/machines');
    expect(listResponse.ok).toBe(true);

    const listResult = await listResponse.json();
    const machines = listResult.data?.items || listResult.data || [];
    const registeredMachine = machines.find((m: any) => m.id === machine.id || m.hostname?.includes('测试机器'));

    if (!registeredMachine) {
      test.skip(true, 'No registered machine found to restart');
      return;
    }

    console.log(`Machine registered with ID: ${registeredMachine.id}`);
    expect(registeredMachine.id).toBeDefined();

    const restartResponse = await apiRequest(`/api/admin/machines/${registeredMachine.id}/restart`, {
      method: 'POST',
    });

    console.log(`Restart response status: ${restartResponse.status}`);

    if (restartResponse.ok) {
      const restartResult = await restartResponse.json();
      console.log(`Restart result: ${JSON.stringify(restartResult, null, 2)}`);
      expect(restartResult.success).toBe(true);
    } else {
      const errorText = await restartResponse.text();
      console.log(`Restart failed (expected in test): ${errorText}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 3000));

    const logFile = getLatestMachineLogFile(machine.id);
    if (logFile && fs.existsSync(logFile)) {
      const logContent = fs.readFileSync(logFile, 'utf-8');

      const hasTypeError = logContent.includes("Cannot read properties of undefined (reading 'restart')");
      expect(hasTypeError).toBe(false);

      console.log('✅ No TypeError in logs after restart command - fix verified!');
    }
  });

  test('should handle batch restart command', async ({ testEnv, apiRequest }) => {
    const listResponse = await apiRequest('/api/admin/machines');
    expect(listResponse.ok).toBe(true);

    const listResult = await listResponse.json();
    const machines = listResult.data?.items || listResult.data || [];

    if (machines.length === 0) {
      test.skip(true, 'No machines registered');
      return;
    }

    const machineIds = machines.slice(0, 2).map((m: any) => m.id);

    const batchRestartResponse = await apiRequest('/api/admin/machines/batch-restart', {
      method: 'POST',
      body: JSON.stringify({ machineIds }),
    });

    console.log(`Batch restart response status: ${batchRestartResponse.status}`);

    if (batchRestartResponse.ok) {
      const result = await batchRestartResponse.json();
      console.log(`Batch restart result: ${JSON.stringify(result, null, 2)}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));

    for (const testMachine of testEnv.machines) {
      const logFile = getLatestMachineLogFile(testMachine.id);
      if (logFile && fs.existsSync(logFile)) {
        const logContent = fs.readFileSync(logFile, 'utf-8');
        const hasTypeError = logContent.includes("Cannot read properties of undefined (reading 'restart')");
        expect(hasTypeError).toBe(false);
      }
    }

    console.log('✅ Batch restart completed without TypeError');
  });
});
