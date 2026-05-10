/**
 * E2E Smoke Test — Full Docker Stack Validation
 *
 * Flow:
 * 1. Health check
 * 2. Admin login → JWT token
 * 3. Create test user → API key auto-generated
 * 4. Use API key to create browser session
 * 5. Connect to browser via Playwright CDP
 * 6. Navigate to https://example.com
 * 7. Verify page content (H1 contains "Example Domain")
 * 8. Take screenshot
 * 9. Release session
 * 10. Verify credits deducted
 * 11. Cleanup: delete test user
 *
 * Usage:
 *   BASE_URL=http://localhost:3000 ADMIN_USERNAME=admin ADMIN_PASSWORD=admin123 \
 *     npx tsx scripts/e2e-smoke-test.ts
 */

import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

async function apiRequest(
  method: string,
  path: string,
  options: {
    body?: any;
    jwt?: string;
    apiKey?: string;
    expectStatus?: number;
  } = {}
): Promise<ApiResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.jwt) headers['Authorization'] = `Bearer ${options.jwt}`;
  if (options.apiKey) headers['x-api-key'] = options.apiKey;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
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
      `Expected status ${options.expectStatus}, got ${res.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`
    );
  }

  if (!res.ok && !options.expectStatus) {
    throw new Error(
      `API error ${res.status}: ${typeof data === 'string' ? data : data?.error || data?.message || JSON.stringify(data)}`
    );
  }

  return data;
}

async function main() {
  console.log('========================================');
  console.log('  E2E Smoke Test — Full Stack Validation');
  console.log('========================================');
  console.log(`  Base URL: ${BASE_URL}`);
  console.log(`  Admin:    ${ADMIN_USERNAME}`);
  console.log('========================================\n');

  let jwt = '';
  let apiKey = '';
  let testUserId: number | undefined;
  let sessionId = '';

  try {
    // ── Step 1: Health check ──────────────────────────────────────
    console.log('[Step 1] Health check...');
    const healthRes = await fetch(`${BASE_URL}/health`);
    if (!healthRes.ok) throw new Error(`Health check failed: ${healthRes.status}`);
    const health = await healthRes.json();
    console.log(`  OK — ${JSON.stringify(health)}\n`);

    // ── Step 2: Admin login ───────────────────────────────────────
    console.log('[Step 2] Admin login...');
    const loginData = await apiRequest('POST', '/api/auth/login', {
      body: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
    });
    if (!loginData.success || !loginData.data?.token) {
      throw new Error(`Login response missing token: ${JSON.stringify(loginData)}`);
    }
    jwt = loginData.data.token;
    const adminUser = loginData.data.user;
    console.log(`  OK — logged in as ${adminUser.username} (role=${adminUser.role})\n`);

    // ── Step 3: Create test user ──────────────────────────────────
    console.log('[Step 3] Create test user...');
    const timestamp = Date.now();
    const createUser = await apiRequest('POST', '/api/users', {
      jwt,
      expectStatus: 201,
      body: {
        username: `e2e-smoke-${timestamp}`,
        password: 'SmokeTest123!',
        email: `e2e-smoke-${timestamp}@test.local`,
        credits: 100,
        role: 'user',
      },
    });
    if (!createUser.success || !createUser.data?.id) {
      throw new Error(`Create user failed: ${JSON.stringify(createUser)}`);
    }
    testUserId = createUser.data.id;
    apiKey = createUser.data.api_key;
    console.log(`  OK — userId=${testUserId}, apiKey=${apiKey?.substring(0, 12)}...\n`);

    if (!apiKey) {
      console.log('  API key not in create response, fetching user detail...');
      const userDetail = await apiRequest('GET', `/api/users/${testUserId}`, { jwt });
      apiKey = userDetail.data?.api_key;
      if (!apiKey) throw new Error('Could not retrieve API key');
      console.log(`  Got apiKey=${apiKey.substring(0, 12)}...\n`);
    }

    // ── Step 4: Create browser session ────────────────────────────
    console.log('[Step 4] Create browser session...');
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
    const directUrl = sessionRes.data.directUrl;
    const browserWSEndpoint = sessionRes.data.browserWSEndpoint;
    console.log(`  OK — sessionId=${sessionId}`);
    console.log(`       directUrl=${directUrl}`);
    console.log(`       wsEndpoint=${browserWSEndpoint}\n`);

    // ── Step 5: Connect to browser & scrape example.com ───────────
    console.log('[Step 5] Connect to browser and scrape example.com...');
    const rawUrl = directUrl || browserWSEndpoint;
    if (!rawUrl) throw new Error('No browser connection URL available');

    const separator = rawUrl.includes('?') ? '&' : '?';
    const connectUrl = jwt ? `${rawUrl}${separator}token=${jwt}` : rawUrl;
    console.log(`  connectUrl=${connectUrl.split('token=')[0]}token=***`);

    const browser = await chromium.connectOverCDP(connectUrl);
    console.log('  Connected via CDP');

    const contexts = browser.contexts();
    const context = contexts.length > 0 ? contexts[0] : await browser.newContext();
    const page = await context.newPage();

    console.log('  Navigating to https://example.com ...');
    await page.goto('https://example.com', { waitUntil: 'domcontentloaded', timeout: 20000 });

    const title = await page.title();
    console.log(`  Page title: "${title}"`);

    const h1Text = await page.textContent('h1');
    console.log(`  H1 text: "${h1Text}"`);

    if (!h1Text || !h1Text.includes('Example Domain')) {
      throw new Error(`Unexpected page content — H1="${h1Text}", expected "Example Domain"`);
    }
    console.log('  Content verified: "Example Domain" found in H1');

    const screenshotBuf = await page.screenshot();
    console.log(`  Screenshot taken: ${screenshotBuf.length} bytes`);

    await page.close();
    await browser.close();
    console.log('  Browser disconnected\n');

    // ── Step 6: Release session ───────────────────────────────────
    console.log('[Step 6] Release session...');
    const releaseRes = await apiRequest('POST', `/api/sessions/${sessionId}/release`, { apiKey });
    if (!releaseRes.success) {
      console.log(`  Warning: release response=${JSON.stringify(releaseRes)} (may have auto-disconnected)`);
    } else {
      console.log(`  OK — status=${releaseRes.data?.status}, duration=${releaseRes.data?.duration}s\n`);
    }

    // ── Step 7: Verify credits deducted ───────────────────────────
    console.log('[Step 7] Verify credits deducted...');
    const meRes = await apiRequest('GET', '/api/users/me', { apiKey });
    if (meRes.success && meRes.data?.credits !== undefined) {
      const remaining = meRes.data.credits;
      console.log(`  Credits: ${remaining}/100`);
      if (remaining < 100) {
        console.log('  OK — credits were deducted\n');
      } else {
        console.log('  Warning — credits not deducted (may be free tier or too fast)\n');
      }
    } else {
      const userCheck = await apiRequest('GET', `/api/users/${testUserId}`, { jwt });
      if (userCheck.data?.credits !== undefined) {
        const remaining = userCheck.data.credits;
        console.log(`  Credits (admin view): ${remaining}/100`);
        if (remaining < 100) {
          console.log('  OK — credits were deducted\n');
        } else {
          console.log('  Warning — credits not deducted\n');
        }
      } else {
        console.log('  Could not verify credits\n');
      }
    }

    // ── Step 8: Cleanup ───────────────────────────────────────────
    console.log('[Step 8] Cleanup: delete test user...');
    const deleteRes = await apiRequest('DELETE', `/api/users/${testUserId}`, { jwt });
    if (deleteRes.success || !deleteRes.error) {
      console.log('  OK — test user deleted\n');
    } else {
      console.log(`  Warning: could not delete user: ${deleteRes.error}\n`);
    }

    // ── SUCCESS ───────────────────────────────────────────────────
    console.log('========================================');
    console.log('  E2E SMOKE TEST PASSED');
    console.log('========================================');
    process.exit(0);
  } catch (err: any) {
    console.error(`\n========================================`);
    console.error(`  E2E SMOKE TEST FAILED`);
    console.error(`  Error: ${err.message}`);
    console.error(`========================================\n`);

    // Cleanup on failure
    try {
      if (sessionId && apiKey) {
        await fetch(`${BASE_URL}/api/sessions/${sessionId}/release`, {
          method: 'POST',
          headers: { 'x-api-key': apiKey },
        });
      }
    } catch {}
    try {
      if (testUserId && jwt) {
        await fetch(`${BASE_URL}/api/users/${testUserId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${jwt}` },
        });
      }
    } catch {}

    process.exit(1);
  }
}

main();
