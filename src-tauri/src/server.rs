use crate::{
    storage::{Frame, Storage},
    store::{self, StoreKind},
};
use axum::{
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
    sync::{Arc, RwLock},
    time::Duration,
};
use tokio::sync::broadcast;
use tower_http::cors::CorsLayer;

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
}

pub struct AppState {
    pub token: String,
    pub storage: Storage,
    pub health: RwLock<RuntimeHealth>,
    pub frames: broadcast::Sender<Arc<Frame>>,
    pub replicas: broadcast::Sender<String>,
}

#[derive(Deserialize)]
struct WsQuery {
    token: String,
    cursor: Option<i64>,
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ClientMessage {
    Checkpoint {
        match_id: String,
        revision: i64,
        payload: serde_json::Value,
    },
    Tombstone {
        match_id: String,
        deleted_at: String,
    },
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

async fn status(State(state): State<Arc<AppState>>, headers: HeaderMap) -> Response {
    if !authorized(&headers, &state) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let mut value = state.health.read().expect("health lock").clone();
    value.paired = true;
    Json(value).into_response()
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
        && (command == "enable-dashboard-auto-open"
            || command == "disable-dashboard-auto-open")
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
    ws.on_upgrade(move |socket| serve_socket(socket, state, query.cursor.unwrap_or(0)))
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

async fn serve_socket(socket: WebSocket, state: Arc<AppState>, cursor: i64) {
    let (mut sender, mut receiver) = socket.split();
    let mut frames = state.frames.subscribe();
    let mut replicas = state.replicas.subscribe();
    if let Ok(checkpoints) = state.storage.checkpoints() {
        for checkpoint in checkpoints {
            let Ok(match_value) = serde_json::from_str::<serde_json::Value>(&checkpoint.payload)
            else {
                continue;
            };
            let value = serde_json::json!({ "type": "checkpoint", "match": match_value });
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
    let mut replay_cursor = cursor;
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
                    Ok(ClientMessage::Checkpoint { match_id, revision, payload }) => {
                        if state.storage.save_checkpoint(&match_id, revision, &payload.to_string()).unwrap_or(false) {
                            let value = serde_json::json!({ "type": "checkpoint", "match": payload });
                            let _ = state.replicas.send(value.to_string());
                        }
                    }
                    Ok(ClientMessage::Tombstone { match_id, deleted_at }) => {
                        if state.storage.save_tombstone(&match_id, &deleted_at).is_ok() {
                            let value = serde_json::json!({ "type": "tombstone", "matchId": match_id, "deletedAt": deleted_at });
                            let _ = state.replicas.send(value.to_string());
                        }
                    }
                    Err(_) => {}
                }
            }
        }
    }
}

pub async fn run(state: Arc<AppState>) -> std::io::Result<()> {
    let allowed = [
        HeaderValue::from_static("https://app.fennec.gg"),
        HeaderValue::from_static("http://localhost:5173"),
        HeaderValue::from_static("http://localhost:5174"),
        HeaderValue::from_static("http://127.0.0.1:5173"),
        HeaderValue::from_static("http://127.0.0.1:5174"),
    ];
    let cors = CorsLayer::new()
        .allow_origin(allowed)
        .allow_methods([Method::GET, Method::POST])
        .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE]);
    let app = Router::new()
        .route("/permission-probe", get(permission_probe))
        .route("/health", get(health))
        .route("/status", get(status))
        .route("/commands/{command}", post(command))
        .route("/ws", get(websocket))
        .layer(cors)
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
