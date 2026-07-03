// Meeting audio recording storage.
//
// During streaming ingest we already have raw PCM (linear16, 16 kHz), so we
// append it to <meetingId>.pcm. For playback we lazily wrap that PCM in a WAV
// header (<meetingId>.wav) which browsers can stream + seek via Range.
//
// Channel count varies by source — the web mic recorder streams mono while the
// extension and the notetaker bot stream 2-channel interleaved (ch0 mic/"You",
// ch1 meeting) — so openRecording persists the channel count in a sidecar
// <meetingId>.meta.json and ensureWav writes a matching WAV header.
//
// When S3 is configured (lib/storage.js), finalizeRecording uploads the WAV to
// the bucket and records the object key on the meeting row; playback then
// redirects to a presigned URL instead of streaming from local disk.

const fs = require('fs');
const path = require('path');
const { s3Enabled, putObject, deleteObject } = require('./storage');

const AUDIO_DIR = path.join(process.cwd(), 'data', 'audio');

const SAMPLE_RATE = 16000;
const BITS = 16;

fs.mkdirSync(AUDIO_DIR, { recursive: true });

const pcmPath = (id) => path.join(AUDIO_DIR, `${id}.pcm`);
const wavPath = (id) => path.join(AUDIO_DIR, `${id}.wav`);
const metaPath = (id) => path.join(AUDIO_DIR, `${id}.meta.json`);

const MIME_BY_EXT = {
  mp3: 'audio/mpeg', m4a: 'audio/mp4', mp4: 'audio/mp4', wav: 'audio/wav',
  webm: 'audio/webm', ogg: 'audio/ogg', flac: 'audio/flac', aac: 'audio/aac',
};

/**
 * Save an uploaded (imported) audio file for later playback. Goes to S3 when
 * configured (returns the object key), otherwise to local disk (returns null).
 */
async function saveImport(meetingId, buffer, ext) {
  const clean = (ext || 'mp3').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'mp3';
  if (s3Enabled()) {
    const key = `audio/${meetingId}.import.${clean}`;
    await putObject(key, buffer, MIME_BY_EXT[clean] || 'application/octet-stream');
    return key;
  }
  fs.writeFileSync(path.join(AUDIO_DIR, `${meetingId}.import.${clean}`), buffer);
  return null;
}

/** Locate a locally imported file for a meeting → { path, mime } or null. */
function importFile(meetingId) {
  let files;
  try {
    files = fs.readdirSync(AUDIO_DIR).filter((f) => f.startsWith(`${meetingId}.import.`));
  } catch {
    return null;
  }
  if (!files.length) return null;
  const ext = files[0].split('.').pop().toLowerCase();
  return { path: path.join(AUDIO_DIR, files[0]), mime: MIME_BY_EXT[ext] || 'application/octet-stream' };
}

/**
 * Open an append stream for a meeting's PCM recording and persist the channel
 * count so playback can build a correct WAV header later.
 */
function openRecording(meetingId, channels = 1) {
  try {
    fs.writeFileSync(metaPath(meetingId), JSON.stringify({ channels }));
  } catch {
    /* header falls back to the stored/default count */
  }
  return fs.createWriteStream(pcmPath(meetingId), { flags: 'a' });
}

/** Channel count a recording was captured with (1 for legacy recordings). */
function recordingChannels(meetingId) {
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath(meetingId), 'utf8'));
    const n = parseInt(meta.channels, 10);
    if (n === 1 || n === 2) return n;
  } catch {
    /* no meta → legacy mono */
  }
  return 1;
}

function hasRecording(meetingId) {
  try {
    return fs.statSync(pcmPath(meetingId)).size > 0;
  } catch {
    return false;
  }
}

/** Remove all stored audio for a meeting (local files + S3 object if any). */
function deleteRecording(meetingId, objectKey) {
  for (const p of [pcmPath(meetingId), wavPath(meetingId), metaPath(meetingId)]) {
    fs.rm(p, { force: true }, () => {});
  }
  const imp = importFile(meetingId);
  if (imp) fs.rm(imp.path, { force: true }, () => {});
  if (objectKey && s3Enabled()) {
    deleteObject(objectKey).catch((err) =>
      console.error('audio: failed to delete S3 object:', err.message)
    );
  }
}

function wavHeader(dataLen, channels) {
  const byteRate = (SAMPLE_RATE * channels * BITS) / 8;
  const blockAlign = (channels * BITS) / 8;
  const buf = Buffer.alloc(44);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataLen, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(byteRate, 28);
  buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(BITS, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataLen, 40);
  return buf;
}

/**
 * Build (or refresh) the playable WAV for a meeting and return its path, or
 * null if there is no recording. Regenerates only when the PCM has grown.
 */
function ensureWav(meetingId) {
  const pcm = pcmPath(meetingId);
  let pcmStat;
  try {
    pcmStat = fs.statSync(pcm);
  } catch {
    return null;
  }
  if (!pcmStat.size) return null;

  const wav = wavPath(meetingId);
  try {
    const wavStat = fs.statSync(wav);
    if (wavStat.mtimeMs >= pcmStat.mtimeMs) return wav; // up to date
  } catch {
    /* needs building */
  }

  const out = fs.openSync(wav, 'w');
  try {
    fs.writeSync(out, wavHeader(pcmStat.size, recordingChannels(meetingId)));
    const inFd = fs.openSync(pcm, 'r');
    try {
      const buf = Buffer.alloc(1 << 20);
      let read;
      while ((read = fs.readSync(inFd, buf, 0, buf.length, null)) > 0) {
        fs.writeSync(out, buf, 0, read);
      }
    } finally {
      fs.closeSync(inFd);
    }
  } finally {
    fs.closeSync(out);
  }
  return wav;
}

/**
 * Upload the finalized WAV to S3 and record the object key on the meeting.
 * No-op without S3 or without a recording. Idempotent — safe to call from
 * both the ingest socket close and the /end route; re-uploads if the PCM grew
 * (e.g. reconnect mid-meeting). Local files are kept as a cache/fallback.
 */
async function finalizeRecording(meetingId) {
  if (!s3Enabled()) return null;
  const wav = ensureWav(meetingId);
  if (!wav) return null;
  const key = `audio/${meetingId}.wav`;
  await putObject(key, fs.createReadStream(wav), 'audio/wav');
  const { pool } = require('./db');
  await pool.query('UPDATE meetings SET audio_object_key = $1 WHERE id = $2', [key, meetingId]);
  return key;
}

module.exports = {
  AUDIO_DIR,
  saveImport,
  importFile,
  openRecording,
  recordingChannels,
  hasRecording,
  deleteRecording,
  ensureWav,
  finalizeRecording,
};
