// Custom Node server for NOTEAI.
//
// Next.js handles all HTTP (pages + /api route handlers), while this server
// also attaches the raw WebSocket layer (/ws/ingest, /ws/live) that Next's
// serverless-style route handlers can't host. It also runs DB schema init on
// boot. Started via `npm run dev` / `npm start`.

require('dotenv').config();

const { createServer } = require('http');
const next = require('next');
const { initDb } = require('./lib/initDb');
const { attachWebSocket } = require('./lib/ws');

const dev = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev });
const handle = app.getRequestHandler();

async function main() {
  await initDb();
  await app.prepare();

  const server = createServer((req, res) => handle(req, res));
  attachWebSocket(server);

  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`NOTEAI ready on http://localhost:${port}  (${dev ? 'dev' : 'production'})`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start NOTEAI:', err);
  process.exit(1);
});
