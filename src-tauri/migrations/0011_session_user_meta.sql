ALTER TABLE capture_sessions ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0;
ALTER TABLE capture_sessions ADD COLUMN user_tags TEXT NOT NULL DEFAULT '[]';
CREATE INDEX IF NOT EXISTS idx_sessions_favorite ON capture_sessions(is_favorite) WHERE is_favorite = 1;
