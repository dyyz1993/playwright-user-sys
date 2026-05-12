import { FastifyInstance, FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';

/**
 * 自定义错误处理插件
 * 确保所有错误响应都包含 success 字段
 */
export default fp(async function (fastify: FastifyInstance) {
  // 设置全局错误处理器
  fastify.setErrorHandler(function (error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
    request.log.error(error);

    // 处理 Content-Type 错误
    if (error.code === 'FST_ERR_CTP_EMPTY_JSON_BODY') {
      // 对于 DELETE 请求，允许空请求体
      if (request.method === 'DELETE') {
        request.body = {};
        return;
      }

      return reply.status(400).send({
        success: false,
        error: '请求体不能为空',
      });
    }

    // 处理验证错误
    if (error.validation) {
      return reply.status(400).send({
        success: false,
        error: '请求参数验证失败',
        details: error.validation,
      });
    }

    // 处理其他错误
    const statusCode = error.statusCode || 500;
    const message =
      statusCode >= 500 && process.env.NODE_ENV === 'production'
        ? 'Internal Server Error'
        : error.message || '服务器内部错误';

    return reply.status(statusCode).send({
      success: false,
      error: message,
    });
  });
});
