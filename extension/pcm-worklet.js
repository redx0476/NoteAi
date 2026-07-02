// AudioWorklet processor that taps the meeting audio and forwards raw Float32
// PCM to the offscreen document in ~4096-sample chunks. Replaces the deprecated
// ScriptProcessorNode. Downsampling to 16 kHz linear16 happens on the main
// thread (see offscreen.js) so this stays cheap on the audio thread.
//
// The tap is fed a 2-channel signal (left = mic / "You", right = the meeting
// tab). It buffers both channels and posts { left, right }. When only one
// channel is present (tab-only fallback), right is omitted and the main thread
// treats it as mono.
class PcmTapProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._left = new Float32Array(4096);
    this._right = new Float32Array(4096);
    this._n = 0;
  }

  process(inputs) {
    const input = inputs[0];
    const left = input && input[0];
    if (!left) return true;
    const right = input[1] || null;
    for (let i = 0; i < left.length; i++) {
      this._left[this._n] = left[i];
      this._right[this._n] = right ? right[i] : 0;
      this._n++;
      if (this._n === this._left.length) {
        // Transfer copies so the audio thread can keep reusing the buffers.
        this.port.postMessage({ left: this._left.slice(0), right: right ? this._right.slice(0) : null });
        this._n = 0;
      }
    }
    // Keep the processor alive for the lifetime of the graph.
    return true;
  }
}

registerProcessor('pcm-tap', PcmTapProcessor);
