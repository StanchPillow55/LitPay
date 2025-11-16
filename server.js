require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const db = require('./db');
const discovery = require('./discovery');
const policy = require('./policy');
const x402Buyer = require('./x402-buyer');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for frontend
app.use(cors({
  origin: function(origin, callback) {
    const allowedOrigins = [
      'http://localhost:3001',
      'http://localhost:3002',
      'http://127.0.0.1:3001',
      'http://127.0.0.1:3002'
    ];
    
    // Allow env override
    if (process.env.CORS_ORIGIN) {
      allowedOrigins.push(process.env.CORS_ORIGIN);
    }
    
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Stripe webhook endpoint needs raw body for signature verification
app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error(`⚠️  Webhook signature verification failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Check idempotency
  const alreadyProcessed = await db.webhookEvents.isProcessed(event.id);
  if (alreadyProcessed) {
    console.log(`ℹ️  Event ${event.id} already processed, skipping`);
    return res.json({ received: true, status: 'duplicate' });
  }

  // Handle the event
  console.log(`✅ Received event: ${event.type}`);

  try {
    switch (event.type) {
      case 'invoice.paid': {
        const invoice = event.data.object;
        console.log('📄 Invoice paid:', invoice.id);
        
        // Upsert invoice
        await db.invoices.upsert(
          invoice.id,
          invoice.customer,
          invoice.amount_paid,
          'paid',
          { stripeData: invoice }
        );
        break;
      }

      case 'charge.succeeded': {
        const charge = event.data.object;
        console.log('💳 Charge succeeded:', charge.id);
        
        // Store in ledger if linked to a session
        // (metadata should contain sessionId)
        if (charge.metadata && charge.metadata.sessionId) {
          await db.ledger.create(
            charge.metadata.sessionId,
            'stripe',
            charge.amount,
            'committed',
            { chargeId: charge.id, stripeData: charge }
          );
          
          // Update session cost
          await db.sessions.updateCost(charge.metadata.sessionId, charge.amount);
        }
        break;
      }

      case 'payment_link.created': {
        const paymentLink = event.data.object;
        console.log('🔗 Payment link created:', paymentLink.id);
        // Store for reference if needed
        break;
      }

      default:
        console.log(`ℹ️  Unhandled event type: ${event.type}`);
    }

    // Mark event as processed
    await db.webhookEvents.markProcessed(event.id, event.type, { processedAt: new Date() });

  } catch (err) {
    console.error(`❌ Error processing webhook:`, err);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }

  // Return a 200 response to acknowledge receipt of the event
  res.json({ received: true });
});

// Other routes need JSON parsing
app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'LitPay', version: '1.0.0' });
});

// Comprehensive health check
app.get('/health', async (req, res) => {
  try {
    // Check database connection
    await db.query('SELECT 1');
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'connected',
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (err) {
    res.status(503).json({
      status: 'unhealthy',
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Session routes
app.post('/api/session', async (req, res) => {
  try {
    const { userId } = req.body;
    const session = await db.sessions.create(userId);
    const budget = await policy.getBudgetStatus(session.id);
    
    res.json({
      id: session.id,
      userId: session.user_id,
      status: session.status,
      totalCostCents: session.total_cost_cents,
      createdAt: session.created_at,
      updatedAt: session.updated_at,
      budget
    });
  } catch (err) {
    console.error('Error creating session:', err);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

app.get('/api/session/:id', async (req, res) => {
  try {
    const session = await db.sessions.getById(req.params.id);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const budget = await policy.getBudgetStatus(session.id);

    res.json({
      id: session.id,
      userId: session.user_id,
      status: session.status,
      totalCostCents: session.total_cost_cents,
      createdAt: session.created_at,
      updatedAt: session.updated_at,
      budget
    });
  } catch (err) {
    console.error('Error fetching session:', err);
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

app.get('/api/session/:id/ledger', async (req, res) => {
  try {
    const ledger = await db.ledger.listBySession(req.params.id);
    res.json(ledger);
  } catch (err) {
    console.error('Error fetching ledger:', err);
    res.status(500).json({ error: 'Failed to fetch ledger' });
  }
});

app.get('/api/session/:id/artifacts', async (req, res) => {
  try {
    const artifacts = await db.artifacts.listBySession(req.params.id);
    res.json({ artifacts });
  } catch (err) {
    console.error('Error fetching artifacts:', err);
    res.status(500).json({ error: 'Failed to fetch artifacts' });
  }
});

// Policy check endpoint
app.post('/api/policy/can-spend', async (req, res) => {
  try {
    const { amountCents, sessionId, provider, tag } = req.body;
    
    if (!amountCents || !sessionId || !provider) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await policy.canSpend(amountCents, { sessionId, provider, tag });
    res.json(result);
  } catch (err) {
    console.error('Error checking policy:', err);
    res.status(500).json({ error: 'Policy check failed' });
  }
});

// Research workflow routes
app.post('/api/session/:id/search', async (req, res) => {
  try {
    const { query, maxResults, minScore } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query parameter required' });
    }

    const session = await db.sessions.getById(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Perform discovery
    const articles = await discovery.discover(query, {
      maxResults: maxResults || 20,
      minScore: minScore || 0.62
    });

    // Estimate costs
    const costEstimate = discovery.estimateCost(articles, 1); // 1¢ per article

    // Store search results as artifact
    await db.artifacts.create(session.id, 'upload', null, {
      query,
      articleCount: articles.length,
      timestamp: new Date().toISOString()
    });

    res.json({
      sessionId: session.id,
      query,
      articles,
      costEstimate
    });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Search failed', message: err.message });
  }
});

app.post('/api/session/:id/enrich', async (req, res) => {
  try {
    const { dois } = req.body;

    if (!dois || !Array.isArray(dois) || dois.length === 0) {
      return res.status(400).json({ error: 'dois array required' });
    }

    const session = await db.sessions.getById(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Use x402 buyer for batch enrichment
    const SELLER_URL = process.env.X402_SELLER_URL || 'http://localhost:3001/enrich/claims';
    
    const results = [];
    let totalCost = 0;
    let successCount = 0;

    for (const doi of dois) {
      // For demo/testing: use mock flow
      // For production: use x402Buyer.executePaymentFlow()
      
      const startTime = Date.now();
      let reservationId = null;

      try {
        // Check policy
        const policyResult = await policy.canSpend(1, {
          sessionId: session.id,
          provider: 'x402',
          tag: 'enrichment'
        });

        if (!policyResult.allow) {
          results.push({
            doi,
            success: false,
            error: `Budget check failed: ${policyResult.reason}`
          });
          continue;
        }

        reservationId = policyResult.reservationId;

        // For MVP: use mock enrichment response
        const mockTxHash = `0x${Date.now().toString(16)}${Math.random().toString(16).slice(2, 18)}`;
        
        // Simulate enrichment success with mock data
        const mockEnrichedData = {
          doi,
          title: `Research Paper ${doi}`,
          abstract: 'This is mock enriched data for demonstration purposes.',
          fullText: 'Mock full text content...',
          claims: ['claim-1', 'claim-2'],
          enrichedAt: new Date().toISOString()
        };

        // Commit reservation
        await policy.commitReservation(reservationId, session.id, {
          doi,
          txHash: mockTxHash,
          timestamp: new Date().toISOString()
        });

        results.push({
          doi,
          success: true,
          data: mockEnrichedData,
          cost: 1,
          txHash: mockTxHash,
          duration: Date.now() - startTime
        });

        successCount++;
        totalCost += 1;
      } catch (err) {
        // Release reservation on error
        if (reservationId) {
          await policy.releaseReservation(reservationId, session.id, {
            error: err.message
          });
        }

        results.push({
          doi,
          success: false,
          error: err.message
        });
      }

      // Small delay between requests
      if (dois.indexOf(doi) < dois.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    res.json({
      sessionId: session.id,
      results,
      totalCost,
      successCount,
      failureCount: dois.length - successCount
    });
  } catch (err) {
    console.error('Enrichment error:', err);
    res.status(500).json({ error: 'Enrichment failed', message: err.message });
  }
});

// File upload configuration
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadDir = './uploads';
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, uniqueSuffix + path.extname(file.originalname));
    }
  }),
  limits: {
    fileSize: 20 * 1024 * 1024 // 20MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.md'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and Markdown files are allowed'));
    }
  }
});

// File upload endpoint
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required' });
    }

    // Verify session exists
    const session = await db.sessions.getById(sessionId);
    if (!session) {
      // Clean up uploaded file
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'Session not found' });
    }

    // Read file content
    const fileContent = fs.readFileSync(req.file.path, 'utf-8');
    
    // Use Claude to extract research query from file
    let extractedQuery = 'research query';
    try {
      const anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });

      const message = await anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 200,
        temperature: 0.2,
        system: "You are a research assistant that extracts research queries from documents. Return ONLY the research query as a concise search phrase, no explanations.",
        messages: [
          {
            role: 'user',
            content: `Extract the main research query or topic from this document. Return only a concise search query (2-10 words) suitable for academic paper search:\n\n${fileContent.substring(0, 5000)}`
          }
        ]
      });

      extractedQuery = message.content[0].text.trim();
      console.log('📝 Extracted query from file:', extractedQuery);
    } catch (err) {
      console.error('Query extraction error:', err);
      // Continue with default query if extraction fails
    }

    // Store artifact with extracted query
    const artifact = await db.artifacts.create(sessionId, 'upload', req.file.path, {
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      uploadedAt: new Date().toISOString(),
      extractedQuery
    });

    res.json({
      id: artifact.id,
      sessionId,
      type: 'upload',
      path: req.file.path,
      originalName: req.file.originalname,
      size: req.file.size,
      extractedQuery
    });
  } catch (err) {
    console.error('Upload error:', err);
    // Clean up file if upload failed
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    res.status(500).json({ error: 'Upload failed', message: err.message });
  }
});

app.post('/api/session/:id/synthesize', async (req, res) => {
  try {
    const { prompt } = req.body;

    const session = await db.sessions.getById(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Get ledger entries to know what papers were enriched
    const ledger = await db.ledger.listBySession(session.id);
    const committedEntries = ledger.filter(e => e.status === 'committed');

    // Get artifacts to retrieve the query and enriched data
    const artifacts = await db.artifacts.listBySession(session.id);
    const searchArtifact = artifacts.find(a => a.metadata.query);
    const query = searchArtifact?.metadata?.query || 'research query';

    // Build enriched papers data from ledger
    const enrichedPapers = committedEntries.map(entry => ({
      doi: entry.metadata.doi || 'N/A',
      cost: entry.amount_cents,
      txHash: entry.metadata.txHash,
      provider: entry.provider
    }));

    // Initialize Claude client
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    // Build context for Claude
    const papersContext = enrichedPapers.map((p, i) => 
      `[${i + 1}] DOI: ${p.doi}, Cost: ${p.cost}¢, Provider: ${p.provider}, TX: ${p.txHash}`
    ).join('\n');

    const systemPrompt = "You are LitPay Research Assistant. You synthesize research findings into clear, structured reports. Cite sources using DOI numbers. Prefer open access when utility is equal. Mark unknowns clearly - never hallucinate DOIs or citations.";

    const userPrompt = `Generate a comprehensive research report based on the following information:

**Research Query:** ${query}

**Enriched Papers:**
${papersContext}

**Budget Information:**
- Session cap: $15.00
- Total spent: ${(session.total_cost_cents / 100).toFixed(2)}
- Papers processed: ${enrichedPapers.length}

${prompt ? `**User Instructions:** ${prompt}\n\n` : ''}Please generate a markdown report with the following sections:

1. **Background** - Context and motivation for this research
2. **Methodology** - How papers were discovered and selected
3. **Key Findings** - Main insights from the literature (cite DOIs)
4. **Research Gaps** - Identified gaps in current research
5. **Next Steps** - Recommended follow-up actions
6. **References** - List all DOIs with costs
7. **Decision Log** - Budget decisions and trade-offs made

Use proper markdown formatting with headers (##), lists, and emphasis where appropriate.`;

    // Call Claude API
    const message = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 2000,
      temperature: 0.3,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userPrompt
        }
      ]
    });

    // Extract markdown from Claude's response
    const markdown = message.content[0].text;

    const report = {
      id: `report-${session.id}`,
      sessionId: session.id,
      markdown,
      query,
      generatedAt: new Date().toISOString(),
      metadata: {
        totalCost: session.total_cost_cents,
        articlesProcessed: enrichedPapers.length,
        model: 'claude-3-haiku-20240307',
        tokensUsed: message.usage.input_tokens + message.usage.output_tokens
      }
    };

    // Store report as artifact
    await db.artifacts.create(session.id, 'report', null, {
      report,
      timestamp: new Date().toISOString()
    });

    // Update session status
    await db.sessions.updateStatus(session.id, 'completed');

    res.json(report);
  } catch (err) {
    console.error('Synthesis error:', err);
    res.status(500).json({ error: 'Synthesis failed', message: err.message });
  }
});

// Background job: cleanup expired reservations every 5 minutes
setInterval(async () => {
  try {
    await policy.cleanupExpiredReservations();
  } catch (err) {
    console.error('Error cleaning up reservations:', err);
  }
}, 5 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`🚀 LitPay server running on http://localhost:${PORT}`);
  console.log(`📡 Webhook endpoint: http://localhost:${PORT}/webhooks/stripe`);
  console.log(`📊 Budget limits:`);
  console.log(`   - Daily: ${policy.LIMITS.DAILY_BUDGET}¢`);
  console.log(`   - Session: ${policy.LIMITS.SESSION_CAP}¢`);
  console.log(`   - Per-call: ${policy.LIMITS.PER_CALL_MAX}¢`);
  console.log(`   - x402 daily: ${policy.LIMITS.X402_DAILY_CEILING}¢`);
});
