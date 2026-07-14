'use strict';

const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const connectPg = require('connect-pg-simple');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

// ── Database pool ─────────────────────────────────────────────────────────────
// Supabase (prod) requires SSL; a local Postgres (Docker) does not and will reject it.
// Detect a local DB (or PGSSL=disable) and turn SSL off only then.
const dbUrl = process.env.DATABASE_URL || '';
const isLocalDb = /localhost|127\.0\.0\.1/.test(dbUrl) || process.env.PGSSL === 'disable';
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocalDb ? false : { rejectUnauthorized: false }, // required for Supabase
  max: 5,
});

// ── Session store ─────────────────────────────────────────────────────────────
const PgSession = connectPg(session);

// ── Express app ───────────────────────────────────────────────────────────────
const app = express();

app.set('trust proxy', 1); // trust Vercel's proxy for secure cookies

// ── CORS — allow Vercel preview and production origins ───────────────────────
app.use((req, res, next) => {
  const origin = req.headers.origin || '';
  const allowedPatterns = [
    /\.vercel\.app$/,
    /^https?:\/\/localhost(:\d+)?$/,
    /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  ];
  // Also allow any explicitly configured origins (comma-separated env var)
  const extraOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);

  const isAllowed =
    !origin ||
    allowedPatterns.some(p => p.test(origin)) ||
    extraOrigins.includes(origin) ||
    extraOrigins.includes('*');

  // Only set CORS headers when the browser sends an Origin header.
  // Never pair Access-Control-Allow-Credentials: true with a wildcard origin.
  if (origin && isAllowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);  // must be explicit, not '*'
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    store: new PgSession({
      pool,
      tableName: 'user_sessions',
      createTableIfMissing: true, // FIX: was false — sessions silently failed when table missing
    }),
    secret: process.env.SESSION_SECRET || 'eeg-dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    },
  })
);

// ── Auto-seed admin user ──────────────────────────────────────────────────────
// Reads the initial password from ADMIN_SEED_PASSWORD env var.
// Set this in Vercel / your .env. If the env var is missing the seed is skipped safely.
async function seedAdmin() {
  const seedPw = process.env.ADMIN_SEED_PASSWORD;
  if (!seedPw) {
    console.log('[Seed] ADMIN_SEED_PASSWORD not set — skipping admin seed.');
    return;
  }
  try {
    const { rows } = await pool.query("SELECT id FROM users WHERE username = 'admin' LIMIT 1");
    if (!rows.length) {
      const hash = await bcrypt.hash(seedPw, 12);
      await pool.query(
        "INSERT INTO users (username, password_hash, role) VALUES ('admin', $1, 'admin')",
        [hash]
      );
      console.log('[Seed] Admin user created.');
    }
  } catch (e) {
    console.error('[Seed] Error:', e.message);
  }
}
seedAdmin();

// ── Middleware ────────────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (!req.session?.userId) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session?.userId) return res.status(401).json({ error: 'Not authenticated' });
  if (req.session.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

function requireElevated(req, res, next) {
  if (!req.session?.userId) return res.status(401).json({ error: 'Not authenticated' });
  if (req.session.role !== 'admin' && req.session.role !== 'co-admin')
    return res.status(403).json({ error: 'Insufficient permissions' });
  next();
}

const VALID_ROLES = ['user', 'admin', 'co-admin'];

// ── Helpers ───────────────────────────────────────────────────────────────────
const mapUser = r => ({
  id: r.id,
  username: r.username,
  role: r.role,
  createdAt: r.created_at,
});

const mapSession = r => ({
  id: r.id,
  userId: r.user_id,
  username: r.username || null,
  name: r.name,
  clientId: r.client_id ?? null,
  activity: r.activity ?? null,
  startTime: r.start_time,
  endTime: r.end_time || null,
  duration: r.duration_seconds || null,
});

const VALID_CLIENT_STATUSES = ['plateau', 'progress', 'issue', 'new'];

const mapClient = r => ({
  id: r.id,
  ownerId: r.owner_id,
  name: r.name,
  age: r.age ?? null,
  email: r.email ?? null,
  status: r.status ?? null,
  goal: r.goal ?? null,
  protocol: r.protocol ?? null,
  protocolSince: r.protocol_since ?? null,
  practicingSince: r.practicing_since ?? null,
  notes: r.notes ?? '',
  archived: r.archived,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  sessionsCount: r.sessions_count != null ? Number(r.sessions_count) : undefined,
  lastSessionAt: r.last_session_at ?? undefined,
  // Remote-student link: the login account whose live sittings this client's
  // owner may watch (Teacher/Student view). Null for in-person clients.
  linkedUserId: r.user_id ?? null,
  linkedUsername: r.linked_username ?? null,
});

const mapEpoch = r => ({
  id: r.id,
  epochNum: r.epoch_num,
  recordedAt: r.recorded_at,
  elapsedSeconds: r.elapsed_seconds ? parseFloat(r.elapsed_seconds) : null,
  chittaBhumi: r.chitta_bhumi,
  chittaConfidence: r.chitta_confidence,
  contemplativeDepth: r.contemplative_depth,
  swara: r.swara,
  swaraConfidence: r.swara_confidence,
  bands: {
    delta: r.delta_power ? parseFloat(r.delta_power) : null,
    theta: r.theta_power ? parseFloat(r.theta_power) : null,
    alpha: r.alpha_power ? parseFloat(r.alpha_power) : null,
    beta: r.beta_power ? parseFloat(r.beta_power) : null,
    gamma: r.gamma_power ? parseFloat(r.gamma_power) : null,
  },
  gunas: {
    sattva: r.sattva ? parseFloat(r.sattva) : null,
    rajas: r.rajas ? parseFloat(r.rajas) : null,
    tamas: r.tamas ? parseFloat(r.tamas) : null,
    label: r.guna_label,
  },
  tattvaFlags: r.tattva_flags || [],
  bloodOxygen: r.blood_oxygen != null ? parseFloat(r.blood_oxygen) : null,
  heartRate: r.heart_rate != null ? parseFloat(r.heart_rate) : null,
  vrittiIndex: r.vritti_index != null ? parseFloat(r.vritti_index) : null,
  nirodhaState: r.nirodha_state || null,
  complexity: r.complexity_lziv != null ? {
    lziv: parseFloat(r.complexity_lziv),
    higuchiFd: parseFloat(r.complexity_higuchi_fd),
    sampleEntropy: parseFloat(r.complexity_sample_entropy),
    permEntropy: parseFloat(r.complexity_perm_entropy),
  } : null,
  aperiodic: r.aperiodic_exponent != null ? {
    exponent: parseFloat(r.aperiodic_exponent),
    offset: parseFloat(r.aperiodic_offset),
  } : null,
  probabilities: r.probabilities || null,
  corroboration: r.corroboration || null,
  faa: r.faa != null ? parseFloat(r.faa) : null,
  plv: r.plv != null ? parseFloat(r.plv) : null,
  lowBetaPower: r.low_beta_power != null ? parseFloat(r.low_beta_power) : null,
  highBetaPower: r.high_beta_power != null ? parseFloat(r.high_beta_power) : null,
  dataQuality: r.data_quality || null,
  swaraNote: r.swara_note || null,
  latencyMs: r.latency_ms != null ? parseFloat(r.latency_ms) : null,
});

// ── Router ────────────────────────────────────────────────────────────────────
const router = express.Router();

// ── Auth ──────────────────────────────────────────────────────────────────────
router.get('/auth/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, username, role FROM users WHERE id = $1', [req.session.userId]);
    if (!rows.length) return res.status(401).json({ error: 'User not found' });
    res.json(mapUser(rows[0]));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    const { rows } = await pool.query('SELECT * FROM users WHERE username = $1 LIMIT 1', [username]);
    if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' });

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    req.session.userId = user.id;
    req.session.role = user.role;
    res.json(mapUser(user));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// ── Live-streaming bridge: mint a .NET backend JWT for the SignalR hub ──────────
// (Teacher/Student view.) EEG-UI authenticates against Express (cookie session);
// the .NET analyser/hub speaks JWT. We broker a token by mapping each Express user
// to a deterministic "shadow" .NET account (login, provisioning it on first use)
// and returning the .NET-issued JWT for the browser's accessTokenFactory. The .NET
// backend stays the identity authority for its own sessions/watch-tokens — Express
// never holds the signing key.
const NET_BACKEND_URL = (process.env.NET_BACKEND_URL || 'https://eeg-backend-5.onrender.com').replace(/\/$/, '');
const NET_SHADOW_SECRET = process.env.NET_SHADOW_SECRET || process.env.SESSION_SECRET || 'eeg-dev-secret-change-me';
// Optional: when the .NET backend has Auth__BridgeKey set, /auth/* require this
// header. Matching it here keeps the broker working; unset in dev → no-op.
const NET_BRIDGE_KEY = process.env.NET_BRIDGE_KEY || '';

function shadowCredentials(userId) {
  // Unguessable, stable per Express user — never stored on the Express side.
  const password = crypto.createHmac('sha256', NET_SHADOW_SECRET).update('watch:' + userId).digest('hex');
  return { email: `hub-${userId}@bridge.local`, password };
}

async function netAuth(pathname, body) {
  const res = await fetch(NET_BACKEND_URL + pathname, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(NET_BRIDGE_KEY ? { 'X-Bridge-Key': NET_BRIDGE_KEY } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
}

// Broker a .NET JWT for ANY Express user (login the shadow account, provisioning
// it on first use). The display name is the Express username so watcher events
// on the hub can show who is watching. Throws on failure.
async function netTokenFor(expressUserId) {
  const { rows } = await pool.query('SELECT username FROM users WHERE id = $1', [expressUserId]);
  const displayName = rows[0]?.username || `user-${expressUserId}`;
  const creds = shadowCredentials(expressUserId);
  let out = await netAuth('/auth/login', { email: creds.email, password: creds.password });
  if (!out.ok && out.status === 401)
    out = await netAuth('/auth/register', { ...creds, display_name: displayName });
  if (!out.ok || !out.data.token)
    throw new Error('Backend auth failed: ' + (out.data.error || 'HTTP ' + out.status));
  return out.data; // { token, expires_at, user_id, display_name }
}

router.post('/eeg-token', requireAuth, async (req, res) => {
  try {
    const out = await netTokenFor(req.session.userId);
    res.json({
      token: out.token,
      backend_url: NET_BACKEND_URL,
      expires_at: out.expires_at,
      user_id: out.user_id,
    });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// ── Live presence + assignment-scoped watch grants ──────────────────────────────
// A remote student "goes live" by registering which .NET session they stream into;
// an instructor may watch a live stream ONLY for a client record they own that is
// LINKED to that student's account (the link is the standing, visible grant — no
// per-sitting code hand-off). The .NET watch-token machinery stays underneath as
// the hub's enforcement primitive; the BFF mints the grant server-side.

router.post('/live/start', requireAuth, async (req, res) => {
  try {
    const netSessionId = (req.body?.netSessionId || '').trim();
    if (!netSessionId) return res.status(400).json({ error: 'netSessionId required' });
    await pool.query(
      `INSERT INTO live_streams (user_id, net_session_id, started_at) VALUES ($1, $2, NOW())
       ON CONFLICT (user_id) DO UPDATE SET net_session_id = $2, started_at = NOW()`,
      [req.session.userId, netSessionId]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/live/stop', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM live_streams WHERE user_id = $1', [req.session.userId]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Which of my linked clients are live right now? (admin → all linked clients;
// co-admin scoped to their own clients, mirroring ownedClient). Streams older
// than 4h are treated as stale leftovers.
router.get('/live/watchable', requireElevated, async (req, res) => {
  try {
    const isAdmin = req.session.role === 'admin';
    const params = [];
    let where = `c.user_id IS NOT NULL AND c.archived = FALSE AND ls.started_at > NOW() - INTERVAL '4 hours'`;
    if (!isAdmin) { params.push(req.session.userId); where += ` AND c.owner_id = $${params.length}`; }
    const { rows } = await pool.query(
      `SELECT c.id AS client_id, c.name, u.username, ls.net_session_id, ls.started_at
         FROM clients c
         JOIN live_streams ls ON ls.user_id = c.user_id
         JOIN users u ON u.id = c.user_id
        WHERE ${where}
        ORDER BY ls.started_at DESC`,
      params
    );
    res.json(rows.map(r => ({
      clientId: r.client_id,
      name: r.name,
      username: r.username,
      netSessionId: r.net_session_id,
      startedAt: r.started_at,
    })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Grant broker: the assignment check happens HERE (ownedClient + link + live),
// then the BFF acts as the identity bridge — it mints the .NET watch token AS the
// student and returns it with the instructor's own JWT. Audit (who redeemed) is
// recorded by the .NET side when the instructor joins.
router.post('/live/watch/:clientId', requireElevated, async (req, res) => {
  try {
    const id = parseInt(req.params.clientId, 10);
    const client = await ownedClient(id, req);
    if (!client) return res.status(403).json({ error: 'Forbidden' });
    if (!client.user_id) return res.status(400).json({ error: 'This client is not linked to a login account' });
    const { rows } = await pool.query('SELECT net_session_id FROM live_streams WHERE user_id = $1', [client.user_id]);
    if (!rows.length) return res.status(404).json({ error: 'This student is not live right now' });
    const netSessionId = rows[0].net_session_id;

    const student = await netTokenFor(client.user_id);
    const mint = await fetch(`${NET_BACKEND_URL}/sessions/${netSessionId}/watch-token`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + student.token },
      signal: AbortSignal.timeout(15000),
    });
    if (!mint.ok) return res.status(502).json({ error: 'Could not obtain a watch grant for the live session' });
    const grant = await mint.json();

    const instructor = await netTokenFor(req.session.userId);
    res.json({
      backend_url: NET_BACKEND_URL,
      token: instructor.token,
      session_id: netSessionId,
      watch_token: grant.watch_token,
      client_name: client.name,
    });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// ── Users (admin only) ────────────────────────────────────────────────────────
router.get('/users', requireAdmin, async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM users ORDER BY created_at ASC');
    res.json(rows.map(mapUser));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/users', requireAdmin, async (req, res) => {
  try {
    const { username, password, role = 'user' } = req.body;
    if (!username || !username.trim())
      return res.status(400).json({ error: 'Username required' });
    if (!password || password.length < 6)
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    if (!VALID_ROLES.includes(role))
      return res.status(400).json({ error: 'Invalid role' });

    const hash = await bcrypt.hash(password, 12);
    // Student accounts also get a linked client record owned by the creator,
    // so they show up in the cohort/Monitor immediately (mirror of
    // /clients/:id/create-login, which goes client → account). Atomic: an
    // account with no cohort record is exactly the trap this avoids.
    const conn = await pool.connect();
    try {
      await conn.query('BEGIN');
      const { rows } = await conn.query(
        'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id, username, role, created_at',
        [username.trim(), hash, role]
      );
      if (role === 'user') {
        await conn.query(
          "INSERT INTO clients (owner_id, name, status, user_id) VALUES ($1, $2, 'new', $3)",
          [req.session.userId, username.trim(), rows[0].id]
        );
      }
      await conn.query('COMMIT');
      res.status(201).json(mapUser(rows[0]));
    } catch (e) {
      await conn.query('ROLLBACK');
      throw e;
    } finally {
      conn.release();
    }
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Username already taken' });
    res.status(500).json({ error: e.message });
  }
});

router.delete('/users/:id', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (req.session.userId === id)
      return res.status(400).json({ error: 'Cannot delete your own account' });
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/users/:id/password', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { password } = req.body;
    if (!password || password.length < 6)
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const hash = await bcrypt.hash(password, 12);
    const { rowCount } = await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, id]);
    if (!rowCount) return res.status(404).json({ error: 'User not found' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/users/:id/role', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { role } = req.body;
    if (!VALID_ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role' });
    if (req.session.userId === id) return res.status(400).json({ error: 'Cannot change your own role' });
    await pool.query('UPDATE users SET role = $1 WHERE id = $2', [role, id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Sessions ──────────────────────────────────────────────────────────────────
// admin → all sessions; co-admin → only sessions they recorded OR sessions
// bound to a client they own (mirrors ownedSession).
router.get('/sessions', requireElevated, async (req, res) => {
  try {
    const isAdmin = req.session.role === 'admin';
    const params = [];
    let where = '';
    if (!isAdmin) {
      params.push(req.session.userId);
      where = `WHERE s.user_id = $1 OR c.owner_id = $1`;
    }
    const { rows } = await pool.query(
      `SELECT s.id, s.user_id, u.username, s.name,
              s.start_time, s.end_time, s.duration_seconds
       FROM eeg_sessions s
       LEFT JOIN users u ON s.user_id = u.id
       LEFT JOIN clients c ON c.id = s.client_id
       ${where}
       ORDER BY s.start_time DESC`,
      params
    );
    res.json(rows.map(mapSession));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/sessions/mine', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, user_id, name, start_time, end_time, duration_seconds
       FROM eeg_sessions WHERE user_id = $1 ORDER BY start_time DESC LIMIT 20`,
      [req.session.userId]
    );
    res.json(rows.map(r => mapSession({ ...r, username: null })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/sessions/start', requireAuth, async (req, res) => {
  try {
    const { name } = req.body;
    // Optional client binding — must be a client the requester owns.
    let clientId = null;
    if (req.body.client_id != null && req.body.client_id !== '') {
      clientId = parseInt(req.body.client_id, 10);
      if (Number.isNaN(clientId) || !(await ownedClient(clientId, req)))
        return res.status(403).json({ error: 'Forbidden client' });
    } else {
      // A student account created by an instructor is LINKED to that instructor's
      // client record. Auto-bind so everything the student records lands under
      // the instructor's client — the student never has to pick anything.
      const { rows: linked } = await pool.query(
        'SELECT id FROM clients WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
        [req.session.userId]
      );
      if (linked.length) clientId = linked[0].id;
    }
    const activity = (req.body.activity || '').trim() || null;
    const { rows } = await pool.query(
      'INSERT INTO eeg_sessions (user_id, name, start_time, client_id, activity) VALUES ($1, $2, NOW(), $3, $4) RETURNING *',
      [req.session.userId, name || 'New Session', clientId, activity]
    );
    res.status(201).json(mapSession(rows[0]));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/sessions/:id/end', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await pool.query(
      `UPDATE eeg_sessions
       SET end_time = NOW(),
           duration_seconds = EXTRACT(EPOCH FROM (NOW() - start_time))::int
       WHERE id = $1 AND user_id = $2`,
      [id, req.session.userId]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Ownership helper ──────────────────────────────────────────────────────────
// Returns the session row if the requester may access it, or null. Access is:
//   - the session's own user (the one who recorded it), or
//   - the owner of the client the session is bound to (instructor → their
//     student's data; the client link is the grant), or
//   - the superadmin (role 'admin' — the ONLY role that bypasses scoping;
//     co-admins must qualify via isRecorder/ownsClient like anyone else).
async function ownedSession(id, req) {
  const { rows } = await pool.query(
    `SELECT s.*, c.owner_id AS client_owner_id
       FROM eeg_sessions s LEFT JOIN clients c ON c.id = s.client_id
      WHERE s.id = $1`,
    [id]
  );
  if (!rows.length) return null;
  const isAdmin = req.session.role === 'admin';
  const isRecorder = rows[0].user_id === req.session.userId;
  const ownsClient = rows[0].client_owner_id === req.session.userId;
  if (!isAdmin && !isRecorder && !ownsClient) return null;
  return rows[0];
}

// Returns the client row if it belongs to the requesting user, or null.
// Only the superadmin (role 'admin') bypasses the owner check; co-admins
// are scoped to their own clients (mirrors ownedSession exactly).
async function ownedClient(id, req) {
  const { rows } = await pool.query('SELECT * FROM clients WHERE id = $1', [id]);
  if (!rows.length) return null;
  const isAdmin = req.session.role === 'admin';
  if (!isAdmin && rows[0].owner_id !== req.session.userId) return null;
  return rows[0];
}

// ── Clients (cohort) ──────────────────────────────────────────────────────────
// List own clients (admin → all; co-admin scoped to owner_id = self),
// each with derived sessionsCount/lastSessionAt.
router.get('/clients', requireElevated, async (req, res) => {
  try {
    const isAdmin = req.session.role === 'admin';
    const includeArchived = req.query.archived === 'true';
    const params = [];
    const where = [];
    if (!isAdmin) { params.push(req.session.userId); where.push(`c.owner_id = $${params.length}`); }
    if (!includeArchived) where.push('c.archived = FALSE');
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const { rows } = await pool.query(
      `SELECT c.*, u.username AS linked_username,
              COUNT(s.id)::int AS sessions_count, MAX(s.start_time) AS last_session_at
         FROM clients c
         LEFT JOIN users u ON u.id = c.user_id
         LEFT JOIN eeg_sessions s ON s.client_id = c.id
         ${whereSql}
         GROUP BY c.id, u.username ORDER BY c.name ASC`,
      params
    );
    res.json(rows.map(mapClient));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Per-client contemplative-depth trend — one average-depth score per recent
// session, so the cohort grid can show a trajectory sparkline rather than just
// a session count. Depth score mirrors the app's DEPTH_PCT scale
// (Mudha/Deep-Inertia 3 … Niruddha/Profound 94). Owner-scoped like /clients.
// Registered BEFORE /clients/:id so ":id" never captures "summary".
router.get('/clients/summary', requireElevated, async (req, res) => {
  try {
    const isAdmin = req.session.role === 'admin';
    const params = [];
    let ownerWhere = '';
    if (!isAdmin) { params.push(req.session.userId); ownerWhere = `AND c.owner_id = $${params.length}`; }
    const { rows } = await pool.query(
      `SELECT c.id AS client_id, s.start_time,
              AVG(CASE e.chitta_bhumi
                    WHEN 'Mudha'     THEN 3
                    WHEN 'Kshipta'   THEN 12
                    WHEN 'Vikshipta' THEN 37
                    WHEN 'Ekagra'    THEN 62
                    WHEN 'Niruddha'  THEN 94 END)::float AS depth_score
         FROM clients c
         JOIN eeg_sessions s ON s.client_id = c.id
         JOIN eeg_epochs   e ON e.session_id = s.id
        WHERE c.archived = FALSE ${ownerWhere}
        GROUP BY c.id, s.id, s.start_time
       HAVING COUNT(e.chitta_bhumi) > 0
        ORDER BY c.id, s.start_time ASC`,
      params
    );
    // Group into per-client series (chronological), keeping the last 8 sessions.
    const byClient = {};
    for (const r of rows) {
      if (r.depth_score == null) continue;
      (byClient[r.client_id] ||= []).push(Math.round(r.depth_score));
    }
    for (const k of Object.keys(byClient)) byClient[k] = byClient[k].slice(-8);
    res.json(byClient);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Create a client owned by the requester.
router.post('/clients', requireElevated, async (req, res) => {
  try {
    const b = req.body || {};
    const name = (b.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Name is required' });
    if (b.status != null && b.status !== '' && !VALID_CLIENT_STATUSES.includes(b.status))
      return res.status(400).json({ error: 'Invalid status' });
    const age = b.age != null && b.age !== '' ? parseInt(b.age, 10) : null;
    const { rows } = await pool.query(
      `INSERT INTO clients (owner_id, name, age, email, status, goal, protocol, protocol_since, practicing_since, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.session.userId, name, Number.isNaN(age) ? null : age, b.email || null,
       b.status || null, b.goal || null, b.protocol || null,
       b.protocolSince || null, b.practicingSince || null, b.notes || '']
    );
    res.status(201).json(mapClient(rows[0]));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Create a student login for a client in ONE step (account + link). This is the
// clear path: the instructor creates the student here; from then on everything
// the student records or streams lands under this client record, and the
// instructor can watch them live. Elevated only (it creates a user account).
router.post('/clients/:id/create-login', requireElevated, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const client = await ownedClient(id, req);
    if (!client) return res.status(403).json({ error: 'Forbidden' });
    if (client.user_id) return res.status(409).json({ error: 'This client already has a login' });

    const username = (req.body?.username || '').trim();
    const password = req.body?.password || '';
    if (!username) return res.status(400).json({ error: 'Username is required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const { rows: taken } = await pool.query('SELECT 1 FROM users WHERE username = $1', [username]);
    if (taken.length) return res.status(409).json({ error: `Username "${username}" is taken` });

    const hash = await bcrypt.hash(password, 12);
    const { rows: created } = await pool.query(
      "INSERT INTO users (username, password_hash, role) VALUES ($1, $2, 'user') RETURNING id",
      [username, hash]
    );
    await pool.query('UPDATE clients SET user_id = $1, updated_at = NOW() WHERE id = $2', [created[0].id, id]);
    const { rows } = await pool.query(
      `SELECT c.*, u.username AS linked_username
         FROM clients c LEFT JOIN users u ON u.id = c.user_id WHERE c.id = $1`, [id]
    );
    res.status(201).json(mapClient(rows[0]));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get one client (with derived counts).
router.get('/clients/:id', requireElevated, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!(await ownedClient(id, req))) return res.status(403).json({ error: 'Forbidden' });
    const { rows } = await pool.query(
      `SELECT c.*, u.username AS linked_username,
              COUNT(s.id)::int AS sessions_count, MAX(s.start_time) AS last_session_at
         FROM clients c
         LEFT JOIN users u ON u.id = c.user_id
         LEFT JOIN eeg_sessions s ON s.client_id = c.id
         WHERE c.id = $1 GROUP BY c.id, u.username`,
      [id]
    );
    res.json(mapClient(rows[0]));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update writable fields on an owned client.
router.put('/clients/:id', requireElevated, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!(await ownedClient(id, req))) return res.status(403).json({ error: 'Forbidden' });
    const b = req.body || {};
    if (b.status != null && b.status !== '' && !VALID_CLIENT_STATUSES.includes(b.status))
      return res.status(400).json({ error: 'Invalid status' });
    if (b.name != null && !b.name.trim()) return res.status(400).json({ error: 'Name cannot be empty' });
    // Only update provided fields (map camelCase → column).
    const cols = { name: 'name', age: 'age', email: 'email', status: 'status', goal: 'goal',
      protocol: 'protocol', protocolSince: 'protocol_since', practicingSince: 'practicing_since',
      notes: 'notes', archived: 'archived' };
    const sets = [], params = [];
    for (const [key, col] of Object.entries(cols)) {
      if (b[key] === undefined) continue;
      let val = b[key];
      if (key === 'age') val = val === '' || val == null ? null : parseInt(val, 10);
      if (key === 'name') val = val.trim();
      params.push(val); sets.push(`${col} = $${params.length}`);
    }
    // Link/unlink a login account (remote student). '' or null unlinks; a
    // username resolves to users.id — the link is the live-watch grant, so it is
    // guarded: you may only link a STUDENT ('user') account that no OTHER
    // instructor has already claimed. This prevents an instructor from linking a
    // rival's student (or an admin/co-admin account) to capture their stream/data.
    if (b.linkedUsername !== undefined) {
      const uname = (b.linkedUsername || '').trim();
      if (!uname) {
        sets.push('user_id = NULL');
      } else {
        const { rows: urows } = await pool.query('SELECT id, role FROM users WHERE username = $1', [uname]);
        if (!urows.length) return res.status(404).json({ error: `No account named "${uname}"` });
        if (urows[0].role !== 'user')
          return res.status(400).json({ error: 'Only a student account can be linked to a client' });
        const targetUserId = urows[0].id;
        const { rows: claimed } = await pool.query(
          'SELECT 1 FROM clients WHERE user_id = $1 AND owner_id <> $2 LIMIT 1',
          [targetUserId, req.session.userId]
        );
        if (claimed.length) return res.status(409).json({ error: 'That student is already linked to another instructor' });
        params.push(targetUserId); sets.push(`user_id = $${params.length}`);
      }
    }
    sets.push('updated_at = NOW()');
    params.push(id);
    await pool.query(
      `UPDATE clients SET ${sets.join(', ')} WHERE id = $${params.length}`, params
    );
    const { rows } = await pool.query(
      `SELECT c.*, u.username AS linked_username
         FROM clients c LEFT JOIN users u ON u.id = c.user_id WHERE c.id = $1`, [id]
    );
    res.json(mapClient(rows[0]));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete an owned client (sessions.client_id → NULL via FK, history preserved).
router.delete('/clients/:id', requireElevated, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!(await ownedClient(id, req))) return res.status(403).json({ error: 'Forbidden' });
    await pool.query('DELETE FROM clients WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Sessions belonging to a client.
router.get('/clients/:id/sessions', requireElevated, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!(await ownedClient(id, req))) return res.status(403).json({ error: 'Forbidden' });
    const { rows } = await pool.query(
      'SELECT * FROM eeg_sessions WHERE client_id = $1 ORDER BY start_time DESC', [id]
    );
    res.json(rows.map(mapSession));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// (Re)bind a session to a client (or clear it). Requires owning both.
router.patch('/sessions/:id/client', requireElevated, async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id, 10);
    if (!(await ownedSession(sessionId, req))) return res.status(403).json({ error: 'Forbidden' });
    let clientId = null;
    if (req.body.clientId != null && req.body.clientId !== '') {
      clientId = parseInt(req.body.clientId, 10);
      if (Number.isNaN(clientId) || !(await ownedClient(clientId, req)))
        return res.status(403).json({ error: 'Forbidden client' });
    }
    await pool.query('UPDATE eeg_sessions SET client_id = $1 WHERE id = $2', [clientId, sessionId]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Epochs ────────────────────────────────────────────────────────────────────
router.post('/sessions/:id/epoch', requireAuth, async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id, 10);
    // FIX: verify the session belongs to this user before writing epoch data
    const sess = await ownedSession(sessionId, req);
    if (!sess) return res.status(403).json({ error: 'Forbidden' });
    const b = req.body;

    await pool.query(
      `INSERT INTO eeg_epochs (
         session_id, epoch_num, recorded_at, elapsed_seconds,
         chitta_bhumi, chitta_confidence, contemplative_depth,
         swara, swara_confidence,
         delta_power, theta_power, alpha_power, beta_power, gamma_power,
         sattva, rajas, tamas, guna_label,
         tattva_flags, blood_oxygen, heart_rate,
         vritti_index, nirodha_state,
         complexity_lziv, complexity_higuchi_fd, complexity_sample_entropy, complexity_perm_entropy,
         aperiodic_exponent, aperiodic_offset,
         probabilities, corroboration, faa, plv,
         low_beta_power, high_beta_power, data_quality, swara_note, latency_ms
       ) VALUES (
         $1, $2, NOW(), $3,
         $4, $5, $6,
         $7, $8,
         $9, $10, $11, $12, $13,
         $14, $15, $16, $17,
         $18, $19, $20,
         $21, $22,
         $23, $24, $25, $26,
         $27, $28,
         $29, $30, $31, $32,
         $33, $34, $35, $36, $37
       )`,
      [
        sessionId, b.epochNum, b.elapsedSeconds,
        b.chittaBhumi, b.chittaConfidence, b.contemplativeDepth,
        b.swara, b.swaraConfidence,
        b.bands?.delta, b.bands?.theta, b.bands?.alpha, b.bands?.beta, b.bands?.gamma,
        b.gunas?.sattva, b.gunas?.rajas, b.gunas?.tamas, b.gunas?.label,
        JSON.stringify(b.tattvaFlags || []), b.bloodOxygen, b.heartRate,
        b.vrittiIndex, b.nirodhaState,
        b.complexity?.lziv, b.complexity?.higuchiFd, b.complexity?.sampleEntropy, b.complexity?.permEntropy,
        b.aperiodic?.exponent, b.aperiodic?.offset,
        b.probabilities ? JSON.stringify(b.probabilities) : null,
        b.corroboration ? JSON.stringify(b.corroboration) : null,
        b.faa, b.plv,
        b.lowBetaPower, b.highBetaPower, b.dataQuality, b.swaraNote, b.latencyMs,
      ]
    );
    res.status(201).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/sessions/:id/epochs', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    // FIX: IDOR — verify ownership before returning epoch data
    if (!await ownedSession(id, req)) return res.status(403).json({ error: 'Forbidden' });
    const { rows } = await pool.query(
      'SELECT * FROM eeg_epochs WHERE session_id = $1 ORDER BY epoch_num ASC',
      [id]
    );
    res.json(rows.map(mapEpoch));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Analytics ─────────────────────────────────────────────────────────────────
router.get('/sessions/:id/analytics', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    // FIX: IDOR — verify ownership before returning analytics
    if (!await ownedSession(id, req)) return res.status(403).json({ error: 'Forbidden' });
    const { rows: epochs } = await pool.query(
      'SELECT * FROM eeg_epochs WHERE session_id = $1 ORDER BY epoch_num ASC',
      [id]
    );

    if (!epochs.length) {
      return res.json({ summary: { totalEpochs: 0 }, phases: [] });
    }

    // Summary
    const totalEpochs = epochs.length;
    const lastEpoch = epochs[epochs.length - 1];
    const durationSeconds = lastEpoch.elapsed_seconds ? Math.ceil(parseFloat(lastEpoch.elapsed_seconds)) : null;

    const stateCounts = {};
    const swaraCounts = {};
    let alphaSum = 0, thetaSum = 0, alphaCount = 0, thetaCount = 0;
    let spo2Sum = 0, spo2Count = 0, hrSum = 0, hrCount = 0;
    let sattvaSum = 0, rajasSum = 0, tamasSum = 0, gunaCount = 0;
    let vrittiSum = 0, vrittiCount = 0;
    let lzivSum = 0, hfdSum = 0, seSum = 0, peSum = 0, complexityCount = 0;
    let apxSum = 0, apoSum = 0, aperiodicCount = 0;
    const tattvaFlagCounts = {};
    const bandSums = { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 };
    const bandCounts = { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 };
    for (const ep of epochs) {
      if (ep.chitta_bhumi) stateCounts[ep.chitta_bhumi] = (stateCounts[ep.chitta_bhumi] || 0) + 1;
      if (ep.swara) swaraCounts[ep.swara] = (swaraCounts[ep.swara] || 0) + 1;
      if (ep.alpha_power) { alphaSum += parseFloat(ep.alpha_power); alphaCount++; }
      if (ep.theta_power) { thetaSum += parseFloat(ep.theta_power); thetaCount++; }
      if (ep.blood_oxygen != null) { spo2Sum += parseFloat(ep.blood_oxygen); spo2Count++; }
      if (ep.heart_rate != null) { hrSum += parseFloat(ep.heart_rate); hrCount++; }
      if (ep.sattva != null && ep.rajas != null && ep.tamas != null) {
        sattvaSum += parseFloat(ep.sattva); rajasSum += parseFloat(ep.rajas); tamasSum += parseFloat(ep.tamas);
        gunaCount++;
      }
      if (ep.vritti_index != null) { vrittiSum += parseFloat(ep.vritti_index); vrittiCount++; }
      if (ep.complexity_lziv != null) {
        lzivSum += parseFloat(ep.complexity_lziv);
        hfdSum += parseFloat(ep.complexity_higuchi_fd);
        seSum += parseFloat(ep.complexity_sample_entropy);
        peSum += parseFloat(ep.complexity_perm_entropy);
        complexityCount++;
      }
      if (ep.aperiodic_exponent != null) {
        apxSum += parseFloat(ep.aperiodic_exponent);
        apoSum += parseFloat(ep.aperiodic_offset);
        aperiodicCount++;
      }
      for (const f of (ep.tattva_flags || [])) {
        tattvaFlagCounts[f] = (tattvaFlagCounts[f] || 0) + 1;
      }
      for (const k of ['delta', 'theta', 'alpha', 'beta', 'gamma']) {
        const v = ep[k + '_power'];
        if (v != null) { bandSums[k] += parseFloat(v); bandCounts[k]++; }
      }
    }
    const dominantState = Object.entries(stateCounts).sort((a,b) => b[1]-a[1])[0]?.[0] || null;

    const avgGunas = gunaCount
      ? { sattva: sattvaSum / gunaCount, rajas: rajasSum / gunaCount, tamas: tamasSum / gunaCount }
      : { sattva: null, rajas: null, tamas: null };
    const dominantGuna = gunaCount
      ? Object.entries(avgGunas).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0][0]
      : null;
    const avgBands = {};
    for (const k of ['delta', 'theta', 'alpha', 'beta', 'gamma']) {
      avgBands[k] = bandCounts[k] ? bandSums[k] / bandCounts[k] : null;
    }

    const avgVritti = vrittiCount ? vrittiSum / vrittiCount : null;
    const avgComplexity = complexityCount ? {
      lziv: lzivSum / complexityCount,
      higuchiFd: hfdSum / complexityCount,
      sampleEntropy: seSum / complexityCount,
      permEntropy: peSum / complexityCount,
    } : null;
    const avgAperiodic = aperiodicCount ? {
      exponent: apxSum / aperiodicCount,
      offset: apoSum / aperiodicCount,
    } : null;
    // Tattva/Chakra flags seen across the session, most-frequent first.
    const tattvaFlags = Object.entries(tattvaFlagCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([flag, count]) => ({ flag, count }));

    // Phase compression
    const phases = [];
    let current = null;

    function finalizePhase(p) {
      const bandKeys = ['delta', 'theta', 'alpha', 'beta', 'gamma'];
      const avgBands = {};
      for (const k of bandKeys) {
        avgBands[k] = p.validBands[k] ? +(p.bandSums[k] / p.validBands[k]).toFixed(4) : null;
      }
      return {
        state: p.state,
        depth: p.depth,
        startEpoch: p.startEpoch,
        endEpoch: p.endEpoch,
        fromSeconds: p.fromSeconds,
        toSeconds: p.toSeconds,
        epochCount: p.epochCount,
        avgBands,
      };
    }

    for (const ep of epochs) {
      const state = ep.chitta_bhumi || 'Unknown';
      const elapsed = ep.elapsed_seconds ? parseFloat(ep.elapsed_seconds) : null;
      if (!current || current.state !== state) {
        if (current) phases.push(finalizePhase(current));
        current = {
          state, depth: ep.contemplative_depth,
          startEpoch: ep.epoch_num, endEpoch: ep.epoch_num,
          fromSeconds: elapsed, toSeconds: elapsed,
          epochCount: 1,
          bandSums: { delta:0,theta:0,alpha:0,beta:0,gamma:0 },
          validBands: { delta:0,theta:0,alpha:0,beta:0,gamma:0 },
        };
      } else {
        current.endEpoch = ep.epoch_num;
        current.toSeconds = elapsed;
        current.epochCount++;
      }
      for (const k of ['delta','theta','alpha','beta','gamma']) {
        const v = ep[k+'_power'] ? parseFloat(ep[k+'_power']) : null;
        if (v != null) { current.bandSums[k] += v; current.validBands[k]++; }
      }
    }
    if (current) phases.push(finalizePhase(current));

    res.json({
      summary: {
        totalEpochs,
        durationSeconds,
        dominantState,
        stateCounts,
        swaraCounts,
        avgAlpha: alphaCount ? alphaSum / alphaCount : null,
        avgTheta: thetaCount ? thetaSum / thetaCount : null,
        avgBands,
        avgGunas,
        dominantGuna,
        avgSpo2: spo2Count ? spo2Sum / spo2Count : null,
        avgHr: hrCount ? hrSum / hrCount : null,
        avgVritti,
        avgComplexity,
        avgAperiodic,
        tattvaFlags,
      },
      phases,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Session Notes ─────────────────────────────────────────────────────────────
router.get('/sessions/:id/notes', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    // FIX: IDOR — verify ownership before returning notes
    if (!await ownedSession(id, req)) return res.status(403).json({ error: 'Forbidden' });
    const { rows } = await pool.query('SELECT content FROM session_notes WHERE session_id = $1', [id]);
    res.json({ content: rows[0]?.content || '' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/sessions/:id/notes', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    // FIX: IDOR — verify ownership before writing notes
    if (!await ownedSession(id, req)) return res.status(403).json({ error: 'Forbidden' });
    const { content = '' } = req.body;
    await pool.query(
      `INSERT INTO session_notes (session_id, content, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (session_id) DO UPDATE SET content = $2, updated_at = NOW()`,
      [id, content]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Admin: sessions grouped by user (superadmin-only global aggregate) ───────
router.get('/admin/sessions/by-user', requireAdmin, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.id, s.user_id, u.username, s.name,
              s.start_time, s.end_time, s.duration_seconds
       FROM eeg_sessions s
       LEFT JOIN users u ON s.user_id = u.id
       ORDER BY u.username, s.start_time DESC`
    );
    const grouped = {};
    for (const row of rows) {
      const key = row.username || 'unknown';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(mapSession(row));
    }
    res.json(grouped);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── AI Baba (RAG Chat over EEG session data) ─────────────────────────────────
const Groq = require('groq-sdk');
// FIX: Guard Groq init — without this, missing GROQ_API_KEY throws at module load time,
// crashing the entire Vercel function before Express can handle any request (including login).
// FIX: .trim() the key — copy/pasting from a terminal or the Groq dashboard often drags
// along a trailing newline/space, which makes the key "present" but invalid.
const GROQ_API_KEY = (process.env.GROQ_API_KEY || '').trim();
const groq = GROQ_API_KEY
  ? new Groq({ apiKey: GROQ_API_KEY })
  : null;
const AI_MODEL = 'llama-3.1-8b-instant';

// FIX: Diagnostic endpoint — hit GET /api/ai/health in the browser to check, without
// guessing, whether Vercel is actually passing GROQ_API_KEY into this function at runtime.
// Never returns the key itself, only whether it's present and roughly what it looks like.
// Superadmin-only: env var names, VERCEL_URL and commit SHA are deployment internals.
router.get('/ai/health', requireAdmin, (req, res) => {
  // FIX: list any env var *names* that look Groq-related (never values) — this catches a
  // typo/wrong-casing in the Vercel dashboard, or the var existing under a different name.
  const groqLikeVarNames = Object.keys(process.env).filter(k => /groq/i.test(k));
  res.json({
    groqConfigured: !!groq,
    keyLength: GROQ_API_KEY.length || 0,
    keyPrefix: GROQ_API_KEY ? GROQ_API_KEY.slice(0, 4) + '…' : null,
    groqLikeVarNames,
    totalEnvVarCount: Object.keys(process.env).length,
    nodeEnv: process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown',
    vercelUrl: process.env.VERCEL_URL || null,
    vercelGitCommitSha: process.env.VERCEL_GIT_COMMIT_SHA || null,
  });
});

// Hard token budget: cap full epoch log to prevent context overflow.
// llama-3.1-8b-instant has 128K token context; each epoch line ≈ 30 tokens.
// 400 epochs × 30 ≈ 12K tokens — safe even with system prompt + history.
const MAX_EPOCH_LINES = 400;

const EEG_SYSTEM_PROMPT = `You are AI Baba, a wise and compassionate guide specialising in EEG brainwave analysis and yogic science. You help users understand their meditation and mindfulness sessions recorded via an EEG headband.

Your role:
- Analyse the EEG session data provided and explain it in simple, accessible language
- Help users understand their mental states, concentration levels, and energy during their session
- Answer questions about focus, relaxation, brainwave bands, and yogic states
- Translate technical EEG metrics into meaningful insights a non-expert can understand

Key concepts you explain:
- Chitta Bhumi states: Kshipta (scattered/restless mind), Vikshipta (distracted/oscillating mind), Ekagra (focused/concentrated mind), Niruddha (deeply absorbed/transcendent mind)
- Contemplative depth: Surface, Emerging, Deep, Profound
- Swara Nadi: Ida (lunar/parasympathetic/creative), Pingala (solar/sympathetic/active), Sushumna (balanced/meditative)
- Trigunas: Sattva (clarity/purity/calm), Rajas (activity/passion/restlessness), Tamas (inertia/dullness/heaviness)
- EEG bands: Delta (1-4 Hz, deep sleep/restoration), Theta (4-8 Hz, drowsy/creative), Alpha (8-13 Hz, relaxed/calm), Beta (13-30 Hz, active thinking), Gamma (30-50 Hz, peak insight/focus)

When the user asks about concentration: Ekagra and Niruddha = concentrated, Kshipta and Vikshipta = not concentrated.
When the user asks about relaxation: look at Alpha power (higher = more relaxed), Ida Swara, and Sattva Guna.
When the user asks about energy: look at Rajas Guna, Pingala Swara, Beta/Gamma power.
When the user asks about when they were most focused: find the epochs with Ekagra or Niruddha and the deepest contemplative depth.
When asked about time-based questions (e.g. "was I concentrating at 5 minutes?"): use elapsed_seconds from the epoch log — 300s = 5 minutes.

ABSOLUTE RULE — YOU MUST FOLLOW THIS WITHOUT EXCEPTION:
If the user's question is NOT related to EEG, brainwaves, meditation, mindfulness, yogic states, or the session data in any way, you MUST reply with this exact sentence and nothing else:
"I'm AI Baba, and I can only help you understand your EEG session data. I'm not able to answer questions on other topics — ask me something about your brainwaves or meditation session!"
Examples of off-topic queries you must refuse: weather, sports, coding help, maths, history, news, personal life advice unrelated to meditation, recipes, jokes, general knowledge questions.`;

const OFF_TOPIC_REPLY_GU = "હું AI બાબા છું, અને હું ફક્ત તમારા EEG સેશન ડેટા સમજવામાં તમારી મદદ કરી શકું છું. હું અન્ય વિષયો પર પ્રશ્નોના જવાબ આપી શકતો નથી — મને તમારા મગજના તરંગો અથવા ધ્યાન સેશન વિશે કંઈક પૂછો!";

// The app UI has an English/Gujarati toggle (useI18n.js) — when the user is in
// Gujarati mode, AI Baba should answer in Gujarati too, so the experience
// stays consistent end-to-end rather than only translating chrome around an
// English AI. Keep Sanskrit/yogic terms (Kshipta, Ekagra, Sattva, ...) as-is
// even in Gujarati replies — that matches how the rest of the app renders
// them (Gujarati script alongside the same underlying Sanskrit vocabulary).
const LANG_INSTRUCTION = {
  gu: `\n\nIMPORTANT: Respond in Gujarati (ગુજરાતી), written in the Gujarati script. Keep Sanskrit/yogic technical terms (Chitta Bhumi state names like Kshipta/Vikshipta/Ekagra/Niruddha, Swara names like Ida/Pingala/Sushumna, Guna names like Sattva/Rajas/Tamas) recognizable — either in Gujarati transliteration or alongside the Roman term — since these are proper nouns from the tradition, not ordinary vocabulary to translate freely. Numbers, percentages and band names (Alpha/Beta/Theta/Delta/Gamma) may stay in their usual form.
For the off-topic case specifically, override the earlier instruction to reply with the English sentence — instead reply with exactly this Gujarati sentence and nothing else: "${OFF_TOPIC_REPLY_GU}"`,
};
function systemPromptFor(lang) {
  return EEG_SYSTEM_PROMPT + (LANG_INSTRUCTION[lang] || '');
}

function buildSessionContext(session, epochs, includeFullLog = true) {
  if (!epochs || epochs.length === 0) {
    return `Session: "${session.name}" — no epoch data was recorded for this session.`;
  }

  const duration = session.duration_seconds
    ? `${Math.floor(session.duration_seconds / 60)}m ${session.duration_seconds % 60}s`
    : 'unknown';
  const startTime = session.start_time
    ? new Date(session.start_time).toLocaleString()
    : 'unknown';

  const chittaCounts = {};
  const swaraCounts  = {};
  let totalSattva = 0, totalRajas = 0, totalTamas = 0, gunaCount = 0;
  let totalDelta  = 0, totalTheta = 0, totalAlpha = 0, totalBeta = 0, totalGamma = 0, bandCount = 0;
  const tattvaSet = new Set();

  for (const ep of epochs) {
    if (ep.chitta_bhumi) chittaCounts[ep.chitta_bhumi] = (chittaCounts[ep.chitta_bhumi] || 0) + 1;
    if (ep.swara)        swaraCounts[ep.swara]         = (swaraCounts[ep.swara]         || 0) + 1;
    if (ep.sattva != null) {
      totalSattva += parseFloat(ep.sattva);
      totalRajas  += parseFloat(ep.rajas  || 0);
      totalTamas  += parseFloat(ep.tamas  || 0);
      gunaCount++;
    }
    if (ep.alpha_power != null) {
      totalDelta += parseFloat(ep.delta_power || 0);
      totalTheta += parseFloat(ep.theta_power || 0);
      totalAlpha += parseFloat(ep.alpha_power || 0);
      totalBeta  += parseFloat(ep.beta_power  || 0);
      totalGamma += parseFloat(ep.gamma_power || 0);
      bandCount++;
    }
    if (ep.tattva_flags && Array.isArray(ep.tattva_flags))
      ep.tattva_flags.forEach(f => tattvaSet.add(f));
  }

  const pct          = (v, n) => n ? (v / n * 100).toFixed(1) + '%' : 'N/A';
  const dominantChitta = Object.entries(chittaCounts).sort((a, b) => b[1] - a[1])[0];
  const dominantSwara  = Object.entries(swaraCounts).sort((a, b)  => b[1] - a[1])[0];

  // Timeline — sample up to 20 representative moments
  const step     = Math.max(1, Math.floor(epochs.length / 20));
  const timeline = epochs
    .filter((_, i) => i % step === 0)
    .map(ep => {
      const t = ep.elapsed_seconds != null
        ? `${Math.floor(ep.elapsed_seconds / 60)}:${String(Math.floor(ep.elapsed_seconds % 60)).padStart(2, '0')}`
        : `ep${ep.epoch_num}`;
      return `  [${t}] ${ep.chitta_bhumi || '?'} | ${ep.contemplative_depth || '?'} depth | ${ep.swara || '?'} | `
           + `S:${ep.sattva      != null ? (ep.sattva      * 100).toFixed(0) : '?'}% `
           + `R:${ep.rajas       != null ? (ep.rajas       * 100).toFixed(0) : '?'}% `
           + `T:${ep.tamas       != null ? (ep.tamas       * 100).toFixed(0) : '?'}% | `
           + `Alpha:${ep.alpha_power != null ? (ep.alpha_power * 100).toFixed(1) : '?'}%`;
    });

  let epochLog = '';
  if (includeFullLog) {
    // Hard cap: if session has more than MAX_EPOCH_LINES epochs, use uniform sampling
    const logEpochs = epochs.length <= MAX_EPOCH_LINES
      ? epochs
      : epochs.filter((_, i) => i % Math.ceil(epochs.length / MAX_EPOCH_LINES) === 0);

    const truncated = epochs.length > MAX_EPOCH_LINES
      ? `\n(Note: ${epochs.length} total epochs — showing ${logEpochs.length} uniformly sampled for context window budget)`
      : '';

    epochLog = `\n--- FULL EPOCH LOG (for time-based queries) ---${truncated}\n`
      + logEpochs.map(ep => {
          const t = ep.elapsed_seconds != null ? Math.round(ep.elapsed_seconds) + 's' : `ep${ep.epoch_num}`;
          return `[${t}] ${ep.chitta_bhumi || '?'}/${ep.contemplative_depth || '?'}/${ep.swara || '?'} `
               + `S:${ep.sattva     != null ? (ep.sattva     * 100).toFixed(0) : '?'}% `
               + `R:${ep.rajas      != null ? (ep.rajas      * 100).toFixed(0) : '?'}% `
               + `T:${ep.tamas      != null ? (ep.tamas      * 100).toFixed(0) : '?'}% `
               + `A:${ep.alpha_power != null ? (ep.alpha_power * 100).toFixed(1) : '?'}% `
               + `B:${ep.beta_power  != null ? (ep.beta_power  * 100).toFixed(1) : '?'}%`;
        }).join('\n');
  }

  return `
=== EEG SESSION DATA ===
Session: "${session.name}"
Recorded: ${startTime}
Duration: ${duration}
Total Epochs: ${epochs.length} (each epoch ≈ 2 seconds → ~${Math.round(epochs.length * 2 / 60)} minutes of data)

--- AGGREGATE STATISTICS ---
Dominant Mental State: ${dominantChitta ? `${dominantChitta[0]} (${((dominantChitta[1] / epochs.length) * 100).toFixed(0)}% of session)` : 'N/A'}
Full Chitta Bhumi breakdown: ${JSON.stringify(chittaCounts)}
Dominant Swara: ${dominantSwara ? `${dominantSwara[0]} (${((dominantSwara[1] / epochs.length) * 100).toFixed(0)}% of session)` : 'N/A'}
Swara breakdown: ${JSON.stringify(swaraCounts)}
Average Trigunas — Sattva:${pct(totalSattva, gunaCount)} Rajas:${pct(totalRajas, gunaCount)} Tamas:${pct(totalTamas, gunaCount)}
Average Band Powers — Delta:${pct(totalDelta, bandCount)} Theta:${pct(totalTheta, bandCount)} Alpha:${pct(totalAlpha, bandCount)} Beta:${pct(totalBeta, bandCount)} Gamma:${pct(totalGamma, bandCount)}
Tattva Events Detected: ${tattvaSet.size > 0 ? Array.from(tattvaSet).join(', ') : 'None'}

--- TIMELINE (key sampled moments) ---
${timeline.join('\n')}
${epochLog}
=== END OF SESSION DATA ===`;
}

// GET /api/ai/sessions — list the logged-in user's sessions (for the session picker UI)
router.get('/ai/sessions', requireAuth, async (req, res) => {
  try {
    // NOTE: no groq guard here — listing sessions is a pure DB query, no AI needed.
    const { rows } = await pool.query(
      `SELECT s.id, s.name, s.start_time, s.end_time, s.duration_seconds,
              COUNT(e.id)::int AS epoch_count
       FROM eeg_sessions s
       LEFT JOIN eeg_epochs e ON e.session_id = s.id
       WHERE s.user_id = $1
       GROUP BY s.id
       ORDER BY s.start_time DESC`,
      [req.session.userId]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/ai/start — generate an AI summary for a session (no full epoch log to save tokens)
router.post('/ai/start', requireAuth, async (req, res) => {
  try {
    if (!groq) return res.status(503).json({ error: 'AI Baba is not configured — set GROQ_API_KEY in Vercel environment variables.' });
    const sessionId = parseInt(req.body.session_id, 10);
    const lang = req.body.lang === 'gu' ? 'gu' : 'en';
    if (!sessionId) return res.status(400).json({ error: 'session_id required' });
    if (!(await ownedSession(sessionId, req))) return res.status(403).json({ error: 'Forbidden' });

    const [{ rows: sessionRows }, { rows: epochs }] = await Promise.all([
      pool.query('SELECT * FROM eeg_sessions WHERE id = $1', [sessionId]),
      pool.query(
        `SELECT epoch_num, elapsed_seconds, chitta_bhumi, chitta_confidence, contemplative_depth,
                swara, swara_confidence, delta_power, theta_power, alpha_power, beta_power, gamma_power,
                sattva, rajas, tamas, guna_label, tattva_flags
         FROM eeg_epochs WHERE session_id = $1 ORDER BY epoch_num ASC`,
        [sessionId]
      ),
    ]);

    if (!sessionRows[0]) return res.status(404).json({ error: 'Session not found' });

    // For the summary, use stats + timeline only (no full epoch log = smaller prompt)
    const context = buildSessionContext(sessionRows[0], epochs, /* includeFullLog= */ false);

    const completion = await groq.chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: 'system', content: systemPromptFor(lang) },
        {
          role: 'user',
          content: `${context}

Give me a warm, concise summary of this EEG session in 4-6 SHORT sentences
total (one tight paragraph, under 120 words) — touch on: the mental state I
was mostly in, how focused I was, what my Swara and Triguna balance suggest,
and one practical encouragement. Same substance as a full report, just said
briefly — like a wise friend giving me the headline, not a lecture. No
bullet points, no headers, no restating these instructions.`,
        },
      ],
      temperature: 0.7,
      // Gujarati script tokenizes far less efficiently than English in most
      // LLM tokenizers (more tokens per word), so the same ~120-word target
      // needs a larger budget or it truncates mid-sentence.
      max_tokens: lang === 'gu' ? 500 : 220,
    });

    res.json({
      summary:     completion.choices[0].message.content,
      session:     sessionRows[0],
      epoch_count: epochs.length,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/ai/chat — continue a conversation about a specific session
router.post('/ai/chat', requireAuth, async (req, res) => {
  try {
    if (!groq) return res.status(503).json({ error: 'AI Baba is not configured — set GROQ_API_KEY in Vercel environment variables.' });
    const sessionId = parseInt(req.body.session_id, 10);
    const lang = req.body.lang === 'gu' ? 'gu' : 'en';
    const { message, history = [] } = req.body;

    if (!sessionId || !message)      return res.status(400).json({ error: 'session_id and message required' });
    if (message.trim().length === 0)  return res.status(400).json({ error: 'Message cannot be empty' });
    if (message.trim().length > 600)  return res.status(400).json({ error: 'Message too long (max 600 chars)' });
    if (!(await ownedSession(sessionId, req))) return res.status(403).json({ error: 'Forbidden' });

    // No server-side keyword pre-filter here (previously gated English
    // messages through isEegRelated() before this comment) — it produced
    // false positives on completely legitimate session questions whenever
    // the wording didn't happen to contain one of a fixed keyword list (e.g.
    // "how well was I concentrating" matched neither "concentration" nor any
    // other keyword and got auto-refused, even though AI Baba had the full
    // session data needed to answer it). Gujarati already skipped this same
    // heuristic for the same reason (a fixed English keyword list can't judge
    // Gujarati text); English gets the identical treatment now — the system
    // prompt's own ABSOLUTE RULE section handles off-topic refusal inside the
    // LLM call, which understands paraphrases a keyword list cannot.

    const [{ rows: sessionRows }, { rows: epochs }] = await Promise.all([
      pool.query('SELECT * FROM eeg_sessions WHERE id = $1', [sessionId]),
      pool.query(
        `SELECT epoch_num, elapsed_seconds, chitta_bhumi, chitta_confidence, contemplative_depth,
                swara, swara_confidence, delta_power, theta_power, alpha_power, beta_power, gamma_power,
                sattva, rajas, tamas, guna_label, tattva_flags
         FROM eeg_epochs WHERE session_id = $1 ORDER BY epoch_num ASC`,
        [sessionId]
      ),
    ]);

    if (!sessionRows[0]) return res.status(404).json({ error: 'Session not found' });

    // Full epoch log included for detailed follow-up questions (capped at MAX_EPOCH_LINES)
    const context = buildSessionContext(sessionRows[0], epochs, /* includeFullLog= */ true);

    // Sanitise history — keep last 10 exchanges, cap each message at 800 chars
    const safeHistory = (Array.isArray(history) ? history : [])
      .slice(-20)
      .filter(m => m && m.role && m.content && typeof m.content === 'string')
      .map(m => ({
        role:    m.role === 'user' ? 'user' : 'assistant',
        content: String(m.content).slice(0, 800),
      }));

    const completion = await groq.chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: 'system', content: `${systemPromptFor(lang)}\n\n${context}` },
        ...safeHistory,
        { role: 'user', content: message },
      ],
      temperature: 0.7,
      max_tokens: lang === 'gu' ? 900 : 450, // Gujarati script tokenizes less efficiently
    });

    const reply = completion.choices[0].message.content;
    res.json({ reply });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Activity types (practice vocabulary) ─────────────────────────────────────
// Admin-managed list that populates the session "practice" picker. Everyone can
// read it (to start a sitting); only the superadmin may modify it.
const mapActivity = r => ({ id: r.id, name: r.name, sortOrder: r.sort_order, archived: r.archived });

router.get('/activities', requireAuth, async (req, res) => {
  try {
    const showArchived = req.query.all === 'true' && req.session.role === 'admin';
    const { rows } = await pool.query(
      `SELECT * FROM activity_types
        ${showArchived ? '' : 'WHERE archived = FALSE'}
        ORDER BY sort_order ASC, name ASC`
    );
    res.json(rows.map(mapActivity));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/activities', requireAdmin, async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Practice name required' });
    // New items sort after the current max unless a position is given.
    let sort = parseInt(req.body.sortOrder, 10);
    if (!Number.isFinite(sort)) {
      const { rows: mx } = await pool.query('SELECT COALESCE(MAX(sort_order), 0) + 10 AS next FROM activity_types');
      sort = mx[0].next;
    }
    const { rows } = await pool.query(
      'INSERT INTO activity_types (name, sort_order) VALUES ($1, $2) RETURNING *',
      [name, sort]
    );
    res.status(201).json(mapActivity(rows[0]));
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'That practice already exists' });
    res.status(500).json({ error: e.message });
  }
});

router.put('/activities/:id', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const fields = [], params = [];
    if (req.body.name != null) {
      const nm = String(req.body.name).trim();
      if (!nm) return res.status(400).json({ error: 'Practice name required' });
      params.push(nm); fields.push(`name = $${params.length}`);
    }
    if (req.body.sortOrder != null) { params.push(parseInt(req.body.sortOrder, 10) || 0); fields.push(`sort_order = $${params.length}`); }
    if (req.body.archived != null) { params.push(!!req.body.archived); fields.push(`archived = $${params.length}`); }
    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });
    params.push(id);
    const { rows } = await pool.query(
      `UPDATE activity_types SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(mapActivity(rows[0]));
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'That practice already exists' });
    res.status(500).json({ error: e.message });
  }
});

router.delete('/activities/:id', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await pool.query('DELETE FROM activity_types WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Mount router & export ─────────────────────────────────────────────────────
app.use('/api', router);



module.exports = app;
