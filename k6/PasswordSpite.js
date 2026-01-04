import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// ============================================
// METRICS (MEANINGFUL & CORRECT)
// ============================================
const registrationCompleted = new Rate('registration_completed'); // 200 or 400
const registrationSuccess   = new Rate('registration_success');   // 200 only
const creationSuccess       = new Rate('creation_success');       // 200/201
const deletionSuccess       = new Rate('deletion_success');       // 200 only
const overallFlowSuccess    = new Rate('overall_flow_success');   // full flow
const responseTimes         = new Trend('response_times');        // latency

const BASE_URL = 'http://localhost:5000';

// ============================================
// LOAD PROFILE + THRESHOLDS
// ============================================
export const options = {
  stages: [
    { duration: '30s', target: 5 },
    { duration: '45s', target: 15 },
    { duration: '45s', target: 30 },
    { duration: '60s', target: 60 },   // peak
    { duration: '60s', target: 60 },   // sustain
    { duration: '30s', target: 20 },
    { duration: '30s', target: 5 },
    { duration: '20s', target: 0 },
  ],

  thresholds: {
    // ---------- BUSINESS ----------
    registration_completed: ['rate>0.95'],
    registration_success:   ['rate>0.95'],
    creation_success:       ['rate>0.97'],
    deletion_success:       ['rate>0.99'],
    overall_flow_success:   ['rate>0.90'],

    // ---------- PERFORMANCE ----------
    response_times: [
      'p(90)<6000',
      'p(95)<8000',
    ],

    http_req_duration: [
      'p(90)<6500',
      'p(95)<8500',
      'max<15000',
    ],

    // ---------- RELIABILITY ----------
    http_req_failed: ['rate<0.05'],
    checks: ['rate>0.95'],
  },
};

// ============================================
// MAIN TEST FLOW
// ============================================
export default function () {
  const vuId = __VU;
  const iterId = __ITER;
  const uid = `${vuId}_${iterId}_${Date.now()}`;

  // ============================================
  // 1. REGISTER
  // ============================================
  const registerRes = http.post(
    `${BASE_URL}/register`,
    JSON.stringify({
      name: `User_${uid}`,
      email: `user_${uid}@k6.com`,
      password: 'Test123!',
    }),
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: '15s',
    }
  );

  responseTimes.add(registerRes.timings.duration);

  registrationCompleted.add(
    registerRes.status === 200 || registerRes.status === 400
  );
  registrationSuccess.add(registerRes.status === 200);

  if (__ITER < 2) {
    console.log(`REGISTER → ${registerRes.status}`);
  }

  if (registerRes.status !== 200) {
    sleep(1);
    return;
  }

  let token;
  try {
    token = JSON.parse(registerRes.body).token;
  } catch {
    sleep(1);
    return;
  }

  // ============================================
  // 2. CREATE PASSWORD
  // ============================================
  sleep(0.5);

  const createRes = http.post(
    `${BASE_URL}/api/passwords`,
    JSON.stringify({
      title: `Password_${uid}`,
      username: 'testuser',
      password: 'encrypted_test',
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      timeout: '10s',
    }
  );

  responseTimes.add(createRes.timings.duration);

  creationSuccess.add(createRes.status === 200 || createRes.status === 201);

  if (__ITER < 2) {
    console.log(`CREATE → ${createRes.status}`);
  }

  if (createRes.status !== 200 && createRes.status !== 201) {
    sleep(1);
    return;
  }

  let passwordId;
  try {
    const body = JSON.parse(createRes.body);
    passwordId = body.id || body._id;
  } catch {
    sleep(1);
    return;
  }

  // ============================================
  // 3. DELETE PASSWORD
  // ============================================
  sleep(0.5);

  const deleteRes = http.del(
    `${BASE_URL}/api/passwords/${passwordId}`,
    null,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      timeout: '10s',
    }
  );

  responseTimes.add(deleteRes.timings.duration);

  const deleteOk = check(deleteRes, {
    'delete status 200': (r) => r.status === 200,
  });

  deletionSuccess.add(deleteRes.status === 200);

  if (__ITER < 2) {
    console.log(`DELETE → ${deleteRes.status}`);
  }

  // ============================================
  // OVERALL FLOW
  // ============================================
  if (
    registerRes.status === 200 &&
    (createRes.status === 200 || createRes.status === 201) &&
    deleteRes.status === 200
  ) {
    overallFlowSuccess.add(1);
  } else {
    overallFlowSuccess.add(0);
  }

  sleep(Math.random() * 2 + 1);
}
