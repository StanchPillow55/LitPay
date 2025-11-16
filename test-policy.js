require('dotenv').config();
const policy = require('./policy');
const db = require('./db');

async function testPolicyEngine() {
  console.log('🧪 Testing Local Policy Engine\n');
  console.log('='.repeat(60));

  try {
    // Test 1: Create a test session
    console.log('\n1️⃣  Creating test session...');
    const session = await db.sessions.create('test-user');
    console.log(`✅ Session created: ${session.id}`);

    // Test 2: Check budget status
    console.log('\n2️⃣  Checking initial budget status...');
    const status = await policy.getBudgetStatus(session.id);
    console.log('Budget Status:');
    console.log(`  Daily: ${status.daily.remaining}¢ / ${status.daily.limit}¢`);
    console.log(`  Session: ${status.session.remaining}¢ / ${status.session.limit}¢`);
    console.log(`  x402 Daily: ${status.x402Daily.remaining}¢ / ${status.x402Daily.limit}¢`);
    console.log(`  Per-call max: ${status.perCallMax}¢`);

    // Test 3: Small spend within limits
    console.log('\n3️⃣  Testing small spend (100¢)...');
    const result1 = await policy.canSpend(100, {
      sessionId: session.id,
      provider: 'x402'
    });
    console.log(`Allow: ${result1.allow}`);
    console.log(`Remaining: ${result1.remainingBudgetCents}¢`);
    console.log(`Reservation ID: ${result1.reservationId}`);

    if (result1.allow) {
      // Commit the reservation
      console.log('  Committing reservation...');
      await policy.commitReservation(result1.reservationId, session.id, {
        test: 'small-spend',
        txHash: '0xtest123'
      });
      console.log('  ✅ Committed');
    }

    // Test 4: Check updated budget
    console.log('\n4️⃣  Checking budget after spend...');
    const status2 = await policy.getBudgetStatus(session.id);
    console.log(`  Session spent: ${status2.session.spent}¢`);
    console.log(`  Session remaining: ${status2.session.remaining}¢`);

    // Test 5: Per-call maximum exceeded
    console.log('\n5️⃣  Testing per-call maximum (600¢ > 500¢ max)...');
    const result2 = await policy.canSpend(600, {
      sessionId: session.id,
      provider: 'x402'
    });
    console.log(`Allow: ${result2.allow}`);
    console.log(`Reason: ${result2.reason}`);

    // Test 6: Reservation with release
    console.log('\n6️⃣  Testing reservation release...');
    const result3 = await policy.canSpend(200, {
      sessionId: session.id,
      provider: 'stripe'
    });
    console.log(`Allow: ${result3.allow}`);
    console.log(`Reservation ID: ${result3.reservationId}`);
    
    if (result3.allow) {
      console.log('  Releasing reservation (simulating payment failure)...');
      await policy.releaseReservation(result3.reservationId, session.id, {
        error: 'payment_failed',
        reason: 'test_scenario'
      });
      console.log('  ✅ Released');
    }

    // Test 7: Multiple spends approaching session cap
    console.log('\n7️⃣  Testing session cap enforcement...');
    let totalSpent = status2.session.spent;
    let spendCount = 0;
    
    while (totalSpent < policy.LIMITS.SESSION_CAP) {
      const testAmount = 300;
      const result = await policy.canSpend(testAmount, {
        sessionId: session.id,
        provider: 'x402'
      });
      
      if (result.allow) {
        await policy.commitReservation(result.reservationId, session.id);
        totalSpent += testAmount;
        spendCount++;
        console.log(`  Spend #${spendCount}: ${testAmount}¢ committed (total: ${totalSpent}¢)`);
      } else {
        console.log(`  ❌ Spend blocked: ${result.reason}`);
        break;
      }
    }

    // Test 8: Final budget status
    console.log('\n8️⃣  Final budget status...');
    const finalStatus = await policy.getBudgetStatus(session.id);
    console.log('Budget Status:');
    console.log(`  Daily: ${finalStatus.daily.spent}¢ / ${finalStatus.daily.limit}¢`);
    console.log(`  Session: ${finalStatus.session.spent}¢ / ${finalStatus.session.limit}¢`);
    console.log(`  x402 Daily: ${finalStatus.x402Daily.spent}¢ / ${finalStatus.x402Daily.limit}¢`);

    // Test 9: Cleanup expired reservations
    console.log('\n9️⃣  Testing reservation cleanup...');
    const cleanedCount = await policy.cleanupExpiredReservations();
    console.log(`  Cleaned up: ${cleanedCount} expired reservations`);

    console.log('\n' + '='.repeat(60));
    console.log('\n✅ All policy engine tests passed!\n');

  } catch (err) {
    console.error('\n❌ Test failed:', err);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await db.pool.end();
  }
}

testPolicyEngine();
