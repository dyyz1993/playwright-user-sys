import { FastifyInstance } from 'fastify';
import adminAuthPageRoutes from './admin/auth.routes.js';
import adminDasboardPageRoutes from './admin/dashboard.routes.js';
import adminUserPageRoutes from './admin/user-pages.routes.js';
import adminMachinePageRoutes from './admin/machine-pages.routes.js';
import adminSessionPageRoutes from './admin/session-pages.routes.js';
import adminProfilePageRoutes from './admin/profile.routes.js';
import adminCreditsPageRoutes from './admin/credits.routes.js';
import adminLogPageRoutes from './admin/logs.routes.js';
import adminUtilityPageRoutes from './admin/utility-pages.routes.js';
import adminDebugRoutes from './admin/debug.routes.js';

export default async function adminRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.register(adminAuthPageRoutes);
  fastify.register(adminDasboardPageRoutes);
  fastify.register(adminUserPageRoutes);
  fastify.register(adminMachinePageRoutes);
  fastify.register(adminSessionPageRoutes);
  fastify.register(adminProfilePageRoutes);
  fastify.register(adminCreditsPageRoutes);
  fastify.register(adminLogPageRoutes);
  fastify.register(adminUtilityPageRoutes);
  fastify.register(adminDebugRoutes);
}
