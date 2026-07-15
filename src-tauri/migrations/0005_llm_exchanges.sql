CREATE TABLE llm_exchanges (
    id TEXT PRIMARY KEY NOT NULL,
    network_request_id TEXT NOT NULL UNIQUE,
    session_id TEXT NOT NULL,
    provider TEXT NOT NULL CHECK (provider IN ('openai', 'anthropic', 'unknown')),
    endpoint TEXT NOT NULL,
    model TEXT,
    response_id TEXT,
    trace_id TEXT,
    parse_status TEXT NOT NULL CHECK (parse_status IN ('parsed', 'partial', 'unrecognized', 'encrypted', 'error')),
    parse_error TEXT,
    input_messages TEXT NOT NULL DEFAULT '[]',
    output_text TEXT NOT NULL DEFAULT '',
    reasoning_summary TEXT NOT NULL DEFAULT '',
    input_tokens INTEGER,
    output_tokens INTEGER,
    reasoning_tokens INTEGER,
    cached_tokens INTEGER,
    parent_event_id TEXT,
    related_event_ids TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    FOREIGN KEY (network_request_id) REFERENCES network_requests(id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES capture_sessions(id) ON DELETE CASCADE
);

CREATE TABLE llm_tool_calls (
    id TEXT PRIMARY KEY NOT NULL,
    exchange_id TEXT NOT NULL,
    external_id TEXT,
    name TEXT NOT NULL,
    arguments TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (exchange_id) REFERENCES llm_exchanges(id) ON DELETE CASCADE
);

CREATE INDEX idx_llm_exchanges_session_created
    ON llm_exchanges(session_id, created_at DESC);

CREATE INDEX idx_llm_exchanges_parent_event
    ON llm_exchanges(parent_event_id);

CREATE INDEX idx_llm_tool_calls_exchange
    ON llm_tool_calls(exchange_id);

CREATE TABLE agent_events_v5 (
    id TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL,
    sequence INTEGER NOT NULL CHECK (sequence > 0),
    timestamp TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('system', 'agent', 'user', 'tool')),
    kind TEXT NOT NULL CHECK (
        kind IN (
            'session_started', 'session_stopped', 'test_event',
            'process_started', 'process_stdout', 'process_stderr', 'process_exited', 'process_error',
            'message', 'reasoning', 'llm_usage', 'tool_call', 'tool_result', 'command', 'file_change'
        )
    ),
    level TEXT NOT NULL CHECK (level IN ('info', 'warning', 'error')),
    summary TEXT NOT NULL,
    payload TEXT NOT NULL DEFAULT '{}',
    FOREIGN KEY (session_id) REFERENCES capture_sessions(id) ON DELETE CASCADE,
    UNIQUE (session_id, sequence)
);

INSERT INTO agent_events_v5
    (id, session_id, sequence, timestamp, source, kind, level, summary, payload)
SELECT id, session_id, sequence, timestamp, source, kind, level, summary, payload
FROM agent_events;

DROP TABLE agent_events;
ALTER TABLE agent_events_v5 RENAME TO agent_events;

CREATE INDEX idx_agent_events_session_sequence
    ON agent_events(session_id, sequence);

CREATE INDEX idx_agent_events_session_kind_timestamp
    ON agent_events(session_id, kind, timestamp);
