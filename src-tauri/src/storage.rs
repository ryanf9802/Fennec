use rusqlite::{params, Connection};
use serde::Serialize;
use std::{io, path::Path, sync::Mutex};

pub struct Storage(Mutex<Connection>);

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

impl Storage {
    pub fn open(path: &Path) -> io::Result<Self> {
        let connection = Connection::open(path).map_err(io::Error::other)?;
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
             );",
            )
            .map_err(io::Error::other)?;
        Ok(Self(Mutex::new(connection)))
    }

    pub fn store_frame(&self, payload: &str) -> io::Result<Frame> {
        let received_at = chrono::Utc::now().to_rfc3339();
        let connection = self
            .0
            .lock()
            .map_err(|_| io::Error::other("storage lock poisoned"))?;
        connection
            .execute(
                "INSERT INTO frames(received_at, payload) VALUES (?1, ?2)",
                params![received_at, payload],
            )
            .map_err(io::Error::other)?;
        let id = connection.last_insert_rowid();
        if id % 1_000 == 0 {
            connection
                .execute(
                    "DELETE FROM frames WHERE received_at < datetime('now', '-30 days')",
                    [],
                )
                .map_err(io::Error::other)?;
        }
        Ok(Frame {
            id,
            received_at,
            payload: payload.to_string(),
        })
    }

    pub fn frames_after(&self, cursor: i64, limit: usize) -> io::Result<Vec<Frame>> {
        let connection = self
            .0
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

    pub fn save_checkpoint(
        &self,
        match_id: &str,
        revision: i64,
        payload: &str,
    ) -> io::Result<bool> {
        let connection = self
            .0
            .lock()
            .map_err(|_| io::Error::other("storage lock poisoned"))?;
        connection.execute(
            "INSERT INTO checkpoints(match_id, revision, payload, updated_at)
             SELECT ?1, ?2, ?3, ?4
             WHERE NOT EXISTS (SELECT 1 FROM tombstones WHERE match_id = ?1)
             ON CONFLICT(match_id) DO UPDATE SET revision=excluded.revision, payload=excluded.payload, updated_at=excluded.updated_at
             WHERE excluded.revision >= checkpoints.revision",
            params![match_id, revision, payload, chrono::Utc::now().to_rfc3339()],
        ).map_err(io::Error::other)?;
        Ok(connection.changes() > 0)
    }

    pub fn checkpoints(&self) -> io::Result<Vec<Checkpoint>> {
        let connection = self
            .0
            .lock()
            .map_err(|_| io::Error::other("storage lock poisoned"))?;
        let mut statement = connection
            .prepare("SELECT match_id, payload FROM checkpoints ORDER BY updated_at")
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
            .0
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
            .0
            .lock()
            .map_err(|_| io::Error::other("storage lock poisoned"))?;
        let mut statement = connection.prepare("SELECT match_id, deleted_at FROM tombstones WHERE deleted_at >= datetime('now', '-30 days')").map_err(io::Error::other)?;
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
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tombstone_prevents_stale_checkpoint_resurrection() {
        let storage = Storage::open(Path::new(":memory:")).expect("in-memory storage");
        assert!(storage
            .save_checkpoint("match-1", 1, "{\"id\":\"match-1\"}")
            .expect("initial checkpoint"));
        storage
            .save_tombstone("match-1", "2026-08-08T00:00:00Z")
            .expect("tombstone");
        assert!(!storage
            .save_checkpoint("match-1", 2, "{\"id\":\"match-1\"}")
            .expect("rejected checkpoint"));
        assert!(storage.checkpoints().expect("checkpoints").is_empty());
    }
}
