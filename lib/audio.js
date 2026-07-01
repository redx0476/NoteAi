// Meeting audio recording storage.
//
// During streaming ingest we already have raw PCM (linear16, 16 kHz, mono), so
// we append it to <meetingId>.pcm. For playback we lazily wrap that PCM in a
// WAV header (<meetingId>.wav) which browsers can stream + seek via Range.

const fs = require('fs');
const path = require('path');

const AUDIO_DIR = path.join(process.cwd(), 'data', 'audio');

const SAMPLE_RATE = 16000;
const CHANNELS = 1;
const BITS = 16;

fs.mkdirSync(AUDIO_DIR, { recursive: true });

const pcmPath = (id) => path.join(AUDIO_DIR, `${id}.pcm`);
const wavPath = (id) => path.join(AUDIO_DIR, `${id}.wav`);

const MIME_BY_EXT = {
  mp3: 'audio/mpeg', m4a: 'audio/mp4', mp4: 'audio/mp4', wav: 'audio/wav',
  webm: 'audio/webm', ogg: 'audio/ogg', flac: 'audio/flac', aac: 'audio/aac',
};

/** Save an uploaded (imported) audio file verbatim for later playback. */
function saveImport(meetingId, buffer, ext) {
  const clean = (ext || 'mp3').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'mp3';
  fs.writeFileSync(path.join(AUDIO_DIR, `${meetingId}.import.${clean}`), buffer);
}

/** Locate an imported file for a meeting → { path, mime } or null. */
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

/** Open an append stream for a meeting's PCM recording. */
function openRecording(meetingId) {
  return fs.createWriteStream(pcmPath(meetingId), { flags: 'a' });
}

function hasRecording(meetingId) {
  try {
    return fs.statSync(pcmPath(meetingId)).size > 0;
  } catch {
    return false;
  }
}

function deleteRecording(meetingId) {
  for (const p of [pcmPath(meetingId), wavPath(meetingId)]) {
    fs.rm(p, { force: true }, () => {});
  }
  const imp = importFile(meetingId);
  if (imp) fs.rm(imp.path, { force: true }, () => {});
}

function wavHeader(dataLen) {
  const byteRate = (SAMPLE_RATE * CHANNELS * BITS) / 8;
  const blockAlign = (CHANNELS * BITS) / 8;
  const buf = Buffer.alloc(44);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataLen, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(CHANNELS, 22);
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
    fs.writeSync(out, wavHeader(pcmStat.size));
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

module.exports = {
  AUDIO_DIR,
  saveImport,
  importFile,
  openRecording,
  hasRecording,
  deleteRecording,
  ensureWav,
};
