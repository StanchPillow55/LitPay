#!/usr/bin/env node

const db = require('./db');

async function reset() {
  console.log('🔄 Resetting database...');
  
  try {
    await db.query('DELETE FROM policy_reservations');
    await db.query('DELETE FROM spend_ledger');
    await db.query('DELETE FROM sessions');
    await db.query('DELETE FROM artifacts');
    await db.query('DELETE FROM invoices');
    await db.query('DELETE FROM meter_events');
    await db.query('DELETE FROM webhook_events');
    
    console.log('✅ Database reset complete');
    process.exit(0);
  } catch (err) {
    console.error('❌ Reset failed:', err.message);
    process.exit(1);
  }
}

reset();
