CREATE TABLE app_settings (
    id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
    save_bodies INTEGER NOT NULL DEFAULT 1,
    body_limit_bytes INTEGER NOT NULL DEFAULT 1048576,
    session_body_limit_bytes INTEGER NOT NULL DEFAULT 104857600,
    retention_days INTEGER NOT NULL DEFAULT 30,
    auto_cleanup INTEGER NOT NULL DEFAULT 0,
    sensitive_headers TEXT NOT NULL DEFAULT '[]',
    sensitive_query_keys TEXT NOT NULL DEFAULT '[]',
    sensitive_json_keys TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL
);

INSERT INTO app_settings (id, updated_at)
VALUES (1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

CREATE INDEX idx_capture_sessions_updated_at
    ON capture_sessions(updated_at);

CREATE INDEX idx_network_requests_host
    ON network_requests(session_id, host);
