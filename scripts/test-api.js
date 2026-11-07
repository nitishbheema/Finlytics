import app from '../server/app.js';
import { generateToken } from '../server/middleware/auth.js';
import bcrypt from 'bcryptjs';

async function runTests() {
  console.log('🧪 Starting Finlytics Automated Unit & Integration Tests...\n');
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

  // 1. Password Hashing Test
  console.log('--- Test Suite 1: Security & Cryptography ---');
  const password = 'TestSecretPassword123';
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(password, salt);
  const isMatch = await bcrypt.compare(password, hash);
  assert(isMatch, 'Bcrypt password hashing and verification works');

  const falseMatch = await bcrypt.compare('WrongPassword', hash);
  assert(!falseMatch, 'Bcrypt correctly rejects incorrect passwords');

  // 2. JWT Generation & Payload
  const token = generateToken({ user_id: 1, email: 'test@example.com', name: 'Test User' });
  assert(typeof token === 'string' && token.length > 20, 'JWT token generation succeeds');

  // 3. Server Instance Test
  console.log('\n--- Test Suite 2: Express App Configuration ---');
  assert(typeof app === 'function', 'Express app instance is properly exported');

  console.log('\n========================================');
  console.log(`Test Summary: ${passed} Passed, ${failed} Failed`);
  console.log('========================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
