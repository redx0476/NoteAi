// Deepgram real-time (streaming) + file speech-to-text.
//
// Streams raw PCM (linear16, 16 kHz, mono) to Deepgram's live endpoint for
// Otter-style captions with speaker diarization, and transcribes complete
// uploaded files. Docs: https://developers.deepgram.com/docs/live-streaming-audio

const WebSocket = require('ws');

const DG_KEY = process.env.DEEPGRAM_API_KEY || '';
const DG_MODEL = process.env.DEEPGRAM_MODEL || 'nova-3';
const DG_LANGUAGE = process.env.DEEPGRAM_LANGUAGE || 'en';

function deepgramEnabled() {
  return !!DG_KEY;
}

/**
 * Transcribe a complete audio file (pre-recorded) with diarization.
 * Returns [{ speaker: 'Speaker N', text, start }] utterances.
 */
async function transcribeFile(buffer, mimetype = 'audio/mpeg') {
  if (!DG_KEY) throw new Error('DEEPGRAM_API_KEY is not configured');
  const params = new URLSearchParams({
    model: DG_MODEL,
    language: DG_LANGUAGE,
    smart_format: 'true',
    punctuate: 'true',
    diarize: 'true',
    utterances: 'true',
  });
  const res = await fetch(`https://api.deepgram.com/v1/listen?${params.toString()}`, {
    method: 'POST',
    headers: { Authorization: `Token ${DG_KEY}`, 'Content-Type': mimetype || 'audio/mpeg' },
    body: buffer,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Deepgram file transcription failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  const data = await res.json();
  const utterances = data.results?.utterances || [];
  if (utterances.length) {
    return utterances
      .filter((u) => (u.transcript || '').trim())
      .map((u) => ({ speaker: `Speaker ${(u.speaker ?? 0) + 1}`, text: u.transcript.trim(), start: u.start ?? 0 }));
  }
  const alt = data.results?.channels?.[0]?.alternatives?.[0];
  const text = (alt?.transcript || '').trim();
  return text ? [{ speaker: 'Speaker 1', text, start: 0 }] : [];
}

/**
 * Open a live transcription connection.
 * @returns {{ send:(buf:Buffer)=>void, finish:()=>void, close:()=>void }}
 */
function openDeepgram({ onTranscript, onError, onClose, onOpen }) {
  if (!DG_KEY) throw new Error('DEEPGRAM_API_KEY is not configured');

  const params = new URLSearchParams({
    model: DG_MODEL,
    language: DG_LANGUAGE,
    encoding: 'linear16',
    sample_rate: '16000',
    channels: '1',
    smart_format: 'true',
    punctuate: 'true',
    interim_results: 'true',
    diarize: 'true',
    endpointing: '300',
  });

  const ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${params.toString()}`, {
    headers: { Authorization: `Token ${DG_KEY}` },
  });

  let keepAlive = null;
  const queue = [];
  let open = false;

  ws.on('open', () => {
    open = true;
    onOpen?.();
    for (const buf of queue.splice(0)) ws.send(buf);
    keepAlive = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'KeepAlive' }));
    }, 8000);
  });

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (msg.type !== 'Results') return;
    const alt = msg.channel?.alternatives?.[0];
    const text = (alt?.transcript || '').trim();
    if (!text) return;
    const speaker = alt.words?.[0]?.speaker ?? 0;
    onTranscript?.({
      text,
      isFinal: !!msg.is_final,
      speaker,
      start: msg.start ?? 0,
      end: (msg.start ?? 0) + (msg.duration ?? 0),
    });
  });

  ws.on('error', (err) => onError?.(err));
  ws.on('close', () => {
    clearInterval(keepAlive);
    onClose?.();
  });

  return {
    send(buf) {
      if (open && ws.readyState === WebSocket.OPEN) ws.send(buf);
      else if (ws.readyState === WebSocket.CONNECTING) queue.push(buf);
    },
    finish() {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'CloseStream' }));
    },
    close() {
      clearInterval(keepAlive);
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    },
  };
}

module.exports = { deepgramEnabled, transcribeFile, openDeepgram };
