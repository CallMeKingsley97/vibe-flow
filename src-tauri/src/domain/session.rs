use std::{fmt, str::FromStr};

use chrono::{DateTime, Utc};
use uuid::Uuid;

use super::error::AppError;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SessionStatus {
    Stopped,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum SessionSource {
    Codex,
    Claude,
    Gemini,
    Cursor,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct SessionUsage {
    pub model: Option<String>,
    pub reasoning_effort: Option<String>,
    pub input_tokens: Option<u64>,
    pub cached_input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
    pub reasoning_output_tokens: Option<u64>,
    pub total_tokens: Option<u64>,
}

impl fmt::Display for SessionSource {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Self::Codex => "codex",
            Self::Claude => "claude",
            Self::Gemini => "gemini",
            Self::Cursor => "cursor",
        })
    }
}

impl FromStr for SessionSource {
    type Err = AppError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "codex" => Ok(Self::Codex),
            "claude" => Ok(Self::Claude),
            "gemini" => Ok(Self::Gemini),
            "cursor" => Ok(Self::Cursor),
            _ => Err(AppError::Storage(format!(
                "unknown session source: {value}"
            ))),
        }
    }
}

impl fmt::Display for SessionStatus {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Self::Stopped => "stopped",
        })
    }
}

impl FromStr for SessionStatus {
    type Err = AppError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "stopped" => Ok(Self::Stopped),
            _ => Err(AppError::Storage(format!(
                "unknown session status: {value}"
            ))),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CaptureSession {
    pub id: Uuid,
    pub name: String,
    pub status: SessionStatus,
    pub started_at: DateTime<Utc>,
    pub ended_at: Option<DateTime<Utc>>,
    pub last_sequence: u64,
    pub source: SessionSource,
    pub external_id: Option<String>,
    pub source_path: Option<String>,
    pub workspace: Option<String>,
    pub usage: SessionUsage,
    pub updated_at: DateTime<Utc>,
}
