// Batch (fallback) speech-to-text. Sends an audio chunk to a Whisper-compatible
// HTTP endpoint and returns the recognized text. Used only when Deepgram
// streaming is not configured.

const STT_API_URL = process.env.STT_API_URL || 'https://api.openai.com/v1/audio/transcriptions';
const STT_API_KEY = process.env.STT_API_KEY || '';
const STT_MODEL = process.env.STT_MODEL || 'whisper-1';
const STT_LANGUAGE = (process.env.STT_LANGUAGE || '').trim();

const HALLUCINATIONS = [
  'thank you for watching',
  'thanks for watching',
  'thank you so much for watching',
  'please subscribe',
  'like and subscribe',
  'peace out',
  'see you in the next video',
  'thank you.',
];

function extFor(mimeType) {
  if (mimeType.includes('wav')) return 'wav';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'm4a';
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3';
  return 'webm';
}

/**
 * @param {Buffer} buffer   raw audio bytes (webm/ogg/wav)
 * @param {string} mimeType e.g. 'audio/webm'
 * @returns {Promise<string>} cleaned text, or '' if rejected as silence/hallucination
 */
async function transcribeChunk(buffer, mimeType = 'audio/webm') {
  if (!STT_API_KEY) throw new Error('STT_API_KEY is not configured');

  const ext = extFor(mimeType);
  const buildForm = () => {
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: mimeType }), `chunk.${ext}`);
    form.append('model', STT_MODEL);
    form.append('response_format', 'json');
    if (STT_LANGUAGE) form.append('language', STT_LANGUAGE);
    return form;
  };

  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(STT_API_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${STT_API_KEY}` },
        body: buildForm(),
      });
      if (res.ok) {
        const data = await res.json();
        return cleanText((data.text || '').trim());
      }
      const detail = await res.text().catch(() => '');
      const err = new Error(`STT request failed (${res.status}): ${detail.slice(0, 300)}`);
      if (res.status === 429 || res.status >= 500) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        continue;
      }
      throw err;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  throw lastErr || new Error('STT failed');
}

function cleanText(text) {
  if (!text) return '';
  const normalized = text.toLowerCase().replace(/[.\s]+/g, ' ').trim();
  if (HALLUCINATIONS.some((h) => normalized === h || normalized === h.replace(/\.$/, ''))) return '';
  if (!/[\p{L}\p{N}]/u.test(text)) return '';
  return text;
}

module.exports = { transcribeChunk };
