import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 5,
  duration: '30s',
  thresholds: {
    'checks': ['rate>0.95'],
    'http_req_duration': ['p(95)<2000'],
  },
};

export default function () {
  const BASE_URL = 'http://localhost:5000';
  
  // MOST LIKELY CORRECT BASED ON YOUR CODE:
  // - Your authRouter.js is likely mounted at root ('/') 
  // - Your passwordsRouter.js is likely mounted at '/api/passwords'
  
  const vuId = __VU;
  const iterId = __ITER;
  const timestamp = Date.now();
  
  // 1. Register - try different patterns
  const user = {
    name: `TestUser${vuId}-${iterId}`,
    email: `test_${vuId}_${iterId}_${timestamp}@test.com`,
    password: 'Test123!',
  };
  
  console.log(`VU${vuId}-${iterId}: Testing with ${user.email}`);
  
  // Try register at root (most likely based on your standalone router)
  const registerRes = http.post(
    `${BASE_URL}/register`,  // NO /api prefix - your authRouter is likely at root
    JSON.stringify(user),
    { headers: { 'Content-Type': 'application/json' }, timeout: '10s' }
  );
  
  console.log(`  Register (/register): ${registerRes.status}`);
  
  if (registerRes.status !== 200) {
    // Try alternative
    console.log(`  Trying /auth/register...`);
    const altRes = http.post(
      `${BASE_URL}/auth/register`,
      JSON.stringify(user),
      { headers: { 'Content-Type': 'application/json' }, timeout: '5s' }
    );
    console.log(`  Alt register: ${altRes.status}`);
    
    if (altRes.status === 200) {
      console.log('  ✅ Use /auth/register endpoint');
      sleep(2);
      return;
    }
    
    console.log(`  ❌ Register failed: ${registerRes.body}`);
    sleep(2);
    return;
  }
  
  let token;
  try {
    const data = JSON.parse(registerRes.body);
    token = data.token;
    console.log(`  ✅ Registered, got token`);
  } catch (e) {
    console.log(`  ❌ Parse error: ${e.message}`);
    sleep(2);
    return;
  }
  
  // 2. Create password
  sleep(0.5);
  
  const createRes = http.post(
    `${BASE_URL}/api/passwords`,  // Most likely based on typical Express mounting
    JSON.stringify({
      title: `Test ${vuId}-${iterId}`,
      username: 'testuser',
      password: 'encrypted_pass',
      // Add more fields if your model requires them
      website: 'https://example.com',
      notes: 'Test password'
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      timeout: '10s',
    }
  );
  
  console.log(`  Create (/api/passwords): ${createRes.status}`);
  
  if (createRes.status !== 200 && createRes.status !== 201) {
    // Try alternative passwords endpoint
    console.log(`  Trying /passwords...`);
    const altCreateRes = http.post(
      `${BASE_URL}/passwords`,
      JSON.stringify({
        title: `Test ${vuId}-${iterId}`,
        username: 'testuser',
        password: 'encrypted'
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        timeout: '5s',
      }
    );
    
    console.log(`  Alt create: ${altCreateRes.status}`);
    
    if (altCreateRes.status === 200 || altCreateRes.status === 201) {
      console.log('  ✅ Use /passwords endpoint');
      // Continue with delete test...
    } else {
      console.log(`  ❌ Create failed: ${createRes.body}`);
      sleep(2);
      return;
    }
  }
  
  let passwordId;
  try {
    const data = JSON.parse(createRes.body);
    passwordId = data.id || data._id;
    console.log(`  ✅ Created password ID: ${passwordId}`);
  } catch (e) {
    console.log(`  ❌ Parse error: ${e.message}`);
    sleep(2);
    return;
  }
  
  // 3. DELETE the password
  sleep(0.5);
  
  console.log(`  Deleting password ${passwordId}...`);
  
  const deleteRes = http.del(
    `${BASE_URL}/api/passwords/${passwordId}`,  // Match create endpoint
    null,
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      timeout: '10s',
    }
  );
  
  console.log(`  Delete: ${deleteRes.status}`);
  console.log(`  Delete response: ${deleteRes.body}`);
  
  // Run checks
  const checks = check(deleteRes, {
    'DELETE returns 200': (r) => r.status === 200,
    'DELETE returns Deleted message': (r) => {
      try {
        const data = JSON.parse(r.body);
        return data.message && (data.message === 'Deleted' || data.message.includes('delete'));
      } catch {
        return false;
      }
    },
  });
  
  if (checks) {
    console.log(`  ✅ Delete successful!`);
  } else {
    console.log(`  ❌ Delete checks failed`);
  }
  
  sleep(1);
}