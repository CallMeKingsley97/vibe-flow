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
                "{\"type\":\"turn_context\",\"timestamp\":\"2026-07-15T00:00:00Z\",\"payload\":{\"model\":\"gpt-5\",\"effort\":\"high\"}}\n",
                "{\"type\":\"event_msg\",\"timestamp\":\"2026-07-15T00:00:01Z\",\"payload\":{\"type\":\"user_message\",\"message\":\"Build it\"}}\n",
                "{\"type\":\"event_msg\",\"timestamp\":\"2026-07-15T00:00:02Z\",\"payload\":{\"type\":\"agent_message\",\"message\":\"Done\"}}\n",
                "{\"type\":\"event_msg\",\"timestamp\":\"2026-07-15T00:00:02Z\",\"payload\":{\"type\":\"token_count\",\"info\":{\"total_token_usage\":{\"input_tokens\":1200,\"cached_input_tokens\":800,\"output_tokens\":300,\"reasoning_output_tokens\":100,\"total_tokens\":1500}}}}\n",
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
        assert_eq!(session.usage.model.as_deref(), Some("gpt-5"));
        assert_eq!(session.usage.reasoning_effort.as_deref(), Some("high"));
        assert_eq!(session.usage.total_tokens, Some(1_500));
        assert_eq!(session.usage.base_url, None);
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
    fn resolves_codex_base_url_from_config() {
        let home = std::env::temp_dir().join(format!("vibe-flow-codex-home-{}", Uuid::new_v4()));
        let sessions = home.join(".codex/sessions");
        fs::create_dir_all(&sessions).expect("sessions dir");
        fs::write(
            home.join(".codex/config.toml"),
            r#"
model_provider = "gpt"
[model_providers.gpt]
name = "proxy"
base_url = "https://api.ark717.com/v1/"
"#,
        )
        .expect("config");
        let path = sessions.join("session.jsonl");
        fs::write(
            &path,
            concat!(
                "{\"type\":\"session_meta\",\"timestamp\":\"2026-07-15T00:00:00Z\",\"payload\":{\"id\":\"codex-base\",\"cwd\":\"/repo\",\"model_provider\":\"gpt\"}}\n",
                "{\"type\":\"turn_context\",\"timestamp\":\"2026-07-15T00:00:00Z\",\"payload\":{\"model\":\"gpt-5\",\"effort\":\"high\"}}\n",
                "{\"type\":\"event_msg\",\"timestamp\":\"2026-07-15T00:00:01Z\",\"payload\":{\"type\":\"user_message\",\"message\":\"Hello\"}}\n"
            ),
        )
        .expect("session");
        let session = CodexAdapter
            .parse(&path)
            .expect("parse")
            .expect("session");
        assert_eq!(
            session.usage.base_url.as_deref(),
            Some("https://api.ark717.com/v1")
        );
        let _ = fs::remove_dir_all(home);
    }

    #[test]
    fn parses_claude_jsonl() {
        let path = fixture_path("jsonl");
        fs::write(
            &path,
            concat!(
                "{\"type\":\"user\",\"sessionId\":\"claude-1\",\"cwd\":\"/repo\",\"timestamp\":\"2026-07-15T00:00:00Z\",\"message\":{\"role\":\"user\",\"content\":\"Explain this\"}}\n",
                "{\"type\":\"assistant\",\"sessionId\":\"claude-1\",\"timestamp\":\"2026-07-15T00:00:01Z\",\"message\":{\"role\":\"assistant\",\"model\":\"claude-opus-4-1\",\"usage\":{\"input_tokens\":200,\"cache_read_input_tokens\":500,\"output_tokens\":100},\"content\":[{\"type\":\"thinking\",\"thinking\":\"Internal reasoning\"},{\"type\":\"text\",\"text\":\"Answer\"},{\"type\":\"tool_use\",\"name\":\"Read\",\"id\":\"tool-1\"},{\"type\":\"tool_use\",\"name\":\"Bash\",\"id\":\"tool-2\",\"input\":{\"command\":\"cargo test\"}}]}}\n"
            ),
        )
        .expect("fixture should write");
        let session = ClaudeAdapter
            .parse(&path)
            .expect("fixture should parse")
            .expect("session should exist");
        assert_eq!(session.source, SessionSource::Claude);
        assert_eq!(session.name, "Explain this");
        assert_eq!(session.usage.model.as_deref(), Some("claude-opus-4-1"));
        assert_eq!(session.usage.reasoning_effort.as_deref(), Some("enabled"));
        assert_eq!(session.usage.total_tokens, Some(800));
        assert_eq!(session.usage.base_url, None);
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
    fn resolves_claude_base_url_from_settings() {
        let home = std::env::temp_dir().join(format!("vibe-flow-claude-home-{}", Uuid::new_v4()));
        let projects = home.join(".claude/projects/demo");
        fs::create_dir_all(&projects).expect("projects dir");
        fs::write(
            home.join(".claude/settings.json"),
            r#"{"env":{"ANTHROPIC_BASE_URL":"https://xiaoxiaobai.me/"}}"#,
        )
        .expect("settings");
        let path = projects.join("session.jsonl");
        fs::write(
            &path,
            concat!(
                "{\"type\":\"user\",\"sessionId\":\"claude-base\",\"cwd\":\"/repo\",\"timestamp\":\"2026-07-15T00:00:00Z\",\"message\":{\"role\":\"user\",\"content\":\"Explain this\"}}\n",
                "{\"type\":\"assistant\",\"sessionId\":\"claude-base\",\"timestamp\":\"2026-07-15T00:00:01Z\",\"message\":{\"role\":\"assistant\",\"model\":\"claude-opus-4-1\",\"usage\":{\"input_tokens\":10,\"output_tokens\":5},\"content\":[{\"type\":\"text\",\"text\":\"Answer\"}]}}\n"
            ),
        )
        .expect("session");
        let session = ClaudeAdapter
            .parse(&path)
            .expect("parse")
            .expect("session");
        assert_eq!(
            session.usage.base_url.as_deref(),
            Some("https://xiaoxiaobai.me")
        );
        let _ = fs::remove_dir_all(home);
    }

    #[test]
    fn parses_gemini_json() {
        let path = fixture_path("json");
        fs::write(
            &path,
            r#"{"sessionId":"gemini-1","projectPath":"/repo","model":"gemini-2.5-pro","thinkingLevel":"high","messages":[{"role":"user","timestamp":"2026-07-15T00:00:00Z","content":"Review code"},{"role":"model","timestamp":"2026-07-15T00:00:01Z","content":"Looks good","usageMetadata":{"promptTokenCount":400,"candidatesTokenCount":80,"thoughtsTokenCount":20,"totalTokenCount":500},"functionCalls":[{"name":"run_shell_command","args":{"command":"cargo test"}}]}]}"#,
        )
        .expect("fixture should write");
        let session = GeminiAdapter
            .parse(&path)
            .expect("fixture should parse")
            .expect("session should exist");
        assert_eq!(session.source, SessionSource::Gemini);
        assert_eq!(session.events.len(), 3);
        assert_eq!(session.usage.model.as_deref(), Some("gemini-2.5-pro"));
        assert_eq!(session.usage.reasoning_effort.as_deref(), Some("high"));
        assert_eq!(session.usage.total_tokens, Some(500));
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
            r#"{"composerId":"cursor-1","workspace":"/repo","modelId":"claude-4-sonnet","reasoningEffort":"low","messages":[{"role":"user","createdAt":"2026-07-15T00:00:00Z","text":"Fix bug"},{"role":"assistant","createdAt":"2026-07-15T00:00:01Z","text":"Fixed","tokenUsage":{"inputTokens":300,"cachedInputTokens":100,"outputTokens":50,"totalTokens":450},"toolCalls":[{"name":"terminal","arguments":{"command":"pnpm test"}}]}]}"#,
        )
        .expect("fixture should write");
        let session = CursorAdapter
            .parse(&path)
            .expect("fixture should parse")
            .expect("session should exist");
        assert_eq!(session.source, SessionSource::Cursor);
        assert_eq!(session.events[0].source, EventSource::User);
        assert_eq!(session.usage.model.as_deref(), Some("claude-4-sonnet"));
        assert_eq!(session.usage.reasoning_effort.as_deref(), Some("low"));
        assert_eq!(session.usage.total_tokens, Some(450));
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
