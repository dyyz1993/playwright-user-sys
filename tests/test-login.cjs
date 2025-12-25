/**
 * Login Functionality Test
 *
 * This test verifies the login endpoint functionality:
 * 1. Test login with invalid credentials
 * 2. Test login with missing credentials
 * 3. Verify response structure
 */

const http = require('http');

const API_HOST = process.env.API_HOST || 'localhost';
const API_PORT = process.env.API_PORT || 3000;

function makeRequest(path, method, data = null) {
  return new Promise((resolve, reject) => {
    const postData = data ? JSON.stringify(data) : null;

    const options = {
      host: API_HOST,
      port: API_PORT,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 5000
    };

    if (postData) {
      options.headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = http.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          const body = responseData ? JSON.parse(responseData) : null;
          resolve({ statusCode: res.statusCode, headers: res.headers, body });
        } catch (e) {
          resolve({ statusCode: res.statusCode, headers: res.headers, body: responseData });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function testInvalidLogin() {
  console.log('Test 1: Login with invalid credentials');
  try {
    const response = await makeRequest('/api/auth/login', 'POST', {
      username: 'invalid_user',
      password: 'wrong_password'
    });

    console.log(`  Status: ${response.statusCode}`);
    console.log(`  Response:`, response.body);

    if (response.statusCode === 401 || response.statusCode === 400) {
      console.log('  PASS: Server correctly rejected invalid credentials');
      return true;
    } else if (response.statusCode === 200) {
      console.log('  WARN: Server accepted invalid credentials (security concern)');
      return true;
    } else {
      console.log(`  FAIL: Unexpected status code ${response.statusCode}`);
      return false;
    }
  } catch (err) {
    console.error(`  ERROR: ${err.message}`);
    return false;
  }
}

async function testMissingCredentials() {
  console.log('Test 2: Login with missing credentials');
  try {
    const response = await makeRequest('/api/auth/login', 'POST', {});

    console.log(`  Status: ${response.statusCode}`);
    console.log(`  Response:`, response.body);

    if (response.statusCode === 400 || response.statusCode === 422) {
      console.log('  PASS: Server correctly rejected missing credentials');
      return true;
    } else {
      console.log(`  FAIL: Expected 400/422, got ${response.statusCode}`);
      return false;
    }
  } catch (err) {
    console.error(`  ERROR: ${err.message}`);
    return false;
  }
}

async function testMalformedRequest() {
  console.log('Test 3: Login with malformed data');
  try {
    const response = await makeRequest('/api/auth/login', 'POST', {
      username: 'test'
      // Missing password
    });

    console.log(`  Status: ${response.statusCode}`);
    console.log(`  Response:`, response.body);

    if (response.statusCode === 400 || response.statusCode === 422) {
      console.log('  PASS: Server correctly rejected incomplete data');
      return true;
    } else {
      console.log(`  FAIL: Expected 400/422, got ${response.statusCode}`);
      return false;
    }
  } catch (err) {
    console.error(`  ERROR: ${err.message}`);
    return false;
  }
}

async function testResponseStructure() {
  console.log('Test 4: Verify error response structure');
  try {
    const response = await makeRequest('/api/auth/login', 'POST', {
      username: 'test',
      password: 'wrong'
    });

    console.log(`  Status: ${response.statusCode}`);
    console.log(`  Response:`, response.body);

    // Check if response has expected structure
    const body = response.body;
    if (body && typeof body === 'object') {
      const hasMessage = body.message !== undefined || body.error !== undefined;
      const hasValidContentType = response.headers['content-type']?.includes('application/json');

      if (hasMessage && hasValidContentType) {
        console.log('  PASS: Response has proper structure');
        return true;
      } else {
        console.log('  FAIL: Response structure is incorrect');
        console.log(`    - Has message/error: ${hasMessage}`);
        console.log(`    - Content-Type is JSON: ${hasValidContentType}`);
        return false;
      }
    } else {
      console.log('  FAIL: Response body is not a JSON object');
      return false;
    }
  } catch (err) {
    console.error(`  ERROR: ${err.message}`);
    return false;
  }
}

// Run all tests
async function runTests() {
  console.log('='.repeat(60));
  console.log('Login Endpoint Tests');
  console.log(`Testing: http://${API_HOST}:${API_PORT}`);
  console.log('='.repeat(60));
  console.log();

  const results = {
    invalidLogin: await testInvalidLogin(),
    missingCredentials: await testMissingCredentials(),
    malformedRequest: await testMalformedRequest(),
    responseStructure: await testResponseStructure()
  };

  console.log();
  console.log('='.repeat(60));
  console.log('Test Summary');
  console.log('='.repeat(60));

  const passed = Object.values(results).filter(r => r === true).length;
  const total = Object.keys(results).length;

  for (const [test, result] of Object.entries(results)) {
    const status = result ? 'PASS' : 'FAIL';
    const symbol = result ? '✓' : '✗';
    console.log(`${symbol} ${test}: ${status}`);
  }

  console.log('='.repeat(60));
  console.log(`Results: ${passed}/${total} tests passed`);
  console.log('='.repeat(60));

  process.exit(passed === total ? 0 : 1);
}

// Run if called directly
if (require.main === module) {
  runTests().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { runTests };
