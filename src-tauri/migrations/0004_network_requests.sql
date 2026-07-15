CREATE TABLE network_requests (
    id TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL,
    method TEXT NOT NULL,
    url TEXT NOT NULL,
    host TEXT NOT NULL,
    status_code INTEGER,
    started_at TEXT NOT NULL,
    first_byte_at TEXT,
    completed_at TEXT,
    request_bytes INTEGER NOT NULL DEFAULT 0,
    response_bytes INTEGER NOT NULL DEFAULT 0,
    state TEXT NOT NULL CHECK (state IN ('pending', 'completed', 'failed', 'tunnel')),
    error TEXT,
    protocol TEXT NOT NULL,
    is_tunnel INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (session_id) REFERENCES capture_sessions(id) ON DELETE CASCADE
);

CREATE TABLE http_headers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id TEXT NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('request', 'response')),
    name TEXT NOT NULL,
    value TEXT NOT NULL,
    FOREIGN KEY (request_id) REFERENCES network_requests(id) ON DELETE CASCADE
);

CREATE TABLE http_bodies (
    request_id TEXT NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('request', 'response')),
    content_type TEXT,
    original_length INTEGER NOT NULL DEFAULT 0,
    saved_length INTEGER NOT NULL DEFAULT 0,
    truncated INTEGER NOT NULL DEFAULT 0,
    content BLOB NOT NULL DEFAULT X'',
    PRIMARY KEY (request_id, direction),
    FOREIGN KEY (request_id) REFERENCES network_requests(id) ON DELETE CASCADE
);

CREATE INDEX idx_network_requests_session_started
    ON network_requests(session_id, started_at DESC);

CREATE INDEX idx_network_requests_session_state
    ON network_requests(session_id, state);

CREATE INDEX idx_http_headers_request_direction
    ON http_headers(request_id, direction);
