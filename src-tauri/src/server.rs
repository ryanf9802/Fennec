use crate::{
    storage::{CanonicalState, DataStatus, Frame, Storage},
    store::{self, StoreKind},
};
use axum::{
    extract::DefaultBodyLimit,
    extract::{
        ws::{Message, WebSocket},
        Path, Query, State, WebSocketUpgrade,
    },
    http::{header, HeaderMap, HeaderValue, Method, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::{
    collections::VecDeque,
    sync::{Arc, RwLock},
    time::{Duration, Instant},
};
use tokio::sync::broadcast;
use tower_http::cors::{AllowOrigin, CorsLayer};

const RESOURCE_SAMPLE_INTERVAL: Duration = Duration::from_secs(5);
const RESOURCE_WINDOW: Duration = Duration::from_secs(60);

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum UpdateStatus {
    #[default]
    Current,
    Checking,
    Downloading,
    WaitingForIdle,
    Installing,
    Retrying,
}

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeHealth {
    pub version: String,
    pub protocol_version: u8,
    pub paired: bool,
    pub store: Option<String>,
    pub stores: Vec<String>,
    pub configured_stores: Vec<String>,
    pub game_running: bool,
    pub feed_connected: bool,
    pub last_packet_at: Option<String>,
    pub launch_on_startup: bool,
    pub open_dashboard_on_game_start: bool,
    pub update_status: UpdateStatus,
    pub available_update_version: Option<String>,
    pub last_update_check_at: Option<String>,
    pub live_data_actions: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CompanionStatus {
    #[serde(flatten)]
    health: RuntimeHealth,
    #[serde(flatten)]
    data: DataStatus,
    resource_usage: Option<ResourceUsage>,
}

#[derive(Serialize)]
struct PairingToken {
    token: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ResourceUsage {
    cpu_percent: f32,
    memory_bytes: u64,
    recent_peak_cpu_percent: f32,
    recent_peak_memory_bytes: u64,
    recent_window_seconds: u64,
    sampled_at: String,
}

#[derive(Clone, Copy)]
struct ResourceSample {
    at: Instant,
    cpu_percent: f32,
    memory_bytes: u64,
}

#[derive(Default)]
struct ResourceWindow {
    samples: VecDeque<ResourceSample>,
}

impl ResourceWindow {
    fn record(&mut self, sample: ResourceSample) -> ResourceUsage {
        self.samples.push_back(sample);
        while self
            .samples
            .front()
            .is_some_and(|oldest| sample.at.duration_since(oldest.at) > RESOURCE_WINDOW)
        {
            self.samples.pop_front();
        }
        ResourceUsage {
            cpu_percent: sample.cpu_percent,
            memory_bytes: sample.memory_bytes,
            recent_peak_cpu_percent: self
                .samples
                .iter()
                .map(|value| value.cpu_percent)
                .fold(0.0, f32::max),
            recent_peak_memory_bytes: self
                .samples
                .iter()
                .map(|value| value.memory_bytes)
                .max()
                .unwrap_or(sample.memory_bytes),
            recent_window_seconds: RESOURCE_WINDOW.as_secs(),
            sampled_at: chrono::Utc::now().to_rfc3339(),
        }
    }
}

struct ResourceMonitor {
    system: sysinfo::System,
    pid: sysinfo::Pid,
    logical_cpu_count: usize,
    window: ResourceWindow,
}

impl ResourceMonitor {
    fn new() -> Option<Self> {
        let pid = sysinfo::get_current_pid().ok()?;
        let mut system = sysinfo::System::new();
        system.refresh_processes(sysinfo::ProcessesToUpdate::Some(&[pid]), true);
        Some(Self {
            system,
            pid,
            logical_cpu_count: std::thread::available_parallelism()
                .map(|count| count.get())
                .unwrap_or(1),
            window: ResourceWindow::default(),
        })
    }

    fn sample(&mut self) -> Option<ResourceUsage> {
        self.system
            .refresh_processes(sysinfo::ProcessesToUpdate::Some(&[self.pid]), true);
        let process = self.system.process(self.pid)?;
        Some(self.window.record(ResourceSample {
            at: Instant::now(),
            cpu_percent: normalize_process_cpu(process.cpu_usage(), self.logical_cpu_count),
            memory_bytes: process.memory(),
        }))
    }
}

pub struct AppState {
    pub token: String,
    pub storage: Storage,
    pub health: RwLock<RuntimeHealth>,
    pub(crate) resource_usage: RwLock<Option<ResourceUsage>>,
    pub frames: broadcast::Sender<Arc<Frame>>,
    pub replicas: broadcast::Sender<String>,
}

fn normalize_process_cpu(cpu_percent: f32, logical_cpu_count: usize) -> f32 {
    if !cpu_percent.is_finite() {
        return 0.0;
    }
    (cpu_percent / logical_cpu_count.max(1) as f32).clamp(0.0, 100.0)
}

#[derive(Deserialize)]
struct WsQuery {
    token: String,
    cursor: Option<i64>,
    data_sync: Option<u8>,
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ClientMessage {
    Checkpoint {
        match_id: String,
        revision: i64,
        payload: serde_json::Value,
        through_frame_id: Option<i64>,
        dataset_generation: Option<i64>,
    },
    Tombstone {
        match_id: String,
        deleted_at: String,
        dataset_generation: Option<i64>,
    },
    AcknowledgeFrame {
        frame_id: i64,
        dataset_generation: Option<i64>,
    },
    Preferences {
        settings: serde_json::Value,
        profile: Option<serde_json::Value>,
        dataset_generation: Option<i64>,
    },
}

fn accepts_generation(state: &AppState, durable_sync: bool, generation: Option<i64>) -> bool {
    !durable_sync
        || matches!(
            (state.storage.dataset_generation(), generation),
            (Ok(expected), Some(actual)) if expected == actual
        )
}

fn authorized(headers: &HeaderMap, state: &AppState) -> bool {
    let expected = format!("Bearer {}", state.token);
    headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        == Some(expected.as_str())
}

async fn permission_probe() -> StatusCode {
    StatusCode::NO_CONTENT
}

async fn health(State(state): State<Arc<AppState>>) -> Json<RuntimeHealth> {
    let mut value = state.health.read().expect("health lock").clone();
    value.paired = false;
    Json(value)
}

fn pairing_origin_allowed(headers: &HeaderMap) -> bool {
    headers
        .get(header::ORIGIN)
        .and_then(|value| value.to_str().ok())
        .is_some_and(crate::is_trusted_web_origin)
}

async fn pair(State(state): State<Arc<AppState>>, headers: HeaderMap) -> Response {
    if !pairing_origin_allowed(&headers) {
        return StatusCode::FORBIDDEN.into_response();
    }
    pairing_token_response(state.token.clone())
}

fn pairing_token_response(token: String) -> Response {
    let mut response = Json(PairingToken { token }).into_response();
    response.headers_mut().insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("no-store"),
    );
    response
}

async fn status(State(state): State<Arc<AppState>>, headers: HeaderMap) -> Response {
    if !authorized(&headers, &state) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let mut health = state.health.read().expect("health lock").clone();
    health.paired = true;
    match state.storage.data_status() {
        Ok(data) => Json(CompanionStatus {
            health,
            data,
            resource_usage: state
                .resource_usage
                .read()
                .expect("resource lock")
                .clone(),
        })
        .into_response(),
        Err(error) => (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()).into_response(),
    }
}

async fn data_snapshot(State(state): State<Arc<AppState>>, headers: HeaderMap) -> Response {
    if !authorized(&headers, &state) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    match state.storage.canonical_state() {
        Ok(value) => Json(value).into_response(),
        Err(error) => (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()).into_response(),
    }
}

async fn restore_data(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(value): Json<CanonicalState>,
) -> Response {
    if !authorized(&headers, &state) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let game_running = state.health.read().expect("health lock").game_running;
    let result = if game_running {
        state.storage.replace_canonical_preserving_live(&value)
    } else {
        state.storage.replace_canonical(&value)
    };
    match result {
        Ok(()) => {
            let _ = state
                .replicas
                .send(serde_json::json!({ "type": "resync" }).to_string());
            StatusCode::NO_CONTENT.into_response()
        }
        Err(error) => (StatusCode::BAD_REQUEST, error.to_string()).into_response(),
    }
}

async fn delete_history(State(state): State<Arc<AppState>>, headers: HeaderMap) -> Response {
    if !authorized(&headers, &state) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let game_running = state.health.read().expect("health lock").game_running;
    let result = if game_running {
        state.storage.delete_history_preserving_live()
    } else {
        state.storage.delete_history()
    };
    match result {
        Ok(()) => {
            let _ = state
                .replicas
                .send(serde_json::json!({ "type": "resync" }).to_string());
            StatusCode::NO_CONTENT.into_response()
        }
        Err(error) => (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()).into_response(),
    }
}

async fn command(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(command): Path<String>,
) -> Response {
    if !authorized(&headers, &state) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let result = match command.as_str() {
        "enable-startup" => store::set_launch_on_startup(true),
        "disable-startup" => store::set_launch_on_startup(false),
        "enable-dashboard-auto-open" => store::set_open_dashboard_on_game_start(true),
        "disable-dashboard-auto-open" => store::set_open_dashboard_on_game_start(false),
        _ => {
            let kind = if command.ends_with("steam") {
                Some(StoreKind::Steam)
            } else if command.ends_with("epic") {
                Some(StoreKind::Epic)
            } else {
                None
            };
            match kind {
                Some(kind) if command.starts_with("create-") => {
                    store::create_shortcut(kind).map(|_| ())
                }
                Some(kind) if command.starts_with("configure-") => store::discover()
                    .into_iter()
                    .find(|item| item.kind == kind)
                    .ok_or_else(|| {
                        std::io::Error::new(
                            std::io::ErrorKind::NotFound,
                            "store installation not found",
                        )
                    })
                    .and_then(|item| crate::configure_with_elevation(&item.config_file)),
                _ => Err(std::io::Error::new(
                    std::io::ErrorKind::InvalidInput,
                    "unknown command",
                )),
            }
        }
    };
    if result.is_ok() && (command == "enable-startup" || command == "disable-startup") {
        state.health.write().expect("health lock").launch_on_startup = command == "enable-startup";
    }
    if result.is_ok()
        && (command == "enable-dashboard-auto-open" || command == "disable-dashboard-auto-open")
    {
        state
            .health
            .write()
            .expect("health lock")
            .open_dashboard_on_game_start = command == "enable-dashboard-auto-open";
    }
    if result.is_ok() && command.starts_with("configure-") {
        state.health.write().expect("health lock").configured_stores = store::configured_stores();
    }
    match result {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(error) => (StatusCode::BAD_REQUEST, error.to_string()).into_response(),
    }
}

async fn websocket(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
    Query(query): Query<WsQuery>,
) -> Response {
    if query.token != state.token {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    ws.on_upgrade(move |socket| {
        serve_socket(
            socket,
            state,
            query.cursor.unwrap_or(0),
            query.data_sync == Some(1),
        )
    })
}

async fn send_frame(
    socket: &mut futures_util::stream::SplitSink<WebSocket, Message>,
    frame: &Frame,
) -> bool {
    let value = serde_json::json!({ "type": "frame", "id": frame.id, "receivedAt": frame.received_at, "payload": frame.payload });
    socket
        .send(Message::Text(value.to_string().into()))
        .await
        .is_ok()
}

async fn serve_socket(socket: WebSocket, state: Arc<AppState>, cursor: i64, durable_sync: bool) {
    let (mut sender, mut receiver) = socket.split();
    let mut frames = state.frames.subscribe();
    let mut replicas = state.replicas.subscribe();
    let canonical = state.storage.canonical_state().unwrap_or_default();
    let status = state.storage.data_status().ok();
    if durable_sync {
        let start = serde_json::json!({
            "type": "sync_start",
            "totalMatches": canonical.matches.len(),
            "settings": canonical.settings,
            "profile": canonical.profile,
            "status": status,
        });
        if sender
            .send(Message::Text(start.to_string().into()))
            .await
            .is_err()
        {
            return;
        }
    }
    if let Ok(checkpoints) = state.storage.checkpoints() {
        let total = checkpoints.len();
        for (index, checkpoint) in checkpoints.into_iter().enumerate() {
            let Ok(match_value) = serde_json::from_str::<serde_json::Value>(&checkpoint.payload)
            else {
                continue;
            };
            let value = serde_json::json!({ "type": "checkpoint", "match": match_value, "completed": index + 1, "total": total });
            if sender
                .send(Message::Text(value.to_string().into()))
                .await
                .is_err()
            {
                return;
            }
        }
    }
    if let Ok(tombstones) = state.storage.tombstones() {
        for tombstone in tombstones {
            let value = serde_json::json!({ "type": "tombstone", "matchId": tombstone.match_id, "deletedAt": tombstone.deleted_at });
            if sender
                .send(Message::Text(value.to_string().into()))
                .await
                .is_err()
            {
                return;
            }
        }
    }
    if durable_sync {
        if sender
            .send(Message::Text(
                serde_json::json!({ "type": "sync_complete" })
                    .to_string()
                    .into(),
            ))
            .await
            .is_err()
        {
            return;
        }
    }
    let durable_cursor = state.storage.materialized_frame_id().unwrap_or(0);
    let mut replay_cursor = if durable_sync { durable_cursor } else { cursor };
    loop {
        let Ok(backlog) = state.storage.frames_after(replay_cursor, 10_000) else {
            break;
        };
        let backlog_len = backlog.len();
        for frame in backlog {
            replay_cursor = frame.id;
            if !send_frame(&mut sender, &frame).await {
                return;
            }
        }
        if backlog_len < 10_000 {
            break;
        }
    }
    loop {
        tokio::select! {
            next = frames.recv() => {
                match next {
                    Ok(frame) if frame.id <= replay_cursor => {}
                    Ok(frame) if !send_frame(&mut sender, &frame).await => return,
                    Err(_) => return,
                    _ => {}
                }
            }
            next = replicas.recv() => {
                match next {
                    Ok(value) => {
                        if sender.send(Message::Text(value.into())).await.is_err() {
                            return;
                        }
                    }
                    Err(_) => return,
                }
            }
            next = receiver.next() => {
                let Some(Ok(Message::Text(text))) = next else { return };
                match serde_json::from_str(&text) {
                    Ok(ClientMessage::Checkpoint { match_id, revision, payload, through_frame_id, dataset_generation }) => {
                        if accepts_generation(&state, durable_sync, dataset_generation)
                            && state.storage.save_checkpoint(&match_id, revision, &payload.to_string(), through_frame_id).unwrap_or(false) {
                            let value = serde_json::json!({ "type": "checkpoint", "match": payload });
                            let _ = state.replicas.send(value.to_string());
                        }
                    }
                    Ok(ClientMessage::Tombstone { match_id, deleted_at, dataset_generation }) => {
                        if accepts_generation(&state, durable_sync, dataset_generation)
                            && state.storage.save_tombstone(&match_id, &deleted_at).is_ok() {
                            let value = serde_json::json!({ "type": "tombstone", "matchId": match_id, "deletedAt": deleted_at });
                            let _ = state.replicas.send(value.to_string());
                        }
                    }
                    Ok(ClientMessage::AcknowledgeFrame { frame_id, dataset_generation }) => {
                        if accepts_generation(&state, durable_sync, dataset_generation) {
                            let _ = state.storage.acknowledge_frames(frame_id);
                        }
                    }
                    Ok(ClientMessage::Preferences { settings, profile, dataset_generation }) => {
                        if accepts_generation(&state, durable_sync, dataset_generation)
                            && state.storage.save_preferences(&settings, profile.as_ref()).is_ok() {
                            let value = serde_json::json!({ "type": "preferences", "settings": settings, "profile": profile });
                            let _ = state.replicas.send(value.to_string());
                        }
                    }
                    Err(_) => {}
                }
            }
        }
    }
}

fn companion_cors() -> CorsLayer {
    CorsLayer::new()
        .allow_origin(AllowOrigin::predicate(|origin: &HeaderValue, _| {
            origin
                .to_str()
                .is_ok_and(crate::is_trusted_web_origin)
        }))
        .allow_methods([Method::GET, Method::POST])
        .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE])
        .allow_private_network(true)
}

pub async fn run(state: Arc<AppState>) -> std::io::Result<()> {
    let app = Router::new()
        .route("/permission-probe", get(permission_probe))
        .route("/health", get(health))
        .route("/pair", post(pair))
        .route("/status", get(status))
        .route("/commands/{command}", post(command))
        .route("/data/snapshot", get(data_snapshot))
        .route("/data/restore", post(restore_data))
        .route("/data/delete-history", post(delete_history))
        .route("/ws", get(websocket))
        .layer(DefaultBodyLimit::max(100 * 1024 * 1024))
        .layer(companion_cors())
        .with_state(state);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:49125").await?;
    axum::serve(listener, app)
        .await
        .map_err(std::io::Error::other)
}

pub async fn collect_stats(state: Arc<AppState>) {
    loop {
        {
            let mut health = state.health.write().expect("health lock");
            health.feed_connected = false;
        }
        match tokio_tungstenite::connect_async("ws://127.0.0.1:49124").await {
            Ok((mut socket, _)) => {
                state.health.write().expect("health lock").feed_connected = true;
                state.health.write().expect("health lock").game_running = true;
                while let Some(Ok(message)) = socket.next().await {
                    let payload = match message {
                        tokio_tungstenite::tungstenite::Message::Text(value) => value.to_string(),
                        tokio_tungstenite::tungstenite::Message::Binary(value) => {
                            String::from_utf8_lossy(&value).to_string()
                        }
                        _ => continue,
                    };
                    if let Ok(frame) = state.storage.store_frame(&payload) {
                        let mut health = state.health.write().expect("health lock");
                        health.last_packet_at = Some(frame.received_at.clone());
                        drop(health);
                        let _ = state.frames.send(Arc::new(frame));
                    }
                }
                let mut health = state.health.write().expect("health lock");
                health.feed_connected = false;
                health.game_running = false;
            }
            Err(_) => {}
        }
        tokio::time::sleep(Duration::from_secs(2)).await;
    }
}

pub async fn monitor_resources(state: Arc<AppState>) {
    let Some(mut monitor) = ResourceMonitor::new() else {
        return;
    };
    loop {
        tokio::time::sleep(RESOURCE_SAMPLE_INTERVAL).await;
        *state.resource_usage.write().expect("resource lock") = monitor.sample();
    }
}

#[cfg(test)]
mod tests {
    use super::{
        companion_cors, normalize_process_cpu, pairing_origin_allowed, pairing_token_response,
        permission_probe, ResourceSample, ResourceWindow,
    };
    use axum::{
        http::{header, HeaderMap, HeaderValue},
        routing::get,
        Router,
    };
    use std::time::{Duration, Instant};
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    #[test]
    fn normalizes_process_cpu_to_the_whole_machine() {
        assert_eq!(normalize_process_cpu(180.0, 8), 22.5);
        assert_eq!(normalize_process_cpu(180.0, 0), 100.0);
        assert_eq!(normalize_process_cpu(f32::NAN, 8), 0.0);
    }

    #[test]
    fn keeps_current_usage_and_rolling_one_minute_peaks() {
        let started = Instant::now();
        let mut window = ResourceWindow::default();
        window.record(ResourceSample {
            at: started,
            cpu_percent: 0.8,
            memory_bytes: 30,
        });
        let peak = window.record(ResourceSample {
            at: started + Duration::from_secs(50),
            cpu_percent: 0.2,
            memory_bytes: 20,
        });
        assert_eq!(peak.cpu_percent, 0.2);
        assert_eq!(peak.memory_bytes, 20);
        assert_eq!(peak.recent_peak_cpu_percent, 0.8);
        assert_eq!(peak.recent_peak_memory_bytes, 30);
        assert_eq!(peak.recent_window_seconds, 60);

        let expired = window.record(ResourceSample {
            at: started + Duration::from_secs(61),
            cpu_percent: 0.1,
            memory_bytes: 10,
        });
        assert_eq!(expired.recent_peak_cpu_percent, 0.2);
        assert_eq!(expired.recent_peak_memory_bytes, 20);
    }

    #[test]
    fn pairing_requires_a_trusted_browser_origin() {
        let mut headers = HeaderMap::new();
        assert!(!pairing_origin_allowed(&headers));

        headers.insert(
            header::ORIGIN,
            HeaderValue::from_static("https://attacker.example"),
        );
        assert!(!pairing_origin_allowed(&headers));

        headers.insert(
            header::ORIGIN,
            HeaderValue::from_static("https://app.fennec.gg"),
        );
        assert!(pairing_origin_allowed(&headers));
    }

    #[test]
    fn pairing_token_response_cannot_be_cached() {
        let response = pairing_token_response("secret".to_string());
        assert_eq!(response.headers()[header::CACHE_CONTROL], "no-store");
    }

    #[tokio::test]
    async fn private_network_preflights_require_a_trusted_origin() {
        let app = Router::new()
            .route("/permission-probe", get(permission_probe))
            .layer(companion_cors());
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind test companion server");
        let address = listener.local_addr().expect("read test server address");
        let server = tokio::spawn(async move {
            axum::serve(listener, app)
                .await
                .expect("serve test companion requests");
        });

        async fn preflight(address: std::net::SocketAddr, origin: &str) -> String {
            let mut stream = tokio::net::TcpStream::connect(address)
                .await
                .expect("connect to test companion server");
            let request = format!(
                "OPTIONS /permission-probe HTTP/1.1\r\nHost: {address}\r\nOrigin: {origin}\r\nAccess-Control-Request-Method: GET\r\nAccess-Control-Request-Private-Network: true\r\nConnection: close\r\n\r\n"
            );
            stream
                .write_all(request.as_bytes())
                .await
                .expect("write preflight request");
            let mut response = String::new();
            stream
                .read_to_string(&mut response)
                .await
                .expect("read preflight response");
            response.to_ascii_lowercase()
        }

        let trusted = preflight(address, "https://app.fennec.gg").await;
        assert!(trusted.contains(
            "access-control-allow-origin: https://app.fennec.gg"
        ));
        assert!(trusted.contains("access-control-allow-private-network: true"));

        let untrusted = preflight(address, "https://attacker.example").await;
        assert!(!untrusted.contains("access-control-allow-origin:"));

        server.abort();
    }
}
