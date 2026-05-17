# Billing Verification Guide

This guide explains how to verify the post-paid billing system in three-tier architecture integration tests.

## Billing Mode: Post-Paid

The system uses a **post-paid** billing model where credits are deducted AFTER the session ends, not during session creation.

## Billing Formula

```typescript
// Credits are calculated based on session duration
const durationMinutes = Math.ceil(sessionDurationSeconds / 60);
const creditsDeducted = durationMinutes * ratePerMinute;
```

- **Minimum charge**: 1 minute
- **Rounding**: Always round up (Math.ceil)
- **Example**:
  - 30 seconds → 1 minute charge
  - 90 seconds → 2 minutes charge
  - 180 seconds → 3 minutes charge

## Verification Pattern

### Complete Verification Flow

```typescript
it('TIER-012: Credits are deducted after session ends (post-paid billing)', { timeout: 60000 }, async () => {
  const user = testUsers[0];
  const ratePerMinute = 1; // Default rate

  // Step 1: Record initial credits
  console.log('[步骤 1] Get initial user credits');
  const userBefore = await UserModel.findById(user.id);
  const initialCredits = userBefore.credits;
  expect(initialCredits).toBe(100);

  // Step 2: Create session (should NOT deduct credits)
  console.log('[步骤 2] Create session (no deduction expected)');
  const createResponse = await createSession(user.token);
  expect(createResponse.statusCode).toBe(201);

  const userAfterCreate = await UserModel.findById(user.id);
  expect(userAfterCreate.credits).toBe(initialCredits); // No change

  // Step 3: Use session (should NOT deduct credits)
  console.log('[步骤 3] Use session (no deduction expected)');
  await new Promise(resolve => setTimeout(resolve, 3000)); // Use for 3 seconds

  const userDuringSession = await UserModel.findById(user.id);
  expect(userDuringSession.credits).toBe(initialCredits); // Still no change

  // Step 4: End session (SHOULD deduct credits)
  console.log('[步骤 4] End session (deduction expected)');
  const sessionId = createResponse.data.id;
  await endSession(sessionId, user.token);

  // Step 5: Verify credits deducted
  console.log('[步骤 5] Verify credits deducted');
  const userAfterEnd = await UserModel.findById(user.id);
  const expectedCharge = 1; // 3 seconds = 1 minute minimum charge
  expect(userAfterEnd.credits).toBe(initialCredits - expectedCharge);

  // Step 6: Verify credit history record
  console.log('[步骤 6] Verify credit history record');
  const history = await CreditHistoryModel.findByUserId(user.id);
  expect(history.items.length).toBeGreaterThanOrEqual(1);

  const latestRecord = history.items[0];
  expect(latestRecord.amount).toBe(-expectedCharge);
  expect(latestRecord.operation).toBe('session_end');
  expect(latestRecord.session_id).toBe(sessionId);

  // Step 7: Verify session record has duration
  console.log('[步骤 7] Verify session record has duration');
  const session = await SessionModel.findById(sessionId);
  expect(session.duration).toBeGreaterThan(0);
  expect(Math.ceil(session.duration / 60)).toBe(expectedCharge);

  console.log('✅ TIER-012 测试通过 - Post-paid billing verified');
});
```

## Test Cases for Billing

### TIER-011: Basic Post-Paid Billing

```typescript
it('TIER-011: Credits are deducted after session ends', async () => {
  // Verify no deduction on creation
  // Verify deduction after ending session
});
```

### TIER-012: Minimum Charge (1 Minute)

```typescript
it('TIER-012: Minimum charge is 1 minute even for short sessions', async () => {
  const initialCredits = 100;

  const session = await createSession(user.token);
  await new Promise(resolve => setTimeout(resolve, 30)); // 30 seconds
  await endSession(session.data.id, user.token);

  const userAfter = await UserModel.findById(user.id);
  expect(userAfter.credits).toBe(initialCredits - 1); // 1 minute minimum
});
```

### TIER-013: Rounded Up Charges

```typescript
it('TIER-013: Charges are rounded up to nearest minute', async () => {
  const initialCredits = 100;

  const session = await createSession(user.token);
  await new Promise(resolve => setTimeout(resolve, 90)); // 90 seconds
  await endSession(session.data.id, user.token);

  const userAfter = await UserModel.findById(user.id);
  expect(userAfter.credits).toBe(initialCredits - 2); // 90s = 2 minutes
});
```

### TIER-014: Insufficient Credits Handling

```typescript
it('TIER-014: Cannot create session when credits are zero', async () => {
  // Set credits to 0
  await db('users').where({ id: user.id }).update({ credits: 0 });

  // Attempt to create session
  const response = await createSession(user.token);

  // Verify error
  expect(response.statusCode).toBe(402);
  expect(response.data.error).toContain('Insufficient credits');

  // Verify no session created
  const sessions = await SessionModel.findByUserId(user.id);
  expect(sessions.items.length).toBe(0);
});
```

### TIER-015: Credit History Tracking

```typescript
it('TIER-015: Credit history records all deductions', async () => {
  const initialCredits = 100;

  // Create and end first session
  const session1 = await createSession(user.token);
  await endSession(session1.data.id, user.token);

  // Create and end second session
  const session2 = await createSession(user.token);
  await endSession(session2.data.id, user.token);

  // Verify credit history
  const history = await CreditHistoryModel.findByUserId(user.id);
  expect(history.items.length).toBeGreaterThanOrEqual(2);

  // Verify records
  history.items.forEach(record => {
    expect(record.amount).toBeLessThan(0); // Deductions
    expect(record.operation).toBe('session_end');
    expect(record.session_id).toBeDefined();
  });
});
```

### TIER-016: Concurrent Session Billing

```typescript
it('TIER-016: Multiple sessions are billed independently', async () => {
  const initialCredits = 100;

  // Create two sessions simultaneously
  const session1 = await createSession(user.token);
  const session2 = await createSession(user.token);

  // Use both sessions
  await new Promise(resolve => setTimeout(resolve, 60)); // 60 seconds

  // End both sessions
  await endSession(session1.data.id, user.token);
  await endSession(session2.data.id, user.token);

  // Verify deductions
  const userAfter = await UserModel.findById(user.id);
  const expectedTotal = 2 * 1; // 2 sessions × 1 minute each
  expect(userAfter.credits).toBe(initialCredits - expectedTotal);

  // Verify history has 2 records
  const history = await CreditHistoryModel.findByUserId(user.id);
  const sessionRecords = history.items.filter(r => r.operation === 'session_end');
  expect(sessionRecords.length).toBeGreaterThanOrEqual(2);
});
```

## Verification Layers

### Layer 1: Database Verification

```typescript
const user = await UserModel.findById(userId);
expect(user.credits).toBe(expectedAmount);

const session = await SessionModel.findById(sessionId);
expect(session.duration).toBe(durationSeconds);

const history = await CreditHistoryModel.findByUserId(userId);
expect(history.items[0].amount).toBe(-charge);
```

### Layer 2: API Response Verification

```typescript
const response = await createSession(user.token);
expect(response.statusCode).toBe(201);
expect(response.data.balance).toBeDefined();

const endResponse = await endSession(sessionId, user.token);
expect(endResponse.statusCode).toBe(200);
expect(endResponse.data.final_balance).toBeDefined();
```

### Layer 3: Business Logic Verification

```typescript
// Verify calculation formula
const session = await SessionModel.findById(sessionId);
const expectedCharge = Math.ceil(session.duration / 60);
const actualCharge = initialCredits - userAfter.credits;
expect(actualCharge).toBe(expectedCharge);
```

## Common Pitfalls

### Pitfall 1: Checking Credits Too Early

```typescript
// ❌ Wrong: Checking immediately after creation
await createSession(user.token);
const user = await UserModel.findById(user.id);
expect(user.credits).toBeLessThan(initialCredits); // Will fail!

// ✅ Correct: Wait until session ends
await createSession(user.token);
await endSession(sessionId, user.token);
const user = await UserModel.findById(user.id);
expect(user.credits).toBeLessThan(initialCredits);
```

### Pitfall 2: Not Accounting for Minimum Charge

```typescript
// ❌ Wrong: Expecting 0 charge for short session
await createSession(user.token);
await new Promise(resolve => setTimeout(resolve, 10));
await endSession(sessionId, user.token);
expect(user.credits).toBe(initialCredits); // Will fail!

// ✅ Correct: Account for 1 minute minimum
expect(user.credits).toBe(initialCredits - 1);
```

### Pitfall 3: Not Waiting for Billing to Complete

```typescript
// ❌ Wrong: Not waiting for async billing
await endSession(sessionId, user.token);
const user = await UserModel.findById(user.id); // May not be updated yet!

// ✅ Correct: Wait for billing to complete
await endSession(sessionId, user.token);
await new Promise(resolve => setTimeout(resolve, 100)); // Wait for DB
const user = await UserModel.findById(user.id);
```

## Helper Functions

### Calculate Expected Charge

```typescript
function calculateCharge(durationSeconds: number, ratePerMinute: number = 1): number {
  return Math.ceil(durationSeconds / 60) * ratePerMinute;
}
```

### Wait for Session Duration

```typescript
async function useSessionFor(seconds: number): Promise<void> {
  console.log(`Using session for ${seconds} seconds...`);
  await new Promise(resolve => setTimeout(resolve, seconds * 1000));
}
```

### Verify Credits Deducted

```typescript
async function verifyCreditsDeducted(userId: string, expectedDeduction: number): Promise<void> {
  const user = await UserModel.findById(userId);
  const initialCredits = 100; // Or get from DB before test
  expect(user.credits).toBe(initialCredits - expectedDeduction);
}
```

## Test Data Setup

```typescript
beforeEach(async () => {
  // Reset credits to known value
  await db('users').where({ id: user.id }).update({ credits: 100 });

  // Clear credit history
  await db('credit_history').where({ user_id: user.id }).del();
});
```

## Summary Checklist

Before submitting a billing test, verify:

- [ ] Test verifies NO deduction on session creation
- [ ] Test verifies deduction AFTER session ends
- [ ] Test accounts for minimum 1-minute charge
- [ ] Test accounts for rounding up (Math.ceil)
- [ ] Test verifies credit history record
- [ ] Test verifies session duration is recorded
- [ ] Test uses specific values (not true/false/0/1)
- [ ] Test verifies at least two layers (DB + API)
- [ ] Test waits for async operations to complete
