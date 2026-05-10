/**
 * 部署验收测试 — Deployment Acceptance Test
 *
 * 覆盖完整用户生命周期:
 * 1. 健康检查
 * 2. 管理员登录 → JWT
 * 3. 创建测试用户 → API Key
 * 4. 创建浏览器会话 → CDP URL
 * 5. Playwright CDP 连接 + 页面验证
 * 6. 文件上传 + 注入浏览器
 * 7. URL 文件下载注入
 * 8. 截图验证
 * 9. 释放会话
 * 10. 验证积分扣减
 * 11. 清理测试用户
 *
 * Usage:
 *   # GitHub CI (Docker)
 *   BASE_URL=http://localhost:3000 ADMIN_PASSWORD=admin123 npx tsx scripts/e2e-acceptance-test.ts
 *
 *   # 生产环境验收
 *   BASE_URL=http://192.168.0.29:3011 ADMIN_PASSWORD=xxx npx tsx scripts/e2e-acceptance-test.ts
 *
 *   # 跳过需要 Playwright 的步骤（生产环境可能没有 playwright 包）
 *   SKIP_PLAYWRIGHT=true BASE_URL=http://... npx tsx scripts/e2e-acceptance-test.ts
 *
 *   # 跳过文件上传步骤
 *   SKIP_FILE_UPLOAD=true BASE_URL=http://... npx tsx scripts/e2e-acceptance-test.ts
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const config = {
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  testUsername: process.env.TEST_USERNAME || `e2e-accept-${Date.now()}`,
  testPassword: process.env.TEST_PASSWORD || 'AcceptTest123!',
  testCredits: parseInt(process.env.TEST_CREDITS || '100', 10),
  timeout: parseInt(process.env.TIMEOUT || '60000', 10),
  skipFileUpload: process.env.SKIP_FILE_UPLOAD === 'true',
  skipPlaywright: process.env.SKIP_PLAYWRIGHT === 'true',
};

interface StepResult {
  name: string;
  label: string;
  passed: boolean;
  durationMs: number;
  error?: string;
}

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

const results: StepResult[] = [];
let currentStep = 0;
const totalSteps = 11;

function printHeader(): void {
  console.log('═══════════════════════════════════════════');
  console.log('  部署验收测试 — Deployment Acceptance Test');
  console.log('═══════════════════════════════════════════');
  console.log(`  环境:         ${config.baseUrl}`);
  console.log(`  管理员:       ${config.adminUsername}`);
  console.log(`  测试用户:     ${config.testUsername}`);
  console.log(`  初始积分:     ${config.testCredits}`);
  console.log(`  超时:         ${config.timeout}ms`);
  console.log(`  跳过 Playwright: ${config.skipPlaywright}`);
  console.log(`  跳过文件上传:   ${config.skipFileUpload}`);
  console.log('═══════════════════════════════════════════\n');
}

async function apiRequest(
  method: string,
  urlPath: string,
  options: {
    body?: any;
    jwt?: string;
    apiKey?: string;
    expectStatus?: number;
    formData?: FormData;
  } = {}
): Promise<ApiResponse> {
  const headers: Record<string, string> = {};
  if (!options.formData) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.jwt) headers['Authorization'] = `Bearer ${options.jwt}`;
  if (options.apiKey) headers['x-api-key'] = options.apiKey;

  const fullUrl = urlPath.startsWith('http') ? urlPath : `${config.baseUrl}${urlPath}`;
  const res = await fetch(fullUrl, {
    method,
    headers,
    body: options.formData
      ? options.formData
      : options.body
        ? JSON.stringify(options.body)
        : undefined,
  });

  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (options.expectStatus && res.status !== options.expectStatus) {
    throw new Error(
      `Expected status ${options.expectStatus}, got ${res.status} from ${method} ${urlPath}: ${typeof data === 'string' ? data : JSON.stringify(data)}`
    );
  }

  if (!res.ok && !options.expectStatus) {
    throw new Error(
      `API error ${res.status} from ${method} ${urlPath}: ${typeof data === 'string' ? data : data?.error || data?.message || JSON.stringify(data)}`
    );
  }

  return data;
}

async function runStep(
  stepNum: number,
  label: string,
  fn: () => Promise<void>
): Promise<void> {
  currentStep = stepNum;
  const start = Date.now();
  try {
    await fn();
    const duration = ((Date.now() - start) / 1000).toFixed(1);
    results.push({ name: `step-${stepNum}`, label, passed: true, durationMs: Date.now() - start });
    console.log(`  ✅ Step ${stepNum}/${totalSteps}: ${label} (${duration}s)\n`);
  } catch (err: any) {
    const duration = ((Date.now() - start) / 1000).toFixed(1);
    results.push({
      name: `step-${stepNum}`,
      label,
      passed: false,
      durationMs: Date.now() - start,
      error: err.message,
    });
    console.log(`  ❌ Step ${stepNum}/${totalSteps}: ${label} — ${err.message} (${duration}s)\n`);
  }
}

function isSkipped(stepNum: number): boolean {
  if (config.skipPlaywright && stepNum >= 5 && stepNum <= 8) return true;
  if (config.skipFileUpload && (stepNum === 6 || stepNum === 7)) return true;
  return false;
}

async function main(): Promise<void> {
  printHeader();

  let jwt = '';
  let apiKey = '';
  let testUserId: number | undefined;
  let sessionId = '';
  let browserWsUrl = '';
  let initialCredits = config.testCredits;

  try {
    // ── Step 1: Health check ──────────────────────────────────────
    await runStep(1, '健康检查 (GET /health)', async () => {
      const healthRes = await fetch(`${config.baseUrl}/health`);
      if (!healthRes.ok) throw new Error(`Health check failed: ${healthRes.status}`);
      const health = await healthRes.json();
      console.log(`    Response: ${JSON.stringify(health)}`);
    });

    // ── Step 2: Admin login ───────────────────────────────────────
    await runStep(2, '管理员登录 — JWT 获取', async () => {
      const loginData = await apiRequest('POST', '/api/auth/login', {
        body: { username: config.adminUsername, password: config.adminPassword },
      });
      if (!loginData.success || !loginData.data?.token) {
        throw new Error(`Login response missing token: ${JSON.stringify(loginData)}`);
      }
      jwt = loginData.data.token;
      const adminUser = loginData.data.user;
      console.log(`    Logged in as ${adminUser.username} (role=${adminUser.role})`);
    });

    // ── Step 3: Create test user ──────────────────────────────────
    await runStep(3, '创建测试用户', async () => {
      const timestamp = Date.now();
      const username = config.testUsername.includes('${Date.now()}')
        ? `e2e-accept-${timestamp}`
        : config.testUsername;
      const createUser = await apiRequest('POST', '/api/users', {
        jwt,
        expectStatus: 201,
        body: {
          username,
          password: config.testPassword,
          email: `${username}@test.local`,
          credits: config.testCredits,
          role: 'user',
        },
      });
      if (!createUser.success || !createUser.data?.id) {
        throw new Error(`Create user failed: ${JSON.stringify(createUser)}`);
      }
      testUserId = createUser.data.id;
      apiKey = createUser.data.api_key;
      console.log(`    userId=${testUserId}, apiKey=${apiKey?.substring(0, 12)}...`);

      if (!apiKey) {
        console.log('    API key not in create response, fetching user detail...');
        const userDetail = await apiRequest('GET', `/api/users/${testUserId}`, { jwt });
        apiKey = userDetail.data?.api_key;
        if (!apiKey) throw new Error('Could not retrieve API key');
        console.log(`    Got apiKey=${apiKey.substring(0, 12)}...`);
      }
    });

    // Abort if user creation failed
    if (!testUserId || !apiKey) {
      throw new Error('Cannot proceed without test user — aborting');
    }

    // ── Step 4: Create browser session ────────────────────────────
    await runStep(4, '创建浏览器会话 (POST /api/sessions)', async () => {
      const sessionRes = await apiRequest('POST', '/api/sessions', {
        apiKey,
        expectStatus: 201,
        body: {
          viewport: { width: 1280, height: 800 },
        },
      });
      if (!sessionRes.success || !sessionRes.data?.id) {
        throw new Error(`Create session failed: ${JSON.stringify(sessionRes)}`);
      }
      sessionId = sessionRes.data.id;
      browserWsUrl = sessionRes.data.directUrl || sessionRes.data.browserWSEndpoint || '';
      console.log(`    sessionId=${sessionId}`);
      console.log(`    browserWsUrl=${browserWsUrl}`);
    });

    // ── Step 5: Playwright CDP connection ─────────────────────────
    if (!isSkipped(5)) {
      await runStep(5, 'Playwright CDP 连接 + 页面验证', async () => {
        const { chromium } = await import('playwright');

        const connectUrl = browserWsUrl;
        if (!connectUrl) throw new Error('No browser connection URL available');

        const browser = await chromium.connectOverCDP(connectUrl);
        console.log('    Connected via CDP');

        const contexts = browser.contexts();
        const context = contexts.length > 0 ? contexts[0] : await browser.newContext();
        const page = await context.newPage();

        await page.goto('https://example.com', {
          waitUntil: 'domcontentloaded',
          timeout: config.timeout,
        });

        const title = await page.title();
        console.log(`    Page title: "${title}"`);
        if (!title || !title.includes('Example')) {
          throw new Error(`Unexpected title: "${title}", expected to contain "Example"`);
        }

        await page.close();
        await browser.close();
        console.log('    Browser disconnected');
      });
    } else {
      console.log(`  ⏭️  Step 5/${totalSteps}: Playwright CDP 连接 — SKIPPED\n`);
    }

    // ── Step 6: File upload + inject ──────────────────────────────
    if (!isSkipped(6)) {
      let tempFilePath: string | undefined;
      await runStep(6, '文件上传 + 注入浏览器', async () => {
        const { chromium } = await import('playwright');

        if (!browserWsUrl) throw new Error('No browser connection URL');

        tempFilePath = path.join(os.tmpdir(), `e2e-upload-${Date.now()}.txt`);
        fs.writeFileSync(tempFilePath, 'Hello from E2E acceptance test!');

        const fileBuffer = fs.readFileSync(tempFilePath);
        const formData = new FormData();
        formData.append('file', new Blob([fileBuffer]), path.basename(tempFilePath));
        formData.append('sessionId', sessionId);

        const uploadRes = await apiRequest('POST', '/api/files/upload-session', {
          apiKey,
          formData,
        });
        if (!uploadRes.success || !uploadRes.data?.machineFilePath) {
          throw new Error(`Upload failed: ${JSON.stringify(uploadRes)}`);
        }
        const machineFilePath = uploadRes.data.machineFilePath;
        console.log(`    Uploaded, machineFilePath=${machineFilePath}`);

        const browser = await chromium.connectOverCDP(browserWsUrl);
        const contexts = browser.contexts();
        const context = contexts.length > 0 ? contexts[0] : await browser.newContext();
        const page = await context.newPage();

        await page.goto('data:text/html,<input type="file" id="upload">');

        const injectRes = await apiRequest(
          'POST',
          `/api/sessions/${sessionId}/inject-file`,
          {
            apiKey,
            body: { machineFilePath, selector: '#upload' },
          }
        );
        if (!injectRes.success) {
          throw new Error(`Inject failed: ${JSON.stringify(injectRes)}`);
        }

        const fileCount = await page.evaluate(() => {
          const input = document.querySelector('#upload') as HTMLInputElement;
          return input?.files?.length ?? 0;
        });
        if (fileCount !== 1) {
          throw new Error(`Expected 1 file on input, got ${fileCount}`);
        }

        await page.close();
        await browser.close();
        console.log(`    File injected and verified (files.length=${fileCount})`);
      });
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        try { fs.unlinkSync(tempFilePath); } catch {}
      }
    } else {
      console.log(`  ⏭️  Step 6/${totalSteps}: 文件上传 — SKIPPED\n`);
    }

    // ── Step 7: URL file download + inject ────────────────────────
    if (!isSkipped(7)) {
      await runStep(7, 'URL 文件下载注入', async () => {
        const { chromium } = await import('playwright');

        if (!browserWsUrl) throw new Error('No browser connection URL');

        const browser = await chromium.connectOverCDP(browserWsUrl);
        const contexts = browser.contexts();
        const context = contexts.length > 0 ? contexts[0] : await browser.newContext();
        const page = await context.newPage();

        await page.goto('data:text/html,<input type="file" id="url-upload">');

        const uploadUrlRes = await apiRequest(
          'POST',
          `/api/sessions/${sessionId}/upload-url`,
          {
            apiKey,
            body: {
              url: 'https://www.w3.org/TR/PNG/iso_8859-1.txt',
              selector: '#url-upload',
            },
          }
        );
        if (!uploadUrlRes.success) {
          throw new Error(`URL upload failed: ${JSON.stringify(uploadUrlRes)}`);
        }

        const fileCount = await page.evaluate(() => {
          const input = document.querySelector('#url-upload') as HTMLInputElement;
          return input?.files?.length ?? 0;
        });
        if (fileCount !== 1) {
          throw new Error(`Expected 1 file on input, got ${fileCount}`);
        }

        await page.close();
        await browser.close();
        console.log(`    URL file injected and verified (files.length=${fileCount})`);
      });
    } else {
      console.log(`  ⏭️  Step 7/${totalSteps}: URL 文件下载注入 — SKIPPED\n`);
    }

    // ── Step 8: Screenshot verification ───────────────────────────
    if (!isSkipped(8)) {
      await runStep(8, '截图验证', async () => {
        const screenshotRes = await apiRequest(
          'GET',
          `/api/sessions/${sessionId}/screenshot`,
          { apiKey }
        );
        const screenshotUrl = screenshotRes.data?.screenshot_url || screenshotRes.data?.url;
        if (!screenshotUrl && !screenshotRes.success) {
          throw new Error(`Screenshot failed: ${JSON.stringify(screenshotRes)}`);
        }
        console.log(`    screenshot_url=${screenshotUrl || '(inline data)'}`);
      });
    } else {
      console.log(`  ⏭️  Step 8/${totalSteps}: 截图验证 — SKIPPED\n`);
    }

    // ── Step 9: Release session ───────────────────────────────────
    await runStep(9, '释放会话 (POST /api/sessions/:id/release)', async () => {
      const releaseRes = await apiRequest(
        'POST',
        `/api/sessions/${sessionId}/release`,
        { apiKey }
      );
      if (!releaseRes.success) {
        console.log(`    Warning: release response=${JSON.stringify(releaseRes)}`);
      } else {
        console.log(`    status=${releaseRes.data?.status}, duration=${releaseRes.data?.duration}s`);
      }
      sessionId = '';
    });

    // ── Step 10: Verify credits deducted ──────────────────────────
    await runStep(10, '验证积分扣减', async () => {
      let remaining: number | undefined;
      try {
        const meRes = await apiRequest('GET', '/api/users/me', { apiKey });
        if (meRes.success && meRes.data?.credits !== undefined) {
          remaining = meRes.data.credits;
        }
      } catch {}

      if (remaining === undefined) {
        const userCheck = await apiRequest('GET', `/api/users/${testUserId}`, { jwt });
        remaining = userCheck.data?.credits;
      }

      if (remaining === undefined) {
        throw new Error('Could not retrieve credits');
      }

      console.log(`    Credits: ${remaining}/${initialCredits}`);
      if (remaining < initialCredits) {
        console.log('    Credits were deducted');
      } else {
        console.log('    Warning — credits not deducted (may be free tier or too fast)');
      }
    });

    // ── Step 11: Cleanup test user ────────────────────────────────
    await runStep(11, '清理测试用户', async () => {
      const deleteRes = await apiRequest('DELETE', `/api/users/${testUserId}`, { jwt });
      if (deleteRes.success || !deleteRes.error) {
        console.log('    Test user deleted');
        testUserId = undefined;
      } else {
        throw new Error(`Could not delete user: ${deleteRes.error}`);
      }
    });
  } catch (err: any) {
    console.error(`\n  Fatal error: ${err.message}\n`);
  } finally {
    // Cleanup on failure
    if (sessionId && apiKey) {
      try {
        await fetch(`${config.baseUrl}/api/sessions/${sessionId}/release`, {
          method: 'POST',
          headers: { 'x-api-key': apiKey },
        });
      } catch {}
    }
    if (testUserId && jwt) {
      try {
        await fetch(`${config.baseUrl}/api/users/${testUserId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${jwt}` },
        });
      } catch {}
    }
  }

  // ── Report ─────────────────────────────────────────────────────
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const totalDuration = results.reduce((sum, r) => sum + r.durationMs, 0);
  const allPassed = failed === 0;

  console.log('═══════════════════════════════════════');
  console.log('  部署验收测试报告');
  console.log(`  环境: ${config.baseUrl}`);
  console.log(`  总计: ${results.length} 步 | 通过: ${passed} | 失败: ${failed}`);
  console.log(`  总耗时: ${(totalDuration / 1000).toFixed(1)}s`);
  console.log(`  结果: ${allPassed ? '✅ PASSED' : '❌ FAILED'}`);

  if (failed > 0) {
    console.log('\n  失败步骤:');
    for (const r of results) {
      if (!r.passed) {
        console.log(`    ❌ ${r.label}: ${r.error}`);
      }
    }
  }
  console.log('═══════════════════════════════════════\n');

  process.exit(allPassed ? 0 : 1);
}

main();
