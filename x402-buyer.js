require('dotenv').config();
const { Coinbase, Wallet } = require('@coinbase/coinbase-sdk');
const axios = require('axios');
const policy = require('./policy');
const db = require('./db');

// Initialize Coinbase SDK
let coinbaseConfigured = false;
let buyerWallet = null;

async function initializeCDP() {
  if (coinbaseConfigured) return;

  try {
    Coinbase.configure({
      apiKeyName: process.env.CDP_API_KEY_ID,
      privateKey: process.env.CDP_API_KEY_SECRET
    });

    // Import existing wallet or create new one
    if (process.env.X402_BUYER_WALLET_ID) {
      // Import from wallet data file if exists
      const fs = require('fs');
      const walletFile = `buyer-wallet-${process.env.X402_BUYER_WALLET_ID}.json`;
      
      if (fs.existsSync(walletFile)) {
        const walletData = JSON.parse(fs.readFileSync(walletFile, 'utf8'));
        buyerWallet = await Wallet.import(walletData);
        console.log('✅ Imported existing CDP buyer wallet');
      }
    }

    if (!buyerWallet) {
      // Create new wallet
      buyerWallet = await Wallet.create({
        networkId: process.env.CDP_NETWORK || 'base-sepolia'
      });
      
      // Save wallet data
      const walletData = buyerWallet.export();
      const fs = require('fs');
      const walletFile = `buyer-wallet-${buyerWallet.getId()}.json`;
      fs.writeFileSync(walletFile, JSON.stringify(walletData, null, 2));
      
      console.log('✅ Created new CDP buyer wallet:', buyerWallet.getId());
      console.log('   Address:', await buyerWallet.getDefaultAddress());
    }

    coinbaseConfigured = true;
  } catch (err) {
    console.error('❌ Failed to initialize CDP:', err.message);
    throw err;
  }
}

/**
 * Execute x402 payment flow
 * 
 * @param {string} url - Enrichment endpoint URL
 * @param {string} sessionId - Session ID for tracking
 * @param {Object} params - Query parameters (e.g., { doi: '10.1234/xyz' })
 * @returns {Promise<{success: boolean, data?: any, cost?: number, txHash?: string, error?: string}>}
 */
async function executePaymentFlow(url, sessionId, params = {}) {
  await initializeCDP();

  const startTime = Date.now();
  let reservationId = null;
  let estimatedCostCents = 100; // Default estimate: $0.01 = 1¢

  try {
    console.log(`\n🔄 Starting x402 flow for session ${sessionId}`);
    console.log(`   URL: ${url}`);
    console.log(`   Params:`, params);

    // Step 1: Make unauthenticated request to get payment details
    console.log('\n1️⃣  Making unauthenticated request...');
    let response;
    
    try {
      response = await axios.get(url, {
        params,
        headers: {
          'x-client-id': 'litpay-buyer'
        },
        validateStatus: (status) => status === 402 || status === 200
      });
    } catch (err) {
      console.error('❌ Initial request failed:', err.message);
      throw new Error(`Endpoint unreachable: ${err.message}`);
    }

    // Step 2: Handle 402 Payment Required
    if (response.status === 402) {
      console.log('💳 Received 402 Payment Required');

      // Parse payment details from response
      const paymentDetails = response.data;
      console.log('   Payment details:', paymentDetails);

      if (!paymentDetails.price || !paymentDetails.payTo) {
        throw new Error('Invalid 402 response: missing price or payTo');
      }

      // Convert price to cents (assuming price is in ETH or similar)
      // For demo purposes, treating price as cents directly
      estimatedCostCents = Math.round(parseFloat(paymentDetails.price) * 100);

      if (estimatedCostCents > 500) {
        throw new Error(`Price ${estimatedCostCents}¢ exceeds per-call maximum of 500¢`);
      }

      // Step 3: Check policy budget
      console.log(`\n2️⃣  Checking policy: ${estimatedCostCents}¢`);
      const policyResult = await policy.canSpend(estimatedCostCents, {
        sessionId,
        provider: 'x402',
        tag: 'enrichment'
      });

      if (!policyResult.allow) {
        console.log(`❌ Policy denied: ${policyResult.reason}`);
        return {
          success: false,
          error: `Budget check failed: ${policyResult.reason}`,
          cost: 0
        };
      }

      reservationId = policyResult.reservationId;
      console.log(`✅ Policy approved (reservation: ${reservationId})`);
      console.log(`   Remaining budget: ${policyResult.remainingBudgetCents}¢`);

      // Step 4: Create and sign payment with CDP wallet
      console.log('\n3️⃣  Signing payment with CDP wallet...');
      
      const defaultAddress = await buyerWallet.getDefaultAddress();
      
      // Create transfer
      const transfer = await defaultAddress.invokeContract({
        contractAddress: paymentDetails.payTo,
        method: 'transfer',
        args: {
          amount: paymentDetails.price,
          assetId: paymentDetails.assetId || 'eth'
        }
      });

      // Wait for confirmation
      console.log('   Waiting for transaction confirmation...');
      await transfer.wait();

      const txHash = transfer.getTransactionHash();
      console.log(`✅ Payment confirmed: ${txHash}`);

      // Step 5: Retry request with payment proof
      console.log('\n4️⃣  Retrying with payment proof...');
      response = await axios.get(url, {
        params,
        headers: {
          'x-client-id': 'litpay-buyer',
          'X-PAYMENT': txHash,
          'X-PAYMENT-NETWORK': process.env.CDP_NETWORK || 'base-sepolia'
        }
      });

      if (response.status !== 200) {
        throw new Error(`Payment accepted but request failed: ${response.status}`);
      }

      // Step 6: Commit reservation
      console.log('\n5️⃣  Committing reservation...');
      await policy.commitReservation(reservationId, sessionId, {
        txHash,
        url,
        params,
        price: paymentDetails.price,
        payTo: paymentDetails.payTo,
        timestamp: new Date().toISOString()
      });

      const duration = Date.now() - startTime;
      console.log(`\n✅ x402 flow complete in ${duration}ms`);
      console.log(`   Cost: ${estimatedCostCents}¢`);
      console.log(`   TX: ${txHash}`);

      return {
        success: true,
        data: response.data,
        cost: estimatedCostCents,
        txHash,
        duration
      };

    } else if (response.status === 200) {
      // Step 2b: Request succeeded without payment (open access)
      console.log('✅ Received 200 OK (no payment required)');
      
      const duration = Date.now() - startTime;
      console.log(`\n✅ x402 flow complete in ${duration}ms (open access)`);

      return {
        success: true,
        data: response.data,
        cost: 0,
        duration
      };
    } else {
      throw new Error(`Unexpected status: ${response.status}`);
    }

  } catch (err) {
    console.error(`\n❌ x402 flow failed: ${err.message}`);

    // Release reservation if it was created
    if (reservationId) {
      console.log('🗑️  Releasing reservation due to error...');
      try {
        await policy.releaseReservation(reservationId, sessionId, {
          error: err.message,
          timestamp: new Date().toISOString()
        });
      } catch (releaseErr) {
        console.error('Failed to release reservation:', releaseErr.message);
      }
    }

    return {
      success: false,
      error: err.message,
      cost: 0
    };
  }
}

/**
 * Batch enrichment with multiple DOIs
 * 
 * @param {string} baseUrl - Base enrichment URL
 * @param {string[]} dois - Array of DOIs to enrich
 * @param {string} sessionId - Session ID
 * @returns {Promise<{results: Array, totalCost: number, successCount: number}>}
 */
async function batchEnrich(baseUrl, dois, sessionId) {
  console.log(`\n📦 Starting batch enrichment for ${dois.length} DOIs`);
  
  const results = [];
  let totalCost = 0;
  let successCount = 0;

  for (let i = 0; i < dois.length; i++) {
    const doi = dois[i];
    console.log(`\n[${i + 1}/${dois.length}] Processing DOI: ${doi}`);

    const result = await executePaymentFlow(baseUrl, sessionId, { doi });
    
    results.push({
      doi,
      success: result.success,
      data: result.data,
      cost: result.cost,
      txHash: result.txHash,
      error: result.error
    });

    if (result.success) {
      successCount++;
      totalCost += result.cost || 0;
    }

    // Small delay between requests
    if (i < dois.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  console.log(`\n📊 Batch enrichment complete:`);
  console.log(`   Success: ${successCount}/${dois.length}`);
  console.log(`   Total cost: ${totalCost}¢`);

  return {
    results,
    totalCost,
    successCount,
    failureCount: dois.length - successCount
  };
}

/**
 * Get buyer wallet info
 */
async function getWalletInfo() {
  await initializeCDP();
  
  const address = await buyerWallet.getDefaultAddress();
  const balance = await address.getBalance('eth');

  return {
    walletId: buyerWallet.getId(),
    address: address.getId(),
    network: buyerWallet.getNetworkId(),
    balance: balance.toString()
  };
}

module.exports = {
  executePaymentFlow,
  batchEnrich,
  getWalletInfo,
  initializeCDP
};
