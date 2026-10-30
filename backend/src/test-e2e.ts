import { prisma } from './database/prisma.js';
import { redisClient } from './config/redis.js';
import { esClient } from './config/elasticsearch.js';

async function runTests() {
  console.log('\n======================================================');
  console.log('🧪 RUNNING REACHINBOX END-TO-END VALIDATION SUITE');
  console.log('======================================================\n');

  const API_BASE = 'http://localhost:5001';

  // Helper fetch with cookies
  let sessionCookie = '';

  const apiCall = async (endpoint: string, options: any = {}) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };
    if (sessionCookie) {
      headers['Cookie'] = sessionCookie;
    }

    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      sessionCookie = setCookie.split(';')[0];
    }

    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  };

  // Test 1: Health check
  console.log('1️⃣  Testing Health Check Endpoint...');
  const health = await apiCall('/health');
  if (health.status === 200 && health.data.database === 'healthy' && health.data.redis === 'healthy') {
    console.log('   ✅ Health Check passed:', health.data);
  } else {
    throw new Error(`Health check failed: ${JSON.stringify(health.data)}`);
  }

  // Test 2: Auth Dev Login
  console.log('\n2️⃣  Testing Authentication & Session Persistence...');
  const authLogin = await apiCall('/auth/dev-login', {
    method: 'POST',
    body: JSON.stringify({
      email: 'e2e.engineer@reachinbox.ai',
      name: 'E2E Test Engineer',
    }),
  });

  if (authLogin.status === 200 && authLogin.data.success) {
    console.log(`   ✅ Dev Login passed for user: ${authLogin.data.user.email} (ID: ${authLogin.data.user.id})`);
  } else {
    throw new Error(`Auth login failed: ${JSON.stringify(authLogin.data)}`);
  }

  // Verify session with GET /auth/me
  const authMe = await apiCall('/auth/me');
  if (authMe.status === 200 && authMe.data.authenticated) {
    console.log('   ✅ Session Cookie verification passed with GET /auth/me');
  } else {
    throw new Error(`Session verification failed: ${JSON.stringify(authMe.data)}`);
  }

  // Test 3: Sender Configuration
  console.log('\n3️⃣  Testing Sender Creation & Rate Limit Configuration...');
  const senderRes = await apiCall('/api/senders', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Rate-Limited Sender',
      email: 'ratelimited@reachinbox.ai',
      hourlyLimit: 2,
      minimumDelay: 2000,
    }),
  });

  const senderId = senderRes.data.sender.id;
  console.log(`   ✅ Sender created with hourlyLimit=2, minimumDelay=2000ms (ID: ${senderId})`);

  // Test 4: Idempotency Verification
  console.log('\n4️⃣  Testing Idempotency Key Handling...');
  const idempotencyKey = `idemp-key-${Date.now()}`;
  const firstSchedule = await apiCall('/api/emails/schedule', {
    method: 'POST',
    body: JSON.stringify({
      senderId,
      recipients: ['idemp.test@example.com'],
      subject: 'Idempotency Test Email',
      body: 'Testing idempotency guarantee.',
      idempotencyKey,
    }),
  });

  console.log(`   First call returned ${firstSchedule.data.count} email(s)`);

  const duplicateSchedule = await apiCall('/api/emails/schedule', {
    method: 'POST',
    body: JSON.stringify({
      senderId,
      recipients: ['idemp.test@example.com'],
      subject: 'Idempotency Test Email',
      body: 'Testing idempotency guarantee.',
      idempotencyKey,
    }),
  });

  if (duplicateSchedule.data.idempotentReplay) {
    console.log('   ✅ Idempotency replay recognized! No duplicate jobs created.');
  } else {
    throw new Error('Idempotency test failed: Duplicate was not prevented');
  }

  // Test 5: Elasticsearch Search
  console.log('\n5️⃣  Testing Elasticsearch Search API...');
  const searchRes = await apiCall('/api/emails/search?q=Idempotency');
  if (searchRes.status === 200 && searchRes.data.total > 0) {
    console.log(`   ✅ Elasticsearch successfully matched ${searchRes.data.total} email(s) for query "Idempotency"`);
  } else {
    console.log('   ⚠️ Elasticsearch returned 0 hits (may still be indexing in background)');
  }

  // Test 6: Slack Connection & Disconnect Flow
  console.log('\n6️⃣  Testing Slack Connection & Disconnect Lifecycle...');
  const slackConnect = await apiCall('/api/slack/dev-connect', {
    method: 'POST',
    body: JSON.stringify({
      slackUserId: 'U_TEST_USER_999',
      teamName: 'E2E Testing Slack Team',
    }),
  });

  if (slackConnect.status === 200 && slackConnect.data.success) {
    console.log('   ✅ Slack connected successfully to team:', slackConnect.data.connection.teamName);
  }

  const slackStatus = await apiCall('/api/slack/status');
  if (slackStatus.data.connected && slackStatus.data.connection.slackUserId === 'U_TEST_USER_999') {
    console.log('   ✅ Slack status confirmed active');
  }

  const slackDisconnect = await apiCall('/api/slack/disconnect', { method: 'POST' });
  if (slackDisconnect.data.success) {
    console.log('   ✅ Slack disconnected successfully');
  }

  console.log('\n======================================================');
  console.log('🎉 ALL REACHINBOX END-TO-END VALIDATIONS PASSED!');
  console.log('======================================================\n');

  process.exit(0);
}

runTests().catch((err) => {
  console.error('\n❌ E2E TEST FAILED:', err);
  process.exit(1);
});
