import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const WS_SERVICE_PATH = path.resolve(__dirname, '../../../services/native-websocket-proxy.service.ts');
const WS_VIEWER_BRIDGE_PATH = path.resolve(__dirname, '../../../services/websocket-proxy/viewer-bridge.ts');

describe('P0-3 FIX: WebSocket viewer paths now require JWT authentication', () => {
  const source = fs.readFileSync(WS_SERVICE_PATH, 'utf-8');
  const lines = source.split('\n');

  function extractMethodBody(methodName: string): string {
    const start = lines.findIndex((l) => new RegExp(`(private|public)\\s+async\\s+${methodName}\\s*\\(`).test(l));
    if (start >= 0) {
      let end = lines.length - 1;
      for (let i = start + 1; i < lines.length; i++) {
        if (/^\s{2}(private|public)\s+(async\s+)?\w+\s*\(/.test(lines[i])) {
          end = i;
          break;
        }
      }
      return lines.slice(start, end).join('\n');
    }
    if (methodName === 'handleViewerWebSocketProxy') {
      const bridgeSource = fs.readFileSync(WS_VIEWER_BRIDGE_PATH, 'utf-8');
      const bridgeLines = bridgeSource.split('\n');
      const funcStart = bridgeLines.findIndex((l) =>
        /\bexport\s+async\s+function\s+handleViewerWebSocketProxy\s*\(/.test(l)
      );
      if (funcStart < 0) return '';
      return bridgeLines.slice(funcStart).join('\n');
    }
    return '';
  }

  it('finds viewer WebSocket handling code for /stream and /events paths', () => {
    expect(source).toContain("pathname.endsWith('/stream')");
    expect(source).toContain("pathname.endsWith('/events')");
  });

  it('proves viewer path routes to handleViewerWebSocketProxy with auth in the upgrade handler', () => {
    // 查找 upgrade 监听器注册（可能是 server.on('upgrade', ...) 或 server.on('upgrade', this.upgradeHandler)）
    const upgradeBlockStart = lines.findIndex(
      (l) => l.includes("server.on('upgrade'") || l.includes('this.upgradeHandler =')
    );
    expect(upgradeBlockStart).toBeGreaterThanOrEqual(0);

    const viewerBranchStart = lines.findIndex(
      (l, i) => i > upgradeBlockStart && l.includes("pathname.endsWith('/stream')")
    );
    expect(viewerBranchStart).toBeGreaterThanOrEqual(0);

    const viewerBranch = lines.slice(viewerBranchStart - 10, viewerBranchStart + 30).join('\n');
    expect(viewerBranch).toContain('handleViewerWebSocketProxy');
  });

  it('proves handleViewerWebSocketProxy verifies JWT and checks authorization', () => {
    const methodBody = extractMethodBody('handleViewerWebSocketProxy');
    expect(methodBody.length, 'Method body should not be empty').toBeGreaterThan(0);

    expect(methodBody, 'Should verify JWT').toContain('jwt.verify');
    expect(methodBody, 'Should decode token into user identity').toContain('decoded');
    expect(methodBody, 'Should extract Bearer token from authorization header').toContain(
      'extractTokenFromHeaderOrCookie'
    );
    expect(methodBody, 'Should look up user from decoded token').toContain('UserModel.findById');
  });

  it('proves handleViewerWebSocketProxy checks session ownership (user_id)', () => {
    const methodBody = extractMethodBody('handleViewerWebSocketProxy');
    expect(methodBody.length, 'Method body should not be empty').toBeGreaterThan(0);

    expect(methodBody, 'Should check session belongs to authenticated user').toContain(
      'session.user_id !== decoded.id'
    );
    expect(methodBody, 'Should allow admin access').toContain('decoded.role');
    expect(methodBody, 'Should return 403 on access denied').toContain('403');
  });

  it('proves handleViewerWebSocketProxy validates session existence and status', () => {
    const methodBody = extractMethodBody('handleViewerWebSocketProxy');
    expect(methodBody.length, 'Method body should not be empty').toBeGreaterThan(0);

    expect(methodBody, 'Should validate session exists').toContain('SessionModel.findById');
    expect(methodBody, 'Should check session status').toContain('session.status');
    expect(methodBody, 'Should return 404 when session not found').toContain('404');
    expect(methodBody, 'Should return 410 when session inactive').toContain('410');
  });

  it('proves handleViewerWebSocketProxy returns 401 on missing/invalid auth', () => {
    const methodBody = extractMethodBody('handleViewerWebSocketProxy');
    expect(methodBody.length, 'Method body should not be empty').toBeGreaterThan(0);

    expect(methodBody, 'Should return 401 when no token').toContain('Missing authentication');
    expect(methodBody, 'Should return 401 on invalid JWT').toContain('Invalid token');
    expect(methodBody, 'Should return 401 when user not found').toContain('User not found');
  });

  it('proves viewer auth is comparable to the main session WebSocket auth (handleExistingSessionProxy)', () => {
    const viewerBody = extractMethodBody('handleViewerWebSocketProxy');
    const mainBody = extractMethodBody('handleExistingSessionProxy');

    expect(viewerBody.length).toBeGreaterThan(0);
    expect(mainBody.length).toBeGreaterThan(0);

    const authPatterns = ['jwt.verify', 'decoded', 'UserModel.findById', 'extractTokenFromHeaderOrCookie'];
    for (const pattern of authPatterns) {
      expect(viewerBody, `Viewer handler should contain ${pattern}`).toContain(pattern);
      expect(mainBody, `Main handler should contain ${pattern}`).toContain(pattern);
    }
  });

  it('documents the fix: viewer paths now enforce authentication + ownership check', () => {
    const viewerBody = extractMethodBody('handleViewerWebSocketProxy');

    expect(viewerBody).toContain('decoded');
    expect(viewerBody).toContain('jwt.verify');
    expect(viewerBody).toContain('session.user_id');
    expect(viewerBody).toContain('net.connect');
    expect(viewerBody).toContain('sessionId');
  });
});
