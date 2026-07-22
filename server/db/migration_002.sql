-- Migration 002: User Holdings for Portfolio Mirroring

CREATE TABLE IF NOT EXISTS user_holdings (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ticker VARCHAR(10) NOT NULL,
    shares DECIMAL(12, 4) NOT NULL DEFAULT 0,
    avg_cost DECIMAL(12, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, ticker)
);

CREATE INDEX IF NOT EXISTS idx_user_holdings_user_id ON user_holdings(user_id);
