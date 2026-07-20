mod app_state;
mod application;
mod domain;
mod infrastructure;
mod interfaces;

use std::{
    fs::OpenOptions,
    path::Path,
    sync::{Arc, Mutex},
};

use app_state::AppState;
use application::{
    analytics_service::AnalyticsService, governance_service::GovernanceService,
    history_service::HistoryService, query_service::QueryService,
};
use infrastructure::{
    history::{default_adapters, watcher::HistoryWatcher},
    persistence::sqlite::SqliteRepository,
};
use interfaces::{channels::HistoryChannelPublisher, commands};
use tauri::Manager;
use tracing_subscriber::EnvFilter;

fn init_tracing(log_path: &Path) {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    if let Ok(file) = OpenOptions::new().create(true).append(true).open(log_path) {
        let _ = tracing_subscriber::fmt()
            .with_env_filter(filter)
            .with_target(false)
            .compact()
            .with_ansi(false)
            .with_writer(Mutex::new(file))
            .try_init();
    } else {
        let _ = tracing_subscriber::fmt()
            .with_env_filter(filter)
            .with_target(false)
            .compact()
            .try_init();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
#[allow(clippy::too_many_lines)] // Tauri dependency wiring and command registration share one entry point.
/// Starts the Vibe Flow desktop application.
///
/// # Panics
///
/// Panics when the Tauri runtime cannot be initialized or exits with a fatal error.
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let diagnostics_dir = data_dir.join("diagnostics");
            std::fs::create_dir_all(&diagnostics_dir)?;
            init_tracing(&diagnostics_dir.join("vibe-flow.log"));
            let database_path = data_dir.join("vibe-flow.sqlite3");

            let (repository, recovered_database_path) = tauri::async_runtime::block_on(
                SqliteRepository::connect_with_recovery(&database_path),
            )?;
            let repository = Arc::new(repository);
            let history_publisher = Arc::new(HistoryChannelPublisher::default());
            let query_service = Arc::new(QueryService::new(repository.clone()));
            let history_service = Arc::new(HistoryService::new(
                app.path().home_dir()?,
                default_adapters(),
                repository.clone(),
                history_publisher.clone(),
            ));
            let history_watcher = HistoryWatcher::start(history_service.clone())?;
            let governance_service =
                Arc::new(GovernanceService::new(repository.clone(), diagnostics_dir));
            let analytics_service = Arc::new(AnalyticsService::new(repository.clone()));

            let cleanup_service = governance_service.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(error) = cleanup_service.run_automatic_cleanup().await {
                    tracing::warn!(%error, "failed to run automatic data cleanup");
                }
            });

            app.manage(AppState {
                query_service,
                history_service: history_service.clone(),
                history_publisher,
                governance_service,
                analytics_service,
                recovered_database_path: recovered_database_path
                    .map(|path| path.display().to_string()),
            });
            app.manage(history_watcher);
            tracing::info!(path = %database_path.display(), "application initialized");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::health_check,
            commands::check_for_update,
            commands::install_available_update,
            commands::list_capture_sessions,
            commands::set_session_favorite,
            commands::search_agent_history,
            commands::list_agent_events,
            commands::scan_local_history,
            commands::get_source_scan_statuses,
            commands::subscribe_history_changes,
            commands::get_data_settings,
            commands::update_data_settings,
            commands::get_storage_stats,
            commands::preview_data_cleanup,
            commands::run_data_cleanup,
            commands::create_diagnostic_bundle,
            commands::get_global_insights,
        ])
        .plugin(tauri_plugin_updater::Builder::new().build())
        .run(tauri::generate_context!())
        .expect("failed to run Vibe Flow");
}
