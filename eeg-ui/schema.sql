-- ════════════════════════════════════════════════════════════
-- EEG DEV TESTING — Database Schema
-- Run this entire script in your Supabase SQL Editor ONCE
-- before deploying to Vercel.
-- ════════════════════════════════════════════════════════════

-- 1. User role enum
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'user', 'co-admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 1b. If the enum already existed from a previous run, make sure 'co-admin' is present.
DO $$ BEGIN
  ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'co-admin';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Users table
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          user_role NOT NULL DEFAULT 'user',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. EEG sessions table
CREATE TABLE IF NOT EXISTS eeg_sessions (
  id               SERIAL PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name             TEXT NOT NULL DEFAULT 'New Session',
  start_time       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_time         TIMESTAMPTZ,
  duration_seconds INTEGER,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Session notes (one per session)
CREATE TABLE IF NOT EXISTS session_notes (
  id         SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES eeg_sessions(id) ON DELETE CASCADE UNIQUE,
  content    TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Session store table (for express-session cookies)
CREATE TABLE IF NOT EXISTS user_sessions (
  sid    VARCHAR NOT NULL,
  sess   JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL,
  CONSTRAINT session_pkey PRIMARY KEY (sid)
);
CREATE INDEX IF NOT EXISTS idx_session_expire ON user_sessions (expire);

-- 6. EEG epochs — per-epoch EEG data stored during live sessions
--    Each epoch is one ~2-second inference window.
--    This table powers the admin session analytics view.
--    NOTE: table name must be `eeg_epochs` — this is what api/server.js queries.
CREATE TABLE IF NOT EXISTS eeg_epochs (
  id                  SERIAL PRIMARY KEY,
  session_id          INTEGER NOT NULL REFERENCES eeg_sessions(id) ON DELETE CASCADE,
  epoch_num           INTEGER NOT NULL,               -- 1-based counter within session
  recorded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  elapsed_seconds     NUMERIC(10,2),                  -- seconds since session start

  -- Chitta Bhumi
  chitta_bhumi        TEXT,                           -- Kshipta | Vikshipta | Ekagra | Niruddha
  chitta_confidence   TEXT,                           -- e.g. "82.4%"
  contemplative_depth TEXT,                           -- Surface | Emerging | Deep | Profound

  -- Swara Nadi
  swara               TEXT,                           -- Ida | Pingala | Sushumna
  swara_confidence    TEXT,

  -- Relative band powers (0..1)
  delta_power         NUMERIC(8,6),
  theta_power         NUMERIC(8,6),
  alpha_power         NUMERIC(8,6),
  beta_power          NUMERIC(8,6),
  gamma_power         NUMERIC(8,6),

  -- Trigunas (0..1, sum to 1)
  sattva              NUMERIC(8,6),
  rajas               NUMERIC(8,6),
  tamas               NUMERIC(8,6),
  guna_label          TEXT,                           -- Sattvic | Rajasic | Tamasic | Balanced

  -- Tattva flags (JSON array of strings)
  tattva_flags        JSONB NOT NULL DEFAULT '[]',

  -- Vitals (from BLE pulse oximeter / demo mode)
  blood_oxygen        NUMERIC(5,2),                   -- SpO2 %
  heart_rate          NUMERIC(5,2),                    -- BPM

  -- Inner Texture / deep-state features (v3) — vṛtti index, complexity, aperiodic.
  -- Previously computed by the analyser but never persisted, so Replay/Analyze
  -- always showed them empty even though the live epoch had real values.
  vritti_index         NUMERIC(6,4),
  nirodha_state         TEXT,
  complexity_lziv        NUMERIC(6,4),
  complexity_higuchi_fd  NUMERIC(6,4),
  complexity_sample_entropy NUMERIC(6,4),
  complexity_perm_entropy   NUMERIC(6,4),
  aperiodic_exponent     NUMERIC(6,4),
  aperiodic_offset       NUMERIC(6,4)
);

ALTER TABLE eeg_epochs ADD COLUMN IF NOT EXISTS vritti_index NUMERIC(6,4);
ALTER TABLE eeg_epochs ADD COLUMN IF NOT EXISTS nirodha_state TEXT;
ALTER TABLE eeg_epochs ADD COLUMN IF NOT EXISTS complexity_lziv NUMERIC(6,4);
ALTER TABLE eeg_epochs ADD COLUMN IF NOT EXISTS complexity_higuchi_fd NUMERIC(6,4);
ALTER TABLE eeg_epochs ADD COLUMN IF NOT EXISTS complexity_sample_entropy NUMERIC(6,4);
ALTER TABLE eeg_epochs ADD COLUMN IF NOT EXISTS complexity_perm_entropy NUMERIC(6,4);
ALTER TABLE eeg_epochs ADD COLUMN IF NOT EXISTS aperiodic_exponent NUMERIC(6,4);
ALTER TABLE eeg_epochs ADD COLUMN IF NOT EXISTS aperiodic_offset NUMERIC(6,4);

CREATE INDEX IF NOT EXISTS idx_epoch_session ON eeg_epochs (session_id, epoch_num);

-- 6b. Migration safety net: if an older deployment already created the table
--     under the previous name/shape, bring it up to the current shape.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'session_epochs')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'eeg_epochs') THEN
    ALTER TABLE session_epochs RENAME TO eeg_epochs;
  END IF;
END $$;

ALTER TABLE eeg_epochs ADD COLUMN IF NOT EXISTS blood_oxygen NUMERIC(5,2);
ALTER TABLE eeg_epochs ADD COLUMN IF NOT EXISTS heart_rate NUMERIC(5,2);

-- ════════════════════════════════════════════════════════════
-- 7. Clients (cohort) — each client belongs to one owning teacher
--    (users.id). Mirrors the eeg_sessions.user_id ownership model.
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS clients (
  id               SERIAL PRIMARY KEY,
  owner_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  age              INTEGER,                        -- nullable
  email            TEXT,                           -- optional contact
  status           TEXT,                           -- plateau | progress | issue | new (app-validated)
  goal             TEXT,                           -- practice goal / focus
  protocol         TEXT,                           -- current prescribed protocol
  protocol_since   DATE,                           -- when the current protocol began
  practicing_since DATE,                           -- drives "N months practicing"
  notes            TEXT NOT NULL DEFAULT '',
  archived         BOOLEAN NOT NULL DEFAULT FALSE, -- soft-hide from cohort grid
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_clients_owner ON clients (owner_id);

-- 8. Associate a recording to a client (nullable — sessions may be unassigned).
--    ON DELETE SET NULL so deleting a client never destroys EEG history.
ALTER TABLE eeg_sessions
  ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_client ON eeg_sessions (client_id);

-- The contemplative practice performed during the sitting (e.g. Dhyāna, Japa,
-- Nāḍī Śodhana). Stored as text (a copy of the chosen activity_types.name) so a
-- session keeps its label even if the type is later renamed or removed.
ALTER TABLE eeg_sessions
  ADD COLUMN IF NOT EXISTS activity TEXT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Activity types — the admin-managed vocabulary of contemplative practices that
-- populates the session "practice" picker. Global (not per-instructor). Only the
-- superadmin (role 'admin') may edit; everyone reads it to start a sitting.
CREATE TABLE IF NOT EXISTS activity_types (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed a starting vocabulary (idempotent — skips any name that already exists).
INSERT INTO activity_types (name, sort_order) VALUES
  ('Dhyāna (meditation)',            10),
  ('Dhāraṇā (concentration)',        20),
  ('Japa / Mantra',                  30),
  ('Trāṭaka (gazing)',               40),
  ('Nāḍī Śodhana (alternate-nostril)', 50),
  ('Kapālabhāti',                    60),
  ('Bhastrikā',                      70),
  ('Ujjāyī',                         80),
  ('So’ham / Ajapa',                 90),
  ('Ānāpāna (breath awareness)',    100),
  ('Yoga Nidrā',                    110),
  ('Śavāsana / rest',               120),
  ('Open awareness',                130)
ON CONFLICT (name) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Teacher/Student live view (2026-07-11)
--    A client record may be LINKED to a login account (a remote student who
--    streams from their own machine). The link is the instructor's standing,
--    visible grant to watch that account's live sittings — no per-sitting code.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_clients_user ON clients (user_id);

-- Presence registry: which accounts are streaming live right now (one per user).
-- net_session_id is the .NET analyser session the browser is publishing into.
CREATE TABLE IF NOT EXISTS live_streams (
  user_id        INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  net_session_id TEXT NOT NULL,
  started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
