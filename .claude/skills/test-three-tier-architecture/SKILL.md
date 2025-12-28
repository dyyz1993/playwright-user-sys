---
name: test-three-tier-architecture
description: Guide for creating integration tests for three-tier architecture (Client SDK, Manager Server, Machine Service). Use when building TIER test cases, testing client-manager-machine integration, or writing end-to-end tests for the playwright-user-sys system.
allowed-tools: "Read,Write,Edit,Bash(pnpm*),Bash(npx*),Bash(nvm*),Grep,Glob"
---

# Three-Tier Architecture Integration Testing

## Quick Start

Copy the template and modify:
```bash
cp tests/integration/three-tier-template.test.ts tests/integration/my-feature.test.ts
pnpm test:unit tests/integration/my-feature.test.ts
```

## Architecture Overview

- **Client Tier**: HTTP API + WebSocket SDK calls
- **Manager Tier**: Fastify HTTP + gRPC + MySQL
- **Machine Tier**: gRPC client + Chrome instances

## Setup Process

1. [Environment Setup](references/setup-guide.md) - Database, ports, Node.js version
2. [Test Patterns](references/test-patterns.md) - Naming, assertions, structure
3. [Billing Verification](references/billing-verification.md) - Post-paid deduction

## Test Numbering

| Range | Type | Description |
|-------|------|-------------|
| TIER-001 ~ TIER-010 | Core Functions | Client, login, session, browser operations |
| TIER-011 ~ TIER-020 | Billing System | Post-paid billing, credit shortage, history |
| TIER-021 ~ TIER-030 | Machine Management | Registration, offline, reconnection, load balancing |
| TIER-031 ~ TIER-040 | Concurrency Tests | Multi-user, multi-machine scenarios |
| TIER-041 ~ TIER-050 | Exception Tests | Machine failure, network interruption |
| TIER-051 ~ TIER-060 | Performance Tests | Stress testing, performance metrics |

## Helper Scripts

```bash
# Initialize test environment
bash .claude/skills/test-three-tier-architecture/scripts/setup-test-env.sh

# Clean up test database
bash .claude/skills/test-three-tier-architecture/scripts/cleanup-test-db.sh
```

## Examples

- Basic session: [TIER-001](../../tests/integration/three-tier-template.test.ts#L300)
- Browser operations: [TIER-004](../../tests/integration/three-tier-template.test.ts#L400)
- Billing flow: [TIER-006](../../tests/integration/three-tier-template.test.ts#L500)

See [examples/README.md](examples/README.md) for complete test scenarios.

## Key Principles

### Multi-Layer Verification

Each test must verify at least two layers:
1. **Database Layer**: Records are correct
2. **API Response Layer**: HTTP responses are correct
3. **gRPC Communication Layer**: Machine calls succeed
4. **Browser Layer**: Chrome operations succeed

### Strict Assertions

```typescript
// Correct: Use specific values
expect(machine.instanceCount).toBe(2);
expect(user.credits).toBe(997);

// Wrong: Avoid true/false/0/1
expect(machine.instanceCount).toBeGreaterThan(0);
expect(sessions.length).toBe(1);
```

### Post-Paid Billing

Credits are deducted AFTER session ends, not during creation:
```typescript
const before = await UserModel.findById(userId);
await createSession();
const afterCreate = await UserModel.findById(userId);
expect(afterCreate.credits).toBe(before.credits); // No deduction yet

await endSession();
const afterEnd = await UserModel.findById(userId);
expect(afterEnd.credits).toBeLessThan(before.credits); // Deducted now
```

## Troubleshooting

[Common issues](references/troubleshooting.md):
- Port conflicts
- Chrome not found
- Machine registration timeout
- Database connection failures

## Related Documentation

- [Complete specification](../../../docs/tests/三端集成测试规范.md)
- [Visual flow diagram](../../../docs/tests/三端架构集成测试流程图.md)
- [Test template](../../tests/integration/three-tier-template.test.ts)
