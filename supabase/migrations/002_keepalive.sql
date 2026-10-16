-- A one-row table the keepalive cron reads so Supabase sees real database activity.
-- It holds no user data. Anonymous read-only; nobody can write through the API.
CREATE TABLE IF NOT EXISTS app_keepalive (
    id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    note TEXT NOT NULL DEFAULT 'edgebook keepalive'
);
INSERT INTO app_keepalive (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE app_keepalive ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read the keepalive row" ON app_keepalive FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON app_keepalive TO anon, authenticated;
