// Postgres connection pool (node-pg). Shared by API route handlers and the
// WebSocket layer. Reads DATABASE_URL from the environment.

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.PG_POOL_MAX || 10),
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('Unexpected Postgres pool error:', err.message);
});

function query(text, params) {
  return pool.query(text, params);
}

/** Run `fn(client)` inside a BEGIN/COMMIT block, rolling back on any error. */
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, withTransaction };
