import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../../..');

function readSrc(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf-8');
}

describe('P1-10 FIX: gRPC calls now have deadline/timeout', () => {
  const connectionManagerPath = 'src/services/machine-grpc/connection-manager.ts';

  it('should prove the source file NOW contains "deadline" usage via withDeadline', () => {
    const content = readSrc(connectionManagerPath);

    expect(content).toContain('withDeadline');
  });

  it('should prove withDeadline utility function exists and uses setTimeout', () => {
    const content = readSrc(connectionManagerPath);

    expect(content).toContain('function withDeadline');
    expect(content).toContain('Promise.race');
    expect(content).toContain('setTimeout');
  });

  it('should identify all 6 RPC call sites that NOW have deadlines', () => {
    const content = readSrc(connectionManagerPath);

    const rpcMethods = [
      'LaunchBrowser',
      'CloseBrowser',
      'GetMachineStatus',
      'TransferFile',
      'DownloadAndInjectFile',
      'InjectFile',
    ];

    for (const method of rpcMethods) {
      const callPattern = new RegExp(`client\\.${method}\\s*\\(`);
      expect(callPattern.test(content), `Expected to find client.${method}() call`).toBe(true);
    }
  });

  it('should count the number of withDeadline usages (should be 6 for 6 RPC methods)', () => {
    const content = readSrc(connectionManagerPath);

    const withDeadlineMatches = content.match(/withDeadline\s*\(/g);
    expect(withDeadlineMatches).not.toBeNull();
    expect(withDeadlineMatches?.length).toBe(6);
  });

  it('should prove standard RPC methods use 30s (30000ms) deadline', () => {
    const content = readSrc(connectionManagerPath);

    const standardRpcMethods = ['LaunchBrowser', 'CloseBrowser', 'GetMachineStatus', 'TransferFile', 'InjectFile'];

    for (const method of standardRpcMethods) {
      const pattern = new RegExp(`client\\.${method}\\([\\s\\S]*?\\}\\)\\s*,\\s*30000\\s*,\\s*\`${method}`);
      expect(pattern.test(content), `${method} should use 30000ms deadline`).toBe(true);
    }
  });

  it('should prove DownloadAndInjectFile uses a longer deadline (60s/60000ms) vs others (30s)', () => {
    const content = readSrc(connectionManagerPath);

    const downloadPattern = /DownloadAndInjectFile[\s\S]*?\}\s*\)\s*,\s*60000\s*,\s*`DownloadAndInjectFile/;
    expect(downloadPattern.test(content), 'DownloadAndInjectFile should use 60000ms deadline').toBe(true);

    const launchPattern = /LaunchBrowser[\s\S]*?\}\s*\)\s*,\s*30000\s*,\s*`LaunchBrowser/;
    expect(launchPattern.test(content), 'LaunchBrowser should use 30000ms deadline').toBe(true);
  });

  it('should prove the withDeadline timeout error includes the RPC label for debugging', () => {
    const content = readSrc(connectionManagerPath);

    expect(content).toContain('gRPC call timeout:');
    expect(content).toContain('${label}');
    expect(content).toContain('${ms}ms');
  });

  it('should verify each RPC method passes a descriptive label to withDeadline', () => {
    const content = readSrc(connectionManagerPath);

    const rpcMethods = [
      'LaunchBrowser',
      'CloseBrowser',
      'GetMachineStatus',
      'TransferFile',
      'DownloadAndInjectFile',
      'InjectFile',
    ];

    for (const method of rpcMethods) {
      const methodLabel = `\`${method} \${machineId}\``;
      const hasLabel = content.includes(methodLabel);
      expect(hasLabel, `${method} should pass descriptive label to withDeadline`).toBe(true);
    }
  });

  it('should confirm keepalive options still exist for connection health', () => {
    const content = readSrc(connectionManagerPath);

    expect(content).toContain('grpc.keepalive_time_ms');
    expect(content).toContain('grpc.keepalive_timeout_ms');
  });
});
