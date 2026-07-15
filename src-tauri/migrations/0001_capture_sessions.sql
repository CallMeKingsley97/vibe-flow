PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS capture_sessions (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
    status TEXT NOT NULL CHECK (status IN ('running', 'stopped', 'failed')),
    started_at TEXT NOT NULL,
    ended_at TEXT,
    last_sequence INTEGER NOT NULL DEFAULT 0 CHECK (last_sequence >= 0)
);

CREATE TABLE IF NOT EXISTS agent_events (
    id TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL,
    sequence INTEGER NOT NULL CHECK (sequence > 0),
    timestamp TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('system', 'agent', 'user')),
    kind TEXT NOT NULL CHECK (kind IN ('session_started', 'session_stopped', 'test_event')),
    level TEXT NOT NULL CHECK (level IN ('info', 'warning', 'error')),
    summary TEXT NOT NULL,
    payload TEXT NOT NULL DEFAULT '{}',
    FOREIGN KEY (session_id) REFERENCES capture_sessions(id) ON DELETE CASCADE,
    UNIQUE (session_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_capture_sessions_started_at
    ON capture_sessions(started_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_events_session_sequence
    ON agent_events(session_id, sequence);

CREATE INDEX IF NOT EXISTS idx_agent_events_session_kind_timestamp
    ON agent_events(session_id, kind, timestamp);
