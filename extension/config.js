// Shared config. Change API_BASE to your deployed backend in production.
globalThis.MEETNOTES = {
  API_BASE: 'http://localhost:3000',
  // WebSocket base (real-time streaming). Derived from API_BASE: http→ws, https→wss.
  WS_BASE: 'http://localhost:3000'.replace(/^http/, 'ws'),
  CHUNK_MS: 6000, // batch-fallback chunk length (only used when streaming is off)
};
