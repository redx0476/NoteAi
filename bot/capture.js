// Page-side audio capture for the notetaker bot (runs inside the meeting tab).
//
// Exported as a source string that runner.js injects via page.addInitScript().
// It taps every remote WebRTC audio track (patched RTCPeerConnection + a
// periodic <audio srcObject> sweep as belt-and-braces), mixes them in one
// AudioContext, downsamples to 16 kHz Int16 and ships ~250 ms batches to Node
// through window.__noteaiPcm(base64).
//
// IMPORTANT: samples are interleaved as [0, sample] — a SILENT channel 0 plus
// the meeting mix on channel 1. The server's Deepgram session is opened with
// channels=2 where ch0 is labeled "You" (the local mic); keeping ch0 silent
// means the existing ingest pipeline works unchanged and no bogus "You"
// segments appear. Do not "optimize" this to mono.
//
// A ScriptProcessorNode is used instead of an AudioWorklet on purpose: worklet
// modules need blob: URLs which meeting-site CSPs can block, while the
// (deprecated but universally supported) ScriptProcessor runs everywhere.

const CAPTURE_SOURCE = `(() => {
  if (window.__noteaiCaptureInstalled) return;
  window.__noteaiCaptureInstalled = true;

  const TARGET_RATE = 16000;
  const state = {
    ctx: null,
    mixer: null,
    processor: null,
    tapped: new WeakSet(), // MediaStreamTrack instances already connected
    pending: [],           // streams seen before the AudioContext exists
    chunks: [],            // Int16Array batches awaiting shipment
    queuedSamples: 0,
    totalSamples: 0,
    rms: 0,                // decaying RMS for the audio-liveness spike/debug
  };

  function ensureContext() {
    if (state.ctx) return state.ctx;
    const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
    const mixer = ctx.createGain();
    mixer.gain.value = 1;
    const processor = ctx.createScriptProcessor(4096, 1, 1);

    processor.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      // Decimating downsample with averaging (same approach as the recorder).
      const ratio = ctx.sampleRate / TARGET_RATE;
      const outLen = Math.floor(input.length / ratio);
      const out = new Int16Array(outLen);
      let sumSq = 0;
      for (let i = 0; i < outLen; i++) {
        const from = Math.floor(i * ratio);
        const to = Math.min(Math.floor((i + 1) * ratio), input.length);
        let sum = 0;
        for (let j = from; j < to; j++) sum += input[j];
        const s = Math.max(-1, Math.min(1, to > from ? sum / (to - from) : 0));
        out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        sumSq += s * s;
      }
      state.rms = state.rms * 0.9 + (outLen ? Math.sqrt(sumSq / outLen) : 0) * 0.1;
      state.totalSamples += outLen;
      state.chunks.push(out);
      state.queuedSamples += outLen;
      if (state.queuedSamples >= TARGET_RATE / 4) flush(); // ~250 ms
    };

    // The processor must reach the destination for onaudioprocess to fire.
    // Route it through a zero gain so the bot never plays audio back into
    // whatever output device headless Chromium thinks it has.
    const sink = ctx.createGain();
    sink.gain.value = 0;
    mixer.connect(processor);
    processor.connect(sink);
    sink.connect(ctx.destination);

    state.ctx = ctx;
    state.mixer = mixer;
    state.processor = processor;

    // Autoplay policies can leave the context suspended; keep nudging it.
    setInterval(() => {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    }, 2000);

    for (const stream of state.pending.splice(0)) tapStream(stream);
    return ctx;
  }

  function flush() {
    if (!state.chunks.length) return;
    const total = state.queuedSamples;
    // Interleave [silent ch0, meeting ch1] — see file header for why.
    const inter = new Int16Array(total * 2);
    let o = 0;
    for (const chunk of state.chunks) {
      for (let i = 0; i < chunk.length; i++) {
        inter[o++] = 0;         // ch0: local mic slot, intentionally silent
        inter[o++] = chunk[i];  // ch1: meeting mix
      }
    }
    state.chunks = [];
    state.queuedSamples = 0;

    const bytes = new Uint8Array(inter.buffer);
    let bin = '';
    const STEP = 0x8000;
    for (let i = 0; i < bytes.length; i += STEP) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + STEP));
    }
    try {
      window.__noteaiPcm && window.__noteaiPcm(btoa(bin));
    } catch (e) {
      /* binding not ready yet — drop the batch */
    }
  }

  function tapStream(stream) {
    if (!stream || typeof stream.getAudioTracks !== 'function') return;
    const tracks = stream.getAudioTracks();
    if (!tracks.length) return;
    if (!state.ctx) {
      state.pending.push(stream);
      // Defer creating the AudioContext until real tracks exist so we don't
      // fight autoplay policy at page load.
      ensureContext();
      return;
    }
    let fresh = false;
    for (const t of tracks) {
      if (!state.tapped.has(t)) {
        state.tapped.add(t);
        fresh = true;
      }
    }
    if (!fresh) return;
    try {
      state.ctx.createMediaStreamSource(stream).connect(state.mixer);
    } catch (e) {
      /* stream may be ended/foreign — ignore */
    }
  }

  // Primary hook: every remote audio track arrives through RTCPeerConnection.
  const OrigRTC = window.RTCPeerConnection;
  if (OrigRTC) {
    window.RTCPeerConnection = function (...args) {
      const pc = new OrigRTC(...args);
      pc.addEventListener('track', (ev) => {
        if (ev.track && ev.track.kind === 'audio') {
          tapStream(ev.streams && ev.streams[0] ? ev.streams[0] : new MediaStream([ev.track]));
        }
      });
      return pc;
    };
    window.RTCPeerConnection.prototype = OrigRTC.prototype;
    Object.setPrototypeOf(window.RTCPeerConnection, OrigRTC);
  }

  // Fallback sweep: Meet/Teams attach remote audio to <audio> elements.
  setInterval(() => {
    document.querySelectorAll('audio').forEach((el) => {
      if (el.srcObject) tapStream(el.srcObject);
    });
  }, 2000);

  // Liveness probe for the runner (audio spike / debugging).
  window.__noteaiCaptureStats = () => ({
    contextState: state.ctx ? state.ctx.state : 'none',
    totalSamples: state.totalSamples,
    rms: state.rms,
  });
})();`;

module.exports = { CAPTURE_SOURCE };
