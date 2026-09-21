-- Woop: esquema minimo. Dos dispositivos por par, sin cuentas ni contrasenas.

DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS pending_codes;
DROP TABLE IF EXISTS devices;
DROP TABLE IF EXISTS pairs;

CREATE TABLE pairs (
  id         TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

CREATE TABLE devices (
  token        TEXT PRIMARY KEY,   -- 32 bytes hex: la unica credencial
  pair_id      TEXT NOT NULL,
  slot         INTEGER NOT NULL,   -- 0 = quien genero el codigo, 1 = quien lo reclamo
  platform     TEXT,               -- 'android' | 'web'
  label        TEXT,
  fcm_token    TEXT,               -- Android
  push_sub     TEXT,               -- suscripcion Web Push (JSON) del iPhone
  battery      INTEGER,
  charging     INTEGER,
  battery_at   INTEGER,
  status_level INTEGER,            -- 1..5, NULL = sin estado activo
  status_at    INTEGER,
  created_at   INTEGER NOT NULL,
  FOREIGN KEY (pair_id) REFERENCES pairs(id)
);
CREATE INDEX idx_devices_pair ON devices(pair_id);
CREATE UNIQUE INDEX idx_devices_pair_slot ON devices(pair_id, slot);

CREATE TABLE pending_codes (
  code       TEXT PRIMARY KEY,     -- 6 digitos
  pair_id    TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE events (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  pair_id   TEXT NOT NULL,
  from_slot INTEGER NOT NULL,
  type      TEXT NOT NULL,         -- 'status' | 'woop' | 'missclick'
  level     INTEGER,
  at        INTEGER NOT NULL
);
CREATE INDEX idx_events_pair_at ON events(pair_id, at DESC);
