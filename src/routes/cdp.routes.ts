import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { UserModel } from '../models/user.model.js';
import { SessionModel } from '../models/session/index.js';
import { createBrowserSession, releaseSession } from '../services/session.service.js';
import { logger } from '@shared/utils/logger.js';
import { UserStatus, SessionStatus } from '@shared/types/index.js';
import { env } from '../config/env.js';

function getApiKey(request: FastifyRequest): string | null {
  const queryKey = (request.query as Record<string, string>).apiKey;
  if (queryKey) return queryKey;
  const headerKey = request.headers['x-api-key'] as string;
  if (headerKey) return headerKey;
  return null;
}

async function authenticateUser(apiKey: string) {
  const user = await UserModel.findByApiKey(apiKey);
  if (!user || user.status !== UserStatus.ACTIVE) return null;
  return { id: user.id, username: user.username };
}

function buildWsUrl(request: FastifyRequest, sessionId: string, apiKey: string): string {
  if (env.PUBLIC_MANAGER_URL) {
    return `ws://${env.PUBLIC_MANAGER_URL}/ws/connect?sessionId=${sessionId}&apiKey=${apiKey}`;
  }
  if (env.PUBLIC_MACHINE_ENDPOINT) {
    return `ws://${env.PUBLIC_MACHINE_ENDPOINT}?sessionId=${sessionId}&apiKey=${apiKey}`;
  }
  const host = request.headers.host || `localhost:${env.PORT || 3000}`;
  return `ws://${host}/ws/connect?sessionId=${sessionId}&apiKey=${apiKey}`;
}

const CDP_VERSION_RESPONSE = {
  Browser: 'Playwright-User-Sys/1.0.0',
  'Protocol-Version': '1.3',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'V8-Version': '12.0.0',
  'WebKit-Version': '537.36',
};

export default async function cdpRoutes(fastify: FastifyInstance): Promise<void> {
  const versionHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const apiKey = getApiKey(request);
      if (apiKey) {
        const user = await authenticateUser(apiKey);
        if (!user) {
          return reply.status(401).send({ error: 'Invalid API Key' });
        }

        const sessionResult = await createBrowserSession(user.id, {}, true);
        const wsUrl = buildWsUrl(request, sessionResult.sessionId, apiKey);

        return reply.send({
          ...CDP_VERSION_RESPONSE,
          webSocketDebuggerUrl: wsUrl,
        });
      }

      return reply.send(CDP_VERSION_RESPONSE);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('CDP /json/version error:', error);
      return reply.status(500).send({ error: errMsg });
    }
  };

  fastify.get('/json/version', versionHandler);
  fastify.get('/json/version/', versionHandler);

  async function listHandler(request: FastifyRequest, reply: FastifyReply) {
    try {
      const apiKey = getApiKey(request);
      if (!apiKey) {
        return reply.status(401).send([{ error: 'API Key required' }]);
      }

      const user = await authenticateUser(apiKey);
      if (!user) {
        return reply.status(401).send([{ error: 'Invalid API Key' }]);
      }

      const sessions = await SessionModel.getAllByUserId(user.id);
      const activeSessions = sessions.filter(
        (s) => s.status === SessionStatus.CONNECTED || s.status === SessionStatus.CREATED
      );

      const targets = await Promise.all(
        activeSessions.map(async (s) => {
          const wsUrl = buildWsUrl(request, s.id, apiKey);
          return {
            id: s.id,
            type: 'page',
            title: 'about:blank',
            url: 'about:blank',
            webSocketDebuggerUrl: wsUrl,
          };
        })
      );

      return reply.send(targets);
    } catch (error: unknown) {
      logger.error('CDP /json/list error:', error);
      return reply.status(500).send([{ error: 'Internal error' }]);
    }
  }

  fastify.get('/json', listHandler);
  fastify.get('/json/list', listHandler);

  fastify.put('/json/new', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const apiKey = getApiKey(request);
      if (!apiKey) {
        return reply.status(401).send({ error: 'API Key required' });
      }

      const user = await authenticateUser(apiKey);
      if (!user) {
        return reply.status(401).send({ error: 'Invalid API Key' });
      }

      const sessionResult = await createBrowserSession(user.id, {}, true);
      const wsUrl = buildWsUrl(request, sessionResult.sessionId, apiKey);

      return reply.send({
        id: sessionResult.sessionId,
        type: 'page',
        title: 'about:blank',
        url: 'about:blank',
        webSocketDebuggerUrl: wsUrl,
      });
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('CDP /json/new error:', error);
      return reply.status(500).send({ error: errMsg });
    }
  });

  fastify.get('/json/close/:sessionId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const apiKey = getApiKey(request);
      if (!apiKey) {
        return reply.status(401).send({ error: 'API Key required' });
      }

      const user = await authenticateUser(apiKey);
      if (!user) {
        return reply.status(401).send({ error: 'Invalid API Key' });
      }

      const { sessionId } = request.params as { sessionId: string };

      const session = await SessionModel.findById(sessionId);
      if (!session) {
        return reply.status(404).send({ error: 'Session not found' });
      }

      if (session.user_id !== user.id) {
        return reply.status(403).send({ error: 'Forbidden' });
      }

      await releaseSession({
        sessionId,
        userId: user.id,
        machineId: session.machine_id ?? undefined,
      });

      return reply.send({ message: 'Session is closed' });
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('CDP /json/close error:', error);
      return reply.status(500).send({ error: errMsg });
    }
  });
}
