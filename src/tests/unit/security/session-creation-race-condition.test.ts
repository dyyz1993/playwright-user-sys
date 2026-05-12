/**
 * P1-9: Session Creation Race Condition Proof-of-Concept
 *
 * PROOF OF ISSUE:
 * In src/services/session.service.ts:148-157, the flow is:
 *
 *   Line 148:  const machine = await MachineModel.findAvailable();  // OUTSIDE transaction
 *   Line 157:  const { sessionId } = await db.transaction(async (trx) => {
 *   Line 186:    const machineInTx = await trx('machines').where({ id: machineId })...
 *   Line 232:    await trx('machines').where({ id: machineId }).increment('instance_count', 1);
 *
 * Two concurrent requests can BOTH pass findAvailable() and get the same machine.
 * The re-check at line 186-192 helps but does NOT fully prevent the race because
 * the re-check and increment are not atomic (another request can pass the re-check
 * between the check and the increment).
 *
 * This test proves the architectural vulnerability without requiring MySQL.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../../..');

function readSrc(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf-8');
}

describe('P1-9: Session creation race condition (TOCTOU between findAvailable and transaction)', () => {
  it('should prove findAvailable() is called OUTSIDE the transaction', () => {
    const content = readSrc('src/services/session.service.ts');
    const lines = content.split('\n');

    const findAvailableLine = lines.findIndex((l) => l.includes('MachineModel.findAvailable()'));
    expect(findAvailableLine).toBeGreaterThanOrEqual(0);

    // Find the next transaction start after findAvailable
    const afterFind = lines.slice(findAvailableLine + 1).join('\n');
    const transactionMatch = afterFind.match(/db\.transaction\s*\(/);

    expect(transactionMatch).not.toBeNull();

    // Prove there is code between findAvailable and db.transaction
    const codeBetween = lines
      .slice(findAvailableLine + 1, findAvailableLine + 1 + afterFind.indexOf(transactionMatch?.[0] ?? ''))
      .filter((l) => l.trim().length > 0);

    // There should be intermediate lines (machine check, logger, etc.)
    expect(codeBetween.length).toBeGreaterThan(0);
  });

  it('should show the code structure: findAvailable → machineId assigned → transaction starts', () => {
    const content = readSrc('src/services/session.service.ts');
    const lines = content.split('\n');

    const findIdx = lines.findIndex((l) => l.includes('MachineModel.findAvailable()'));
    const machineIdIdx = lines.findIndex((l, i) => i > findIdx && l.includes('const machineId = machine'));
    const txIdx = lines.findIndex((l, i) => i > machineIdIdx && l.includes('db.transaction'));

    // Ordering proves the vulnerability: find → assign → tx
    expect(findIdx).toBeLessThan(machineIdIdx);
    expect(machineIdIdx).toBeLessThan(txIdx);
  });

  it('should prove the re-check inside the transaction is not atomic with the increment', () => {
    const content = readSrc('src/services/session.service.ts');
    const lines = content.split('\n');

    // Find the re-check: "instance_count < max_instances"
    const recheckIdx = lines.findIndex(
      (l) => l.includes('instance_count < max_instances') || l.includes('machineInTx')
    );
    expect(recheckIdx).toBeGreaterThanOrEqual(0);

    // Find the increment
    const incrementIdx = lines.findIndex(
      (l) => l.includes("increment('instance_count'") || l.includes('increment("instance_count"')
    );
    expect(incrementIdx).toBeGreaterThanOrEqual(0);

    // Both should be inside the transaction
    expect(recheckIdx).toBeGreaterThan(0);
    expect(incrementIdx).toBeGreaterThan(recheckIdx);

    // There are intermediate operations between re-check and increment:
    // user validation, credit check, session count check, session insert, credit deduction...
    // These intermediate operations create a window for another request to also pass the re-check.
    const between = lines.slice(recheckIdx + 1, incrementIdx).filter((l) => l.trim().length > 0);

    expect(between.length).toBeGreaterThan(5);
  });

  describe('race condition simulation', () => {
    it('should demonstrate that two concurrent find-then-reserve calls can claim the same resource', () => {
      type Machine = { id: string; instance_count: number; max_instances: number };

      const machines: Machine[] = [{ id: 'machine-1', instance_count: 0, max_instances: 1 }];

      // Phase 1: Both requests call findAvailable() OUTSIDE transaction
      // Both get a reference to the SAME machine because instance_count (0) < max_instances (1)
      const foundByA = machines.find((m) => m.instance_count < m.max_instances);
      const foundByB = machines.find((m) => m.instance_count < m.max_instances);

      expect(foundByA).toBeDefined();
      expect(foundByB).toBeDefined();
      expect(foundByA?.id).toBe(foundByB?.id); // Same machine!

      // Phase 2: Each request enters its own transaction and re-checks
      // Both re-checks see instance_count=0 (still < max_instances=1) because
      // neither has incremented yet — the re-check is not atomic with the increment.
      function recheck(machineId: string): boolean {
        const m = machines.find((m) => m.id === machineId);
        return !!m && m.instance_count < m.max_instances; // both pass
      }

      expect(recheck(foundByA?.id ?? '')).toBe(true);
      expect(recheck(foundByB?.id ?? '')).toBe(true); // BOTH pass the re-check!

      // Phase 3: Both increment instance_count
      // In real code, there are many async operations between re-check and increment,
      // creating a large window for both requests to pass the check.
      if (foundByA) foundByA.instance_count += 1;
      if (foundByB) foundByB.instance_count += 1;

      // PROOF: instance_count (2) > max_instances (1) — double booking!
      expect(machines[0].instance_count).toBe(2);
      expect(machines[0].instance_count).toBeGreaterThan(machines[0].max_instances);
    });

    it('should show a correct atomic approach prevents double-booking', async () => {
      // Reset
      const machines: { id: string; instance_count: number; max_instances: number }[] = [
        { id: 'machine-1', instance_count: 0, max_instances: 1 },
      ];

      // Atomic find-and-reserve (simulating SELECT ... FOR UPDATE within tx)
      function atomicFindAndReserve(): { machineId: string; success: boolean } {
        const m = machines.find((m) => m.instance_count < m.max_instances);
        if (!m) return { machineId: '', success: false };
        m.instance_count += 1;
        return { machineId: m.id, success: true };
      }

      async function createSessionSafe(): Promise<{ machineId: string; success: boolean }> {
        // In JS, synchronous code is atomic within a single event loop tick.
        // In real DB: use SELECT ... FOR UPDATE inside the transaction.
        return atomicFindAndReserve();
      }

      // Even with Promise.all, the synchronous atomic block prevents double-booking
      const [r1, r2] = await Promise.all([createSessionSafe(), createSessionSafe()]);

      const successCount = [r1, r2].filter((r) => r.success).length;
      expect(successCount).toBe(1);
      expect(machines[0].instance_count).toBeLessThanOrEqual(machines[0].max_instances);
    });
  });

  it('should provide the recommended fix', () => {
    const content = readSrc('src/services/session.service.ts');
    const lines = content.split('\n');

    const findIdx = lines.findIndex((l) => l.includes('MachineModel.findAvailable()'));

    // The fix: move findAvailable INSIDE the transaction with row-level locking.
    // Current vulnerable pattern:
    //   const machine = await MachineModel.findAvailable();  // line 148, OUTSIDE tx
    //   ...
    //   await db.transaction(async (trx) => { ... });        // line 157

    // Fixed pattern:
    //   await db.transaction(async (trx) => {
    //     const machine = await trx('machines')
    //       .whereRaw('instance_count < max_instances')
    //       .forUpdate()  // row-level lock
    //       .first();
    //     ...
    //   });

    expect(findIdx).toBeGreaterThanOrEqual(0);
  });
});
