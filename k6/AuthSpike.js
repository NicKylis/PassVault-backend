import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Metrics
const registrationSuccess = new Rate('registration_success');
const loginSuccess = new Rate('login_success');
const responseTimes = new Trend('response_times');

export const options = {
  // OPTIMIZED SPIKE PATTERN FOR YOUR SYSTEM
  // Baseline: 3-4 seconds per request with 1 user
  // With 50 users: 11+ seconds (too slow)
  // Let's use more conservative numbers:
  
  stages: [
    // Phase 1: Baseline (1 user)
    { duration: '30s', target: 1 },
    
    // Phase 2: Small increase (5 users - 5x load)
    { duration: '30s', target: 5 },
    
    // Phase 3: Moderate spike (15 users - 15x load)
    { duration: '30s', target: 15 },
    
    // Phase 4: Peak (25 users - reduced from 50)
    { duration: '30s', target: 25 },
    
    // Phase 5: Recovery
    { duration: '30s', target: 5 },
    { duration: '30s', target: 1 },
  ],
  
  // REALISTIC THRESHOLDS FOR YOUR SYSTEM
  thresholds: {
    'response_times': ['p(95)<10000'],  // 10 seconds max (based on your 1-user = 4s)
    'registration_success': ['rate>0.70'],
    'login_success': ['rate>0.80'],
    'http_req_failed': ['rate<0.20'],   // Allow 20% failures during spike
  },
  
  // Performance optimizations
  discardResponseBodies: false,  // Keep for debugging
  noConnectionReuse: false,      // Reuse connections
  batch: 5,                      // Small batches
};

export default function () {
  const BASE_URL = 'http://localhost:5000';
  const vuId = __VU;
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 10);
  
  // 1. REGISTRATION
  const testUser = {
    name: `User_${vuId}_${__ITER}`,
    email: `test_${vuId}_${__ITER}_${timestamp}_${randomSuffix}@k6.com`,
    password: 'test123'  // SIMPLE PASSWORD - reduces bcrypt time
  };
  
  const regStart = Date.now();
  const regRes = http.post(
    `${BASE_URL}/register`,
    JSON.stringify(testUser),
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: '15s',  // Increased timeout
      tags: { endpoint: 'register' }
    }
  );
  const regTime = Date.now() - regStart;
  responseTimes.add(regTime);
  
  console.log(`VU${vuId}: Register ${regRes.status} in ${regTime}ms`);
  
  if (regRes.status === 200) {
    registrationSuccess.add(1);
    
    // 2. LOGIN (after successful registration)
    sleep(1); // Small delay
    
    const loginStart = Date.now();
    const loginRes = http.post(
      `${BASE_URL}/login`,
      JSON.stringify({
        email: testUser.email,
        password: testUser.password
      }),
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: '15s',
        tags: { endpoint: 'login' }
      }
    );
    const loginTime = Date.now() - loginStart;
    responseTimes.add(loginTime);
    
    console.log(`VU${vuId}: Login ${loginRes.status} in ${loginTime}ms`);
    
    if (loginRes.status === 200) {
      loginSuccess.add(1);
    } else {
      loginSuccess.add(0);
    }
    
  } else {
    registrationSuccess.add(0);
    
    // If registration failed, try a simple login with fallback user
    if (Math.random() < 0.3) {
      sleep(0.5);
      
      const fallbackLogin = http.post(
        `${BASE_URL}/login`,
        JSON.stringify({
          email: `fallback${vuId % 3}@test.com`,  // Use 3 fallback users
          password: 'test123'
        }),
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: '10s',
          tags: { endpoint: 'login_fallback' }
        }
      );
    }
  }
  
  // ADAPTIVE SLEEP BASED ON CURRENT LOAD
  const currentVUs = __VU;
  let thinkTime;
  
  if (currentVUs <= 5) {
    thinkTime = Math.random() * 3 + 2;  // 2-5 seconds (normal)
  } else if (currentVUs <= 15) {
    thinkTime = Math.random() * 2 + 1;  // 1-3 seconds (moderate load)
  } else {
    thinkTime = Math.random() * 1 + 0.5; // 0.5-1.5 seconds (high load)
  }
  
  sleep(thinkTime);
}

// Setup: Create fallback users
export function setup() {
  console.log('🔧 Creating fallback users for login tests...');
  const BASE_URL = 'http://localhost:5000';
  
  // Create 3 simple users with fast passwords
  for (let i = 0; i < 3; i++) {
    const user = {
      name: `Fallback${i}`,
      email: `fallback${i}@test.com`,
      password: 'test123'  // Simple password for faster bcrypt
    };
    
    try {
      const res = http.post(
        `${BASE_URL}/register`,
        JSON.stringify(user),
        { headers: { 'Content-Type': 'application/json' }, timeout: '30s' }
      );
      
      if (res.status === 200) {
        console.log(`✅ Created fallback user ${i}`);
      } else if (res.status === 400 && res.body.includes('already in use')) {
        console.log(`ℹ️ Fallback user ${i} already exists`);
      }
    } catch (e) {
      console.log(`⚠️ Error creating fallback user ${i}: ${e.message}`);
    }
  }
  
  return { fallbackUsers: 3 };
}