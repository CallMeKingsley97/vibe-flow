use chrono::{DateTime, Utc};
use uuid::Uuid;

use super::{error::AppError, event::EventKind, session::SessionSource};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum SearchScope {
    #[default]
    All,
    Messages,
    Commands,
    Tools,
    Skills,
    Mcp,
    Sessions,
}

impl SearchScope {
    pub fn parse(value: Option<&str>) -> Result<Self, AppError> {
        match value.unwrap_or("all") {
            "all" => Ok(Self::All),
            "messages" => Ok(Self::Messages),
            "commands" => Ok(Self::Commands),
            "tools" => Ok(Self::Tools),
            "skills" => Ok(Self::Skills),
            "mcp" => Ok(Self::Mcp),
            "sessions" => Ok(Self::Sessions),
            other => Err(AppError::Validation(format!("unknown search scope: {other}"))),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SearchQuery {
    pub query: String,
    pub source: Option<SessionSource>,
    pub workspace: Option<String>,
    pub scope: SearchScope,
    pub limit: u32,
    pub offset: u32,
}

impl SearchQuery {
    pub fn new(
        query: &str,
        source: Option<SessionSource>,
        workspace: Option<String>,
        scope: SearchScope,
        limit: u32,
        offset: u32,
    ) -> Result<Self, AppError> {
        let query = query.trim().to_string();
        if query.is_empty() {
            return Err(AppError::Validation("search query must not be empty".into()));
        }
        if query.chars().count() > 200 {
            return Err(AppError::Validation(
                "search query must be at most 200 characters".into(),
            ));
        }
        Ok(Self {
            query,
            source,
            workspace: workspace.filter(|value| !value.trim().is_empty()),
            scope,
            limit: limit.clamp(1, 100),
            offset,
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SearchMatchField {
    SessionName,
    Workspace,
    Summary,
    ToolName,
    Skill,
    Mcp,
    Command,
}

impl SearchMatchField {
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::SessionName => "session_name",
            Self::Workspace => "workspace",
            Self::Summary => "summary",
            Self::ToolName => "tool_name",
            Self::Skill => "skill",
            Self::Mcp => "mcp",
            Self::Command => "command",
        }
    }

    pub fn parse(value: &str) -> Result<Self, AppError> {
        match value {
            "session_name" => Ok(Self::SessionName),
            "workspace" => Ok(Self::Workspace),
            "summary" => Ok(Self::Summary),
            "tool_name" => Ok(Self::ToolName),
            "skill" => Ok(Self::Skill),
            "mcp" => Ok(Self::Mcp),
            "command" => Ok(Self::Command),
            other => Err(AppError::Storage(format!("unknown match field: {other}"))),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SearchHit {
    pub session_id: Uuid,
    pub session_name: String,
    pub source: SessionSource,
    pub workspace: Option<String>,
    pub updated_at: DateTime<Utc>,
    pub event_id: Option<Uuid>,
    pub sequence: Option<u64>,
    pub kind: Option<EventKind>,
    pub timestamp: Option<DateTime<Utc>>,
    pub match_field: SearchMatchField,
    pub snippet: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SearchResult {
    pub hits: Vec<SearchHit>,
    pub has_more: bool,
}

#[must_use]
pub fn like_pattern(raw: &str) -> String {
    let mut escaped = String::with_capacity(raw.len() + 2);
    for ch in raw.chars() {
        match ch {
            '\\' | '%' | '_' => {
                escaped.push('\\');
                escaped.push(ch);
            }
            other => escaped.push(other),
        }
    }
    format!("%{escaped}%")
}

#[must_use]
pub fn snippet_around(text: &str, needle: &str, max_chars: usize) -> String {
    let max_chars = max_chars.max(24);
    let lower = text.to_lowercase();
    let needle_lower = needle.to_lowercase();
    let match_byte = lower.find(&needle_lower).unwrap_or(0);
    let prefix_chars = max_chars / 3;
    let chars: Vec<char> = text.chars().collect();
    let match_char = text[..match_byte].chars().count();
    let start = match_char.saturating_sub(prefix_chars);
    let end = (start + max_chars).min(chars.len());
    let mut snippet: String = chars[start..end].iter().collect();
    if start > 0 {
        snippet = format!("…{snippet}");
    }
    if end < chars.len() {
        snippet.push('…');
    }
    snippet
}
