-- server/schema.sql
CREATE TABLE IF NOT EXISTS consultation_requests (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name         TEXT NOT NULL,
  email             TEXT NOT NULL,
  phone             TEXT,
  property_address  TEXT NOT NULL,
  borough           TEXT,                          -- one of the <select> values, or NULL
  message           TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'new',    -- 'new' | 'contacted' | 'closed'
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  source_ip         TEXT,
  user_agent        TEXT
);

CREATE INDEX IF NOT EXISTS idx_consultation_requests_created_at
  ON consultation_requests (created_at);
