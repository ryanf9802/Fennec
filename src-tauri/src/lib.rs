mod config;
mod server;
mod storage;
mod store;

use server::{AppState, RuntimeHealth};
use std::{
    fs,
    process::Command,
    sync::{Arc, RwLock},
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager,
};
use tauri_plugin_deep_link::DeepLinkExt;

pub fn configure_path(path: &std::path::Path) -> std::io::Result<()> {
    config::configure_file(path)
}

pub(crate) fn configure_with_elevation(path: &std::path::Path) -> std::io::Result<()> {
    match config::configure_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => {
            #[cfg(windows)]
            {
                let executable = std::env::current_exe()?;
                let executable_arg = executable.to_string_lossy().into_owned();
                let path_arg = path.to_string_lossy().into_owned();
                let status = Command::new("powershell.exe")
                    .args([
                        "-NoProfile",
                        "-NonInteractive",
                        "-Command",
                        "& { $p = Start-Process -FilePath $args[0] -ArgumentList @('--configure-file', $args[1]) -Verb RunAs -Wait -PassThru; exit $p.ExitCode }",
                        &executable_arg,
                        &path_arg,
                    ])
                    .status()?;
                if status.success() {
                    Ok(())
                } else {
                    Err(std::io::Error::other(
                        "elevated configuration was cancelled or failed",
                    ))
                }
            }
            #[cfg(not(windows))]
            Err(error)
        }
        Err(error) => Err(error),
    }
}

const PRODUCTION_SETUP_URL: &str = "https://app.fennec.gg/setup";
const PAIRING_RETURN_URLS: [&str; 5] = [
    PRODUCTION_SETUP_URL,
    "http://localhost:5173/setup",
    "http://localhost:5174/setup",
    "http://127.0.0.1:5173/setup",
    "http://127.0.0.1:5174/setup",
];

fn pairing_url(return_to: Option<&str>, token: &str) -> String {
    let return_to = return_to
        .filter(|candidate| PAIRING_RETURN_URLS.contains(candidate))
        .unwrap_or(PRODUCTION_SETUP_URL);
    format!("{return_to}#companion={token}")
}

fn open_fennec(token: &str, return_to: Option<&str>) {
    let url = pairing_url(return_to, token);
    #[cfg(windows)]
    let _ = Command::new("cmd").args(["/C", "start", "", &url]).spawn();
    #[cfg(not(windows))]
    let _ = Command::new("xdg-open").arg(url).spawn();
}

fn launch_from_url(app: tauri::AppHandle, value: &url::Url) {
    let requested = value.path().trim_matches('/');
    let install = store::discover().into_iter().find(|item| {
        matches!(
            (&item.kind, requested),
            (store::StoreKind::Steam, "steam") | (store::StoreKind::Epic, "epic")
        )
    });
    let Some(install) = install else { return };
    tauri::async_runtime::spawn(async move {
        if store::launch(&install).is_ok()
            && store::wait_for_game_lifecycle(install.executable)
                .await
                .is_ok()
        {
            tokio::time::sleep(std::time::Duration::from_secs(3)).await;
            app.exit(0);
        }
    });
}

fn handle_urls(
    app: tauri::AppHandle,
    urls: impl IntoIterator<Item = url::Url>,
    token: Option<&str>,
) {
    for value in urls {
        if value.scheme() == "fennec" && value.host_str() == Some("launch") {
            launch_from_url(app.clone(), &value);
        } else if value.scheme() == "fennec" && value.host_str() == Some("open") {
            let return_to = value
                .query_pairs()
                .find_map(|(key, value)| (key == "return_to").then(|| value.into_owned()));
            if let Some(token) = token {
                open_fennec(token, return_to.as_deref());
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            let urls = args
                .into_iter()
                .filter_map(|arg| url::Url::parse(&arg).ok());
            let token = app
                .try_state::<Arc<AppState>>()
                .map(|state| state.token.clone());
            handle_urls(app.clone(), urls, token.as_deref());
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let directory = app.path().app_data_dir()?;
            fs::create_dir_all(&directory)?;
            let token_path = directory.join("pairing-token");
            let token = fs::read_to_string(&token_path).unwrap_or_else(|_| {
                let value = uuid::Uuid::new_v4().simple().to_string();
                let _ = fs::write(&token_path, &value);
                value
            });
            let installs = store::discover();
            let mut stores: Vec<String> = installs
                .iter()
                .map(|item| match item.kind {
                    store::StoreKind::Steam => "steam".to_string(),
                    store::StoreKind::Epic => "epic".to_string(),
                })
                .collect();
            stores.sort();
            stores.dedup();
            let selected = (stores.len() == 1).then(|| stores[0].clone());
            let (frames, _) = tokio::sync::broadcast::channel(512);
            let (replicas, _) = tokio::sync::broadcast::channel(128);
            let state = Arc::new(AppState {
                token: token.clone(),
                storage: storage::Storage::open(&directory.join("fennec.sqlite3"))?,
                health: RwLock::new(RuntimeHealth {
                    version: env!("CARGO_PKG_VERSION").to_string(),
                    protocol_version: 1,
                    paired: false,
                    store: selected,
                    stores,
                    configured_stores: store::configured_stores(),
                    game_running: false,
                    feed_connected: false,
                    last_packet_at: None,
                    launch_on_startup: store::launch_on_startup(),
                }),
                frames,
                replicas,
            });
            app.manage(state.clone());

            let server_state = state.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(error) = server::run(server_state).await {
                    eprintln!("Fennec companion server stopped: {error}");
                }
            });
            tauri::async_runtime::spawn(server::collect_stats(state));

            let open = MenuItem::with_id(app, "open", "Open Fennec", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit companion", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &quit])?;
            let menu_token = token.clone();
            TrayIconBuilder::new()
                .icon(app.default_window_icon().expect("bundle icon").clone())
                .tooltip("Fennec Companion")
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "open" => open_fennec(&menu_token, None),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            if let Some(urls) = app.deep_link().get_current()? {
                handle_urls(app.handle().clone(), urls, Some(&token));
            }
            let deep_link_handle = app.handle().clone();
            let deep_link_token = token.clone();
            app.deep_link().on_open_url(move |event| {
                handle_urls(
                    deep_link_handle.clone(),
                    event.urls().to_vec(),
                    Some(&deep_link_token),
                );
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Fennec Companion");
}

#[cfg(test)]
mod tests {
    use super::{pairing_url, PRODUCTION_SETUP_URL};

    #[test]
    fn pairing_accepts_known_local_development_urls() {
        assert_eq!(
            pairing_url(Some("http://localhost:5173/setup"), "abc123"),
            "http://localhost:5173/setup#companion=abc123"
        );
    }

    #[test]
    fn pairing_rejects_untrusted_return_urls() {
        assert_eq!(
            pairing_url(Some("https://attacker.example/setup"), "abc123"),
            format!("{PRODUCTION_SETUP_URL}#companion=abc123")
        );
    }
}
