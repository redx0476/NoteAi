#!/usr/bin/env node
// Notetaker bot runner — one child process per meeting.
//
//   node bot/runner.js --job <botJobId>     (spawned by lib/bots/manager.js)
//   node bot/runner.js --spike <meetingUrl> (standalone audio-capture spike:
//                                            joins and logs capture RMS, no DB)
//
// Flow: load job → create meeting via the API (as the owner, using the
// service token in BOT_TOKEN) → launch Chromium → join as guest → stream
// captured meeting audio into /ws/ingest (same pipeline as the extension) →
// scrape the roster → on meeting end, POST /end (LLM notes + S3 finalize).

require('dotenv').config();

const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const BOT_NAME = process.env.BOT_NAME || 'NoteAI Notetaker';
const APP_URL = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;
const HEADFUL = process.env.BOT_HEADFUL === '1';
const MAX_MINUTES = parseInt(process.env.BOT_MAX_MINUTES || '120', 10);
const ADMISSION_TIMEOUT_MIN = parseInt(process.env.BOT_ADMISSION_TIMEOUT_MIN || '10', 10);
const ALONE_GRACE_MS = 5 * 60 * 1000; // leave after 5 min alone in the call
const SAMPLE_RATE = 16000;

const args = process.argv.slice(2);
const argOf = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
};

function detectPlatform(url) {
  if (/meet\.google\.com\//i.test(url)) return 'meet';
  if (/teams\.(microsoft|live)\.com\//i.test(url)) return 'teams';
  return null;
}

function api(pathname, { method = 'GET', body } = {}) {
  return fetch(`${APP_URL}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.BOT_TOKEN}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }).then(async (res) => {
    if (!res.ok) throw new Error(`${method} ${pathname} → ${res.status}`);
    return res.json().catch(() => ({}));
  });
}

/** Minimal WAV wrapper for batch-fallback chunks (16 kHz mono linear16). */
function wavWrap(pcm) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

async function launchBrowser() {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({
    headless: !HEADFUL,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-blink-features=AutomationControlled',
      ...(process.env.BOT_NO_SANDBOX === '1' ? ['--no-sandbox'] : []),
    ],
  });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 720 },
    permissions: ['microphone', 'camera'],
  });
  return { browser, context };
}

// ── Spike mode: prove headless audio capture works before anything else ──────
async function spike(url) {
  const platform = detectPlatform(url);
  if (!platform) throw new Error(`Unsupported meeting URL: ${url}`);
  const plat = require(`./platforms/${platform}`);
  const { CAPTURE_SOURCE } = require('./capture');

  const { browser, context } = await launchBrowser();
  const page = await context.newPage();
  let bytes = 0;
  await page.addInitScript(CAPTURE_SOURCE);
  await page.exposeFunction('__noteaiPcm', (b64) => {
    bytes += Buffer.from(b64, 'base64').length;
  });

  console.log(`[spike] joining ${url} as "${BOT_NAME}" (headless=${!HEADFUL})`);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await plat.requestJoin(page, BOT_NAME);
  console.log('[spike] join requested — waiting for admission (admit the bot from the host)…');
  await plat.waitForAdmission(page, ADMISSION_TIMEOUT_MIN);
  console.log('[spike] admitted! Logging capture stats every 5 s — Ctrl+C to stop.');

  const timer = setInterval(async () => {
    const stats = await page.evaluate(() => window.__noteaiCaptureStats?.()).catch(() => null);
    console.log(
      `[spike] ctx=${stats?.contextState} samples=${stats?.totalSamples} rms=${stats?.rms?.toFixed(4)} shipped=${(bytes / 1024).toFixed(0)}KB` +
        (stats && stats.totalSamples > 0 && stats.rms < 0.0005 ? '  ⚠ near-silent' : '')
    );
  }, 5000);

  process.on('SIGINT', async () => {
    clearInterval(timer);
    await browser.close().catch(() => {});
    process.exit(0);
  });
}

// ── Job mode ─────────────────────────────────────────────────────────────────
async function run(jobId) {
  const { pool } = require('../lib/db');
  const setJob = (fields) => {
    const keys = Object.keys(fields);
    const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    return pool
      .query(`UPDATE bot_jobs SET ${sets}, updated_at = now() WHERE id = $${keys.length + 1}`, [
        ...Object.values(fields),
        jobId,
      ])
      .catch((err) => console.error('bot: job update failed:', err.message));
  };

  const { rows } = await pool.query('SELECT * FROM bot_jobs WHERE id = $1', [jobId]);
  const job = rows[0];
  if (!job) throw new Error(`bot_jobs row ${jobId} not found`);
  const platform = job.platform;
  const plat = require(`./platforms/${platform}`);
  const { CAPTURE_SOURCE } = require('./capture');

  await setJob({ status: 'joining', started_at: new Date(), error: null });

  // The bot owns the meeting row on behalf of the user (service token).
  const meeting = await api('/api/meetings', {
    method: 'POST',
    body: {
      title: job.event_title || 'Meeting',
      platform,
      meetingUrl: job.meeting_url,
    },
  });
  await setJob({ meeting_id: meeting.id });

  const { browser, context } = await launchBrowser();
  const page = await context.newPage();

  // ── PCM path: page → binding → WebSocket /ws/ingest ──
  let ws = null;
  let wsOpen = false;
  let fellBack = false;
  const preOpen = [];

  // Batch fallback (Deepgram off): accumulate the mono meeting channel and
  // POST ~15 s WAV chunks to /api/transcribe like the extension does. The raw
  // stereo PCM still streams over the socket so the recording is saved.
  let batchBuf = [];
  let batchBytes = 0;
  let recordStart = null;
  const BATCH_TARGET = SAMPLE_RATE * 2 * 15; // 15 s of mono 16-bit
  let batchOffset = 0;

  async function flushBatch(force = false) {
    if (!fellBack || (!force && batchBytes < BATCH_TARGET) || batchBytes === 0) return;
    const pcm = Buffer.concat(batchBuf, batchBytes);
    const tOffset = batchOffset;
    batchBuf = [];
    batchBytes = 0;
    batchOffset += pcm.length / 2 / SAMPLE_RATE;
    const form = new FormData();
    form.append('audio', new Blob([wavWrap(pcm)], { type: 'audio/wav' }), 'chunk.wav');
    form.append('speaker', 'Speaker 1');
    form.append('tOffset', String(tOffset));
    await fetch(`${APP_URL}/api/transcribe/${meeting.id}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.BOT_TOKEN}` },
      body: form,
    }).catch((err) => console.error('bot: batch chunk failed:', err.message));
  }

  function connectIngest() {
    const wsUrl =
      APP_URL.replace(/^http/, 'ws') +
      `/ws/ingest?meetingId=${encodeURIComponent(meeting.id)}&token=${encodeURIComponent(process.env.BOT_TOKEN)}`;
    ws = new WebSocket(wsUrl);
    ws.on('open', () => {
      wsOpen = true;
      for (const buf of preOpen.splice(0)) ws.send(buf);
    });
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'fallback' && !fellBack) {
          fellBack = true;
          console.log(`bot: streaming unavailable (${msg.reason}) — switching to batch captions`);
        }
      } catch {
        /* binary echo — ignore */
      }
    });
    ws.on('error', (err) => console.error('bot: ingest socket error:', err.message));
    ws.on('close', () => {
      wsOpen = false;
    });
  }

  await page.addInitScript(CAPTURE_SOURCE);
  await page.exposeFunction('__noteaiPcm', (b64) => {
    const buf = Buffer.from(b64, 'base64');
    if (recordStart === null) recordStart = Date.now();
    if (wsOpen) ws.send(buf);
    else if (preOpen.length < 200) preOpen.push(buf); // ~50 s max backlog
    if (fellBack) {
      // Deinterleave: keep ch1 (odd Int16 slots) — ch0 is the silent mic slot.
      const mono = Buffer.alloc(buf.length / 2);
      for (let i = 0; i + 3 < buf.length; i += 4) {
        mono[i / 2] = buf[i + 2];
        mono[i / 2 + 1] = buf[i + 3];
      }
      batchBuf.push(mono);
      batchBytes += mono.length;
      flushBatch();
    }
  });

  // ── Join ──
  console.log(`bot: joining ${job.meeting_url} as "${BOT_NAME}"`);
  await page.goto(job.meeting_url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await plat.requestJoin(page, BOT_NAME);
  await setJob({ status: 'waiting_admission' });
  await plat.waitForAdmission(page, ADMISSION_TIMEOUT_MIN);
  console.log('bot: admitted to the meeting');
  await setJob({ status: 'recording' });
  connectIngest();

  // ── Roster scraping ──
  let lastRoster = '';
  const rosterTimer = setInterval(async () => {
    const names = await plat.scrapeParticipants(page);
    const key = names.slice().sort().join('|');
    if (names.length && key !== lastRoster) {
      lastRoster = key;
      await api(`/api/meetings/${meeting.id}/participants`, {
        method: 'POST',
        body: { names },
      }).catch(() => {});
    }
  }, 20_000);

  // ── End detection ──
  let aloneSince = null;
  let finishing = false;

  async function finish(reason) {
    if (finishing) return;
    finishing = true;
    console.log(`bot: leaving (${reason})`);
    clearInterval(rosterTimer);
    clearInterval(watchTimer);
    await flushBatch(true).catch(() => {});
    try {
      await plat.leave(page);
    } catch {
      /* page may be gone */
    }
    try {
      ws?.close();
    } catch {
      /* ignore */
    }
    // Give the server a beat to flush the recording file handle.
    await new Promise((r) => setTimeout(r, 1500));
    await api(`/api/meetings/${meeting.id}/end`, { method: 'POST', body: {} }).catch((err) =>
      console.error('bot: /end failed:', err.message)
    );
    await setJob({ status: 'ended', ended_at: new Date(), error: reason === 'meeting_ended' ? null : reason });
    await browser.close().catch(() => {});
    await pool.end().catch(() => {});
    process.exit(0);
  }

  const startedAt = Date.now();
  const watchTimer = setInterval(async () => {
    if (finishing) return;
    if (Date.now() - startedAt > MAX_MINUTES * 60_000) return finish('max_duration');
    if (await plat.isEnded(page)) return finish('meeting_ended');
    if (!(await plat.isInCall(page))) return finish('meeting_ended');
    const count = await plat.participantCount(page);
    if (count > 0 && count <= 1) {
      aloneSince = aloneSince || Date.now();
      if (Date.now() - aloneSince > ALONE_GRACE_MS) return finish('alone_in_meeting');
    } else {
      aloneSince = null;
    }
  }, 5000);

  process.on('SIGTERM', () => finish('stopped_by_user'));
  process.on('SIGINT', () => finish('stopped_by_user'));

  // Failure diagnostics for anything that escapes: screenshot + failed status.
  process.on('unhandledRejection', async (err) => {
    console.error('bot: unhandled rejection:', err);
    try {
      const dir = path.join(process.cwd(), 'data', 'bot');
      fs.mkdirSync(dir, { recursive: true });
      await page.screenshot({ path: path.join(dir, `${jobId}.png`) });
    } catch {
      /* ignore */
    }
    await setJob({ status: 'failed', error: String(err?.message || err) });
    process.exit(1);
  });
}

// ── Entry ────────────────────────────────────────────────────────────────────
const spikeUrl = argOf('--spike');
const jobId = argOf('--job');

(async () => {
  if (spikeUrl) return spike(spikeUrl);
  if (!jobId) {
    console.error('Usage: node bot/runner.js --job <botJobId> | --spike <meetingUrl>');
    process.exit(2);
  }
  try {
    await run(jobId);
  } catch (err) {
    console.error('bot: fatal:', err.message);
    try {
      const { pool } = require('../lib/db');
      await pool.query(
        `UPDATE bot_jobs SET status = 'failed', error = $1, updated_at = now() WHERE id = $2`,
        [String(err.message || err).slice(0, 500), jobId]
      );
    } catch {
      /* ignore */
    }
    process.exit(1);
  }
})();
