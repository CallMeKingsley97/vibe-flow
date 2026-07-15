pub mod adapter;
pub mod claude;
pub mod codex;
pub mod cursor;
pub mod gemini;
pub mod watcher;

use std::{path::Path, sync::Arc};

use adapter::AgentHistoryAdapter;
use claude::ClaudeAdapter;
use codex::CodexAdapter;
use cursor::CursorAdapter;
use gemini::GeminiAdapter;

pub fn default_adapters() -> Vec<Arc<dyn AgentHistoryAdapter>> {
    vec![
        Arc::new(CodexAdapter),
        Arc::new(ClaudeAdapter),
        Arc::new(GeminiAdapter),
        Arc::new(CursorAdapter),
    ]
}

pub fn adapter_for_path<'a>(
    adapters: &'a [Arc<dyn AgentHistoryAdapter>],
    path: &Path,
) -> Option<&'a Arc<dyn AgentHistoryAdapter>> {
    adapters.iter().find(|adapter| adapter.matches(path))
}

#[cfg(test)]
mod tests {
    use std::{fs, path::PathBuf};

    use uuid::Uuid;

    use crate::domain::{
        event::{EventKind, EventSource},
        session::SessionSource,
    };

    use super::{
        adapter::AgentHistoryAdapter, claude::ClaudeAdapter, codex::CodexAdapter,
        cursor::CursorAdapter, gemini::GeminiAdapter,
    };

    fn fixture_path(extension: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "vibe-flow-history-{}.{}",
            Uuid::new_v4(),
            extension
        ))
    }

    #[test]
    fn parses_codex_jsonl() {
        let path = fixture_path("jsonl");
        fs::write(
            &path,
            concat!(
                "{\"type\":\"session_meta\",\"timestamp\":\"2026-07-15T00:00:00Z\",\"payload\":{\"id\":\"codex-1\",\"cwd\":\"/repo\"}}\n",
                "{\"type\":\"event_msg\",\"timestamp\":\"2026-07-15T00:00:01Z\",\"payload\":{\"type\":\"user_message\",\"message\":\"Build it\"}}\n",
                "{\"type\":\"event_msg\",\"timestamp\":\"2026-07-15T00:00:02Z\",\"payload\":{\"type\":\"agent_message\",\"message\":\"Done\"}}\n",
                "{\"type\":\"response_item\",\"timestamp\":\"2026-07-15T00:00:03Z\",\"payload\":{\"type\":\"custom_tool_call\",\"name\":\"exec\",\"call_id\":\"call-1\",\"input\":\"sed -n '1,200p' /Users/test/.codex/skills/openai-docs/SKILL.md\"}}\n",
                "{\"type\":\"response_item\",\"timestamp\":\"2026-07-15T00:00:03Z\",\"payload\":{\"type\":\"custom_tool_call\",\"name\":\"exec\",\"call_id\":\"call-command\",\"input\":\"const r = await Promise.all([tools.exec_command({ cmd: \\\"git status --short\\\" }), tools.exec_command({ cmd: \\\"cargo test\\\" })]);\"}}\n",
                "{\"type\":\"response_item\",\"timestamp\":\"2026-07-15T00:00:04Z\",\"payload\":{\"type\":\"function_call\",\"name\":\"mcp__docs__search\",\"call_id\":\"call-2\"}}\n"
            ),
        )
        .expect("fixture should write");
        let session = CodexAdapter
            .parse(&path)
            .expect("fixture should parse")
            .expect("session should exist");
        assert_eq!(session.source, SessionSource::Codex);
        assert_eq!(session.external_id, "codex-1");
        assert_eq!(session.name, "Build it");
        assert!(
            session
                .events
                .iter()
                .any(|event| event.kind == EventKind::ToolCall)
        );
        let skill = session
            .events
            .iter()
            .find(|event| {
                event
                    .payload
                    .get("toolCategory")
                    .and_then(serde_json::Value::as_str)
                    == Some("skill")
            })
            .expect("skill metadata should be retained");
        assert_eq!(
            skill
                .payload
                .get("skillName")
                .and_then(serde_json::Value::as_str),
            Some("openai-docs")
        );
        assert!(session.events.iter().any(|event| {
            event
                .payload
                .get("mcpServer")
                .and_then(serde_json::Value::as_str)
                == Some("docs")
        }));
        assert!(session.events.iter().any(|event| {
            event
                .payload
                .get("commands")
                .and_then(serde_json::Value::as_array)
                .is_some_and(|commands| {
                    commands.len() == 2
                        && commands.first().and_then(serde_json::Value::as_str)
                            == Some("git status --short")
                })
        }));
        let _ = fs::remove_file(path);
    }

    #[test]
    fn parses_claude_jsonl() {
        let path = fixture_path("jsonl");
        fs::write(
            &path,
            concat!(
                "{\"type\":\"user\",\"sessionId\":\"claude-1\",\"cwd\":\"/repo\",\"timestamp\":\"2026-07-15T00:00:00Z\",\"message\":{\"role\":\"user\",\"content\":\"Explain this\"}}\n",
                "{\"type\":\"assistant\",\"sessionId\":\"claude-1\",\"timestamp\":\"2026-07-15T00:00:01Z\",\"message\":{\"role\":\"assistant\",\"content\":[{\"type\":\"text\",\"text\":\"Answer\"},{\"type\":\"tool_use\",\"name\":\"Read\",\"id\":\"tool-1\"},{\"type\":\"tool_use\",\"name\":\"Bash\",\"id\":\"tool-2\",\"input\":{\"command\":\"cargo test\"}}]}}\n"
            ),
        )
        .expect("fixture should write");
        let session = ClaudeAdapter
            .parse(&path)
            .expect("fixture should parse")
            .expect("session should exist");
        assert_eq!(session.source, SessionSource::Claude);
        assert_eq!(session.name, "Explain this");
        assert!(
            session
                .events
                .iter()
                .any(|event| event.kind == EventKind::ToolCall)
        );
        assert!(session.events.iter().any(|event| {
            event
                .payload
                .get("toolCategory")
                .and_then(serde_json::Value::as_str)
                == Some("file")
        }));
        assert!(session.events.iter().any(|event| {
            event
                .payload
                .get("command")
                .and_then(serde_json::Value::as_str)
                == Some("cargo test")
        }));
        let _ = fs::remove_file(path);
    }

    #[test]
    fn parses_gemini_json() {
        let path = fixture_path("json");
        fs::write(
            &path,
            r#"{"sessionId":"gemini-1","projectPath":"/repo","messages":[{"role":"user","timestamp":"2026-07-15T00:00:00Z","content":"Review code"},{"role":"model","timestamp":"2026-07-15T00:00:01Z","content":"Looks good","functionCalls":[{"name":"run_shell_command","args":{"command":"cargo test"}}]}]}"#,
        )
        .expect("fixture should write");
        let session = GeminiAdapter
            .parse(&path)
            .expect("fixture should parse")
            .expect("session should exist");
        assert_eq!(session.source, SessionSource::Gemini);
        assert_eq!(session.events.len(), 3);
        assert!(session.events.iter().any(|event| {
            event
                .payload
                .get("command")
                .and_then(serde_json::Value::as_str)
                == Some("cargo test")
        }));
        let _ = fs::remove_file(path);
    }

    #[test]
    fn parses_cursor_json() {
        let path = fixture_path("json");
        fs::write(
            &path,
            r#"{"composerId":"cursor-1","workspace":"/repo","messages":[{"role":"user","createdAt":"2026-07-15T00:00:00Z","text":"Fix bug"},{"role":"assistant","createdAt":"2026-07-15T00:00:01Z","text":"Fixed","toolCalls":[{"name":"terminal","arguments":{"command":"pnpm test"}}]}]}"#,
        )
        .expect("fixture should write");
        let session = CursorAdapter
            .parse(&path)
            .expect("fixture should parse")
            .expect("session should exist");
        assert_eq!(session.source, SessionSource::Cursor);
        assert_eq!(session.events[0].source, EventSource::User);
        assert!(session.events.iter().any(|event| {
            event
                .payload
                .get("command")
                .and_then(serde_json::Value::as_str)
                == Some("pnpm test")
        }));
        let _ = fs::remove_file(path);
    }

    #[tokio::test]
    async fn parses_cursor_state_database() {
        use sqlx::{
            Connection, Executor,
            sqlite::{SqliteConnectOptions, SqliteConnection},
        };

        let directory = std::env::temp_dir().join(format!("vibe-flow-cursor-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).expect("fixture directory should exist");
        let path = directory.join("state.vscdb");
        let options = SqliteConnectOptions::new()
            .filename(&path)
            .create_if_missing(true);
        let mut connection = SqliteConnection::connect_with(&options)
            .await
            .expect("database should open");
        connection
            .execute("CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value BLOB)")
            .await
            .expect("table should create");
        sqlx::query("INSERT INTO ItemTable (key, value) VALUES (?, ?)")
            .bind("composer.test")
            .bind(
                r#"{"composerId":"cursor-db-1","messages":[{"role":"user","text":"Database chat"},{"role":"assistant","text":"Imported"}]}"#,
            )
            .execute(&mut connection)
            .await
            .expect("fixture should insert");
        connection.close().await.expect("database should close");

        let parser_path = path.clone();
        let sessions = tokio::task::spawn_blocking(move || CursorAdapter.parse_many(&parser_path))
            .await
            .expect("parser task should finish")
            .expect("database should parse");
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].external_id, "cursor-db-1");
        let _ = fs::remove_dir_all(directory);
    }
}
