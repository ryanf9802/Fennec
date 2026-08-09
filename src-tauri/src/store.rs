use serde::{Deserialize, Serialize};
use std::{
    fs, io,
    path::{Path, PathBuf},
    process::Command,
    time::Duration,
};

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum StoreKind {
    Steam,
    Epic,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoreInstall {
    pub kind: StoreKind,
    pub root: PathBuf,
    pub executable: PathBuf,
    pub config_file: PathBuf,
    pub launch_id: String,
}

fn select_config(root: &Path) -> Option<PathBuf> {
    let config = root.join("TAGame").join("Config");
    let override_file = config.join("TAStatsAPI.ini");
    let default_file = config.join("DefaultStatsAPI.ini");
    override_file
        .exists()
        .then_some(override_file)
        .or_else(|| default_file.exists().then_some(default_file))
}

#[cfg(windows)]
fn steam_roots() -> Vec<PathBuf> {
    use winreg::{enums::HKEY_CURRENT_USER, RegKey};
    let mut roots = Vec::new();
    if let Ok(key) = RegKey::predef(HKEY_CURRENT_USER).open_subkey("Software\\Valve\\Steam") {
        if let Ok(path) = key.get_value::<String, _>("SteamPath") {
            roots.push(PathBuf::from(path));
        }
    }
    if let Some(program_files) = std::env::var_os("ProgramFiles(x86)") {
        roots.push(PathBuf::from(program_files).join("Steam"));
    }
    roots.sort();
    roots.dedup();
    roots
}

#[cfg(not(windows))]
fn steam_roots() -> Vec<PathBuf> {
    Vec::new()
}

fn unescape_vdf_path(value: &str) -> PathBuf {
    PathBuf::from(value.replace("\\\\", "\\"))
}

fn steam_libraries(root: &Path) -> Vec<PathBuf> {
    let mut libraries = vec![root.to_path_buf()];
    let file = root.join("steamapps").join("libraryfolders.vdf");
    if let Ok(text) = fs::read_to_string(file) {
        for line in text.lines() {
            let trimmed = line.trim();
            if !trimmed.starts_with("\"path\"") {
                continue;
            }
            let values: Vec<&str> = trimmed.split('"').collect();
            if let Some(value) = values.get(3) {
                libraries.push(unescape_vdf_path(value));
            }
        }
    }
    libraries.sort();
    libraries.dedup();
    libraries
}

fn discover_steam() -> Vec<StoreInstall> {
    let mut installs = Vec::new();
    for steam in steam_roots() {
        for library in steam_libraries(&steam) {
            let manifest = library.join("steamapps").join("appmanifest_252950.acf");
            let Ok(text) = fs::read_to_string(manifest) else {
                continue;
            };
            let installdir = text
                .lines()
                .find_map(|line| {
                    let values: Vec<&str> = line.trim().split('"').collect();
                    (values.get(1) == Some(&"installdir"))
                        .then(|| values.get(3).copied())
                        .flatten()
                })
                .unwrap_or("rocketleague");
            let root = library.join("steamapps").join("common").join(installdir);
            let executable = root.join("Binaries").join("Win64").join("RocketLeague.exe");
            if let Some(config_file) = select_config(&root).filter(|_| executable.exists()) {
                installs.push(StoreInstall {
                    kind: StoreKind::Steam,
                    root,
                    executable,
                    config_file,
                    launch_id: "252950".into(),
                });
            }
        }
    }
    installs
}

fn discover_epic() -> Vec<StoreInstall> {
    let Some(program_data) = std::env::var_os("ProgramData") else {
        return Vec::new();
    };
    let manifests = PathBuf::from(program_data)
        .join("Epic")
        .join("EpicGamesLauncher")
        .join("Data")
        .join("Manifests");
    let Ok(entries) = fs::read_dir(manifests) else {
        return Vec::new();
    };
    entries
        .flatten()
        .filter_map(|entry| {
            let text = fs::read_to_string(entry.path()).ok()?;
            let value: serde_json::Value = serde_json::from_str(&text).ok()?;
            let name = value
                .get("MainGameAppName")
                .or_else(|| value.get("AppName"))?
                .as_str()?;
            let display = value
                .get("DisplayName")
                .and_then(serde_json::Value::as_str)
                .unwrap_or_default()
                .to_ascii_lowercase();
            if name != "Sugar" && !display.contains("rocket league") {
                return None;
            }
            let root = PathBuf::from(value.get("InstallLocation")?.as_str()?);
            let executable = root.join("Binaries").join("Win64").join("RocketLeague.exe");
            let config_file = select_config(&root)?;
            executable.exists().then_some(StoreInstall {
                kind: StoreKind::Epic,
                root,
                executable,
                config_file,
                launch_id: name.to_string(),
            })
        })
        .collect()
}

pub fn discover() -> Vec<StoreInstall> {
    let mut installs = discover_steam();
    installs.extend(discover_epic());
    installs
}

pub fn configured_stores() -> Vec<String> {
    let mut stores: Vec<String> = discover()
        .into_iter()
        .filter(|install| {
            fs::read_to_string(&install.config_file)
                .is_ok_and(|text| crate::config::configured(&text))
        })
        .map(|install| match install.kind {
            StoreKind::Steam => "steam".to_string(),
            StoreKind::Epic => "epic".to_string(),
        })
        .collect();
    stores.sort();
    stores.dedup();
    stores
}

pub fn launch(install: &StoreInstall) -> io::Result<()> {
    match install.kind {
        StoreKind::Steam => {
            let steam = steam_roots()
                .into_iter()
                .map(|root| root.join("steam.exe"))
                .find(|path| path.exists())
                .ok_or_else(|| {
                    io::Error::new(io::ErrorKind::NotFound, "Steam launcher not found")
                })?;
            Command::new(steam)
                .args(["-applaunch", &install.launch_id])
                .spawn()?;
        }
        StoreKind::Epic => {
            let uri = format!(
                "com.epicgames.launcher://apps/{}?action=launch&silent=true",
                install.launch_id
            );
            Command::new("cmd")
                .args(["/C", "start", "", &uri])
                .spawn()?;
        }
    }
    Ok(())
}

pub async fn wait_for_game_lifecycle(executable: PathBuf) -> io::Result<()> {
    let started = tokio::time::Instant::now();
    loop {
        if process_running(&executable) {
            break;
        }
        if started.elapsed() > Duration::from_secs(180) {
            return Err(io::Error::new(
                io::ErrorKind::TimedOut,
                "Rocket League did not start within three minutes",
            ));
        }
        tokio::time::sleep(Duration::from_secs(2)).await;
    }
    loop {
        if !process_running(&executable) {
            break;
        }
        tokio::time::sleep(Duration::from_secs(3)).await;
    }
    Ok(())
}

fn process_running(executable: &Path) -> bool {
    let mut system = sysinfo::System::new_all();
    system.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    system.processes().values().any(|process| {
        process.exe().is_some_and(|path| {
            path.to_string_lossy()
                .eq_ignore_ascii_case(&executable.to_string_lossy())
        })
    })
}

pub fn create_shortcut(kind: StoreKind) -> io::Result<PathBuf> {
    let profile = std::env::var_os("USERPROFILE")
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "Windows user profile not found"))?;
    let label = match kind {
        StoreKind::Steam => "Steam",
        StoreKind::Epic => "Epic",
    };
    let slug = label.to_ascii_lowercase();
    let path = PathBuf::from(profile)
        .join("Desktop")
        .join(format!("Rocket League ({label}) with Fennec.url"));
    fs::write(
        &path,
        format!("[InternetShortcut]\r\nURL=fennec://launch/{slug}\r\n"),
    )?;
    Ok(path)
}

#[cfg(windows)]
pub fn launch_on_startup() -> bool {
    use winreg::{enums::HKEY_CURRENT_USER, RegKey};
    RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Run")
        .and_then(|key| key.get_value::<String, _>("Fennec Companion"))
        .is_ok()
}

#[cfg(not(windows))]
pub fn launch_on_startup() -> bool {
    false
}

#[cfg(windows)]
pub fn set_launch_on_startup(enabled: bool) -> io::Result<()> {
    use winreg::{enums::HKEY_CURRENT_USER, RegKey};
    let (key, _) = RegKey::predef(HKEY_CURRENT_USER)
        .create_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Run")?;
    if enabled {
        let executable = std::env::current_exe()?;
        key.set_value(
            "Fennec Companion",
            &format!("\"{}\"", executable.to_string_lossy()),
        )
    } else {
        match key.delete_value("Fennec Companion") {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error),
        }
    }
}

#[cfg(not(windows))]
pub fn set_launch_on_startup(_enabled: bool) -> io::Result<()> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "Windows startup is only available on Windows",
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_escaped_vdf_path() {
        assert_eq!(unescape_vdf_path(r"D:\\Games"), PathBuf::from(r"D:\Games"));
    }
}
