-- Table: working_drafts
-- Purpose: Temporary storage for in-progress trade entries, plans, and reviews before they're confirmed to Drive.
CREATE TABLE IF NOT EXISTS working_drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    draft_type TEXT NOT NULL CHECK (draft_type IN ('entry', 'plan', 'reflection', 'review', 'settings', 'journal_snapshot')),
    draft_key TEXT NOT NULL,
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'persisting', 'persisted', 'failed')),
    drive_confirmed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, draft_type, draft_key)
);

-- Table: active_sessions
-- Purpose: Track active user sessions for realtime presence and state recovery.
CREATE TABLE IF NOT EXISTS active_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    tab_id TEXT NOT NULL,
    current_view TEXT,
    last_heartbeat TIMESTAMPTZ DEFAULT now(),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, tab_id)
);

-- Table: processing_queue
-- Purpose: Queue for async operations (Drive writes, image uploads) with status tracking.
CREATE TABLE IF NOT EXISTS processing_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    operation TEXT NOT NULL,
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    attempts INT DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_working_drafts_user_status ON working_drafts(user_id, status);
CREATE INDEX IF NOT EXISTS idx_active_sessions_user ON active_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_processing_queue_user_status ON processing_queue(user_id, status);

-- Supabase is advisory working memory only; every record still belongs to the
-- authenticated user who owns the corresponding Drive-backed journal.
ALTER TABLE working_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE active_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE processing_queue ENABLE ROW LEVEL SECURITY;

-- `edgebook_user_id` is minted only by the server from the verified Edgebook
-- session. It keeps the existing g_<Google subject> identity intact without
-- adding a second login or migrating any Drive data.
CREATE POLICY "Users manage their own working drafts"
    ON working_drafts
    FOR ALL
    TO authenticated
    USING (user_id = (SELECT auth.jwt() ->> 'edgebook_user_id'))
    WITH CHECK (user_id = (SELECT auth.jwt() ->> 'edgebook_user_id'));

CREATE POLICY "Users manage their own active sessions"
    ON active_sessions
    FOR ALL
    TO authenticated
    USING (user_id = (SELECT auth.jwt() ->> 'edgebook_user_id'))
    WITH CHECK (user_id = (SELECT auth.jwt() ->> 'edgebook_user_id'));

CREATE POLICY "Users manage their own processing queue"
    ON processing_queue
    FOR ALL
    TO authenticated
    USING (user_id = (SELECT auth.jwt() ->> 'edgebook_user_id'))
    WITH CHECK (user_id = (SELECT auth.jwt() ->> 'edgebook_user_id'));

GRANT SELECT, INSERT, UPDATE, DELETE ON working_drafts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON active_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON processing_queue TO authenticated;

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_working_drafts_updated_at
    BEFORE UPDATE ON working_drafts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Cleanup function
CREATE OR REPLACE FUNCTION cleanup_stale_working_memory()
RETURNS void AS $$
BEGIN
    -- Delete drafts persisted > 1 hour ago
    DELETE FROM working_drafts
    WHERE status = 'persisted' AND drive_confirmed_at < now() - INTERVAL '1 hour';
    
    -- Delete sessions with no heartbeat > 30 mins
    DELETE FROM active_sessions
    WHERE last_heartbeat < now() - INTERVAL '30 minutes';
    
    -- Delete completed queue items > 1 hour old
    DELETE FROM processing_queue
    WHERE status = 'completed' AND completed_at < now() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql;
