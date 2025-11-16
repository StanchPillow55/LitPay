require('dotenv').config();
const express = require('express');

const app = express();
const PORT = process.env.X402_SELLER_PORT || 3001;

// Mock enrichment data
const mockEnrichmentData = {
  '10.1234/test': {
    doi: '10.1234/test',
    title: 'A Test Article on AI Research',
    authors: ['Smith, J.', 'Johnson, A.'],
    citations: 42,
    abstract: 'This is a test abstract for demonstration purposes.',
    claims: [
      'AI models require large datasets for effective training',
      'Transfer learning reduces training time by 60%',
      'Attention mechanisms improve model interpretability'
    ],
    year: 2024,
    journal: 'Journal of AI Research'
  },
  '10.5678/demo': {
    doi: '10.5678/demo',
    title: 'Advanced Machine Learning Techniques',
    authors: ['Lee, K.', 'Chen, W.'],
    citations: 127,
    abstract: 'Exploring novel approaches to deep learning optimization.',
    claims: [
      'Novel optimizer converges 40% faster than Adam',
      'Adaptive learning rates prevent gradient explosion',
      'Batch normalization layers stabilize training'
    ],
    year: 2023,
    journal: 'ML Today'
  }
};

// Price per enrichment request (in cents)
const PRICE_CENTS = 1; // $0.01

// Mock payment tracking (in-memory for demo)
const processedPayments = new Set();

app.get('/enrich/claims', (req, res) => {
  const { doi } = req.query;
  const paymentHeader = req.headers['x-payment'];
  const clientId = req.headers['x-client-id'];

  console.log(`\n📥 Received request for DOI: ${doi}`);
  console.log(`   Client ID: ${clientId}`);
  console.log(`   Payment header: ${paymentHeader ? 'present' : 'missing'}`);

  // Validate DOI parameter
  if (!doi) {
    return res.status(400).json({
      error: 'Missing required parameter: doi'
    });
  }

  // Check if payment is provided
  if (!paymentHeader) {
    console.log('💳 No payment - returning 402');
    
    // Return 402 Payment Required with payment details
    return res.status(402).json({
      error: 'Payment Required',
      price: PRICE_CENTS / 100, // Convert to dollars for response
      priceCents: PRICE_CENTS,
      payTo: process.env.X402_SELLER_PAYTO || '0x9a040A890cdDaaB361e3515368a9f532a12fF8f4',
      assetId: 'eth',
      network: process.env.CDP_NETWORK || 'base-sepolia',
      message: 'Please include X-PAYMENT header with transaction hash'
    });
  }

  // Validate payment (simplified - just check if it's a valid-looking hash)
  if (!paymentHeader.startsWith('0x') || paymentHeader.length < 10) {
    console.log('❌ Invalid payment format');
    return res.status(400).json({
      error: 'Invalid payment format',
      message: 'X-PAYMENT must be a valid transaction hash'
    });
  }

  // Check if payment already used (prevent double-spend)
  if (processedPayments.has(paymentHeader)) {
    console.log('⚠️  Payment already used');
    return res.status(409).json({
      error: 'Payment already processed',
      message: 'This transaction has already been used'
    });
  }

  // Mark payment as processed
  processedPayments.add(paymentHeader);

  // Get enrichment data
  const enrichmentData = mockEnrichmentData[doi];

  if (!enrichmentData) {
    console.log(`❌ DOI not found: ${doi}`);
    return res.status(404).json({
      error: 'DOI not found',
      message: `No enrichment data available for ${doi}`,
      suggestion: `Try one of: ${Object.keys(mockEnrichmentData).join(', ')}`
    });
  }

  console.log(`✅ Payment accepted - returning enriched data`);
  console.log(`   TX Hash: ${paymentHeader}`);

  // Return enriched data with payment receipt
  res.status(200).json({
    success: true,
    doi,
    ...enrichmentData,
    payment: {
      txHash: paymentHeader,
      amount: PRICE_CENTS / 100,
      amountCents: PRICE_CENTS,
      network: process.env.CDP_NETWORK || 'base-sepolia',
      timestamp: new Date().toISOString()
    }
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'x402-seller-mock',
    price: `${PRICE_CENTS}¢`,
    availableDOIs: Object.keys(mockEnrichmentData)
  });
});

// Stats endpoint
app.get('/stats', (req, res) => {
  res.json({
    totalPaymentsProcessed: processedPayments.size,
    pricePerRequest: PRICE_CENTS,
    totalRevenueCents: processedPayments.size * PRICE_CENTS
  });
});

app.listen(PORT, () => {
  console.log(`\n🏪 x402 Seller Mock running on http://localhost:${PORT}`);
  console.log(`   Enrichment endpoint: http://localhost:${PORT}/enrich/claims`);
  console.log(`   Price: ${PRICE_CENTS}¢ ($${(PRICE_CENTS / 100).toFixed(2)}) per request`);
  console.log(`   Available DOIs: ${Object.keys(mockEnrichmentData).join(', ')}`);
  console.log(`   Payment address: ${process.env.X402_SELLER_PAYTO || '0x9a040...'}\n`);
});
