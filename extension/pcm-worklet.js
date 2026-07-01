// AudioWorklet processor that taps the meeting audio and forwards raw mono
// Float32 PCM to the offscreen document in ~4096-sample chunks. Replaces the
// deprecated ScriptProcessorNode. Downsampling to 16 kHz linear16 happens on
// the main thread (see offscreen.js) so this stays cheap on the audio thread.
class PcmTapProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buf = new Float32Array(4096);
    this._n = 0;
  }

  process(inputs) {
    const input = inputs[0];
    const channel = input && input[0];
    if (channel) {
      for (let i = 0; i < channel.length; i++) {
        this._buf[this._n++] = channel[i];
        if (this._n === this._buf.length) {
          // Transfer a copy so the audio thread can keep reusing the buffer.
          this.port.postMessage(this._buf.slice(0));
          this._n = 0;
        }
      }
    }
    // Keep the processor alive for the lifetime of the graph.
    return true;
  }
}

registerProcessor('pcm-tap', PcmTapProcessor);
