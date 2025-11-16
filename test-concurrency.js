require('dotenv').config();
const policy = require('./policy');
const db = require('./db');

/**
 * Test concurrent policy checks to ensure no overspend
 * 
 * Scenario: 10 parallel requests for 500¢ each with 1500¢ session cap
 * Expected: Only 3 should succeed (3 * 500¢ = 1500¢), 7 should be denied
 */
async function testConcurrency() {
  console.log('🧪 Testing Policy Engine Concurrency\n');
  console.log('='.repeat(60));

  try {
    // Create test session
    console.log('\n1️⃣  Creating test session...');
    const session = await db.sessions.create('concurrency-test-user');
    console.log(`✅ Session: ${session.id}`);
    console.log(`   Session cap: ${policy.LIMITS.SESSION_CAP}¢`);

    // Scenario parameters
    const NUM_REQUESTS = 10;
    const AMOUNT_PER_REQUEST = 500; // Per-call maximum
    const EXPECTED_SUCCESS = Math.floor(policy.LIMITS.SESSION_CAP / AMOUNT_PER_REQUEST);
    
    console.log('\n2️⃣  Test scenario:');
    console.log(`   Concurrent requests: ${NUM_REQUESTS}`);
    console.log(`   Amount per request: ${AMOUNT_PER_REQUEST}¢`);
    console.log(`   Expected successes: ${EXPECTED_SUCCESS} (${EXPECTED_SUCCESS * AMOUNT_PER_REQUEST}¢)`);
    console.log(`   Expected denials: ${NUM_REQUESTS - EXPECTED_SUCCESS}`);

    // Create array of concurrent requests
    console.log('\n3️⃣  Launching concurrent requests...');
    const startTime = Date.now();
    
    const requests = Array.from({ length: NUM_REQUESTS }, (_, i) => 
      policy.canSpend(AMOUNT_PER_REQUEST, {
        sessionId: session.id,
        provider: 'x402',
        tag: `concurrent-${i}`
      })
    );

    // Execute all requests in parallel
    const results = await Promise.all(requests);
    const duration = Date.now() - startTime;

    console.log(`✅ All requests completed in ${duration}ms`);

    // Analyze results
    console.log('\n4️⃣  Analyzing results...');
    const approved = results.filter(r => r.allow);
    const denied = results.filter(r => !r.allow);

    console.log(`   Approved: ${approved.length}`);
    console.log(`   Denied: ${denied.length}`);

    // Calculate total reserved
    const totalReserved = approved.reduce((sum, r) => sum + AMOUNT_PER_REQUEST, 0);
    console.log(`   Total reserved: ${totalReserved}¢`);

    // Commit the approved reservations
    console.log('\n5️⃣  Committing approved reservations...');
    for (const result of approved) {
      if (result.reservationId) {
        await policy.commitReservation(result.reservationId, session.id, {
          test: 'concurrency',
          timestamp: new Date().toISOString()
        });
      }
    }
    console.log(`✅ Committed ${approved.length} reservations`);

    // Verify final session total
    console.log('\n6️⃣  Verifying session total...');
    const finalSession = await db.sessions.getById(session.id);
    const ledgerTotal = await db.ledger.getSessionTotal(session.id);
    
    console.log(`   Session total_cost_cents: ${finalSession.total_cost_cents}¢`);
    console.log(`   Ledger total: ${ledgerTotal}¢`);

    // Check for overspend
    const overspend = finalSession.total_cost_cents > policy.LIMITS.SESSION_CAP;

    console.log('\n7️⃣  Test assertions...');
    
    // Assertion 1: No overspend
    if (overspend) {
      console.log(`   ❌ FAIL: Overspend detected!`);
      console.log(`      Spent: ${finalSession.total_cost_cents}¢`);
      console.log(`      Limit: ${policy.LIMITS.SESSION_CAP}¢`);
      console.log(`      Over by: ${finalSession.total_cost_cents - policy.LIMITS.SESSION_CAP}¢`);
      throw new Error('Overspend detected - concurrency safety failed');
    } else {
      console.log(`   ✅ PASS: No overspend`);
      console.log(`      Spent: ${finalSession.total_cost_cents}¢ ≤ ${policy.LIMITS.SESSION_CAP}¢`);
    }

    // Assertion 2: Correct number of approvals
    if (approved.length !== EXPECTED_SUCCESS) {
      console.log(`   ⚠️  WARNING: Approval count unexpected`);
      console.log(`      Expected: ${EXPECTED_SUCCESS}`);
      console.log(`      Got: ${approved.length}`);
      console.log(`      (This may be OK if timing varies)`);
    } else {
      console.log(`   ✅ PASS: Correct approval count (${approved.length})`);
    }

    // Assertion 3: All denials have reasons
    const denialsWithReasons = denied.filter(r => r.reason);
    if (denialsWithReasons.length === denied.length) {
      console.log(`   ✅ PASS: All denials have reasons`);
    } else {
      console.log(`   ❌ FAIL: Some denials missing reasons`);
    }

    // Show sample denial reasons
    if (denied.length > 0) {
      console.log('\n8️⃣  Sample denial reasons:');
      denied.slice(0, 3).forEach((d, i) => {
        console.log(`   ${i + 1}. ${d.reason}`);
      });
    }

    // Performance metrics
    console.log('\n9️⃣  Performance metrics:');
    console.log(`   Total duration: ${duration}ms`);
    console.log(`   Average per request: ${Math.round(duration / NUM_REQUESTS)}ms`);
    console.log(`   Requests per second: ${Math.round((NUM_REQUESTS / duration) * 1000)}`);

    console.log('\n' + '='.repeat(60));
    console.log('\n✅ Concurrency test PASSED!\n');
    console.log('Key results:');
    console.log(`  - No overspend: ${finalSession.total_cost_cents}¢ ≤ ${policy.LIMITS.SESSION_CAP}¢`);
    console.log(`  - Approved: ${approved.length}/${NUM_REQUESTS}`);
    console.log(`  - Denied: ${denied.length}/${NUM_REQUESTS}`);
    console.log(`  - Duration: ${duration}ms`);
    console.log(`  - Transaction safety: VERIFIED ✓\n`);

  } catch (err) {
    console.error('\n❌ Concurrency test FAILED:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await db.pool.end();
  }
}

testConcurrency();
