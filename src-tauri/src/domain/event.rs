use std::{fmt, str::FromStr};

use chrono::{DateTime, Utc};
use serde_json::Value;
use uuid::Uuid;

use super::error::AppError;

macro_rules! string_enum {
    ($name:ident { $($variant:ident => $value:literal),+ $(,)? }) => {
        #[derive(Debug, Clone, Copy, PartialEq, Eq)]
        pub enum $name { $($variant),+ }

        impl fmt::Display for $name {
            fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
                formatter.write_str(match self { $(Self::$variant => $value),+ })
            }
        }

        impl FromStr for $name {
            type Err = AppError;

            fn from_str(value: &str) -> Result<Self, Self::Err> {
                match value {
                    $($value => Ok(Self::$variant),)+
                    _ => Err(AppError::Storage(format!("unknown {}: {value}", stringify!($name)))),
                }
            }
        }
    };
}

string_enum!(EventSource {
    System => "system",
    Agent => "agent",
    User => "user",
    Tool => "tool",
});

string_enum!(EventKind {
    Message => "message",
    Reasoning => "reasoning",
    LlmUsage => "llm_usage",
    ToolCall => "tool_call",
    ToolResult => "tool_result",
    Command => "command",
    FileChange => "file_change",
});

string_enum!(EventLevel {
    Info => "info",
    Warning => "warning",
    Error => "error",
});

#[derive(Debug, Clone, PartialEq)]
pub struct AgentEvent {
    pub id: Uuid,
    pub session_id: Uuid,
    pub sequence: u64,
    pub timestamp: DateTime<Utc>,
    pub source: EventSource,
    pub kind: EventKind,
    pub level: EventLevel,
    pub summary: String,
    pub payload: Value,
}
