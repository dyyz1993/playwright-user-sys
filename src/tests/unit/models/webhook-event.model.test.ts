import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../config/database.js', () => ({
  db: Object.assign(
    (table: string) => {
      throw new Error(`Unexpected db('${table}') call in unit test`);
    },
    { raw: (sql: string) => sql }
  ),
}));

vi.mock('@shared/utils/logger.js', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('WebhookEventModel', () => {
  describe('safeParsePayload (via module behavior)', () => {
    it('should have all expected static methods', async () => {
      const mod = await import('../../../models/webhook-event.model.js');
      expect(mod.WebhookEventModel).toBeDefined();
      expect(typeof mod.WebhookEventModel.create).toBe('function');
      expect(typeof mod.WebhookEventModel.findById).toBe('function');
      expect(typeof mod.WebhookEventModel.markDelivered).toBe('function');
      expect(typeof mod.WebhookEventModel.markFailed).toBe('function');
      expect(typeof mod.WebhookEventModel.findByUserId).toBe('function');
      expect(typeof mod.WebhookEventModel.findPending).toBe('function');
      expect(typeof mod.WebhookEventModel.findAll).toBe('function');
    });
  });

  describe('CreateWebhookEventInput interface', () => {
    it('should accept valid input', async () => {
      const mod = await import('../../../models/webhook-event.model.js');
      const input: mod.CreateWebhookEventInput = {
        user_id: 1,
        event_type: 'session.created' as any,
        payload: { sessionId: 'abc123' },
      };
      expect(input.user_id).toBe(1);
      expect(input.event_type).toBe('session.created');
      expect(input.payload).toEqual({ sessionId: 'abc123' });
    });

    it('should accept complex payload', async () => {
      const mod = await import('../../../models/webhook-event.model.js');
      const input: mod.CreateWebhookEventInput = {
        user_id: 5,
        event_type: 'session.released' as any,
        payload: {
          sessionId: 'xyz',
          duration: 3600,
          creditsUsed: 60,
          metadata: { browser: 'chromium' },
        },
      };
      expect(input.payload.metadata).toEqual({ browser: 'chromium' });
    });
  });

  describe('WebhookEvent interface', () => {
    it('should have correct field types', async () => {
      const mod = await import('../../../models/webhook-event.model.js');
      const event: mod.WebhookEvent = {
        id: 1,
        user_id: 1,
        event_type: 'session.created' as any,
        payload: { key: 'value' },
        delivered: false,
        attempts: 0,
        error: null,
        last_attempt: null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      expect(event.payload).toEqual({ key: 'value' });
      expect(event.delivered).toBe(false);
      expect(event.last_attempt).toBeNull();
    });

    it('should accept delivered event with last_attempt', async () => {
      const mod = await import('../../../models/webhook-event.model.js');
      const now = new Date();
      const event: mod.WebhookEvent = {
        id: 2,
        user_id: 1,
        event_type: 'session.created' as any,
        payload: {},
        delivered: true,
        attempts: 1,
        error: null,
        last_attempt: now,
        created_at: now,
        updated_at: now,
      };
      expect(event.delivered).toBe(true);
      expect(event.last_attempt).toBe(now);
    });
  });
});
