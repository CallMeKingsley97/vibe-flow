use std::{path::PathBuf, sync::Arc};

use chrono::{Duration, Utc};
use serde_json::json;

use crate::{
    application::ports::GovernanceRepository,
    domain::{
        error::AppError,
        governance::{AgentDataSettings, CleanupPreview, CleanupResult, StorageStats},
    },
};

pub struct GovernanceService {
    repository: Arc<dyn GovernanceRepository>,
    diagnostics_dir: PathBuf,
}

impl GovernanceService {
    pub fn new(repository: Arc<dyn GovernanceRepository>, diagnostics_dir: PathBuf) -> Self {
        Self {
            repository,
            diagnostics_dir,
        }
    }

    pub async fn settings(&self) -> Result<AgentDataSettings, AppError> {
        self.repository.get_data_settings().await
    }

    pub async fn update_settings(
        &self,
        settings: AgentDataSettings,
    ) -> Result<AgentDataSettings, AppError> {
        settings.validate()?;
        let updated = self.repository.update_data_settings(settings).await?;
        if updated.auto_cleanup {
            let cutoff = Utc::now() - Duration::days(i64::from(updated.retention_days));
            self.repository.cleanup_before(cutoff).await?;
        }
        Ok(updated)
    }

    pub async fn storage_stats(&self) -> Result<StorageStats, AppError> {
        self.repository.storage_stats().await
    }

    pub async fn cleanup_preview(&self, retention_days: u32) -> Result<CleanupPreview, AppError> {
        if !(1..=3650).contains(&retention_days) {
            return Err(AppError::Validation(
                "保留周期必须在 1 到 3650 天之间".into(),
            ));
        }
        self.repository
            .cleanup_preview(Utc::now() - Duration::days(i64::from(retention_days)))
            .await
    }

    pub async fn cleanup(&self, retention_days: u32) -> Result<CleanupResult, AppError> {
        let preview = self.cleanup_preview(retention_days).await?;
        self.repository.cleanup_before(preview.cutoff).await
    }

    pub async fn run_automatic_cleanup(&self) -> Result<Option<CleanupResult>, AppError> {
        let settings = self.settings().await?;
        if !settings.auto_cleanup {
            return Ok(None);
        }
        self.cleanup(settings.retention_days).await.map(Some)
    }

    pub async fn create_diagnostic_bundle(&self) -> Result<PathBuf, AppError> {
        let settings = self.settings().await?;
        let stats = self.storage_stats().await?;
        std::fs::create_dir_all(&self.diagnostics_dir)
            .map_err(|error| AppError::Internal(format!("无法创建诊断目录: {error}")))?;
        let path = self.diagnostics_dir.join(format!(
            "vibe-flow-diagnostic-{}.json",
            Utc::now().format("%Y%m%d-%H%M%S")
        ));
        let document = json!({
            "schemaVersion": 2,
            "generatedAt": Utc::now().to_rfc3339(),
            "applicationVersion": env!("CARGO_PKG_VERSION"),
            "privacy": {
                "containsAgentMessages": false,
                "containsToolArguments": false,
                "containsSourceFiles": false,
                "containsPlaintextSecrets": false
            },
            "diagnosticLog": {
                "enabled": self.diagnostics_dir.join("vibe-flow.log").exists(),
                "includedInBundle": false,
                "reason": "原始日志可能包含本机路径，安全诊断包默认仅包含汇总数据"
            },
            "settings": {
                "retentionDays": settings.retention_days,
                "autoCleanup": settings.auto_cleanup
            },
            "storage": {
                "databaseBytes": stats.database_bytes,
                "sessionCount": stats.session_count,
                "eventCount": stats.event_count,
                "oldestSessionAt": stats.oldest_session_at.map(|value| value.to_rfc3339())
            }
        });
        std::fs::write(&path, serde_json::to_vec_pretty(&document)?)
            .map_err(|error| AppError::Internal(format!("无法写入诊断包: {error}")))?;
        Ok(path)
    }
}
