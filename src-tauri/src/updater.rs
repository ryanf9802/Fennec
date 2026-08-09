use crate::server::{AppState, UpdateStatus};
use chrono::Utc;
use std::{sync::Arc, time::Duration};
use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

const STARTUP_DELAY: Duration = Duration::from_secs(10);
const CHECK_INTERVAL: Duration = Duration::from_secs(60 * 60);
const IDLE_WINDOW: Duration = Duration::from_secs(15);
const IDLE_POLL_INTERVAL: Duration = Duration::from_secs(1);

#[derive(Default)]
struct IdleWindow {
    idle_since: Option<Duration>,
}

impl IdleWindow {
    fn observe(&mut self, idle: bool, now: Duration) -> bool {
        if !idle {
            self.idle_since = None;
            return false;
        }
        let idle_since = self.idle_since.get_or_insert(now);
        now.saturating_sub(*idle_since) >= IDLE_WINDOW
    }
}

fn is_idle(state: &AppState) -> bool {
    let health = state.health.read().expect("health lock");
    !health.game_running && !health.feed_connected
}

fn set_status(state: &AppState, status: UpdateStatus, version: Option<String>) {
    let mut health = state.health.write().expect("health lock");
    health.update_status = status;
    health.available_update_version = version;
}

async fn wait_until_idle(state: &AppState) {
    let started = tokio::time::Instant::now();
    let mut window = IdleWindow::default();
    loop {
        if window.observe(is_idle(state), started.elapsed()) && is_idle(state) {
            return;
        }
        tokio::time::sleep(IDLE_POLL_INTERVAL).await;
    }
}

async fn check_and_install(app: &AppHandle, state: &AppState) -> Result<(), String> {
    set_status(state, UpdateStatus::Checking, None);
    state
        .health
        .write()
        .expect("health lock")
        .last_update_check_at = Some(Utc::now().to_rfc3339());
    let updater = app.updater().map_err(|error| error.to_string())?;
    let update = updater.check().await.map_err(|error| error.to_string())?;
    let Some(update) = update else {
        set_status(state, UpdateStatus::Current, None);
        return Ok(());
    };

    let version = Some(update.version.clone());
    set_status(state, UpdateStatus::Downloading, version.clone());
    let bytes = update
        .download(|_, _| {}, || {})
        .await
        .map_err(|error| error.to_string())?;
    set_status(state, UpdateStatus::WaitingForIdle, version.clone());
    wait_until_idle(state).await;
    set_status(state, UpdateStatus::Installing, version);
    update.install(bytes).map_err(|error| error.to_string())
}

pub fn spawn(app: AppHandle, state: Arc<AppState>) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(STARTUP_DELAY).await;
        loop {
            if let Err(error) = check_and_install(&app, &state).await {
                eprintln!("Fennec companion automatic update failed: {error}");
                let version = state
                    .health
                    .read()
                    .expect("health lock")
                    .available_update_version
                    .clone();
                set_status(&state, UpdateStatus::Retrying, version);
            }
            tokio::time::sleep(CHECK_INTERVAL).await;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::{Duration, IdleWindow, IDLE_WINDOW};

    #[test]
    fn requires_a_continuous_idle_window() {
        let mut window = IdleWindow::default();
        assert!(!window.observe(true, Duration::ZERO));
        assert!(!window.observe(true, IDLE_WINDOW - Duration::from_secs(1)));
        assert!(window.observe(true, IDLE_WINDOW));
    }

    #[test]
    fn activity_resets_the_idle_window() {
        let mut window = IdleWindow::default();
        assert!(!window.observe(true, Duration::ZERO));
        assert!(!window.observe(false, IDLE_WINDOW));
        assert!(!window.observe(true, IDLE_WINDOW + Duration::from_secs(1)));
        assert!(!window.observe(true, IDLE_WINDOW.saturating_mul(2),));
        assert!(window.observe(true, IDLE_WINDOW.saturating_mul(2) + Duration::from_secs(1),));
    }
}
