import { build } from './src/tests/helpers/app.js';

async function test() {
  const app = await build();

  // Create a test user
  const userResponse = await app.inject({
    method: 'POST',
    url: '/api/admin/users',
    headers: {
      Authorization: 'Bearer ' + generateToken({ id: 1, username: 'admin', role: 'admin' }),
    },
    payload: {
      username: 'testuser_debug',
      password: 'password123',
      credits: 100,
    },
  });

  const user = JSON.parse(userResponse.payload).data;

  // Create test sessions
  const { SessionModel } = await import('./src/models/session.model.js');
  await SessionModel.create({
    user_id: user.id,
    options: { userAgent: 'test-agent' },
  });
  await SessionModel.create({
    user_id: user.id,
    options: { userAgent: 'test-agent-2' },
  });

  // Get sessions
  const response = await app.inject({
    method: 'GET',
    url: '/api/sessions',
    headers: {
      'x-api-key': user.api_key,
    },
  });

  console.log('Status:', response.statusCode);
  console.log('Payload:', response.payload);

  await app.close();
}

function generateToken(user) {
  const jwt = require('jsonwebtoken');
  return jwt.sign(user, 'test-secret');
}

test().catch(console.error);
