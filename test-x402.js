require('dotenv').config();
const axios = require('axios');
const db = require('./db');
const policy = require('./policy');

const SELLER_URL = 'http://localhost:3001/enrich/claims';

/**
 * Simplified x402 flow for testing (without actual CDP wallet transactions)
 */
async function testX402Flow() {
  console.log('🧪 Testing x402 Payment Flow\n');
  console.log('='.repeat(60));

  try {
    // Step 1: Create test session
    console.log('\n1️⃣  Creating test session...');
    const session = await db.sessions.create('x402-test-user');
    console.log(`✅ Session created: ${session.id}`);

    // Step 2: Test unauthenticated request (should get 402)
    console.log('\n2️⃣  Testing unauthenticated request...');
    const doi = '10.1234/test';
    
    let response;
    try {
      response = await axios.get(SELLER_URL, {
        params: { doi },
        headers: { 'x-client-id': 'litpay-buyer' },
        validateStatus: (status) => status === 402 || status === 200
      });
    } catch (err) {
      console.error(`❌ Seller not reachable: ${err.message}`);
      console.error('   Make sure to start the seller: node x402-seller-mock.js');
      process.exit(1);
    }

    if (response.status !== 402) {
      console.error(`❌ Expected 402, got ${response.status}`);
      process.exit(1);
    }

    console.log('✅ Received 402 Payment Required');
    console.log('   Payment details:', response.data);

    const paymentDetails = response.data;
    const priceCents = paymentDetails.priceCents;

    // Step 3: Check policy
    console.log(`\n3️⃣  Checking policy for ${priceCents}¢...`);
    const policyResult = await policy.canSpend(priceCents, {
      sessionId: session.id,
      provider: 'x402',
      tag: 'enrichment'
    });

    if (!policyResult.allow) {
      console.error(`❌ Policy denied: ${policyResult.reason}`);
      process.exit(1);
    }

    console.log(`✅ Policy approved (reservation: ${policyResult.reservationId})`);
    console.log(`   Remaining budget: ${policyResult.remainingBudgetCents}¢`);

    // Step 4: Simulate payment (mock transaction hash for testing)
    console.log('\n4️⃣  Simulating payment...');
    const mockTxHash = `0x${Date.now().toString(16)}${Math.random().toString(16).slice(2, 18)}`;
    console.log(`✅ Mock transaction: ${mockTxHash}`);

    // Step 5: Retry with payment
    console.log('\n5️⃣  Retrying with payment proof...');
    response = await axios.get(SELLER_URL, {
      params: { doi },
      headers: {
        'x-client-id': 'litpay-buyer',
        'X-PAYMENT': mockTxHash
      }
    });

    if (response.status !== 200) {
      console.error(`❌ Expected 200, got ${response.status}`);
      process.exit(1);
    }

    console.log('✅ Received enriched data:');
    console.log(`   Title: ${response.data.title}`);
    console.log(`   Authors: ${response.data.authors.join(', ')}`);
    console.log(`   Claims: ${response.data.claims.length}`);

    // Step 6: Commit reservation
    console.log('\n6️⃣  Committing reservation...');
    await policy.commitReservation(policyResult.reservationId, session.id, {
      txHash: mockTxHash,
      doi,
      price: priceCents,
      payTo: paymentDetails.payTo,
      timestamp: new Date().toISOString()
    });
    console.log('✅ Reservation committed');

    // Step 7: Verify ledger entry
    console.log('\n7️⃣  Verifying ledger entry...');
    const ledgerEntries = await db.ledger.listBySession(session.id);
    console.log(`✅ Ledger entries: ${ledgerEntries.length}`);
    
    const committedEntry = ledgerEntries.find(e => e.status === 'committed');
    if (committedEntry) {
      console.log(`   Amount: ${committedEntry.amount_cents}¢`);
      console.log(`   Provider: ${committedEntry.provider}`);
      const metadata = typeof committedEntry.metadata === 'string' 
        ? JSON.parse(committedEntry.metadata) 
        : committedEntry.metadata;
      console.log(`   TX Hash: ${metadata.txHash}`);
    }

    // Step 8: Check updated budget
    console.log('\n8️⃣  Checking updated budget...');
    const budgetStatus = await policy.getBudgetStatus(session.id);
    console.log(`   Session spent: ${budgetStatus.session.spent}¢`);
    console.log(`   x402 daily spent: ${budgetStatus.x402Daily.spent}¢`);

    console.log('\n' + '='.repeat(60));
    console.log('\n✅ x402 flow test complete!\n');

    // Test 2: Budget denial
    console.log('\n🧪 Test 2: Budget Denial\n');
    console.log('='.repeat(60));
    
    console.log('\n1️⃣  Attempting spend that exceeds per-call max...');
    const largeAmountResult = await policy.canSpend(600, {
      sessionId: session.id,
      provider: 'x402'
    });

    if (largeAmountResult.allow) {
      console.error('❌ Should have been denied');
      process.exit(1);
    }

    console.log(`✅ Correctly denied: ${largeAmountResult.reason}`);

    // Test 3: Payment already used
    console.log('\n🧪 Test 3: Double-Spend Prevention\n');
    console.log('='.repeat(60));
    
    console.log('\n1️⃣  Attempting to reuse same transaction hash...');
    try {
      response = await axios.get(SELLER_URL, {
        params: { doi },
        headers: {
          'x-client-id': 'litpay-buyer',
          'X-PAYMENT': mockTxHash  // Reusing same hash
        },
        validateStatus: (status) => status === 409 || status === 200
      });

      if (response.status === 409) {
        console.log('✅ Correctly rejected duplicate payment');
        console.log(`   Error: ${response.data.error}`);
      } else {
        console.error('❌ Should have rejected duplicate payment');
      }
    } catch (err) {
      console.error('Error testing double-spend:', err.message);
    }

    console.log('\n' + '='.repeat(60));
    console.log('\n✅ All x402 tests passed!\n');

  } catch (err) {
    console.error('\n❌ Test failed:', err);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await db.pool.end();
  }
}

testX402Flow();
