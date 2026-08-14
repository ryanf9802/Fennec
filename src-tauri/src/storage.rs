use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs, io,
    path::{Path, PathBuf},
    sync::Mutex,
};

const DATA_SYNC_VERSION: u8 = 1;

pub struct Storage {
    connection: Mutex<Connection>,
    path: PathBuf,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Frame {
    pub id: i64,
    pub received_at: String,
    pub payload: String,
}

#[derive(Serialize)]
pub struct Checkpoint {
    pub match_id: String,
    pub payload: String,
}

#[derive(Serialize)]
pub struct Tombstone {
    pub match_id: String,
    pub deleted_at: String,
}

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CanonicalState {
    #[serde(default)]
    pub matches: Vec<Value>,
    pub settings: Option<Value>,
    pub profile: Option<Value>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataStatus {
    pub data_sync_version: u8,
    pub instance_id: String,
    pub dataset_generation: i64,
    pub canonical_matches: i64,
    pub pending_frames: i64,
    pub materialized_frame_id: i64,
    pub database_bytes: u64,
    pub last_packet_at: Option<String>,
    pub last_synced_at: Option<String>,
}

fn metadata(connection: &Connection, key: &str) -> rusqlite::Result<Option<String>> {
    connection
        .query_row(
            "SELECT value FROM metadata WHERE key = ?1",
            params![key],
            |row| row.get(0),
        )
        .optional()
}

fn put_metadata(transaction: &Transaction<'_>, key: &str, value: &str) -> rusqlite::Result<()> {
    transaction.execute(
        "INSERT INTO metadata(key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        params![key, value],
    )?;
    Ok(())
}

impl Storage {
    pub fn open(path: &Path) -> io::Result<Self> {
        let mut connection = Connection::open(path).map_err(io::Error::other)?;
        connection
            .execute_batch(
                "PRAGMA journal_mode=WAL;
                 CREATE TABLE IF NOT EXISTS frames (
                   id INTEGER PRIMARY KEY AUTOINCREMENT,
                   received_at TEXT NOT NULL,
                   payload TEXT NOT NULL
                 );
                 CREATE TABLE IF NOT EXISTS checkpoints (
                   match_id TEXT PRIMARY KEY,
                   revision INTEGER NOT NULL,
                   payload TEXT NOT NULL,
                   updated_at TEXT NOT NULL
                 );
                 CREATE TABLE IF NOT EXISTS tombstones (
                   match_id TEXT PRIMARY KEY,
                   deleted_at TEXT NOT NULL
                 );
                 CREATE TABLE IF NOT EXISTS metadata (
                   key TEXT PRIMARY KEY,
                   value TEXT NOT NULL
                 );",
            )
            .map_err(io::Error::other)?;
        let transaction = connection.transaction().map_err(io::Error::other)?;
        if metadata(&transaction, "instance_id")
            .map_err(io::Error::other)?
            .is_none()
        {
            put_metadata(
                &transaction,
                "instance_id",
                &uuid::Uuid::new_v4().simple().to_string(),
            )
            .map_err(io::Error::other)?;
        }
        for (key, value) in [("dataset_generation", "1"), ("materialized_frame_id", "0")] {
            if metadata(&transaction, key)
                .map_err(io::Error::other)?
                .is_none()
            {
                put_metadata(&transaction, key, value).map_err(io::Error::other)?;
            }
        }
        transaction.commit().map_err(io::Error::other)?;
        Ok(Self {
            connection: Mutex::new(connection),
            path: path.to_path_buf(),
        })
    }

    pub fn store_frame(&self, payload: &str) -> io::Result<Frame> {
        let received_at = chrono::Utc::now().to_rfc3339();
        let mut connection = self
            .connection
            .lock()
            .map_err(|_| io::Error::other("storage lock poisoned"))?;
        let transaction = connection.transaction().map_err(io::Error::other)?;
        transaction
            .execute(
                "INSERT INTO frames(received_at, payload) VALUES (?1, ?2)",
                params![received_at, payload],
            )
            .map_err(io::Error::other)?;
        let id = transaction.last_insert_rowid();
        put_metadata(&transaction, "last_packet_at", &received_at).map_err(io::Error::other)?;
        transaction.commit().map_err(io::Error::other)?;
        Ok(Frame {
            id,
            received_at,
            payload: payload.to_string(),
        })
    }

    pub fn frames_after(&self, cursor: i64, limit: usize) -> io::Result<Vec<Frame>> {
        let connection = self
            .connection
            .lock()
            .map_err(|_| io::Error::other("storage lock poisoned"))?;
        let mut statement = connection
            .prepare(
                "SELECT id, received_at, payload FROM frames WHERE id > ?1 ORDER BY id LIMIT ?2",
            )
            .map_err(io::Error::other)?;
        let rows = statement
            .query_map(params![cursor, limit as i64], |row| {
                Ok(Frame {
                    id: row.get(0)?,
                    received_at: row.get(1)?,
                    payload: row.get(2)?,
                })
            })
            .map_err(io::Error::other)?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(io::Error::other)
    }

    pub fn materialized_frame_id(&self) -> io::Result<i64> {
        let connection = self
            .connection
            .lock()
            .map_err(|_| io::Error::other("storage lock poisoned"))?;
        connection
            .query_row(
                "SELECT COALESCE((SELECT CAST(value AS INTEGER) FROM metadata WHERE key = 'materialized_frame_id'), 0)",
                [],
                |row| row.get(0),
            )
            .map_err(io::Error::other)
    }

    pub fn dataset_generation(&self) -> io::Result<i64> {
        let connection = self
            .connection
            .lock()
            .map_err(|_| io::Error::other("storage lock poisoned"))?;
        Ok(metadata(&connection, "dataset_generation")
            .map_err(io::Error::other)?
            .and_then(|value| value.parse().ok())
            .unwrap_or(1))
    }

    fn acknowledge_transaction(transaction: &Transaction<'_>, cursor: i64) -> rusqlite::Result<()> {
        let current = metadata(transaction, "materialized_frame_id")?
            .and_then(|value| value.parse::<i64>().ok())
            .unwrap_or(0);
        if cursor <= current {
            return Ok(());
        }
        put_metadata(transaction, "materialized_frame_id", &cursor.to_string())?;
        put_metadata(
            transaction,
            "last_synced_at",
            &chrono::Utc::now().to_rfc3339(),
        )?;
        transaction.execute("DELETE FROM frames WHERE id <= ?1", params![cursor])?;
        Ok(())
    }

    pub fn acknowledge_frames(&self, cursor: i64) -> io::Result<()> {
        let mut connection = self
            .connection
            .lock()
            .map_err(|_| io::Error::other("storage lock poisoned"))?;
        let transaction = connection.transaction().map_err(io::Error::other)?;
        Self::acknowledge_transaction(&transaction, cursor).map_err(io::Error::other)?;
        transaction.commit().map_err(io::Error::other)
    }

    pub fn save_checkpoint(
        &self,
        match_id: &str,
        revision: i64,
        payload: &str,
        through_frame_id: Option<i64>,
    ) -> io::Result<bool> {
        let mut connection = self
            .connection
            .lock()
            .map_err(|_| io::Error::other("storage lock poisoned"))?;
        let transaction = connection.transaction().map_err(io::Error::other)?;
        transaction.execute(
            "INSERT INTO checkpoints(match_id, revision, payload, updated_at)
             SELECT ?1, ?2, ?3, ?4
             WHERE NOT EXISTS (SELECT 1 FROM tombstones WHERE match_id = ?1)
             ON CONFLICT(match_id) DO UPDATE SET revision=excluded.revision, payload=excluded.payload, updated_at=excluded.updated_at
             WHERE excluded.revision > checkpoints.revision",
            params![match_id, revision, payload, chrono::Utc::now().to_rfc3339()],
        ).map_err(io::Error::other)?;
        let changed = transaction.changes() > 0;
        if let Some(cursor) = through_frame_id {
            Self::acknowledge_transaction(&transaction, cursor).map_err(io::Error::other)?;
        }
        transaction.commit().map_err(io::Error::other)?;
        Ok(changed)
    }

    pub fn checkpoints(&self) -> io::Result<Vec<Checkpoint>> {
        let connection = self
            .connection
            .lock()
            .map_err(|_| io::Error::other("storage lock poisoned"))?;
        let mut statement = connection
            .prepare("SELECT match_id, payload FROM checkpoints ORDER BY updated_at, match_id")
            .map_err(io::Error::other)?;
        let rows = statement
            .query_map([], |row| {
                Ok(Checkpoint {
                    match_id: row.get(0)?,
                    payload: row.get(1)?,
                })
            })
            .map_err(io::Error::other)?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(io::Error::other)
    }

    pub fn save_tombstone(&self, match_id: &str, deleted_at: &str) -> io::Result<()> {
        let connection = self
            .connection
            .lock()
            .map_err(|_| io::Error::other("storage lock poisoned"))?;
        connection
            .execute(
                "DELETE FROM checkpoints WHERE match_id = ?1",
                params![match_id],
            )
            .map_err(io::Error::other)?;
        connection.execute(
            "INSERT INTO tombstones(match_id, deleted_at) VALUES (?1, ?2)
             ON CONFLICT(match_id) DO UPDATE SET deleted_at=MAX(tombstones.deleted_at, excluded.deleted_at)",
            params![match_id, deleted_at],
        ).map_err(io::Error::other)?;
        Ok(())
    }

    pub fn tombstones(&self) -> io::Result<Vec<Tombstone>> {
        let connection = self
            .connection
            .lock()
            .map_err(|_| io::Error::other("storage lock poisoned"))?;
        let mut statement = connection
            .prepare("SELECT match_id, deleted_at FROM tombstones ORDER BY deleted_at, match_id")
            .map_err(io::Error::other)?;
        let rows = statement
            .query_map([], |row| {
                Ok(Tombstone {
                    match_id: row.get(0)?,
                    deleted_at: row.get(1)?,
                })
            })
            .map_err(io::Error::other)?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(io::Error::other)
    }

    pub fn save_preferences(&self, settings: &Value, profile: Option<&Value>) -> io::Result<()> {
        let mut connection = self
            .connection
            .lock()
            .map_err(|_| io::Error::other("storage lock poisoned"))?;
        let transaction = connection.transaction().map_err(io::Error::other)?;
        put_metadata(&transaction, "settings", &settings.to_string()).map_err(io::Error::other)?;
        match profile {
            Some(value) => put_metadata(&transaction, "profile", &value.to_string()),
            None => transaction
                .execute("DELETE FROM metadata WHERE key = 'profile'", [])
                .map(|_| ()),
        }
        .map_err(io::Error::other)?;
        put_metadata(
            &transaction,
            "last_synced_at",
            &chrono::Utc::now().to_rfc3339(),
        )
        .map_err(io::Error::other)?;
        transaction.commit().map_err(io::Error::other)
    }

    pub fn canonical_state(&self) -> io::Result<CanonicalState> {
        let matches = self
            .checkpoints()?
            .into_iter()
            .filter_map(|checkpoint| serde_json::from_str(&checkpoint.payload).ok())
            .collect();
        let connection = self
            .connection
            .lock()
            .map_err(|_| io::Error::other("storage lock poisoned"))?;
        let read_value = |key: &str| -> io::Result<Option<Value>> {
            let value: Option<String> = connection
                .query_row(
                    "SELECT value FROM metadata WHERE key = ?1",
                    params![key],
                    |row| row.get(0),
                )
                .optional()
                .map_err(io::Error::other)?;
            value
                .map(|raw| serde_json::from_str(&raw).map_err(io::Error::other))
                .transpose()
        };
        Ok(CanonicalState {
            matches,
            settings: read_value("settings")?,
            profile: read_value("profile")?,
        })
    }

    pub fn replace_canonical(&self, state: &CanonicalState) -> io::Result<()> {
        self.replace_canonical_with_live_capture(state, false)
    }

    pub fn replace_canonical_preserving_live(
        &self,
        state: &CanonicalState,
    ) -> io::Result<()> {
        self.replace_canonical_with_live_capture(state, true)
    }

    fn replace_canonical_with_live_capture(
        &self,
        state: &CanonicalState,
        preserve_live_capture: bool,
    ) -> io::Result<()> {
        let mut connection = self
            .connection
            .lock()
            .map_err(|_| io::Error::other("storage lock poisoned"))?;
        let transaction = connection.transaction().map_err(io::Error::other)?;
        let preserved = if preserve_live_capture {
            let mut statement = transaction
                .prepare(
                    "SELECT match_id, revision, payload, updated_at
                     FROM checkpoints ORDER BY updated_at DESC",
                )
                .map_err(io::Error::other)?;
            let mut rows = statement.query([]).map_err(io::Error::other)?;
            let mut preserved = None;
            while let Some(row) = rows.next().map_err(io::Error::other)? {
                let payload: String = row.get(2).map_err(io::Error::other)?;
                let is_live = serde_json::from_str::<Value>(&payload)
                    .ok()
                    .and_then(|value| value.get("lifecycle").and_then(Value::as_str).map(str::to_owned))
                    .is_some_and(|lifecycle| lifecycle == "live");
                if is_live {
                    preserved = Some((
                        row.get::<_, String>(0).map_err(io::Error::other)?,
                        row.get::<_, i64>(1).map_err(io::Error::other)?,
                        payload,
                        row.get::<_, String>(3).map_err(io::Error::other)?,
                    ));
                    break;
                }
            }
            preserved
        } else {
            None
        };
        transaction
            .execute("DELETE FROM checkpoints", [])
            .map_err(io::Error::other)?;
        transaction
            .execute("DELETE FROM tombstones", [])
            .map_err(io::Error::other)?;
        if !preserve_live_capture {
            transaction
                .execute("DELETE FROM frames", [])
                .map_err(io::Error::other)?;
        }
        for (revision, value) in state.matches.iter().enumerate() {
            let mut value = value.clone();
            let Some(match_id) = value.get("id").and_then(Value::as_str).map(str::to_owned) else {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidData,
                    "match is missing id",
                ));
            };
            if preserved.as_ref().is_some_and(|(id, ..)| id == &match_id) {
                continue;
            }
            if preserve_live_capture
                && value.get("lifecycle").and_then(Value::as_str) == Some("live")
            {
                if let Some(object) = value.as_object_mut() {
                    object.insert("lifecycle".to_string(), Value::String("incomplete".to_string()));
                    if let Some(last_event_at) = object.get("lastEventAt").cloned() {
                        object.insert("endedAt".to_string(), last_event_at);
                    }
                }
            }
            transaction.execute(
                "INSERT INTO checkpoints(match_id, revision, payload, updated_at) VALUES (?1, ?2, ?3, ?4)",
                params![match_id, revision as i64 + 1, value.to_string(), chrono::Utc::now().to_rfc3339()],
            ).map_err(io::Error::other)?;
        }
        if let Some((match_id, revision, payload, updated_at)) = preserved {
            transaction
                .execute(
                    "INSERT INTO checkpoints(match_id, revision, payload, updated_at) VALUES (?1, ?2, ?3, ?4)",
                    params![match_id, revision, payload, updated_at],
                )
                .map_err(io::Error::other)?;
        }
        match &state.settings {
            Some(settings) => put_metadata(&transaction, "settings", &settings.to_string()),
            None => transaction
                .execute("DELETE FROM metadata WHERE key = 'settings'", [])
                .map(|_| ()),
        }
        .map_err(io::Error::other)?;
        match &state.profile {
            Some(profile) => put_metadata(&transaction, "profile", &profile.to_string()),
            None => transaction
                .execute("DELETE FROM metadata WHERE key = 'profile'", [])
                .map(|_| ()),
        }
        .map_err(io::Error::other)?;
        let generation = metadata(&transaction, "dataset_generation")
            .map_err(io::Error::other)?
            .and_then(|value| value.parse::<i64>().ok())
            .unwrap_or(1)
            + 1;
        put_metadata(&transaction, "dataset_generation", &generation.to_string())
            .map_err(io::Error::other)?;
        if !preserve_live_capture {
            put_metadata(&transaction, "materialized_frame_id", "0")
                .map_err(io::Error::other)?;
        }
        put_metadata(
            &transaction,
            "last_synced_at",
            &chrono::Utc::now().to_rfc3339(),
        )
        .map_err(io::Error::other)?;
        transaction.commit().map_err(io::Error::other)
    }

    pub fn delete_history(&self) -> io::Result<()> {
        let state = self.canonical_state()?;
        self.replace_canonical(&CanonicalState {
            matches: Vec::new(),
            settings: state.settings,
            profile: state.profile,
        })
    }

    pub fn delete_history_preserving_live(&self) -> io::Result<()> {
        let state = self.canonical_state()?;
        self.replace_canonical_preserving_live(&CanonicalState {
            matches: Vec::new(),
            settings: state.settings,
            profile: state.profile,
        })
    }

    pub fn data_status(&self) -> io::Result<DataStatus> {
        let connection = self
            .connection
            .lock()
            .map_err(|_| io::Error::other("storage lock poisoned"))?;
        let value = |key: &str| -> rusqlite::Result<Option<String>> {
            connection
                .query_row(
                    "SELECT value FROM metadata WHERE key = ?1",
                    params![key],
                    |row| row.get(0),
                )
                .optional()
        };
        let count = |table: &str| -> io::Result<i64> {
            connection
                .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
                    row.get(0)
                })
                .map_err(io::Error::other)
        };
        let database_bytes = fs::metadata(&self.path).map(|item| item.len()).unwrap_or(0)
            + fs::metadata(self.path.with_extension("sqlite3-wal"))
                .map(|item| item.len())
                .unwrap_or(0);
        Ok(DataStatus {
            data_sync_version: DATA_SYNC_VERSION,
            instance_id: value("instance_id")
                .map_err(io::Error::other)?
                .unwrap_or_default(),
            dataset_generation: value("dataset_generation")
                .map_err(io::Error::other)?
                .and_then(|item| item.parse().ok())
                .unwrap_or(1),
            canonical_matches: count("checkpoints")?,
            pending_frames: count("frames")?,
            materialized_frame_id: value("materialized_frame_id")
                .map_err(io::Error::other)?
                .and_then(|item| item.parse().ok())
                .unwrap_or(0),
            database_bytes,
            last_packet_at: value("last_packet_at").map_err(io::Error::other)?,
            last_synced_at: value("last_synced_at").map_err(io::Error::other)?,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tombstone_prevents_stale_checkpoint_resurrection() {
        let storage = Storage::open(Path::new(":memory:")).expect("in-memory storage");
        assert!(storage
            .save_checkpoint("match-1", 1, "{\"id\":\"match-1\"}", None)
            .expect("initial checkpoint"));
        storage
            .save_tombstone("match-1", "2026-08-08T00:00:00Z")
            .expect("tombstone");
        assert!(!storage
            .save_checkpoint("match-1", 2, "{\"id\":\"match-1\"}", None)
            .expect("rejected checkpoint"));
        assert!(storage.checkpoints().expect("checkpoints").is_empty());
        assert_eq!(storage.tombstones().expect("tombstones").len(), 1);
    }

    #[test]
    fn frames_remain_until_the_browser_acknowledges_a_durable_checkpoint() {
        let storage = Storage::open(Path::new(":memory:")).expect("in-memory storage");
        let first = storage.store_frame("one").expect("first frame");
        let second = storage.store_frame("two").expect("second frame");
        assert_eq!(storage.data_status().expect("status").pending_frames, 2);
        storage
            .save_checkpoint("match-1", 1, "{\"id\":\"match-1\"}", Some(first.id))
            .expect("checkpoint");
        assert_eq!(storage.data_status().expect("status").pending_frames, 1);
        storage
            .acknowledge_frames(second.id)
            .expect("training frame acknowledgment");
        assert_eq!(storage.data_status().expect("status").pending_frames, 0);
    }

    #[test]
    fn replacing_history_is_atomic_and_advances_the_dataset_generation() {
        let storage = Storage::open(Path::new(":memory:")).expect("in-memory storage");
        let generation = storage.data_status().expect("status").dataset_generation;
        storage
            .replace_canonical(&CanonicalState {
                matches: vec![serde_json::json!({"id": "restored"})],
                settings: Some(serde_json::json!({"theme": "dark"})),
                profile: Some(serde_json::json!({"primaryId": "Steam|1|0"})),
            })
            .expect("restore");
        let state = storage.canonical_state().expect("canonical state");
        assert_eq!(state.matches.len(), 1);
        assert_eq!(
            storage.data_status().expect("status").dataset_generation,
            generation + 1
        );
    }

    #[test]
    fn live_restore_preserves_capture_and_archives_imported_live_matches() {
        let storage = Storage::open(Path::new(":memory:")).expect("in-memory storage");
        let materialized = storage.store_frame("materialized").expect("first frame");
        storage
            .save_checkpoint(
                "current",
                10,
                r#"{"id":"current","lifecycle":"live","lastEventAt":"2026-08-13T12:00:00Z"}"#,
                Some(materialized.id),
            )
            .expect("live checkpoint");
        storage
            .save_checkpoint(
                "old",
                1,
                r#"{"id":"old","lifecycle":"completed"}"#,
                None,
            )
            .expect("old checkpoint");
        storage.store_frame("pending").expect("pending frame");
        let generation = storage.data_status().expect("status").dataset_generation;

        storage
            .replace_canonical_preserving_live(&CanonicalState {
                matches: vec![
                    serde_json::json!({"id": "restored", "lifecycle": "completed"}),
                    serde_json::json!({
                        "id": "backup-live",
                        "lifecycle": "live",
                        "lastEventAt": "2026-08-12T12:00:00Z"
                    }),
                ],
                settings: None,
                profile: None,
            })
            .expect("live restore");

        let state = storage.canonical_state().expect("canonical state");
        let current = state
            .matches
            .iter()
            .find(|value| value["id"] == "current")
            .expect("current match");
        let imported_live = state
            .matches
            .iter()
            .find(|value| value["id"] == "backup-live")
            .expect("imported live match");
        assert_eq!(current["lifecycle"], "live");
        assert_eq!(imported_live["lifecycle"], "incomplete");
        assert_eq!(imported_live["endedAt"], "2026-08-12T12:00:00Z");
        assert!(state.matches.iter().all(|value| value["id"] != "old"));
        let status = storage.data_status().expect("status");
        assert_eq!(status.pending_frames, 1);
        assert_eq!(status.materialized_frame_id, materialized.id);
        assert_eq!(status.dataset_generation, generation + 1);
    }

    #[test]
    fn live_delete_removes_every_match_except_the_current_capture() {
        let storage = Storage::open(Path::new(":memory:")).expect("in-memory storage");
        storage
            .save_checkpoint(
                "current",
                10,
                r#"{"id":"current","lifecycle":"live"}"#,
                None,
            )
            .expect("live checkpoint");
        storage
            .save_checkpoint(
                "incomplete",
                1,
                r#"{"id":"incomplete","lifecycle":"incomplete"}"#,
                None,
            )
            .expect("incomplete checkpoint");
        storage
            .save_checkpoint(
                "completed",
                1,
                r#"{"id":"completed","lifecycle":"completed"}"#,
                None,
            )
            .expect("completed checkpoint");
        storage.store_frame("pending").expect("pending frame");

        storage
            .delete_history_preserving_live()
            .expect("live delete");

        let state = storage.canonical_state().expect("canonical state");
        assert_eq!(state.matches.len(), 1);
        assert_eq!(state.matches[0]["id"], "current");
        assert_eq!(storage.data_status().expect("status").pending_frames, 1);
    }
}
