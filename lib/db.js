// Postgres connection pool (node-pg). Shared by API route handlers and the
// WebSocket layer. Reads DATABASE_URL from the environment.

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});

pool.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('Unexpected Postgres pool error:', err.message);
});

function query(text, params) {
  return pool.query(text, params);
}

module.exports = { pool, query };
