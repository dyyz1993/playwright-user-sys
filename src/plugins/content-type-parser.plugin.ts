import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

/**
 * 自定义内容类型解析器插件
 * 允许空的 JSON 请求体，特别是对 DELETE 请求
 */
export default fp(async function (fastify: FastifyInstance) {
  // 添加自定义 JSON 解析器，允许空请求体
  fastify.addContentTypeParser('application/json', {
    parseAs: 'string',
  }, function (req, body, done) {
    if (body === '') {
      // 如果请求体为空，返回空对象
      done(null, {});
    } else {
      try {
        const json = JSON.parse(body as string);
        done(null, json);
      } catch (err) {
        const error = new Error('Invalid JSON');
        (error as any).statusCode = 400;
        done(error, undefined);
      }
    }
  });
});
