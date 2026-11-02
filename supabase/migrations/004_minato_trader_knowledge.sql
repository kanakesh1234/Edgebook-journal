-- =============================================================================
-- Migration 004: MINATO persistent trader knowledge
--
-- A durable, per-trader notebook the MINATO agent reads at the start of each turn and writes to when it
-- learns something worth keeping (stated goals/rules, decisions, strategy notes, data-backed conclusions
-- with the date they were true, conversation summaries, one progress checkpoint per day).
--
-- This is contextual memory, not model training. Live journal data is NEVER stored here as a source of
-- truth: it is always read fresh, and `as_of` records how old an observation is.
--
-- Isolation uses the same RLS identity as migration 001/003: the server mints a short-lived JWT carrying
-- `edgebook_user_id`, and the policy compares it to `user_id`.
-- =============================================================================

CREATE TABLE IF NOT EXISTS minato_trader_knowledge (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL,
    kind          TEXT NOT NULL CHECK (kind IN (
                      'strategy','strength','weakness','mistake','risk','emotion','habit',
                      'goal','decision','preference','progress','fact','conversation')),
    content       TEXT NOT NULL CHECK (char_length(content) BETWEEN 8 AND 600),
    evidence      TEXT[] NOT NULL DEFAULT '{}',
    source        TEXT NOT NULL CHECK (source IN ('trader_stated','analysis','conversation','checkpoint')),
    confidence    DOUBLE PRECISION NOT NULL DEFAULT 0.7 CHECK (confidence BETWEEN 0 AND 1),
    status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','superseded','deleted')),
    times_seen    INT NOT NULL DEFAULT 1,
    first_seen    TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen     TIMESTAMPTZ NOT NULL DEFAULT now(),
    as_of         TEXT,                                  -- YYYY-MM-DD of the data the observation was drawn from
    data          JSONB NOT NULL DEFAULT '{}'::jsonb,    -- structured payload (e.g. checkpoint metrics)
    fingerprint   TEXT NOT NULL,                         -- dedupe key (kind + normalised content, or one-per-day checkpoint)
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One ACTIVE row per fingerprint per trader: repeated observations reinforce instead of duplicating.
CREATE UNIQUE INDEX IF NOT EXISTS uq_minato_knowledge_active_fp
    ON minato_trader_knowledge (user_id, fingerprint) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_minato_knowledge_user_recent
    ON minato_trader_knowledge (user_id, status, last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_minato_knowledge_checkpoint
    ON minato_trader_knowledge (user_id, source, as_of DESC) WHERE source = 'checkpoint';

ALTER TABLE minato_trader_knowledge ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own minato trader knowledge" ON minato_trader_knowledge;
CREATE POLICY "Users manage their own minato trader knowledge"
    ON minato_trader_knowledge FOR ALL TO authenticated
    USING (user_id = (SELECT auth.jwt() ->> 'edgebook_user_id'))
    WITH CHECK (user_id = (SELECT auth.jwt() ->> 'edgebook_user_id'));

GRANT SELECT, INSERT, UPDATE, DELETE ON minato_trader_knowledge TO authenticated;

-- Keep updated_at honest (function created in migration 001).
DROP TRIGGER IF EXISTS update_minato_trader_knowledge_updated_at ON minato_trader_knowledge;
CREATE TRIGGER update_minato_trader_knowledge_updated_at
    BEFORE UPDATE ON minato_trader_knowledge
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
