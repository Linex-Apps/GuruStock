-- GuruStock Database Schema

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    budget DECIMAL(12, 2) DEFAULT 0,
    tier VARCHAR(10) DEFAULT 'free' CHECK (tier IN ('free', 'pro')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gurus (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS trades (
    id SERIAL PRIMARY KEY,
    guru_id INTEGER NOT NULL REFERENCES gurus(id) ON DELETE CASCADE,
    ticker VARCHAR(10) NOT NULL,
    company_name VARCHAR(255) NOT NULL,
    action VARCHAR(4) NOT NULL CHECK (action IN ('buy', 'sell')),
    shares BIGINT,
    price_estimate DECIMAL(12, 2),
    filing_date DATE,
    source_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_alerts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    trade_id INTEGER NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
    seen_at TIMESTAMP WITH TIME ZONE,
    acted_at TIMESTAMP WITH TIME ZONE
);

-- Add confidence column for trade data quality tracking
ALTER TABLE trades ADD COLUMN IF NOT EXISTS confidence VARCHAR(20) DEFAULT 'estimated';

-- Unique constraint for deduplication
ALTER TABLE trades ADD CONSTRAINT trades_guru_ticker_filing_unique UNIQUE (guru_id, ticker, filing_date);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_trades_guru_id ON trades(guru_id);
CREATE INDEX IF NOT EXISTS idx_trades_filing_date ON trades(filing_date DESC);
CREATE INDEX IF NOT EXISTS idx_trades_ticker ON trades(ticker);
CREATE INDEX IF NOT EXISTS idx_user_alerts_user_id ON user_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_user_alerts_trade_id ON user_alerts(trade_id);
