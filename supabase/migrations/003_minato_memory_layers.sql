-- =============================================================================
-- Migration 003: Minato Multi-Layer Memory System
-- Separate tables for Working, Semantic, and Episodic memory + Retrieval Logs
-- Live trade data is NEVER stored here; it is always read directly from the
-- journal/trades DB via deterministic tools.
-- =============================================================================

-- 1. WORKING MEMORY (current conversation threads, summarized when long)
CREATE TABLE IF NOT EXISTS minato_working_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    session_date TEXT NOT NULL, -- YYYY-MM-DD
    summary TEXT DEFAULT '',
    messages JSONB NOT NULL DEFAULT '[]'::jsonb,
    pending_question JSONB DEFAULT NULL, -- tracks missing input prompts (e.g. stop size / risk %)
    token_estimate INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, session_date)
);

-- 2. SEMANTIC MEMORY (durable user facts: risk per trade, daily loss/drawdown limit,
--    profit target, instruments traded, account type, strategy rules, session times,
--    goals, psychology notes — with superseding history)
CREATE TABLE IF NOT EXISTS minato_semantic_memory (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    fact_key TEXT NOT NULL, -- canonical slot e.g. 'risk_per_trade', 'stop_points', 'instruments', 'account_type'
    category TEXT NOT NULL CHECK (category IN (
        'risk_per_trade',
        'daily_loss_limit',
        'drawdown_limit',
        'profit_target',
        'instruments_traded',
        'account_type',
        'strategy_rules',
        'session_times',
        'goals',
        'psychology_notes',
        'general_fact'
    )),
    content TEXT NOT NULL,
    structured_value JSONB DEFAULT '{}'::jsonb,
    entities TEXT[] DEFAULT '{}',
    confidence DOUBLE PRECISION NOT NULL DEFAULT 0.9,
    importance DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    pinned BOOLEAN NOT NULL DEFAULT false,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'deleted')),
    superseded_by TEXT DEFAULT NULL,
    source_message_id TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. EPISODIC MEMORY (per-session / per-day summaries: what happened, lessons,
--    mistakes, emotions — linked to trade/journal IDs, with importance & decay)
CREATE TABLE IF NOT EXISTS minato_episodic_memory (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    episode_date TEXT NOT NULL, -- YYYY-MM-DD
    summary TEXT NOT NULL,
    lessons TEXT[] DEFAULT '{}',
    mistakes TEXT[] DEFAULT '{}',
    emotions TEXT[] DEFAULT '{}',
    trade_ids TEXT[] DEFAULT '{}',
    entities TEXT[] DEFAULT '{}',
    confidence DOUBLE PRECISION NOT NULL DEFAULT 0.9,
    importance DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    decay_rate DOUBLE PRECISION NOT NULL DEFAULT 0.02,
    pinned BOOLEAN NOT NULL DEFAULT false,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'decayed', 'superseded', 'deleted')),
    source_message_id TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. RETRIEVAL LOGS (transparency & debug mode: what was retrieved per answer)
CREATE TABLE IF NOT EXISTS minato_retrieval_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    query TEXT NOT NULL,
    classified_intent TEXT NOT NULL,
    tools_called TEXT[] DEFAULT '{}',
    retrieved_items JSONB NOT NULL DEFAULT '[]'::jsonb,
    token_budget INT NOT NULL DEFAULT 1200,
    tokens_used INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_minato_working_user_date ON minato_working_memory(user_id, session_date);
CREATE INDEX IF NOT EXISTS idx_minato_semantic_user_status ON minato_semantic_memory(user_id, status);
CREATE INDEX IF NOT EXISTS idx_minato_semantic_user_key ON minato_semantic_memory(user_id, fact_key);
CREATE INDEX IF NOT EXISTS idx_minato_episodic_user_status ON minato_episodic_memory(user_id, status, episode_date DESC);
CREATE INDEX IF NOT EXISTS idx_minato_retrieval_logs_user ON minato_retrieval_logs(user_id, created_at DESC);

-- Row Level Security
ALTER TABLE minato_working_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE minato_semantic_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE minato_episodic_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE minato_retrieval_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own minato working memory"
    ON minato_working_memory FOR ALL TO authenticated
    USING (user_id = (SELECT auth.jwt() ->> 'edgebook_user_id'))
    WITH CHECK (user_id = (SELECT auth.jwt() ->> 'edgebook_user_id'));

CREATE POLICY "Users manage their own minato semantic memory"
    ON minato_semantic_memory FOR ALL TO authenticated
    USING (user_id = (SELECT auth.jwt() ->> 'edgebook_user_id'))
    WITH CHECK (user_id = (SELECT auth.jwt() ->> 'edgebook_user_id'));

CREATE POLICY "Users manage their own minato episodic memory"
    ON minato_episodic_memory FOR ALL TO authenticated
    USING (user_id = (SELECT auth.jwt() ->> 'edgebook_user_id'))
    WITH CHECK (user_id = (SELECT auth.jwt() ->> 'edgebook_user_id'));

CREATE POLICY "Users manage their own minato retrieval logs"
    ON minato_retrieval_logs FOR ALL TO authenticated
    USING (user_id = (SELECT auth.jwt() ->> 'edgebook_user_id'))
    WITH CHECK (user_id = (SELECT auth.jwt() ->> 'edgebook_user_id'));

GRANT SELECT, INSERT, UPDATE, DELETE ON minato_working_memory TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON minato_semantic_memory TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON minato_episodic_memory TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON minato_retrieval_logs TO authenticated;
