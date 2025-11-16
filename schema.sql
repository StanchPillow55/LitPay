-- LitPay Database Schema
-- Version: 1.0
-- Date: 2025-11-15

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  status TEXT CHECK (status IN ('active','completed','failed')) DEFAULT 'active',
  total_cost_cents INT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);

-- Policy reservations (15min TTL)
CREATE TABLE IF NOT EXISTS policy_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  amount_cents INT NOT NULL,
  provider TEXT CHECK (provider IN ('x402','stripe')) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  committed BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reservations_expires ON policy_reservations(expires_at) WHERE NOT committed;
CREATE INDEX IF NOT EXISTS idx_reservations_session ON policy_reservations(session_id);
CREATE INDEX IF NOT EXISTS idx_reservations_committed ON policy_reservations(committed);

-- Spend ledger (7 year retention for compliance)
CREATE TABLE IF NOT EXISTS spend_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  provider TEXT CHECK (provider IN ('x402','stripe')) NOT NULL,
  amount_cents INT NOT NULL,
  status TEXT CHECK (status IN ('pending','committed','failed')) DEFAULT 'pending',
  metadata JSONB,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ledger_session ON spend_ledger(session_id);
CREATE INDEX IF NOT EXISTS idx_ledger_provider_date ON spend_ledger(provider, created_at);
CREATE INDEX IF NOT EXISTS idx_ledger_created ON spend_ledger(created_at);
CREATE INDEX IF NOT EXISTS idx_ledger_status ON spend_ledger(status);

-- Artifacts (uploads, reports, receipts)
CREATE TABLE IF NOT EXISTS artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  type TEXT CHECK (type IN ('upload','report','receipt')) NOT NULL,
  s3_key TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_artifacts_session ON artifacts(session_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_type ON artifacts(type);

-- Stripe invoices
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_invoice_id TEXT UNIQUE NOT NULL,
  customer_id TEXT NOT NULL,
  amount_cents INT NOT NULL,
  status TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_stripe_id ON invoices(stripe_invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);

-- Stripe meter events
CREATE TABLE IF NOT EXISTS meter_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_meter_id TEXT NOT NULL,
  event_name TEXT NOT NULL,
  value INT NOT NULL,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  metadata JSONB,
  timestamp TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meter_session ON meter_events(session_id);
CREATE INDEX IF NOT EXISTS idx_meter_timestamp ON meter_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_meter_event_name ON meter_events(event_name);

-- Webhook events log (for idempotency)
CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMP DEFAULT now(),
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_stripe_id ON webhook_events(stripe_event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_type ON webhook_events(event_type);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to auto-update updated_at on sessions
DROP TRIGGER IF EXISTS update_sessions_updated_at ON sessions;
CREATE TRIGGER update_sessions_updated_at
  BEFORE UPDATE ON sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to clean up expired reservations
CREATE OR REPLACE FUNCTION cleanup_expired_reservations()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM policy_reservations
  WHERE expires_at < now() AND NOT committed;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Comments for documentation
COMMENT ON TABLE sessions IS 'Research sessions with status and cost tracking';
COMMENT ON TABLE policy_reservations IS 'Pre-reservations for budget enforcement (15min TTL)';
COMMENT ON TABLE spend_ledger IS 'Financial transaction log (7 year retention)';
COMMENT ON TABLE artifacts IS 'S3 references for uploads, reports, and receipts';
COMMENT ON TABLE invoices IS 'Stripe invoice records';
COMMENT ON TABLE meter_events IS 'Stripe usage metering events';
COMMENT ON TABLE webhook_events IS 'Webhook idempotency tracking';
