CREATE TABLE agent_events_v2 (
    id TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL,
    sequence INTEGER NOT NULL CHECK (sequence > 0),
    timestamp TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('system', 'agent', 'user')),
    kind TEXT NOT NULL CHECK (
        kind IN (
            'session_started',
            'session_stopped',
            'test_event',
            'process_started',
            'process_stdout',
            'process_stderr',
            'process_exited',
            'process_error'
        )
    ),
    level TEXT NOT NULL CHECK (level IN ('info', 'warning', 'error')),
    summary TEXT NOT NULL,
    payload TEXT NOT NULL DEFAULT '{}',
    FOREIGN KEY (session_id) REFERENCES capture_sessions(id) ON DELETE CASCADE,
    UNIQUE (session_id, sequence)
);

INSERT INTO agent_events_v2
    (id, session_id, sequence, timestamp, source, kind, level, summary, payload)
SELECT id, session_id, sequence, timestamp, source, kind, level, summary, payload
FROM agent_events;

DROP TABLE agent_events;
ALTER TABLE agent_events_v2 RENAME TO agent_events;

CREATE INDEX idx_agent_events_session_sequence
    ON agent_events(session_id, sequence);

CREATE INDEX idx_agent_events_session_kind_timestamp
    ON agent_events(session_id, kind, timestamp);
