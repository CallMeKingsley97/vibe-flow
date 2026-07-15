DELETE FROM capture_sessions WHERE source = 'vibe_flow';

CREATE TABLE capture_sessions_v8 (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
    status TEXT NOT NULL DEFAULT 'stopped' CHECK (status = 'stopped'),
    started_at TEXT NOT NULL,
    ended_at TEXT,
    last_sequence INTEGER NOT NULL DEFAULT 0 CHECK (last_sequence >= 0),
    source TEXT NOT NULL CHECK (source IN ('codex', 'claude', 'gemini', 'cursor')),
    external_id TEXT NOT NULL,
    source_path TEXT NOT NULL,
    workspace TEXT,
    updated_at TEXT NOT NULL
);

INSERT INTO capture_sessions_v8
    (id, name, status, started_at, ended_at, last_sequence,
     source, external_id, source_path, workspace, updated_at)
SELECT id, name, 'stopped', started_at, ended_at, last_sequence,
       source, external_id, source_path, workspace, updated_at
FROM capture_sessions
WHERE source IN ('codex', 'claude', 'gemini', 'cursor')
  AND external_id IS NOT NULL
  AND source_path IS NOT NULL;

CREATE TABLE agent_events_v8 (
    id TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL,
    sequence INTEGER NOT NULL CHECK (sequence > 0),
    timestamp TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('system', 'agent', 'user', 'tool')),
    kind TEXT NOT NULL CHECK (
        kind IN ('message', 'reasoning', 'llm_usage', 'tool_call', 'tool_result', 'command', 'file_change')
    ),
    level TEXT NOT NULL CHECK (level IN ('info', 'warning', 'error')),
    summary TEXT NOT NULL,
    payload TEXT NOT NULL DEFAULT '{}',
    FOREIGN KEY (session_id) REFERENCES capture_sessions_v8(id) ON DELETE CASCADE,
    UNIQUE (session_id, sequence)
);

INSERT INTO agent_events_v8
    (id, session_id, sequence, timestamp, source, kind, level, summary, payload)
SELECT event.id, event.session_id, event.sequence, event.timestamp,
       event.source, event.kind, event.level, event.summary, event.payload
FROM agent_events event
JOIN capture_sessions_v8 session ON session.id = event.session_id
WHERE event.kind IN ('message', 'reasoning', 'llm_usage', 'tool_call', 'tool_result', 'command', 'file_change');

DROP TABLE agent_events;
DROP TABLE capture_sessions;
ALTER TABLE capture_sessions_v8 RENAME TO capture_sessions;
ALTER TABLE agent_events_v8 RENAME TO agent_events;

CREATE UNIQUE INDEX idx_capture_sessions_external_source_id
    ON capture_sessions(source, external_id);
CREATE INDEX idx_capture_sessions_source_updated_at
    ON capture_sessions(source, updated_at DESC);
CREATE INDEX idx_capture_sessions_started_at
    ON capture_sessions(started_at DESC);
CREATE INDEX idx_capture_sessions_updated_at
    ON capture_sessions(updated_at);
CREATE INDEX idx_agent_events_session_sequence
    ON agent_events(session_id, sequence);
CREATE INDEX idx_agent_events_session_kind_timestamp
    ON agent_events(session_id, kind, timestamp);
