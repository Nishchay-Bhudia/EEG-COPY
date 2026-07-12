#!/usr/bin/env node
// Apply schema.sql to the database in DATABASE_URL. Self-contained (uses the pg
// dependency already present) so deployment needs no psql on the host. The
// schema is fully idempotent — safe to run on every deploy.
//
//   DATABASE_URL=postgres://… node scripts/apply-schema.js
//
// SSL: enabled for remote hosts (Render/managed PG), disabled for localhost, or
// forced off with PGSSL=disable.
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const isLocal = /localhost|127\.0\.0\.1/.test(dbUrl) || process.env.PGSSL === 'disable';
const schemaPath = path.join(__dirname, '..', 'schema.sql');

(async () => {
  const pool = new Pool({
    connectionString: dbUrl,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });
  try {
    const sql = fs.readFileSync(schemaPath, 'utf8');
    await pool.query(sql);
    console.log('✓ schema.sql applied.');
  } catch (e) {
    console.error('Schema apply failed:', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
