import http from 'k6/http';
import { check } from 'k6';

// Test exactly one iteration of register → login
export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    checks: ['rate==1.00'], // All checks must pass
  },
};

export default function () {
  const BASE_URL = 'http://localhost:5000';
  const timestamp = Date.now();
  
  // Test user data
  const testUser = {
    name: 'Single Test User',
    email: `single.test.${timestamp}@k6.com`,
    password: 'TestPassword123!'
  };
  
  console.log('🚀 Testing Single User Auth Flow\n');
  
  // 1. REGISTER
  console.log('1. Registering user...');
  const registerRes = http.post(
    `${BASE_URL}/register`,
    JSON.stringify(testUser),
    { headers: { 'Content-Type': 'application/json' }, timeout: '10s' }
  );
  
  console.log(`   Status: ${registerRes.status}`);
  console.log(`   Response: ${registerRes.body.substring(0, 150)}...`);
  
  check(registerRes, {
    'registration successful': (r) => r.status === 200,
  });
  
  if (registerRes.status !== 200) {
    console.log('❌ Registration failed - stopping test');
    return;
  }
  
  // Parse registration data
  let regData;
  try {
    regData = JSON.parse(registerRes.body);
    console.log(`   ✅ User registered: ${regData.user.email}`);
  } catch (e) {
    console.log('❌ Failed to parse registration response');
    return;
  }
  
  // 2. LOGIN
  console.log('\n2. Logging in with same credentials...');
  const loginRes = http.post(
    `${BASE_URL}/login`,
    JSON.stringify({
      email: testUser.email,
      password: testUser.password
    }),
    { headers: { 'Content-Type': 'application/json' }, timeout: '10s' }
  );
  
  console.log(`   Status: ${loginRes.status}`);
  console.log(`   Response: ${loginRes.body.substring(0, 150)}...`);
  
  check(loginRes, {
    'login successful': (r) => r.status === 200,
    'login returns token': (r) => {
      try {
        const data = JSON.parse(r.body);
        return data.token && data.token.length > 10;
      } catch {
        return false;
      }
    },
    'user data matches': (r) => {
      try {
        const data = JSON.parse(r.body);
        return data.user.email === regData.user.email;
      } catch {
        return false;
      }
    },
  });
  
  // 3. TEST ERROR CASES
  console.log('\n3. Testing error cases...');
  
  // Invalid login
  const invalidLoginRes = http.post(
    `${BASE_URL}/login`,
    JSON.stringify({
      email: testUser.email,
      password: 'WRONG_PASSWORD'
    }),
    { headers: { 'Content-Type': 'application/json' }, timeout: '5s' }
  );
  
  check(invalidLoginRes, {
    'invalid login returns 400': (r) => r.status === 400,
    'correct error message': (r) => {
      try {
        const data = JSON.parse(r.body);
        return data.error === 'Invalid credentials';
      } catch {
        return false;
      }
    },
  });
  
  // Missing fields registration
  const badRegisterRes = http.post(
    `${BASE_URL}/register`,
    JSON.stringify({ name: 'Missing Fields' }), // Missing email and password
    { headers: { 'Content-Type': 'application/json' }, timeout: '5s' }
  );
  
  check(badRegisterRes, {
    'bad registration returns 400': (r) => r.status === 400,
  });
  
  console.log('\n✅ Single user auth flow test complete!');
  console.log(`Tested: ${testUser.email}`);
}