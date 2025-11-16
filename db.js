require('dotenv').config();
const { Pool } = require('pg');

// Create connection pool
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('❌ Unexpected database error:', err);
});

// Helper function to run queries
async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 1000) {
      console.warn(`⚠️  Slow query (${duration}ms):`, text.substring(0, 50));
    }
    return res;
  } catch (err) {
    console.error('❌ Query error:', err.message);
    console.error('Query:', text);
    throw err;
  }
}

// Session methods
const sessions = {
  async create(userId = null) {
    const result = await query(
      'INSERT INTO sessions (user_id) VALUES ($1) RETURNING *',
      [userId]
    );
    return result.rows[0];
  },

  async getById(id) {
    const result = await query(
      'SELECT * FROM sessions WHERE id = $1',
      [id]
    );
    return result.rows[0];
  },

  async updateStatus(id, status) {
    const result = await query(
      'UPDATE sessions SET status = $1, updated_at = now() WHERE id = $2 RETURNING *',
      [status, id]
    );
    return result.rows[0];
  },

  async updateCost(id, costDelta) {
    const result = await query(
      'UPDATE sessions SET total_cost_cents = total_cost_cents + $1 WHERE id = $2 RETURNING *',
      [costDelta, id]
    );
    return result.rows[0];
  },

  async listByUser(userId, limit = 10) {
    const result = await query(
      'SELECT * FROM sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
      [userId, limit]
    );
    return result.rows;
  }
};

// Policy reservation methods
const reservations = {
  async create(sessionId, amountCents, provider, ttlMinutes = 15) {
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
    const result = await query(
      `INSERT INTO policy_reservations (session_id, amount_cents, provider, expires_at)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [sessionId, amountCents, provider, expiresAt]
    );
    return result.rows[0];
  },

  async commit(id) {
    const result = await query(
      'UPDATE policy_reservations SET committed = true WHERE id = $1 RETURNING *',
      [id]
    );
    return result.rows[0];
  },

  async release(id) {
    await query('DELETE FROM policy_reservations WHERE id = $1', [id]);
  },

  async cleanupExpired() {
    const result = await query('SELECT cleanup_expired_reservations()');
    return result.rows[0].cleanup_expired_reservations;
  },

  async getTotalReserved(sessionId = null, provider = null) {
    let sql = `
      SELECT COALESCE(SUM(amount_cents), 0) as total
      FROM policy_reservations
      WHERE expires_at > now() AND NOT committed
    `;
    const params = [];
    
    if (sessionId) {
      params.push(sessionId);
      sql += ` AND session_id = $${params.length}`;
    }
    
    if (provider) {
      params.push(provider);
      sql += ` AND provider = $${params.length}`;
    }

    const result = await query(sql, params);
    return parseInt(result.rows[0].total, 10);
  }
};

// Spend ledger methods
const ledger = {
  async create(sessionId, provider, amountCents, status = 'pending', metadata = {}) {
    const result = await query(
      `INSERT INTO spend_ledger (session_id, provider, amount_cents, status, metadata)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [sessionId, provider, amountCents, status, JSON.stringify(metadata)]
    );
    return result.rows[0];
  },

  async updateStatus(id, status, metadata = null) {
    const result = await query(
      `UPDATE spend_ledger 
       SET status = $1, metadata = COALESCE($2, metadata)
       WHERE id = $3 RETURNING *`,
      [status, metadata ? JSON.stringify(metadata) : null, id]
    );
    return result.rows[0];
  },

  async getDailyTotal(provider = null) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let sql = `
      SELECT COALESCE(SUM(amount_cents), 0) as total
      FROM spend_ledger
      WHERE created_at >= $1 AND status = 'committed'
    `;
    const params = [today];

    if (provider) {
      params.push(provider);
      sql += ` AND provider = $${params.length}`;
    }

    const result = await query(sql, params);
    return parseInt(result.rows[0].total, 10);
  },

  async getSessionTotal(sessionId) {
    const result = await query(
      `SELECT COALESCE(SUM(amount_cents), 0) as total
       FROM spend_ledger
       WHERE session_id = $1 AND status = 'committed'`,
      [sessionId]
    );
    return parseInt(result.rows[0].total, 10);
  },

  async listBySession(sessionId) {
    const result = await query(
      'SELECT * FROM spend_ledger WHERE session_id = $1 ORDER BY created_at DESC',
      [sessionId]
    );
    return result.rows;
  }
};

// Artifacts methods
const artifacts = {
  async create(sessionId, type, s3Key, metadata = {}) {
    const result = await query(
      `INSERT INTO artifacts (session_id, type, s3_key, metadata)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [sessionId, type, s3Key, JSON.stringify(metadata)]
    );
    return result.rows[0];
  },

  async getById(id) {
    const result = await query(
      'SELECT * FROM artifacts WHERE id = $1',
      [id]
    );
    return result.rows[0];
  },

  async listBySession(sessionId, type = null) {
    let sql = 'SELECT * FROM artifacts WHERE session_id = $1';
    const params = [sessionId];

    if (type) {
      params.push(type);
      sql += ` AND type = $${params.length}`;
    }

    sql += ' ORDER BY created_at DESC';

    const result = await query(sql, params);
    return result.rows;
  }
};

// Invoice methods
const invoices = {
  async upsert(stripeInvoiceId, customerId, amountCents, status, metadata = {}) {
    const result = await query(
      `INSERT INTO invoices (stripe_invoice_id, customer_id, amount_cents, status, metadata)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (stripe_invoice_id) 
       DO UPDATE SET status = $4, metadata = $5, created_at = invoices.created_at
       RETURNING *`,
      [stripeInvoiceId, customerId, amountCents, status, JSON.stringify(metadata)]
    );
    return result.rows[0];
  },

  async getByStripeId(stripeInvoiceId) {
    const result = await query(
      'SELECT * FROM invoices WHERE stripe_invoice_id = $1',
      [stripeInvoiceId]
    );
    return result.rows[0];
  },

  async listByCustomer(customerId, limit = 10) {
    const result = await query(
      'SELECT * FROM invoices WHERE customer_id = $1 ORDER BY created_at DESC LIMIT $2',
      [customerId, limit]
    );
    return result.rows;
  }
};

// Meter events methods
const meterEvents = {
  async create(meterId, eventName, value, sessionId = null, metadata = {}) {
    const result = await query(
      `INSERT INTO meter_events (stripe_meter_id, event_name, value, session_id, metadata)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [meterId, eventName, value, sessionId, JSON.stringify(metadata)]
    );
    return result.rows[0];
  },

  async listBySession(sessionId) {
    const result = await query(
      'SELECT * FROM meter_events WHERE session_id = $1 ORDER BY timestamp DESC',
      [sessionId]
    );
    return result.rows;
  }
};

// Webhook events methods (for idempotency)
const webhookEvents = {
  async isProcessed(stripeEventId) {
    const result = await query(
      'SELECT COUNT(*) as count FROM webhook_events WHERE stripe_event_id = $1',
      [stripeEventId]
    );
    return result.rows[0].count > 0;
  },

  async markProcessed(stripeEventId, eventType, metadata = {}) {
    const result = await query(
      `INSERT INTO webhook_events (stripe_event_id, event_type, metadata)
       VALUES ($1, $2, $3)
       ON CONFLICT (stripe_event_id) DO NOTHING
       RETURNING *`,
      [stripeEventId, eventType, JSON.stringify(metadata)]
    );
    return result.rows[0];
  }
};

// Transaction helper
async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  query,
  transaction,
  pool,
  sessions,
  reservations,
  ledger,
  artifacts,
  invoices,
  meterEvents,
  webhookEvents
};
