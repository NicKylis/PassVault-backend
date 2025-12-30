import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// ============================================
// PROPERLY DEFINED METRICS
// ============================================
const registrationSuccess = new Rate('registration_success');      // Only 200 responses
const registrationCompleted = new Rate('registration_completed');  // Any non-error response
const creationSuccess = new Rate('creation_success');
const deletionSuccess = new Rate('deletion_success');
const overallFlowSuccess = new Rate('overall_flow_success');
const responseTimes = new Trend('response_times');

// ============================================
// UPDATED THRESHOLDS
// ============================================
export const options = {
  stages: [
    { duration: '30s', target: 3 },
    { duration: '30s', target: 10 },
    { duration: '20s', target: 30 },
    { duration: '30s', target: 30 },
    { duration: '15s', target: 10 },
    { duration: '30s', target: 3 },
  ],
  
  // CORRECTED THRESHOLDS
  thresholds: {
    'registration_completed': ['rate>0.98'],  // 98% should complete (200 OR 400)
    'registration_success': ['rate>0.95'],    // 95% should succeed (200 only)
    'creation_success': ['rate>0.98'],
    'deletion_success': ['rate>0.99'],        // Deletion should be near perfect
    'overall_flow_success': ['rate>0.90'],    // 90% complete all 3 steps
    'response_times': ['p(95)<8000'],
  },
};

// ============================================
// UPDATED TEST LOGIC
// ============================================
export default function () {
  const BASE_URL = 'http://localhost:5000';
  const vuId = __VU;
  const iterId = __ITER;
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 15);
  
  // 1. REGISTRATION with better tracking
  const user = {
    name: `User_${vuId}_${iterId}`,
    email: `test_${vuId}_${iterId}_${timestamp}_${randomStr}@k6.com`,
    password: 'Test123!',
  };
  
  const registerRes = http.post(
    `${BASE_URL}/register`,
    JSON.stringify(user),
    { headers: { 'Content-Type': 'application/json' }, timeout: '15s' }
  );
  
  // Track BOTH completion and success
  registrationCompleted.add(registerRes.status === 200 || registerRes.status === 400);
  registrationSuccess.add(registerRes.status === 200);
  
  console.log(`Register: ${registerRes.status}`);
  
  if (registerRes.status !== 200) {
    // Registration failed, skip rest of flow
    sleep(2);
    return;
  }
  
  let token;
  try {
    token = JSON.parse(registerRes.body).token;
  } catch (e) {
    sleep(2);
    return;
  }
  
  // 2. CREATE PASSWORD
  sleep(0.5);
  
  const createRes = http.post(
    `${BASE_URL}/api/passwords`,
    JSON.stringify({
      title: `Password_${vuId}_${iterId}`,
      username: 'testuser',
      password: 'encrypted_test',
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      timeout: '10s',
    }
  );
  
  creationSuccess.add(createRes.status === 200 || createRes.status === 201);
  
  if (createRes.status !== 200 && createRes.status !== 201) {
    sleep(2);
    return;
  }
  
  let passwordId;
  try {
    const data = JSON.parse(createRes.body);
    passwordId = data.id || data._id;
  } catch (e) {
    sleep(2);
    return;
  }
  
  // 3. DELETE PASSWORD
  sleep(0.5);
  
  const deleteRes = http.del(
    `${BASE_URL}/api/passwords/${passwordId}`,
    null,
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      timeout: '10s',
    }
  );
  
  const deleteCheck = check(deleteRes, {
    'delete returns 200': (r) => r.status === 200,
    'delete has message': (r) => {
      try {
        const data = JSON.parse(r.body);
        return data.message && data.message.includes('Deleted');
      } catch {
        return false;
      }
    },
  });
  
  deletionSuccess.add(deleteCheck);
  
  // Track overall flow success
  if (registerRes.status === 200 && 
      (createRes.status === 200 || createRes.status === 201) && 
      deleteRes.status === 200) {
    overallFlowSuccess.add(1);
    console.log(`✅ Full flow completed successfully!`);
  } else {
    overallFlowSuccess.add(0);
  }
  
  console.log(`Create: ${createRes.status}, Delete: ${deleteRes.status}`);
  
  sleep(Math.random() * 2 + 1);
}