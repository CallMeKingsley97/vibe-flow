use tauri::{AppHandle, State, ipc::Channel};
use tauri_plugin_updater::UpdaterExt;
use uuid::Uuid;

use crate::{app_state::AppState, domain::{error::AppError, session::SessionSource}};

use super::dto::{
    AgentEventDto, ApiErrorDto, CaptureSessionDto, CleanupPreviewDto, CleanupResultDto,
    DataSettingsDto, HealthCheckDto, HistoryChangeDto, SourceScanStatusDto, StorageStatsDto,
    UpdateCheckDto, UpdateDataSettingsDto,
};

fn parse_id(value: &str, resource: &str) -> Result<Uuid, ApiErrorDto> {
    Uuid::parse_str(value)
        .map_err(|_| AppError::Validation(format!("invalid {resource} id: {value}")).into())
}

#[tauri::command]
pub async fn health_check(state: State<'_, AppState>) -> Result<HealthCheckDto, ApiErrorDto> {
    state
        .query_service
        .ping()
        .await
        .map_err(ApiErrorDto::from)?;
    Ok(HealthCheckDto {
        status: "ok",
        version: env!("CARGO_PKG_VERSION"),
        database: "connected",
        recovered_database_path: state.recovered_database_path.clone(),
    })
}

#[tauri::command]
pub async fn check_for_update(app: AppHandle) -> Result<UpdateCheckDto, ApiErrorDto> {
    let update = app
        .updater()
        .map_err(|error| AppError::Internal(error.to_string()))?
        .check()
        .await
        .map_err(|error| AppError::Internal(error.to_string()))?;
    Ok(update.map_or(
        UpdateCheckDto {
            current_version: env!("CARGO_PKG_VERSION"),
            available: false,
            version: None,
            body: None,
        },
        |update| UpdateCheckDto {
            current_version: env!("CARGO_PKG_VERSION"),
            available: true,
            version: Some(update.version),
            body: update.body,
        },
    ))
}

#[tauri::command]
pub async fn install_available_update(app: AppHandle) -> Result<bool, ApiErrorDto> {
    let Some(update) = app
        .updater()
        .map_err(|error| AppError::Internal(error.to_string()))?
        .check()
        .await
        .map_err(|error| AppError::Internal(error.to_string()))?
    else {
        return Ok(false);
    };
    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|error| AppError::Internal(error.to_string()))?;
    app.restart();
}

#[tauri::command]
pub async fn list_capture_sessions(
    limit: Option<u32>,
    offset: Option<u32>,
    source: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<CaptureSessionDto>, ApiErrorDto> {
    let source = source
        .as_deref()
        .map(str::parse::<SessionSource>)
        .transpose()
        .map_err(|error| AppError::Validation(error.to_string()))?;
    state
        .query_service
        .list_sessions(limit.unwrap_or(500), offset.unwrap_or(0), source)
        .await
        .map(|sessions| sessions.into_iter().map(Into::into).collect())
        .map_err(Into::into)
}

#[tauri::command]
pub async fn list_agent_events(
    session_id: String,
    after_sequence: Option<u64>,
    limit: Option<u32>,
    state: State<'_, AppState>,
) -> Result<Vec<AgentEventDto>, ApiErrorDto> {
    state
        .query_service
        .list_events(
            parse_id(&session_id, "session")?,
            after_sequence.unwrap_or(0),
            limit.unwrap_or(500),
        )
        .await
        .map(|events| events.into_iter().map(Into::into).collect())
        .map_err(Into::into)
}

#[tauri::command]
pub async fn scan_local_history(
    state: State<'_, AppState>,
) -> Result<Vec<SourceScanStatusDto>, ApiErrorDto> {
    state
        .history_service
        .scan_all()
        .await
        .map(|statuses| statuses.into_iter().map(Into::into).collect())
        .map_err(Into::into)
}

#[tauri::command]
pub async fn get_source_scan_statuses(
    state: State<'_, AppState>,
) -> Result<Vec<SourceScanStatusDto>, ApiErrorDto> {
    Ok(state
        .history_service
        .statuses()
        .into_iter()
        .map(Into::into)
        .collect())
}

#[tauri::command]
pub async fn subscribe_history_changes(
    on_change: Channel<HistoryChangeDto>,
    state: State<'_, AppState>,
) -> Result<(), ApiErrorDto> {
    state.history_publisher.subscribe(on_change);
    Ok(())
}

#[tauri::command]
pub async fn get_data_settings(state: State<'_, AppState>) -> Result<DataSettingsDto, ApiErrorDto> {
    state
        .governance_service
        .settings()
        .await
        .map(Into::into)
        .map_err(Into::into)
}

#[tauri::command]
pub async fn update_data_settings(
    settings: UpdateDataSettingsDto,
    state: State<'_, AppState>,
) -> Result<DataSettingsDto, ApiErrorDto> {
    state
        .governance_service
        .update_settings(settings.into())
        .await
        .map(Into::into)
        .map_err(Into::into)
}

#[tauri::command]
pub async fn get_storage_stats(state: State<'_, AppState>) -> Result<StorageStatsDto, ApiErrorDto> {
    state
        .governance_service
        .storage_stats()
        .await
        .map(Into::into)
        .map_err(Into::into)
}

#[tauri::command]
pub async fn preview_data_cleanup(
    retention_days: u32,
    state: State<'_, AppState>,
) -> Result<CleanupPreviewDto, ApiErrorDto> {
    state
        .governance_service
        .cleanup_preview(retention_days)
        .await
        .map(Into::into)
        .map_err(Into::into)
}

#[tauri::command]
pub async fn run_data_cleanup(
    retention_days: u32,
    state: State<'_, AppState>,
) -> Result<CleanupResultDto, ApiErrorDto> {
    state
        .governance_service
        .cleanup(retention_days)
        .await
        .map(Into::into)
        .map_err(Into::into)
}

#[tauri::command]
pub async fn create_diagnostic_bundle(state: State<'_, AppState>) -> Result<String, ApiErrorDto> {
    state
        .governance_service
        .create_diagnostic_bundle()
        .await
        .map(|path| path.display().to_string())
        .map_err(Into::into)
}
