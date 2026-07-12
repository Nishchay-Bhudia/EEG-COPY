'use strict';
/* ────────────────────────────────────────────────────────────────────────────
   LOCAL DEV LAUNCHER — not used in production.
   In prod, Vercel serves the static files and runs api/server.js as a
   serverless function (see vercel.json). This file reproduces that locally:
   it loads .env, serves the static frontend, and delegates everything else to
   the API app, which mounts its routes under /api (api/server.js line ~898).

   Run:  npm run dev     (after `npm install` and a Postgres is reachable)
──────────────────────────────────────────────────────────────────────────── */

const fs = require('fs');
const path = require('path');

// Minimal .env loader (no dependency). Must run BEFORE requiring the API,
// because api/server.js reads process.env at import time to build the DB pool.
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

const express = require('express');
const api = require('./api/server'); // the exported Express app (mounts /api internally)

const app = express();

// Prefer the built Vue SPA (web/dist) when present; fall back to the legacy
// static files otherwise. Either way the API app handles /api/* on the same origin.
const distDir = path.join(__dirname, 'web', 'dist');
const useVue = fs.existsSync(path.join(distDir, 'index.html'));

if (useVue) {
  app.use(express.static(distDir));            // index.html + hashed /assets/*
  app.use((req, res, next) => {                // SPA history fallback (non-/api GETs → index.html)
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      return res.sendFile(path.join(distDir, 'index.html'));
    }
    next();
  });
  app.use(api);                                // /api/* and non-GET
} else {
  app.use(express.static(__dirname, { index: 'index.html' })); // legacy: /, /app.js, /style.css …
  app.use(api);
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n  EEG-UI dev server → http://localhost:${PORT}`);
  console.log(`  API mounted at    → http://localhost:${PORT}/api`);
  if (!process.env.DATABASE_URL) {
    console.log('  ⚠  DATABASE_URL is not set — login/sessions will fail. See .env.\n');
  } else {
    console.log('');
  }
});
