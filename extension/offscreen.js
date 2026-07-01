// Runs in the offscreen document. Captures the meeting tab's audio and streams
// it to the backend for real-time transcription.
//
// Primary path (Deepgram configured): open a WebSocket to /ws/ingest and stream
// raw PCM (linear16, 16 kHz, mono). Transcripts (interim + final, with speaker
// labels) come back down the same socket and are relayed to the live panel.
//
// Fallback path (no streaming provider): record short WebM chunks and POST them
// to /api/transcribe/:id.
//
// Either way, the tab audio is also piped to the speakers so the user still
// hears the meeting.

let stream = null;
let ctx = null;
let source = null;
let processor = null;
let workletNode = null;
let pcmSink = null;
let socket = null;
let cfg = null;
let startTime = 0;
let mode = null; // 'stream' | 'batch'
let levelTimer = null;

// Batch-fallback state.
let recorder = null;

const TARGET_RATE = 16000;

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.target !== 'offscreen') return;
  if (msg.type === 'OFFSCREEN_START') start(msg);
  if (msg.type === 'OFFSCREEN_STOP') stop();
});

async function start(msg) {
  cfg = msg;
  startTime = Date.now();

  stream = await navigator.mediaDevices.getUserMedia({
    audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: msg.streamId } },
  });

  ctx = new AudioContext();
  source = ctx.createMediaStreamSource(stream);
  source.connect(ctx.destination); // keep playing audio to the user

  if (cfg.streaming && cfg.wsBase) {
    startStreaming();
  } else {
    startBatch();
  }

  // Report a rough input level to the popup for the live meter.
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  levelTimer = setInterval(() => {
    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    const rms = Math.min(1, Math.sqrt(sum / buf.length) * 4);
    chrome.runtime.sendMessage({ type: 'LEVEL', level: rms }).catch(() => {});
  }, 150);
}

// ── Real-time streaming path ────────────────────────────────────────────────
function startStreaming() {
  mode = 'stream';
  const url = `${cfg.wsBase}/ws/ingest?meetingId=${encodeURIComponent(cfg.meetingId)}&token=${encodeURIComponent(cfg.token)}`;
  socket = new WebSocket(url);
  socket.binaryType = 'arraybuffer';

  let connected = false;

  socket.onopen = () => {
    connected = true;
    attachPcmTap();
  };

  socket.onmessage = (ev) => {
    let m;
    try {
      m = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (m.type === 'fallback') {
      // Server has no streaming provider — switch to batch upload.
      teardownPcmTap();
      try { socket.close(); } catch {}
      socket = null;
      startBatch();
      return;
    }
    if (m.type === 'interim' || m.type === 'final') {
      chrome.runtime.sendMessage({
        type: 'SEGMENT',
        kind: m.type,
        text: m.text,
        speaker: m.speaker || 'Speaker',
        tOffset: m.tOffset || 0,
        meetingId: cfg.meetingId,
      }).catch(() => {});
    }
  };

  socket.onerror = () => {
    if (!connected) {
      // Never connected — fall back to batch so notes still get captured.
      teardownPcmTap();
      socket = null;
      startBatch();
    }
  };
}

async function attachPcmTap() {
  const inRate = ctx.sampleRate;
  // Preferred path: AudioWorkletNode (ScriptProcessorNode is deprecated). The
  // worklet module is same-origin to the offscreen doc, so no web-accessible
  // resource entry is required.
  try {
    await ctx.audioWorklet.addModule(chrome.runtime.getURL('pcm-worklet.js'));
    workletNode = new AudioWorkletNode(ctx, 'pcm-tap');
    source.connect(workletNode);
    // Route through a muted gain node so the graph keeps pulling audio.
    pcmSink = ctx.createGain();
    pcmSink.gain.value = 0;
    workletNode.connect(pcmSink);
    pcmSink.connect(ctx.destination);
    workletNode.port.onmessage = (e) => {
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      const pcm = downsampleToInt16(e.data, inRate, TARGET_RATE);
      if (pcm.byteLength) socket.send(pcm);
    };
  } catch {
    // AudioWorklet unavailable — fall back to the deprecated ScriptProcessor.
    attachScriptProcessorTap(inRate);
  }
}

function attachScriptProcessorTap(inRate) {
  processor = ctx.createScriptProcessor(4096, 1, 1);
  source.connect(processor);
  // Connect through a muted gain node so the processor keeps firing.
  const sink = ctx.createGain();
  sink.gain.value = 0;
  processor.connect(sink);
  sink.connect(ctx.destination);
  processor._sink = sink;

  processor.onaudioprocess = (e) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const input = e.inputBuffer.getChannelData(0);
    const pcm = downsampleToInt16(input, inRate, TARGET_RATE);
    if (pcm.byteLength) socket.send(pcm);
  };
}

function teardownPcmTap() {
  if (workletNode) {
    try { workletNode.port.onmessage = null; } catch {}
    try { workletNode.disconnect(); } catch {}
    try { pcmSink?.disconnect(); } catch {}
    workletNode = null;
    pcmSink = null;
  }
  if (processor) {
    try { processor.disconnect(); } catch {}
    try { processor._sink?.disconnect(); } catch {}
    processor.onaudioprocess = null;
    processor = null;
  }
}

// Downsample a Float32 mono buffer to 16-bit PCM at the target rate.
function downsampleToInt16(input, inRate, outRate) {
  const ratio = inRate / outRate;
  const outLen = Math.floor(input.length / ratio);
  const out = new Int16Array(outLen);
  let pos = 0;
  for (let i = 0; i < outLen; i++) {
    const idx = Math.floor(i * ratio);
    let s = input[idx];
    s = Math.max(-1, Math.min(1, s));
    out[pos++] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out.buffer;
}

// ── Batch fallback path ─────────────────────────────────────────────────────
function startBatch() {
  mode = 'batch';
  recordNextChunk();
}

function recordNextChunk() {
  if (!stream || mode !== 'batch') return;
  const chunks = [];
  const opts = {};
  const mime = pickMime();
  if (mime) opts.mimeType = mime;
  recorder = new MediaRecorder(stream, opts);
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.onstop = async () => {
    if (chunks.length) {
      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
      uploadChunk(blob).catch((e) => console.warn('upload failed', e));
    }
    if (stream && mode === 'batch') recordNextChunk();
  };
  recorder.start();
  setTimeout(() => recorder && recorder.state !== 'inactive' && recorder.stop(), cfg.chunkMs || 6000);
}

async function uploadChunk(blob) {
  const tOffset = (Date.now() - startTime) / 1000;
  const form = new FormData();
  form.append('audio', blob, 'chunk.webm');
  form.append('tOffset', String(tOffset));
  const res = await fetch(`${cfg.apiBase}/api/transcribe/${cfg.meetingId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}` },
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (data.text) {
    chrome.runtime.sendMessage({
      type: 'SEGMENT',
      kind: 'final',
      text: data.text,
      tOffset,
      speaker: 'Speaker',
      meetingId: cfg.meetingId,
    }).catch(() => {});
  }
}

function pickMime() {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'];
  return types.find((t) => MediaRecorder.isTypeSupported(t)) || '';
}

// ── Stop / cleanup ──────────────────────────────────────────────────────────
function stop() {
  const s = stream;
  stream = null; // breaks the batch loop
  mode = null;
  clearInterval(levelTimer);
  levelTimer = null;

  teardownPcmTap();
  if (socket) {
    try { socket.close(); } catch {}
    socket = null;
  }
  if (recorder && recorder.state !== 'inactive') {
    try { recorder.stop(); } catch {}
  }
  recorder = null;

  s?.getTracks().forEach((t) => t.stop());
  try { ctx?.close(); } catch {}
  ctx = null;
  source = null;

  // Close the offscreen document so it doesn't leak across sessions.
  chrome.offscreen?.closeDocument?.().catch(() => {});
}
