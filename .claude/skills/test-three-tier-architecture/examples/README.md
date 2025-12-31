# Test Examples

This directory contains references to actual test implementations in the codebase. Instead of duplicating code here, we link to the real test files that demonstrate various testing patterns.

## Core Test Template

### **Three-Tier Template** - `tests/integration/three-tier-template.test.ts`

The main template file that demonstrates:
- Complete beforeAll/afterAll setup
- Database initialization
- Manager and machine service startup
- Test user creation
- Port management
- Cleanup procedures

**Usage:**
```bash
cp tests/integration/three-tier-template.test.ts tests/integration/my-feature.test.ts
```

## Test Scenarios

### TIER-001 ~ TIER-010: Core Functions

**Example: User Authentication**
- Location: `tests/integration/three-tier-template.test.ts`
- Tests: Login, token generation, API key validation

**Example: Session Creation**
- Location: `tests/integration/three-tier-template.test.ts`
- Tests: Create session, WebSocket connection, browser launch

**Example: Browser Operations**
- Location: `tests/integration/three-tier-template.test.ts`
- Tests: Page navigation, screenshot, script execution

### TIER-011 ~ TIER-020: Billing System

**Example: Post-Paid Billing**
- Location: See [Billing Verification Guide](../references/billing-verification.md)
- Tests: Credit deduction after session ends, minimum charge, rounding

**Example: Insufficient Credits**
- Location: `tests/integration/three-tier-template.test.ts`
- Tests: 402 error when credits are zero, cannot create session

**Example: Credit History**
- Location: `tests/integration/three-tier-template.test.ts`
- Tests: History records all deductions, operation types

### TIER-021 ~ TIER-030: Machine Management

**Example: Machine Registration**
- Location: `tests/integration/three-tier-template.test.ts`
- Tests: Machine appears in database, status is online

**Example: Load Balancing**
- Location: `tests/integration/three-tier-template.test.ts`
- Tests: Session allocated to machine with lowest instance count

**Example: Machine Reconnection**
- Location: `tests/integration/three-tier-template.test.ts`
- Tests: Machine reconnects after disconnect, heartbeat recovery

### TIER-031 ~ TIER-040: Concurrency Tests

**Example: Multi-User Sessions**
- Location: `tests/integration/three-tier-template.test.ts`
- Tests: Multiple users create sessions simultaneously

**Example: Multi-Machine Distribution**
- Location: `tests/integration/three-tier-template.test.ts`
- Tests: Sessions distributed across multiple machines

**Example: Concurrent Billing**
- Location: See [Billing Verification Guide](../references/billing-verification.md#tier-016-concurrent-session-billing)
- Tests: Multiple sessions billed independently

## Code Snippets

### Basic Session Creation

```typescript
it('TIER-003: User can create a new browser session', async () => {
  const user = testUsers[0];

  const response = await createSession(user.token);
  expect(response.statusCode).toBe(201);
  expect(response.data.directUrl).toContain('ws://');

  const session = await SessionModel.findById(response.data.id);
  expect(session.user_id).toBe(user.id);
  expect(session.status).toBe('active');
});
```

### Chrome Connection Testing

```typescript
it('TIER-004: User can connect to browser via WebSocket', async () => {
  const user = testUsers[0];

  const session = await createSession(user.token);
  const browser = await puppeteer.connect({
    browserWSEndpoint: session.data.directUrl,
  });

  expect(browser.isConnected()).toBe(true);

  const page = await browser.newPage();
  await page.goto('https://www.baidu.com');
  expect(await page.title()).toBe('百度一下，你就知道');

  await browser.disconnect();
});
```

### Load Balancing Verification

```typescript
it('TIER-008: Sessions are load balanced across machines', async () => {
  const user = testUsers[0];

  // Create sessions on machine 1
  const machine1 = machineServers[0].machineId;
  await db('machines').where({ id: machine1 }).update({ instance_count: 2 });

  // Create session - should go to machine 2 (lower count)
  const response = await createSession(user.token);
  const session = await SessionModel.findById(response.data.id);

  expect(session.machine_id).not.toBe(machine1);
});
```

### Post-Paid Billing Verification

```typescript
it('TIER-012: Credits are deducted after session ends', async () => {
  const user = testUsers[0];

  const before = await UserModel.findById(user.id);

  const session = await createSession(user.token);
  const afterCreate = await UserModel.findById(user.id);
  expect(afterCreate.credits).toBe(before.credits); // No deduction

  await endSession(session.data.id, user.token);
  const afterEnd = await UserModel.findById(user.id);
  expect(afterEnd.credits).toBeLessThan(before.credits); // Deducted
});
```

## Running Examples

### Run All Integration Tests

```bash
pnpm test:unit tests/integration/
```

### Run Specific Test File

```bash
pnpm test:unit tests/integration/three-tier-template.test.ts
```

### Run Specific Test Case

```bash
pnpm test:unit tests/integration/three-tier-template.test.ts -t "TIER-001"
```

### Run with Debug Output

```bash
LOG_LEVEL=debug pnpm test:unit tests/integration/three-tier-template.test.ts
```

## Related Documentation

- **[Test Patterns Guide](../references/test-patterns.md)** - Naming conventions, assertion standards
- **[Billing Verification Guide](../references/billing-verification.md)** - Post-paid billing patterns
- **[Environment Setup](../references/setup-guide.md)** - How to set up test environment
- **[Troubleshooting](../references/troubleshooting.md)** - Common issues and solutions
- **[Complete Specification](../../../docs/tests/三端集成测试规范.md)** - Full test specification

## Creating New Tests

1. Copy the template:
   ```bash
   cp tests/integration/three-tier-template.test.ts tests/integration/your-test.test.ts
   ```

2. Edit the file:
   - Update describe block name
   - Adjust NUM_USERS and NUM_MACHINES
   - Add your test cases following TIER-XXX pattern

3. Run the test:
   ```bash
   pnpm test:unit tests/integration/your-test.test.ts
   ```

4. Verify:
   - All tests pass
   - No zombie processes
   - Database is cleaned up
