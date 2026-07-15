DROP TABLE IF EXISTS llm_tool_calls;
DROP TABLE IF EXISTS llm_exchanges;
DROP TABLE IF EXISTS http_bodies;
DROP TABLE IF EXISTS http_headers;
DROP TABLE IF EXISTS network_requests;
DROP TABLE IF EXISTS app_settings;

CREATE TABLE agent_settings (
    id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
    retention_days INTEGER NOT NULL DEFAULT 30,
    auto_cleanup INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
);

INSERT INTO agent_settings (id, retention_days, auto_cleanup, updated_at)
VALUES (1, 30, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
