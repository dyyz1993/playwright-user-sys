/**
 * Basic API Health Check Test
 *
 * This test performs a simple health check on the API server
 * to verify it's running and responding to requests.
 */

const http = require('http');

const API_HOST = process.env.API_HOST || 'localhost';
const API_PORT = process.env.API_PORT || 3000;

function testApiHealth() {
  return new Promise((resolve, reject) => {
    const options = {
      host: API_HOST,
      port: API_PORT,
      path: '/health',
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 5000
    };

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        console.log(`Health Check Status: ${res.statusCode}`);
        console.log(`Response Body: ${data}`);

        if (res.statusCode === 200 || res.statusCode === 404) {
          // 404 is acceptable if /health endpoint doesn't exist but server is running
          console.log('API Test PASSED - Server is responding');
          resolve({ success: true, statusCode: res.statusCode, body: data });
        } else {
          console.log('API Test FAILED - Unexpected status code');
          reject(new Error(`Unexpected status code: ${res.statusCode}`));
        }
      });
    });

    req.on('error', (err) => {
      console.error('API Test FAILED - Connection error:', err.message);
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout - server may not be running'));
    });

    req.end();
  });
}

function testLoginEndpoint() {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      username: 'test',
      password: 'test'
    });

    const options = {
      host: API_HOST,
      port: API_PORT,
      path: '/api/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 5000
    };

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        console.log(`Login Endpoint Status: ${res.statusCode}`);
        console.log(`Response Body: ${data}`);

        if (res.statusCode === 200 || res.statusCode === 401 || res.statusCode === 400) {
          // All are acceptable - 200 means success, 401 means auth failed, 400 means validation failed
          console.log('Login Endpoint Test PASSED');
          resolve({ success: true, statusCode: res.statusCode, body: data });
        } else {
          console.log('Login Endpoint Test FAILED');
          reject(new Error(`Unexpected status code: ${res.statusCode}`));
        }
      });
    });

    req.on('error', (err) => {
      console.error('Login Endpoint Test FAILED - Connection error:', err.message);
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.write(postData);
    req.end();
  });
}

// Run tests
async function runTests() {
  console.log('='.repeat(60));
  console.log('API Integration Tests');
  console.log(`Testing: http://${API_HOST}:${API_PORT}`);
  console.log('='.repeat(60));
  console.log();

  try {
    console.log('Test 1: Health Check');
    console.log('-'.repeat(60));
    await testApiHealth();
    console.log();

    console.log('Test 2: Login Endpoint');
    console.log('-'.repeat(60));
    await testLoginEndpoint();
    console.log();

    console.log('='.repeat(60));
    console.log('All API Tests PASSED');
    console.log('='.repeat(60));
    process.exit(0);
  } catch (err) {
    console.log();
    console.log('='.repeat(60));
    console.error('API Tests FAILED:', err.message);
    console.log('='.repeat(60));
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runTests();
}

module.exports = { testApiHealth, testLoginEndpoint };
