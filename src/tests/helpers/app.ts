import Fastify, { FastifyInstance } from 'fastify';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import authPlugin from '../../plugins/auth.plugin.js';
import errorHandlerPlugin from '../../plugins/error-handler.plugin.js';
// 简化测试，移除不必要的插件
// import corsPlugin from '../../plugins/cors.plugin.js';
// import swaggerPlugin from '../../plugins/swagger.plugin.js';
// import sensiblePlugin from '../../plugins/sensible.plugin.js';
import userRoutes from '../../routes/user.routes.js';
import authRoutes from '../../routes/auth.routes.js';
import adminApiRoutes from '../../routes/admin-api.routes.js';
import sessionRoutes from '../../routes/session.routes.js';
import machineRoutes from '../../routes/machine.routes.js';
import adminMachineApiRoutes from '../../routes/admin-machine-api.routes.js';

/**
 * 构建测试应用实例
 */
export async function build(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false, // 测试时禁用日志
  });

  // 配置自定义 validatorCompiler，确保拒绝未知字段而不是删除
  app.setValidatorCompiler(({ schema }) => {
    const ajv = new Ajv({
      removeAdditional: false, // 关键：拒绝而不是删除未知字段
      coerceTypes: true,
      useDefaults: true,
      allErrors: false,
    });
    addFormats(ajv); // 添加 email、uri 等格式支持
    return ajv.compile(schema);
  });

  // 注册插件
  // 简化测试，只注册必要的插件
  // await app.register(corsPlugin);
  // await app.register(sensiblePlugin);
  await app.register(errorHandlerPlugin); // 注册错误处理插件，确保验证错误正确返回
  await app.register(authPlugin);

  // 注册路由
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(userRoutes, { prefix: '/api/users' });
  await app.register(adminApiRoutes);
  await app.register(sessionRoutes, { prefix: '/api/sessions' });
  await app.register(machineRoutes, { prefix: '/api/machines' });
  await app.register(adminMachineApiRoutes); // 添加机器管理API路由

  return app;
}
