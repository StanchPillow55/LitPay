-- Create policy lock table for concurrency control
CREATE TABLE IF NOT EXISTS policy_lock (
  id INTEGER PRIMARY KEY DEFAULT 1,
  CHECK (id = 1) -- Only allow one row
);

-- Insert the sentinel row
INSERT INTO policy_lock (id) VALUES (1) ON CONFLICT DO NOTHING;
