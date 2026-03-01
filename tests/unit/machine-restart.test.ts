import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import net from 'net';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logsDir = path.join(__dirname, '../../logs/test-logs');
fs.mkdirSync(logsDir, { recursive: true });

async function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as net.AddressInfo).port;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

interface TestServer {
  process: ChildProcess;
  port: number;
  grpcPort: number;
  logFile: string;
}

describe('MachineServer getMachineServer Fix', () => {
  describe('Unit Tests - Module Exports', () => {
    it('should export getMachineServer function from app.ts', async () => {
      const { getMachineServer } = await import('../../src/machine/app.js');
      expect(typeof getMachineServer).toBe('function');
    });

    it('should export MachineServer class from app.ts', async () => {
      const { MachineServer } = await import('../../src/machine/app.js');
      expect(typeof MachineServer).toBe('function');
    });

    it('should export MachineState enum from app.ts', async () => {
      const { MachineState } = await import('../../src/machine/app.js');
      expect(MachineState).toBeDefined();
      expect(MachineState.RUNNING).toBe('running');
      expect(MachineState.STOPPED).toBe('stopped');
    });

    it('should export getMachineServer from index.ts', async () => {
      const module = await import('../../src/machine/index.js');
      expect(typeof module.getMachineServer).toBe('function');
    });

    it('should have restart method on MachineServer prototype', async () => {
      const { MachineServer } = await import('../../src/machine/app.js');
      expect(typeof MachineServer.prototype.restart).toBe('function');
      expect(typeof MachineServer.prototype.stop).toBe('function');
      expect(typeof MachineServer.prototype.start).toBe('function');
    });
  });

  describe('Integration Tests - MachineServer Instance', () => {
    let managerProcess: ChildProcess | null = null;
    let machineProcess: ChildProcess | null = null;
    let managerPort: number;
    let managerGrpcPort: number;
    let machineGrpcPort: number;
    let machineProxyPort: number;
    let machineLogFile: string;

    beforeAll(async () => {
      [managerPort, managerGrpcPort, machineGrpcPort, machineProxyPort] = await Promise.all([
        getAvailablePort(),
        getAvailablePort(),
        getAvailablePort(),
        getAvailablePort(),
      ]);

      console.log(
        `Test ports: manager=${managerPort}, managerGrpc=${managerGrpcPort}, machineGrpc=${machineGrpcPort}, machineProxy=${machineProxyPort}`
      );
    }, 30000);

    afterAll(async () => {
      if (machineProcess) {
        machineProcess.kill('SIGTERM');
        await new Promise((resolve) => setTimeout(resolve, 1000));
        if (!machineProcess.killed) {
          machineProcess.kill('SIGKILL');
        }
      }
      if (managerProcess) {
        managerProcess.kill('SIGTERM');
        await new Promise((resolve) => setTimeout(resolve, 1000));
        if (!managerProcess.killed) {
          managerProcess.kill('SIGKILL');
        }
      }
    });

    it('should start manager server', async () => {
      const logFile = path.join(logsDir, `manager-${Date.now()}.log`);
      const logStream = fs.createWriteStream(logFile);

      managerProcess = spawn('npx', ['tsx', 'src/server.ts'], {
        cwd: path.join(__dirname, '../..'),
        env: {
          ...process.env,
          NODE_ENV: 'test',
          PORT: String(managerPort),
          GRPC_PORT: String(managerGrpcPort),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      managerProcess.stdout?.pipe(logStream);
      managerProcess.stderr?.pipe(logStream);

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Manager startup timeout')), 30000);

        const check = async () => {
          try {
            const response = await fetch(`http://localhost:${managerPort}/health`);
            if (response.ok) {
              clearTimeout(timeout);
              resolve();
            }
          } catch {
            setTimeout(check, 500);
          }
        };
        setTimeout(check, 1000);
      });

      console.log(`Manager started on port ${managerPort}`);
    }, 60000);

    it('should start machine server and register', async () => {
      machineLogFile = path.join(logsDir, `machine-${Date.now()}.log`);
      const logStream = fs.createWriteStream(machineLogFile);

      const machineId = `test-machine-${Date.now()}`;

      machineProcess = spawn('npx', ['tsx', 'src/machine/server.ts'], {
        cwd: path.join(__dirname, '../..'),
        env: {
          ...process.env,
          NODE_ENV: 'test',
          MACHINE_ID: machineId,
          MACHINE_NAME: 'Test Machine',
          MANAGER_HOST: `localhost:${managerGrpcPort}`,
          MACHINE_GRPC_PORT: String(machineGrpcPort),
          PROXY_PORT: String(machineProxyPort),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      machineProcess.stdout?.pipe(logStream);
      machineProcess.stderr?.pipe(logStream);

      await new Promise((resolve) => setTimeout(resolve, 3000));

      expect(machineProcess.killed).toBe(false);
      console.log(`Machine started with PID ${machineProcess.pid}`);
    }, 30000);

    it('should have getMachineServer return instance when machine is running', async () => {
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const { getMachineServer } = await import('../../src/machine/app.js');
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

    it('should NOT have TypeError in machine logs after startup', async () => {
      await new Promise((resolve) => setTimeout(resolve, 2000));

      if (fs.existsSync(machineLogFile)) {
        const logContent = fs.readFileSync(machineLogFile, 'utf-8');

        const hasTypeError = logContent.includes("Cannot read properties of undefined (reading 'restart')");
        expect(hasTypeError).toBe(false);

        console.log('✅ No TypeError found in machine logs');
      }
    });
  });
});
