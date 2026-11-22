-- Pose Hero AI: players, scores (SQLite)
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS players (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pin_hash   TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS scores (
  id         INTEGER PRIMARY KEY,
  player_id  INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  mode       TEXT NOT NULL,
  score      INTEGER NOT NULL,
  reps       INTEGER NOT NULL DEFAULT 0,
  step_acc   INTEGER,
  duration_s INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS scores_mode_time ON scores(mode, created_at);
CREATE INDEX IF NOT EXISTS scores_player ON scores(player_id);
