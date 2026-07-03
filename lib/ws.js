// Real-time WebSocket layer.
//
//   /ws/ingest?meetingId=&token=   ← client streams raw PCM up; backend proxies
//                                     it to Deepgram, stores final segments, and
//                                     echoes transcripts back down (live panel).
//   /ws/live?meetingId=&token=     ← dashboards subscribe to the same interim +
//                                     final transcripts in real time.
//
// A per-meeting hub fans transcripts out to every subscriber of that meeting.

const { WebSocketServer } = require('ws');
const { URL } = require('url');
const { pool } = require('./db');
const { verifyToken } = require('./auth');
const { openDeepgram, deepgramEnabled } = require('./services/deepgram');
const { openRecording, finalizeRecording } = require('./audio');

/** meetingId -> Set<WebSocket> of subscribers (dashboards + ingest echo). */
const hubs = new Map();

function subscribers(meetingId) {
  let set = hubs.get(meetingId);
  if (!set) hubs.set(meetingId, (set = new Set()));
  return set;
}

// Remove a socket and drop the hub entry when it was the last subscriber, so
// the map doesn't grow forever across meetings.
function unsubscribe(meetingId, ws) {
  const set = hubs.get(meetingId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) hubs.delete(meetingId);
}

function broadcast(meetingId, payload) {
  const json = JSON.stringify(payload);
  for (const ws of subscribers(meetingId)) {
    if (ws.readyState === ws.OPEN) {
      try {
        ws.send(json);
      } catch {
        /* ignore */
      }
    }
  }
}

async function authFromUrl(reqUrl) {
  const url = new URL(reqUrl, 'http://localhost');
  const token = url.searchParams.get('token');
  const meetingId = url.searchParams.get('meetingId');
  const payload = token && verifyToken(token);
  if (!payload || !meetingId) return null;
  const { rows } = await pool.query(
    'SELECT id FROM meetings WHERE id = $1 AND user_id = $2',
    [meetingId, payload.uid]
  );
  if (!rows[0]) return null;
  // PCM channel count: the web mic recorder sends mono (channels=1); the
  // extension and the notetaker bot send 2-channel interleaved (default).
  const channels = url.searchParams.get('channels') === '1' ? 1 : 2;
  return { meetingId, userId: payload.uid, path: url.pathname, channels };
}

function attachWebSocket(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const path = req.url.split('?')[0];
    if (path !== '/ws/ingest' && path !== '/ws/live') return; // let other upgrades (HMR) pass

    authFromUrl(req.url)
      .then((ctx) => {
        if (!ctx) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }
        wss.handleUpgrade(req, socket, head, (ws) => {
          ctx.path === '/ws/ingest' ? handleIngest(ws, ctx) : handleLive(ws, ctx);
        });
      })
      .catch(() => {
        try {
          socket.destroy();
        } catch {
          /* ignore */
        }
      });
  });

  return wss;
}

// ── Dashboard / viewer subscriber ────────────────────────────────────────────
function handleLive(ws, { meetingId }) {
  subscribers(meetingId).add(ws);
  ws.send(JSON.stringify({ type: 'ready' }));
  ws.on('close', () => unsubscribe(meetingId, ws));
  ws.on('error', () => unsubscribe(meetingId, ws));
}

// ── Audio ingest (streaming recorder) ────────────────────────────────────────
function handleIngest(ws, { meetingId, channels = 2 }) {
  subscribers(meetingId).add(ws);

  // Always persist the raw audio, independent of whether live transcription is
  // available. This guarantees the recording is saved even when Deepgram is not
  // configured or the streaming connection falls back.
  const recording = openRecording(meetingId, channels);
  let audioMarked = false;
  let dgReady = false;
  let fellBack = false;
  let readyTimer = null;
  let dg = null;

  const writeAudio = (data) => {
    try {
      recording.write(data);
    } catch {
      /* ignore */
    }
    if (!audioMarked) {
      audioMarked = true;
      pool
        .query('UPDATE meetings SET has_audio = true WHERE id = $1', [meetingId])
        .catch((err) => console.error('ws: failed to mark meeting audio:', err.message));
    }
  };

  const insertSegment = (speaker, text, start) =>
    pool
      .query('INSERT INTO segments (meeting_id, speaker, text, t_offset) VALUES ($1, $2, $3, $4)', [
        meetingId,
        speaker,
        text,
        start,
      ])
      .catch((err) => console.error('ws: failed to insert segment:', err.message));

  // If Deepgram never comes up (bad/expired key, network, upstream error, or it
  // simply isn't configured), tell the client to switch to the batch
  // /api/transcribe path so captions still work. We keep the socket open so the
  // raw audio keeps recording — the client decides whether to keep streaming
  // (web recorder) or close and switch to batch upload (extension).
  const fallbackToBatch = (reason) => {
    if (fellBack) return;
    fellBack = true;
    clearTimeout(readyTimer);
    try {
      if (ws.readyState === ws.OPEN)
        ws.send(JSON.stringify({ type: 'fallback', reason: String(reason || 'deepgram_unavailable') }));
    } catch {
      /* ignore */
    }
    try {
      dg?.close();
    } catch {
      /* ignore */
    }
    dg = null;
  };

  if (!deepgramEnabled()) {
    fallbackToBatch('deepgram_not_configured');
  } else {
    try {
      dg = openDeepgram({
        channels,
        onOpen: () => {
          dgReady = true;
          clearTimeout(readyTimer);
          if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'ready' }));
        },
        onTranscript: ({ text, isFinal, speaker, channelIndex, start }) => {
          // In 2-channel mode channel 0 is the local microphone ("You") and
          // channel 1 the meeting. Mono recordings rely on diarization alone.
          const speakerLabel =
            channels === 2 && channelIndex === 0 ? 'You' : `Speaker ${speaker + 1}`;
          const payload = {
            type: isFinal ? 'final' : 'interim',
            text,
            speaker: speakerLabel,
            tOffset: start,
          };
          if (isFinal) insertSegment(payload.speaker, text, start);
          broadcast(meetingId, payload);
        },
        onError: (err) => {
          if (!dgReady) {
            fallbackToBatch(err.message || 'deepgram_error');
          } else if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: 'error', message: String(err.message || err) }));
          }
        },
        onClose: () => {
          // Closed before it ever opened → connection was rejected upstream.
          if (!dgReady) fallbackToBatch('deepgram_closed');
        },
      });
    } catch (err) {
      fallbackToBatch(err.message);
    }

    // Safety net: if Deepgram doesn't open within a few seconds, fall back.
    if (dg) {
      readyTimer = setTimeout(() => {
        if (!dgReady) fallbackToBatch('deepgram_timeout');
      }, 5000);
    }
  }

  ws.on('message', (data, isBinary) => {
    if (!isBinary) return;
    // Always record the audio, even after a transcription fallback.
    writeAudio(data);
    if (!fellBack && dg) {
      try {
        dg.send(data);
      } catch {
        /* ignore */
      }
    }
  });

  const cleanup = () => {
    clearTimeout(readyTimer);
    unsubscribe(meetingId, ws);
    try {
      recording.end();
    } catch {
      /* ignore */
    }
    try {
      dg?.finish();
      dg?.close();
    } catch {
      /* ignore */
    }
    // Push the recording to S3 when configured. Idempotent + re-upload safe,
    // so a reconnect mid-meeting just refreshes the object later.
    finalizeRecording(meetingId).catch((err) =>
      console.error('ws: failed to finalize recording:', err.message)
    );
  };
  ws.on('close', cleanup);
  ws.on('error', cleanup);
}

module.exports = { attachWebSocket };
