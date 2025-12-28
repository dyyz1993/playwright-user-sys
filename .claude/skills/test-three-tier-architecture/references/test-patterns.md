# Test Patterns and Standards

This guide defines the testing patterns, naming conventions, and assertion standards for three-tier architecture integration tests.

## Test Case Naming Convention

### TIER-XXX Numbering

All test cases must use the TIER-XXX prefix:

```typescript
it('TIER-001: User can login with valid credentials', async () => { });
it('TIER-002: User can create a new browser session', async () => { });
```

### Number Ranges

| Range | Category | Examples |
|-------|----------|----------|
| TIER-001 ~ TIER-010 | Core Functions | Login, session creation, browser operations |
| TIER-011 ~ TIER-020 | Billing System | Credit deduction, billing history, shortage handling |
| TIER-021 ~ TIER-030 | Machine Management | Registration, heartbeat, offline, reconnection |
| TIER-031 ~ TIER-040 | Concurrency Tests | Multi-user, multi-machine scenarios |
| TIER-041 ~ TIER-050 | Exception Tests | Machine failure, network interruption |
| TIER-051 ~ TIER-060 | Performance Tests | Stress testing, performance metrics |

### Test Name Format

```typescript
// Good: Clear, specific, describes what is being tested
it('TIER-005: Session is allocated to machine with lowest instance count', async () => { });

// Bad: Vague, doesn't indicate the specific behavior
it('TIER-005: Load balancing', async () => { });
```

## Test File Structure

### Basic Template

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildManager } from '../../src/manager/app.js';
import { MachineServer } from '../../src/machine/app.js';
import { UserModel, MachineModel, SessionModel, CreditHistoryModel } from '../../src/models/index.js';

describe('Three-Tier Integration Tests', () => {
  const NUM_USERS = 2;
  const NUM_MACHINES = 2;
  const INITIAL_CREDITS = 100;

  let testUsers: any[] = [];
  let machineServers: any[] = [];
  let managerApp: any;
  let managerHttpPort: number;
  let managerGrpcPort: number;

  beforeAll(async () => {
    // Setup: Node.js, database, manager, machines
  }, 180000);

  afterAll(async () => {
    // Cleanup: Stop servers, drop database
  }, 60000);

  beforeEach(async () => {
    // Reset: Clear sessions, reset credits
  });

  describe('Core Functions (TIER-001 ~ TIER-010)', () => {
    it('TIER-001: Test description', { timeout: 60000 }, async () => {
      // Test implementation
    });
  });
});
```

## Test Case Structure Pattern

### Step-by-Step Format

Each test case should follow this structure:

```typescript
it('TIER-XXX: Clear description of what is being tested', { timeout: 60000 }, async () => {
  const user = testUsers[0];

  // Step 1: Initial state
  console.log('[步骤 1] Get initial user state');
  const userBefore = await UserModel.findById(user.id);
  expect(userBefore.credits).toBe(100);

  // Step 2: Execute action
  console.log('[步骤 2] Create session');
  const response = await createSession(user.token);

  // Step 3: Verify database
  console.log('[步骤 3] Verify database record');
  const session = await SessionModel.findById(response.data.id);
  expect(session.user_id).toBe(user.id);
  expect(session.status).toBe('active');

  // Step 4: Verify API response
  console.log('[步骤 4] Verify API response');
  expect(response.statusCode).toBe(201);
  expect(response.data.ws_url).toContain('ws://');

  // Step 5: Verify actual effect
  console.log('[步骤 5] Verify WebSocket connection');
  const browser = await puppeteer.connect({ browserWSEndpoint: response.data.ws_url });
  expect(browser.isConnected()).toBe(true);
  await browser.disconnect();

  console.log('✅ TIER-XXX 测试通过');
});
```

## Assertion Standards

### Strict Value Assertions

**DO NOT use true/false/0/1 in assertions.** Always use specific, meaningful values.

```typescript
// ✅ Correct: Specific values
expect(machine.instanceCount).toBe(2);
expect(user.credits).toBe(997);
expect(session.duration).toBe(180);
expect(response.data.token.length).toBeGreaterThan(50);
expect(machines.length).toBe(3);

// ❌ Wrong: Generic values
expect(machine.instanceCount).toBeGreaterThan(0);
expect(user.credits).toBeTruthy();
expect(sessions.length).toBe(1);
expect(result).toBe(true);
```

### Multi-Layer Verification

Each test case must verify at least **TWO** layers:

1. **Database Layer**: Database records are correct
2. **API Response Layer**: HTTP responses are correct
3. **gRPC Communication Layer**: Machine calls succeed
4. **Browser Layer**: Chrome operations succeed

```typescript
it('TIER-XXX: Multi-layer verification example', async () => {
  // Layer 1: API Response
  const response = await createSession(user.token);
  expect(response.statusCode).toBe(201);
  expect(response.data.id).toBeDefined();

  // Layer 2: Database
  const session = await SessionModel.findById(response.data.id);
  expect(session.user_id).toBe(user.id);
  expect(session.machine_id).toBeDefined();

  // Layer 3: gRPC (optional)
  const machine = await MachineModel.findById(session.machine_id);
  expect(machine.instance_count).toBe(1);

  // Layer 4: Browser (optional)
  const browser = await puppeteer.connect({ browserWSEndpoint: response.data.ws_url });
  expect(browser.isConnected()).toBe(true);
  await browser.disconnect();
});
```

## Test Data Management

### beforeEach Pattern

Reset test data before each test:

```typescript
beforeEach(async () => {
  // Clear sessions and credits
  await db('sessions').del();
  await db('credit_history').del();

  // Reset user credits
  for (const user of testUsers) {
    await db('users').where({ id: user.id }).update({ credits: INITIAL_CREDITS });
  }

  // Reset machine instance counts
  for (const machine of machineServers) {
    await db('machines').where({ id: machine.machineId }).update({ instance_count: 0 });
  }
});
```

### Test User Factory

Use the factory helper for creating test users:

```typescript
import { createTestUser } from '../helpers/factories.js';

const user = await createTestUser({
  username: `testuser_${Date.now()}`,
  credits: 100,
  role: 'user',
});
```

## Timeout Settings

Integration tests take longer. Set appropriate timeouts:

```typescript
// Entire describe block
describe('Three-tier tests', () => {
  // tests
}, 180000); // 3 minutes

// Individual test
it('TIER-XXX: Test name', { timeout: 90000 }, async () => {
  // 90 seconds
});

// Setup/teardown
beforeAll(async () => {
  // setup
}, 180000); // 3 minutes

afterAll(async () => {
  // cleanup
}, 60000); // 1 minute
```

## Common Test Patterns

### Pattern 1: CRUD Operations

```typescript
it('TIER-XXX: Create, read, update, delete session', async () => {
  // Create
  const created = await createSession(user.token);
  expect(created.statusCode).toBe(201);

  // Read
  const retrieved = await getSession(created.data.id, user.token);
  expect(retrieved.data.id).toBe(created.data.id);

  // Update
  const updated = await updateSession(created.data.id, { timeout: 300 }, user.token);
  expect(updated.data.timeout).toBe(300);

  // Delete
  const deleted = await deleteSession(created.data.id, user.token);
  expect(deleted.statusCode).toBe(204);
});
```

### Pattern 2: State Transitions

```typescript
it('TIER-XXX: Session state transitions from active to closed', async () => {
  // Create session (active)
  const created = await createSession(user.token);
  let session = await SessionModel.findById(created.data.id);
  expect(session.status).toBe('active');

  // End session (closed)
  await endSession(created.data.id, user.token);
  session = await SessionModel.findById(created.data.id);
  expect(session.status).toBe('closed');
  expect(session.ended_at).not.toBeNull();
});
```

### Pattern 3: Error Handling

```typescript
it('TIER-XXX: Returns 402 when insufficient credits', async () => {
  // Set credits to 0
  await db('users').where({ id: user.id }).update({ credits: 0 });

  // Attempt to create session
  const response = await createSession(user.token);

  // Verify error response
  expect(response.statusCode).toBe(402);
  expect(response.data.error).toContain('Insufficient credits');
});
```

## Test Organization

### Group Related Tests

```typescript
describe('Core Functions (TIER-001 ~ TIER-010)', () => {
  describe('Authentication', () => {
    it('TIER-001: User can login', async () => { });
    it('TIER-002: Invalid credentials return 401', async () => { });
  });

  describe('Session Management', () => {
    it('TIER-003: User can create session', async () => { });
    it('TIER-004: User can end session', async () => { });
  });
});
```

### Test Independence

Each test should be independent and not rely on other tests:

```typescript
// ✅ Good: Each test sets up its own data
it('TIER-001: Create session', async () => {
  const response = await createSession(user.token);
  expect(response.statusCode).toBe(201);
});

it('TIER-002: End session', async () => {
  const session = await createSession(user.token); // Independent setup
  const response = await endSession(session.data.id, user.token);
  expect(response.statusCode).toBe(200);
});

// ❌ Bad: Relies on previous test
it('TIER-001: Create session', async () => {
  global.sessionId = await createSession(user.token);
});

it('TIER-002: End session', async () => {
  await endSession(global.sessionId, user.token); // Depends on TIER-001
});
```

## Verification Checklist

Before committing a test, verify:

- [ ] Test name follows TIER-XXX format
- [ ] Test description is clear and specific
- [ ] No assertions use true/false/0/1
- [ ] At least two layers are verified
- [ ] beforeEach resets test data properly
- [ ] Timeouts are set appropriately
- [ ] Test is independent (no shared state)
- [ ] Console.log statements use [步骤 N] format
- [ ] Test passes consistently (not flaky)
