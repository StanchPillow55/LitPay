require('dotenv').config();
const db = require('./db');

async function seed() {
  console.log('🌱 Seeding database...\n');

  try {
    // Create demo session
    console.log('1️⃣  Creating demo session...');
    const session = await db.sessions.create('demo-user');
    console.log(`✅ Session: ${session.id}`);

    // Create demo artifacts
    console.log('\n2️⃣  Creating demo artifacts...');
    
    const searchArtifact = await db.artifacts.create(
      session.id,
      'upload',
      null,
      {
        query: 'machine learning transformers',
        articleCount: 5,
        timestamp: new Date().toISOString()
      }
    );
    console.log(`✅ Search artifact: ${searchArtifact.id}`);

    const reportArtifact = await db.artifacts.create(
      session.id,
      'report',
      null,
      {
        title: 'Demo Research Report',
        sections: ['Background', 'Methods', 'Findings'],
        timestamp: new Date().toISOString()
      }
    );
    console.log(`✅ Report artifact: ${reportArtifact.id}`);

    // Create demo papers (as ledger entries with metadata)
    console.log('\n3️⃣  Creating demo paper entries...');
    
    const demoPapers = [
      {
        doi: '10.1234/demo1',
        title: 'Attention Is All You Need',
        authors: ['Vaswani, A.', 'Shazeer, N.'],
        citations: 85000,
        year: 2017
      },
      {
        doi: '10.1234/demo2',
        title: 'BERT: Pre-training of Deep Bidirectional Transformers',
        authors: ['Devlin, J.', 'Chang, M.'],
        citations: 45000,
        year: 2018
      },
      {
        doi: '10.1234/demo3',
        title: 'GPT-3: Language Models are Few-Shot Learners',
        authors: ['Brown, T.', 'Mann, B.'],
        citations: 12000,
        year: 2020
      },
      {
        doi: '10.1234/demo4',
        title: 'An Image is Worth 16x16 Words: Transformers for Image Recognition',
        authors: ['Dosovitskiy, A.'],
        citations: 8000,
        year: 2020
      },
      {
        doi: '10.1234/demo5',
        title: 'Training language models to follow instructions with human feedback',
        authors: ['Ouyang, L.', 'Wu, J.'],
        citations: 3000,
        year: 2022
      }
    ];

    for (const paper of demoPapers) {
      await db.ledger.create(
        session.id,
        'x402',
        1, // 1 cent per paper
        'committed',
        {
          ...paper,
          txHash: `0xdemo${Math.random().toString(16).slice(2, 10)}`,
          timestamp: new Date().toISOString()
        }
      );
      console.log(`✅ Paper: ${paper.title.substring(0, 50)}...`);
    }

    // Update session cost
    console.log('\n4️⃣  Updating session totals...');
    await db.sessions.updateCost(session.id, demoPapers.length);
    await db.sessions.updateStatus(session.id, 'completed');
    console.log(`✅ Session total: ${demoPapers.length}¢`);

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('\n✅ Database seeded successfully!\n');
    console.log('Demo data created:');
    console.log(`  - Sessions: 1`);
    console.log(`  - Artifacts: 2`);
    console.log(`  - Papers: ${demoPapers.length}`);
    console.log(`  - Total cost: ${demoPapers.length}¢`);
    console.log(`\nSession ID: ${session.id}`);
    console.log(`View at: http://localhost:3000/api/session/${session.id}\n`);

  } catch (err) {
    console.error('\n❌ Seed failed:', err);
    process.exit(1);
  } finally {
    await db.pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  seed();
}

module.exports = { seed };
