'use client';

// Captures microphone audio in the browser, downsamples it to linear16 PCM
// (16 kHz, mono) and streams it to the /ws/ingest WebSocket for live Deepgram
// transcription. Returns a controller with stop().

import { wsBase } from './api';

function downsample(input, inRate, outRate) {
  if (outRate >= inRate) return input;
  const ratio = inRate / outRate;
  const outLen = Math.round(input.length / ratio);
  const out = new Float32Array(outLen);
  let outIdx = 0;
  let inIdx = 0;
  while (outIdx < outLen) {
    const next = Math.round((outIdx + 1) * ratio);
    let sum = 0;
    let count = 0;
    for (; inIdx < next && inIdx < input.length; inIdx++) {
      sum += input[inIdx];
      count++;
    }
    out[outIdx++] = count ? sum / count : 0;
  }
  return out;
}

function floatTo16BitPCM(input) {
  const buf = new ArrayBuffer(input.length * 2);
  const view = new DataView(buf);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buf;
}

/**
 * @param {string} meetingId
 * @param {string} token
 * @param {{ onStatus?: (s:string)=>void, onFallback?: (reason:string)=>void }} handlers
 * @returns {Promise<{ stop: () => void }>}
 */
export async function startMicIngest(meetingId, token, { onStatus, onFallback } = {}) {
  // channels=1: this recorder streams plain mono mic PCM (the extension/bot
  // stream 2-channel interleaved and omit the param).
  const url = `${wsBase()}/ws/ingest?meetingId=${encodeURIComponent(meetingId)}&token=${encodeURIComponent(token)}&channels=1`;
  const ws = new WebSocket(url);
  ws.binaryType = 'arraybuffer';

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const ctx = new AudioCtx();
  if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
  const source = ctx.createMediaStreamSource(stream);
  const processor = ctx.createScriptProcessor(4096, 1, 1);

  processor.onaudioprocess = (e) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    const input = e.inputBuffer.getChannelData(0);
    const down = downsample(input, ctx.sampleRate, 16000);
    ws.send(floatTo16BitPCM(down));
  };

  source.connect(processor);
  processor.connect(ctx.destination);

  ws.onopen = () => onStatus?.('connected');
  ws.onmessage = (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (msg.type === 'fallback') onFallback?.(msg.reason || 'streaming_unavailable');
  };
  ws.onerror = () => onStatus?.('error');

  let stopped = false;
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      try {
        processor.disconnect();
        source.disconnect();
      } catch {
        /* ignore */
      }
      stream.getTracks().forEach((t) => t.stop());
      ctx.close().catch(() => {});
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    },
  };
}
