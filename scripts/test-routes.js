import http from 'http';
import app from '../server/app.js';
import { generateToken } from '../server/middleware/auth.js';

async function runRouteTests() {
  console.log('🧪 Starting HTTP Route Integration Tests...\n');

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  const testToken = generateToken({ user_id: 1, email: 'test@finlytics.dev', name: 'Tester' });
  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${testToken}`,
  };

  try {
    // 1. Health check
    const healthRes = await fetch(`${baseUrl}/api/health`);
    const healthData = await healthRes.json();
    assert(healthRes.status === 200 && healthData.status === 'ok', 'GET /api/health returns 200 OK');

    // 2. Auth register validation
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'bad' }),
    });
    assert(regRes.status === 400, 'POST /api/auth/register validates required input fields');

    // 3. Auth login validation
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert(loginRes.status === 400, 'POST /api/auth/login validates required credentials');

    // 4. Protected route without token
    const dashRes = await fetch(`${baseUrl}/api/dashboard/summary`);
    assert(dashRes.status === 401, 'GET /api/dashboard/summary rejects unauthenticated requests with 401');

    const expRes = await fetch(`${baseUrl}/api/expenses`);
    assert(expRes.status === 401, 'GET /api/expenses rejects unauthenticated requests with 401');

    const incRes = await fetch(`${baseUrl}/api/income`);
    assert(incRes.status === 401, 'GET /api/income rejects unauthenticated requests with 401');

    const catRes = await fetch(`${baseUrl}/api/categories`);
    assert(catRes.status === 401, 'GET /api/categories rejects unauthenticated requests with 401');

    const profRes = await fetch(`${baseUrl}/api/user/profile`, { method: 'PUT' });
    assert(profRes.status === 401, 'PUT /api/user/profile rejects unauthenticated requests with 401');

    // 5. Category Type Validation Tests (Invalid Type should return 400)
    const badCatRes = await fetch(`${baseUrl}/api/categories`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ name: 'InvalidCat', type: 'crypto' }),
    });
    assert(badCatRes.status === 400, "POST /api/categories rejects invalid category types other than 'income' or 'expense'");

    const emptyCatRes = await fetch(`${baseUrl}/api/categories`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ name: '', type: 'expense' }),
    });
    assert(emptyCatRes.status === 400, 'POST /api/categories rejects empty category name');

    // 6. 404 handler
    const notFoundRes = await fetch(`${baseUrl}/api/nonexistent-route-12345`);
    assert(notFoundRes.status === 404, 'Unmatched /api/* route returns 404 Not Found');

    console.log('\n========================================');
    console.log(`Route Test Summary: ${passed} Passed, ${failed} Failed`);
    console.log('========================================\n');
  } finally {
    server.close();
  }

  if (failed > 0) {
    process.exit(1);
  }
}

runRouteTests().catch((err) => {
  console.error('Route testing failed:', err);
  process.exit(1);
});
