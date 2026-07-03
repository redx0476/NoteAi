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
 * Group a Deepgram word list into consecutive same-speaker runs.
 * @returns {{ speaker:number, text:string, start:number }[]}
 */
function groupWordsBySpeaker(words) {
  const groups = [];
  for (const w of words) {
    const speaker = w.speaker ?? 0;
    const token = w.punctuated_word ?? w.word ?? '';
    const last = groups[groups.length - 1];
    if (last && last.speaker === speaker) {
      last.text += (last.text ? ' ' : '') + token;
    } else {
      groups.push({ speaker, text: token, start: w.start ?? 0 });
    }
  }
  return groups
    .map((g) => ({ ...g, text: g.text.trim() }))
    .filter((g) => g.text);
}

/**
 * Open a live transcription connection.
 * @param {{ channels?: 1|2 }} opts — 2 (default): interleaved ch0 = local mic
 *   ("You"), ch1 = meeting (extension/bot); 1: plain mono (web mic recorder).
 * @returns {{ send:(buf:Buffer)=>void, finish:()=>void, close:()=>void }}
 */
function openDeepgram({ onTranscript, onError, onClose, onOpen, channels = 2 }) {
  if (!DG_KEY) throw new Error('DEEPGRAM_API_KEY is not configured');

  const params = new URLSearchParams({
    model: DG_MODEL,
    language: DG_LANGUAGE,
    encoding: 'linear16',
    sample_rate: '16000',
    // multichannel keeps interleaved channels transcribed separately; diarize
    // still splits multiple speakers within a channel.
    channels: String(channels),
    multichannel: channels > 1 ? 'true' : 'false',
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
    const isFinal = !!msg.is_final;
    const end = (msg.start ?? 0) + (msg.duration ?? 0);
    // Which audio channel this result came from (0 = mic/"You", 1 = meeting).
    const channelIndex = msg.channel_index?.[0] ?? 0;

    // On final results, split the utterance into one segment per speaker so a
    // stretch where two people talk isn't collapsed under the first word's
    // speaker. Interim captions are transient, so keep the cheap first-word path.
    if (isFinal && alt.words?.length) {
      for (const group of groupWordsBySpeaker(alt.words)) {
        onTranscript?.({ text: group.text, isFinal: true, speaker: group.speaker, channelIndex, start: group.start, end });
      }
      return;
    }
    onTranscript?.({
      text,
      isFinal,
      speaker: alt.words?.[0]?.speaker ?? 0,
      channelIndex,
      start: msg.start ?? 0,
      end,
    });
  });

  ws.on('error', (err) => {
    clearInterval(keepAlive);
    onError?.(err);
  });
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

module.exports = { deepgramEnabled, transcribeFile, openDeepgram, groupWordsBySpeaker };
