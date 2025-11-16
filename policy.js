require('dotenv').config();
const db = require('./db');

// Policy limits from environment variables (in cents)
const LIMITS = {
  DAILY_BUDGET: parseInt(process.env.POLICY_DAILY_BUDGET_CENTS || '5000', 10),
  SESSION_CAP: parseInt(process.env.POLICY_SESSION_CAP_CENTS || '1500', 10),
  PER_CALL_MAX: parseInt(process.env.POLICY_PER_CALL_MAX_CENTS || '500', 10),
  X402_DAILY_CEILING: parseInt(process.env.POLICY_PROVIDER_X402_DAILY_CEILING_CENTS || '3000', 10),
  RESERVATION_TTL_MINUTES: parseInt(process.env.RESERVATION_TTL_MINUTES || '15', 10)
};

/**
 * Check if a spend is allowed based on policy rules
 * 
 * @param {number} amountCents - Amount to spend in cents
 * @param {Object} context - Context for the spend
 * @param {string} context.sessionId - Session ID
 * @param {string} context.provider - Provider ('x402' or 'stripe')
 * @param {string} [context.tag] - Optional tag for categorization
 * @returns {Promise<{allow: boolean, remainingBudgetCents: number, reason?: string, reservationId?: string}>}
 */
async function canSpend(amountCents, context) {
  const { sessionId, provider, tag } = context;

  // Validate inputs
  if (!amountCents || amountCents <= 0) {
    return {
      allow: false,
      remainingBudgetCents: 0,
      reason: 'Amount must be greater than 0'
    };
  }

  if (!sessionId) {
    return {
      allow: false,
      remainingBudgetCents: 0,
      reason: 'Session ID required'
    };
  }

  if (!['x402', 'stripe'].includes(provider)) {
    return {
      allow: false,
      remainingBudgetCents: 0,
      reason: 'Provider must be x402 or stripe'
    };
  }

  try {
    // Use transaction with row-level lock for concurrency safety
    const result = await db.transaction(async (client) => {
      const lockStart = Date.now();
      // Acquire exclusive row lock on sentinel row to serialize policy checks
      // This creates a proper mutex that blocks all concurrent policy checks
      await client.query('SELECT 1 FROM policy_lock WHERE id = 1 FOR UPDATE');
      const lockWait = Date.now() - lockStart;
      if (lockWait > 100) {
        console.log(`⚠️  Lock contention: ${lockWait}ms wait for policy check`);
      }
      
      // 1. Check per-call maximum (fast path - no DB queries needed)
      if (amountCents > LIMITS.PER_CALL_MAX) {
        return {
          allow: false,
          remainingBudgetCents: LIMITS.PER_CALL_MAX,
          reason: `Per-call maximum is ${LIMITS.PER_CALL_MAX}¢ ($${(LIMITS.PER_CALL_MAX / 100).toFixed(2)})`
        };
      }
      
      // 2. Create reservation FIRST so it's visible to concurrent transactions
      // This ensures the budget check includes this pending reservation
      // Use PostgreSQL's now() + interval to avoid clock skew issues
      const reservationResult = await client.query(
        `INSERT INTO policy_reservations (session_id, amount_cents, provider, expires_at)
         VALUES ($1, $2, $3, now() + interval '${LIMITS.RESERVATION_TTL_MINUTES} minutes') 
         RETURNING *, expires_at > now() as is_valid`,
        [sessionId, amountCents, provider]
      );
      const reservation = reservationResult.rows[0];

      // 3. Get daily totals (committed + reserved) - now includes this reservation
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const dailyResult = await client.query(
        `SELECT COALESCE(SUM(amount_cents), 0) as total
         FROM spend_ledger
         WHERE created_at >= $1 AND status = 'committed'`,
        [today]
      );
      const dailyCommitted = parseInt(dailyResult.rows[0].total, 10);
      
      const dailyReservedResult = await client.query(
        `SELECT COALESCE(SUM(amount_cents), 0) as total
         FROM policy_reservations
         WHERE expires_at > now() AND NOT committed`
      );
      const dailyReserved = parseInt(dailyReservedResult.rows[0].total, 10);
      const dailyTotal = dailyCommitted + dailyReserved;

      // Daily total already includes the reservation we just created, so don't add amountCents again
      if (dailyTotal > LIMITS.DAILY_BUDGET) {
        // Delete the reservation since we're rejecting
        await client.query('DELETE FROM policy_reservations WHERE id = $1', [reservation.id]);
        const remaining = Math.max(0, LIMITS.DAILY_BUDGET - (dailyTotal - amountCents));
        return {
          allow: false,
          remainingBudgetCents: remaining,
          reason: `Daily budget of ${LIMITS.DAILY_BUDGET}¢ exceeded. Spent: ${dailyTotal - amountCents}¢`
        };
      }

      // 4. Get session totals (committed + reserved)
      const sessionCommittedResult = await client.query(
        `SELECT COALESCE(SUM(amount_cents), 0) as total
         FROM spend_ledger
         WHERE session_id = $1 AND status = 'committed'`,
        [sessionId]
      );
      const sessionCommitted = parseInt(sessionCommittedResult.rows[0].total, 10);
      
      const sessionReservedResult = await client.query(
        `SELECT COALESCE(SUM(amount_cents), 0) as total
         FROM policy_reservations
         WHERE expires_at > now() AND NOT committed AND session_id = $1`,
        [sessionId]
      );
      const sessionReserved = parseInt(sessionReservedResult.rows[0].total, 10);
      const sessionTotal = sessionCommitted + sessionReserved;
      

      // Session total already includes the reservation we just created
      if (sessionTotal > LIMITS.SESSION_CAP) {
        // Delete the reservation since we're rejecting
        await client.query('DELETE FROM policy_reservations WHERE id = $1', [reservation.id]);
        const remaining = Math.max(0, LIMITS.SESSION_CAP - (sessionTotal - amountCents));
        return {
          allow: false,
          remainingBudgetCents: remaining,
          reason: `Session cap of ${LIMITS.SESSION_CAP}¢ exceeded. Spent: ${sessionTotal - amountCents}¢`
        };
      }

      // 5. Check x402-specific daily ceiling
      if (provider === 'x402') {
        const x402CommittedResult = await client.query(
          `SELECT COALESCE(SUM(amount_cents), 0) as total
           FROM spend_ledger
           WHERE created_at >= $1 AND status = 'committed' AND provider = 'x402'`,
          [today]
        );
        const x402DailyCommitted = parseInt(x402CommittedResult.rows[0].total, 10);
        
        const x402ReservedResult = await client.query(
          `SELECT COALESCE(SUM(amount_cents), 0) as total
           FROM policy_reservations
           WHERE expires_at > now() AND NOT committed AND provider = 'x402'`
        );
        const x402DailyReserved = parseInt(x402ReservedResult.rows[0].total, 10);
        const x402DailyTotal = x402DailyCommitted + x402DailyReserved;

        // x402 total already includes the reservation we just created
        if (x402DailyTotal > LIMITS.X402_DAILY_CEILING) {
          // Delete the reservation since we're rejecting
          await client.query('DELETE FROM policy_reservations WHERE id = $1', [reservation.id]);
          const remaining = Math.max(0, LIMITS.X402_DAILY_CEILING - (x402DailyTotal - amountCents));
          return {
            allow: false,
            remainingBudgetCents: remaining,
            reason: `x402 daily ceiling of ${LIMITS.X402_DAILY_CEILING}¢ exceeded. Spent: ${x402DailyTotal - amountCents}¢`
          };
        }
      }

      // 6. All checks passed - reservation already created above

      // Calculate remaining budget (most restrictive limit)
      // Note: totals already include the reservation we just created
      const remainingDaily = LIMITS.DAILY_BUDGET - dailyTotal;
      const remainingSession = LIMITS.SESSION_CAP - sessionTotal;
      let remainingBudget = Math.min(remainingDaily, remainingSession);

      if (provider === 'x402') {
        // We already computed x402DailyTotal above, reuse those values
        const x402CommittedResult = await client.query(
          `SELECT COALESCE(SUM(amount_cents), 0) as total
           FROM spend_ledger
           WHERE created_at >= $1 AND status = 'committed' AND provider = 'x402'`,
          [today]
        );
        const x402DailyCommitted = parseInt(x402CommittedResult.rows[0].total, 10);
        
        const x402ReservedResult = await client.query(
          `SELECT COALESCE(SUM(amount_cents), 0) as total
           FROM policy_reservations
           WHERE expires_at > now() AND NOT committed AND provider = 'x402'`
        );
        const x402DailyReserved = parseInt(x402ReservedResult.rows[0].total, 10);
        const x402DailyTotal = x402DailyCommitted + x402DailyReserved;
        
        const remainingX402 = LIMITS.X402_DAILY_CEILING - x402DailyTotal;
        remainingBudget = Math.min(remainingBudget, remainingX402);
      }

      return {
        allow: true,
        remainingBudgetCents: Math.max(0, remainingBudget),
        reservationId: reservation.id
      };
    });
    
    return result;
    
  } catch (err) {
    console.error('❌ Policy check error:', err.message);
    return {
      allow: false,
      remainingBudgetCents: 0,
      reason: 'Internal policy check error'
    };
  }
}

/**
 * Commit a reservation after successful spend
 * 
 * @param {string} reservationId - Reservation ID from canSpend
 * @param {string} sessionId - Session ID
 * @param {Object} metadata - Optional metadata (tx hash, receipt, etc)
 * @returns {Promise<void>}
 */
async function commitReservation(reservationId, sessionId, metadata = {}) {
  try {
    await db.transaction(async (client) => {
      // Mark reservation as committed
      const reservation = await db.reservations.commit(reservationId);

      if (!reservation) {
        throw new Error('Reservation not found');
      }

      // Create committed ledger entry
      await db.ledger.create(
        sessionId,
        reservation.provider,
        reservation.amount_cents,
        'committed',
        metadata
      );

      // Update session total cost
      await db.sessions.updateCost(sessionId, reservation.amount_cents);
    });

    console.log(`✅ Committed reservation ${reservationId}`);
  } catch (err) {
    console.error('❌ Failed to commit reservation:', err);
    throw err;
  }
}

/**
 * Release a reservation (e.g., on payment failure)
 * 
 * @param {string} reservationId - Reservation ID from canSpend
 * @param {string} sessionId - Session ID
 * @param {Object} metadata - Optional metadata about the failure
 * @returns {Promise<void>}
 */
async function releaseReservation(reservationId, sessionId, metadata = {}) {
  try {
    const reservation = await db.reservations.getById(reservationId);
    
    if (reservation) {
      // Log failed spend attempt
      await db.ledger.create(
        sessionId,
        reservation.provider,
        reservation.amount_cents,
        'failed',
        metadata
      );

      // Delete reservation
      await db.reservations.release(reservationId);
      
      console.log(`🗑️  Released reservation ${reservationId}`);
    }
  } catch (err) {
    console.error('❌ Failed to release reservation:', err);
    throw err;
  }
}

/**
 * Get current budget status for a session
 * 
 * @param {string} sessionId - Session ID
 * @returns {Promise<Object>} Budget status
 */
async function getBudgetStatus(sessionId) {
  try {
    // Daily totals
    const dailyCommitted = await db.ledger.getDailyTotal();
    const dailyReserved = await db.reservations.getTotalReserved();
    const dailySpent = dailyCommitted + dailyReserved;

    // Session totals
    const sessionCommitted = await db.ledger.getSessionTotal(sessionId);
    const sessionReserved = await db.reservations.getTotalReserved(sessionId);
    const sessionSpent = sessionCommitted + sessionReserved;

    // x402 daily total
    const x402DailyCommitted = await db.ledger.getDailyTotal('x402');
    const x402DailyReserved = await db.reservations.getTotalReserved(null, 'x402');
    const x402DailySpent = x402DailyCommitted + x402DailyReserved;

    return {
      daily: {
        limit: LIMITS.DAILY_BUDGET,
        spent: dailySpent,
        remaining: Math.max(0, LIMITS.DAILY_BUDGET - dailySpent)
      },
      session: {
        limit: LIMITS.SESSION_CAP,
        spent: sessionSpent,
        remaining: Math.max(0, LIMITS.SESSION_CAP - sessionSpent)
      },
      x402Daily: {
        limit: LIMITS.X402_DAILY_CEILING,
        spent: x402DailySpent,
        remaining: Math.max(0, LIMITS.X402_DAILY_CEILING - x402DailySpent)
      },
      perCallMax: LIMITS.PER_CALL_MAX
    };
  } catch (err) {
    console.error('❌ Failed to get budget status:', err);
    throw err;
  }
}

/**
 * Cleanup expired reservations (called periodically)
 * 
 * @returns {Promise<number>} Number of reservations cleaned up
 */
async function cleanupExpiredReservations() {
  try {
    const count = await db.reservations.cleanupExpired();
    if (count > 0) {
      console.log(`🧹 Cleaned up ${count} expired reservations`);
    }
    return count;
  } catch (err) {
    console.error('❌ Failed to cleanup reservations:', err);
    return 0;
  }
}

// Add missing getById function to reservations
db.reservations.getById = async function(id) {
  const result = await db.query(
    'SELECT * FROM policy_reservations WHERE id = $1',
    [id]
  );
  return result.rows[0];
};

module.exports = {
  LIMITS,
  canSpend,
  commitReservation,
  releaseReservation,
  getBudgetStatus,
  cleanupExpiredReservations
};
