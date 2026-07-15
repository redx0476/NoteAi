// Runs in the offscreen document. Captures the meeting tab's audio AND the
// user's microphone and streams them to the backend for real-time transcription.
//
// The two sources are kept on separate channels so speakers can be told apart
// deterministically: channel 0 = the microphone ("You"), channel 1 = the
// meeting tab (the other participants). Deepgram runs in multichannel mode.
//
// Primary path (Deepgram configured): open a WebSocket to /ws/ingest and stream
// raw interleaved-stereo PCM (linear16, 16 kHz, 2 channels). Transcripts (interim
// + final, with speaker labels) come back down the same socket and are relayed
// to the live panel.
//
// Fallback path (no streaming provider): record short WebM chunks of a mono mix
// of mic + tab and POST them to /api/transcribe/:id.
//
// Either way, the tab audio is also piped to the speakers so the user still
// hears the meeting. The microphone is never routed to the speakers (that would
// cause echo/feedback).

let stream = null; // tab-audio stream
let micStream = null; // microphone stream (null if permission denied / no device)
let ctx = null;
let tabSource = null;
let micSource = null;
let merger = null; // 2-ch tap node: ch0 = mic, ch1 = tab
let mixDest = null; // mono mixed stream for the batch recorder
let analyser = null;
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

  // Capture the meeting tab's audio (the other participants → channel 1). If the
  // stream id has gone stale or capture is refused, getUserMedia can either throw
  // or hand back a stream with no live audio track. Both mean remote audio is
  // lost, so treat them the same: report TAB_CAPTURE_FAILED and abort — recording
  // only the local mic would silently drop everyone else.
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: msg.streamId } },
    });
  } catch (err) {
    console.error('[noteai] tab capture failed:', err);
    chrome.runtime.sendMessage({ type: 'TAB_CAPTURE_FAILED', message: String(err?.message || err) }).catch(() => {});
    return;
  }
  const tabTracks = stream.getAudioTracks();
  console.log('[noteai] tab audio tracks:', tabTracks.map((t) => ({ readyState: t.readyState, muted: t.muted })));
  if (!tabTracks.length || tabTracks.every((t) => t.readyState === 'ended')) {
    console.error('[noteai] tab capture produced no live audio track');
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
    chrome.runtime.sendMessage({ type: 'TAB_CAPTURE_FAILED', message: 'no live tab audio track' }).catch(() => {});
    return;
  }

  ctx = new AudioContext();
  tabSource = ctx.createMediaStreamSource(stream);
  tabSource.connect(ctx.destination); // keep playing the meeting audio to the user

  // Capture the local microphone so the user's own speech is transcribed. One
  // retry covers transient errors (device briefly busy). If it still fails
  // (permission not granted to the extension origin / no device), continue with
  // tab audio only — the mic channel simply stays silent so remote speakers are
  // still labeled right — and report MIC_DENIED so the user gets warned.
  const openMic = () =>
    navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  try {
    try {
      micStream = await openMic();
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
      micStream = await openMic();
    }
    micSource = ctx.createMediaStreamSource(micStream);
  } catch (err) {
    micStream = null;
    micSource = null;
    chrome.runtime.sendMessage({ type: 'MIC_DENIED', message: String(err?.message || err) }).catch(() => {});
  }

  // Stereo tap: channel 0 = mic ("You"), channel 1 = meeting tab.
  merger = ctx.createChannelMerger(2);
  if (micSource) micSource.connect(merger, 0, 0);
  tabSource.connect(merger, 0, 1);

  // Mono mixed stream for the batch-fallback recorder (captures both voices).
  mixDest = ctx.createMediaStreamDestination();
  if (micSource) micSource.connect(mixDest);
  tabSource.connect(mixDest);

  if (cfg.streaming && cfg.wsBase) {
    startStreaming();
  } else {
    startBatch();
  }

  // Report a rough input level to the popup for the live meter (mic + meeting).
  analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  merger.connect(analyser);
  const buf = new Float32Array(analyser.fftSize);

  // Per-channel diagnostics: tap the tab and mic sources separately so a silent
  // channel is observable. If the tab channel stays at ~0 while the mic is live,
  // the meeting audio isn't being captured (see TAB_CAPTURE_FAILED).
  const tabAnalyser = ctx.createAnalyser();
  tabAnalyser.fftSize = 512;
  tabSource.connect(tabAnalyser);
  const tabBuf = new Float32Array(tabAnalyser.fftSize);
  let micAnalyser = null;
  let micBuf = null;
  if (micSource) {
    micAnalyser = ctx.createAnalyser();
    micAnalyser.fftSize = 512;
    micSource.connect(micAnalyser);
    micBuf = new Float32Array(micAnalyser.fftSize);
  }
  const rmsOf = (an, b) => {
    an.getFloatTimeDomainData(b);
    let sum = 0;
    for (let i = 0; i < b.length; i++) sum += b[i] * b[i];
    return Math.sqrt(sum / b.length);
  };
  let peakTab = 0;
  let peakMic = 0;
  let ticks = 0;

  levelTimer = setInterval(() => {
    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    const rms = Math.min(1, Math.sqrt(sum / buf.length) * 4);
    chrome.runtime.sendMessage({ type: 'LEVEL', level: rms }).catch(() => {});

    peakTab = Math.max(peakTab, rmsOf(tabAnalyser, tabBuf));
    if (micAnalyser) peakMic = Math.max(peakMic, rmsOf(micAnalyser, micBuf));
    if (++ticks >= 7) {
      // ~1s window. Warn once if the meeting channel is essentially silent.
      console.log(`[noteai] channel RMS — tab(ch1)=${peakTab.toFixed(4)} mic(ch0)=${peakMic.toFixed(4)}`);
      if (peakTab < 0.0005) console.warn('[noteai] meeting/tab channel is silent — other participants will NOT be transcribed');
      peakTab = 0;
      peakMic = 0;
      ticks = 0;
    }
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
  // Preferred path: AudioWorkletNode (ScriptProcessorNode is deprecated). The
  // worklet module is same-origin to the offscreen doc, so no web-accessible
  // resource entry is required.
  try {
    await ctx.audioWorklet.addModule(chrome.runtime.getURL('pcm-worklet.js'));
    workletNode = new AudioWorkletNode(ctx, 'pcm-tap', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 2,
      channelCountMode: 'explicit',
      channelInterpretation: 'discrete',
    });
    merger.connect(workletNode);
    // Route through a muted gain node so the graph keeps pulling audio.
    pcmSink = ctx.createGain();
    pcmSink.gain.value = 0;
    workletNode.connect(pcmSink);
    pcmSink.connect(ctx.destination);
    workletNode.port.onmessage = (e) => {
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      const { left, right } = e.data;
      const pcm = downsampleStereoInterleaved(left, right, ctx.sampleRate, TARGET_RATE);
      if (pcm.byteLength) socket.send(pcm);
    };
  } catch {
    // AudioWorklet unavailable — fall back to the deprecated ScriptProcessor.
    attachScriptProcessorTap();
  }
}

function attachScriptProcessorTap() {
  processor = ctx.createScriptProcessor(4096, 2, 2);
  merger.connect(processor);
  // Connect through a muted gain node so the processor keeps firing.
  const sink = ctx.createGain();
  sink.gain.value = 0;
  processor.connect(sink);
  sink.connect(ctx.destination);
  processor._sink = sink;

  processor.onaudioprocess = (e) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const left = e.inputBuffer.getChannelData(0);
    const right = e.inputBuffer.numberOfChannels > 1 ? e.inputBuffer.getChannelData(1) : null;
    const pcm = downsampleStereoInterleaved(left, right, ctx.sampleRate, TARGET_RATE);
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

// Downsample two Float32 mono buffers (left/right) to interleaved 16-bit PCM at
// the target rate. `right` may be null (mic missing) → emitted as silence.
function downsampleStereoInterleaved(left, right, inRate, outRate) {
  const ratio = inRate / outRate;
  const outLen = Math.floor(left.length / ratio);
  const out = new Int16Array(outLen * 2);
  let pos = 0;
  for (let i = 0; i < outLen; i++) {
    const idx = Math.floor(i * ratio);
    let l = Math.max(-1, Math.min(1, left[idx]));
    let r = right ? Math.max(-1, Math.min(1, right[idx])) : 0;
    out[pos++] = l < 0 ? l * 0x8000 : l * 0x7fff;
    out[pos++] = r < 0 ? r * 0x8000 : r * 0x7fff;
  }
  return out.buffer;
}

// ── Batch fallback path ─────────────────────────────────────────────────────
function batchStream() {
  // Prefer the mixed mic+tab stream so the user's voice is captured too.
  return mixDest?.stream || stream;
}

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
  recorder = new MediaRecorder(batchStream(), opts);
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
  form.append('speaker', 'Speaker 1');
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
      speaker: 'Speaker 1',
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
  const mic = micStream;
  stream = null; // breaks the batch loop
  micStream = null;
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
  mic?.getTracks().forEach((t) => t.stop());
  try { ctx?.close(); } catch {}
  ctx = null;
  tabSource = null;
  micSource = null;
  merger = null;
  mixDest = null;
  analyser = null;

  // Close the offscreen document so it doesn't leak across sessions.
  chrome.offscreen?.closeDocument?.().catch(() => {});
}
