// Browser audio plumbing for the live call.
// Capture: mic → AudioWorklet → 16 kHz mono PCM16 chunks (what Gemini Live expects).
// Playback: 24 kHz PCM16 chunks from Gemini → gap-free scheduled AudioBuffers, flushable on barge-in.

const WORKLET = `
class PcmCapture extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.ratio = sampleRate / 16000;   // input rate → 16 kHz
    this.acc = 0;                      // fractional read position carry-over
    this.buf = new Int16Array(1600);   // 100 ms at 16 kHz
    this.n = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    let sumSq = 0;
    // Box-filter decimation: average the input samples that fall in each output sample.
    let pos = this.acc;
    while (pos < ch.length) {
      const start = Math.floor(pos), end = Math.min(ch.length, Math.floor(pos + this.ratio));
      let s = 0, c = 0;
      for (let i = start; i < Math.max(end, start + 1); i++) { s += ch[i]; c++; }
      const v = Math.max(-1, Math.min(1, s / c));
      sumSq += v * v;
      this.buf[this.n++] = v < 0 ? v * 0x8000 : v * 0x7fff;
      if (this.n === this.buf.length) {
        this.port.postMessage(this.buf.buffer.slice(0));
        this.n = 0;
      }
      pos += this.ratio;
    }
    this.acc = pos - ch.length;
    this.port.postMessage({ level: Math.sqrt(sumSq / Math.max(1, ch.length / this.ratio)) });
    return true;
  }
}
registerProcessor('pcm-capture', PcmCapture);
`;

export function bytesToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function base64ToInt16(b64: string): Int16Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Int16Array(bytes.buffer, 0, Math.floor(bytes.length / 2));
}

export class MicCapture {
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  level = 0;
  muted = false;

  private stream: MediaStream;
  private onChunk: (base64Pcm: string) => void;

  constructor(stream: MediaStream, onChunk: (base64Pcm: string) => void) {
    this.stream = stream;
    this.onChunk = onChunk;
  }

  async start() {
    this.ctx = new AudioContext();
    const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
    await this.ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.ctx, "pcm-capture");
    this.node.port.onmessage = (e) => {
      if (e.data instanceof ArrayBuffer) {
        if (!this.muted) this.onChunk(bytesToBase64(e.data));
      } else if (typeof e.data?.level === "number") {
        // Smooth for the visualiser / silence detection.
        this.level = this.muted ? 0 : this.level * 0.7 + e.data.level * 0.3;
      }
    };
    this.source.connect(this.node);
    // Worklet must be pulled by the graph; route to a muted gain so nothing is heard.
    const sink = this.ctx.createGain();
    sink.gain.value = 0;
    this.node.connect(sink).connect(this.ctx.destination);
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  stop() {
    this.node?.port.close();
    this.source?.disconnect();
    this.node?.disconnect();
    this.stream.getTracks().forEach((t) => t.stop());
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}

export class PcmPlayer {
  private ctx: AudioContext;
  private analyser: AnalyserNode;
  private gain: GainNode;
  private nextTime = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private data: Uint8Array<ArrayBuffer>;
  onDrained: (() => void) | null = null;

  constructor() {
    this.ctx = new AudioContext();
    this.gain = this.ctx.createGain();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.data = new Uint8Array(this.analyser.fftSize);
    this.gain.connect(this.analyser).connect(this.ctx.destination);
  }

  async resume() {
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  // ── Ringback tone while the call connects ("ring-ring … ring-ring") ──
  private ring: { oscs: OscillatorNode[]; gain: GainNode; timer: number } | null = null;

  /** Start a soft telephone ringback: two 0.4 s bursts, then a pause, repeating every 3 s. */
  startRing() {
    if (this.ring) return;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.ctx.destination);
    const oscs = [400, 450].map((f) => {
      const o = this.ctx.createOscillator();
      o.frequency.value = f;
      o.connect(gain);
      o.start();
      return o;
    });
    const schedule = () => {
      const t = this.ctx.currentTime + 0.05;
      const g = gain.gain;
      for (const start of [t, t + 0.6]) {
        g.setValueAtTime(0, start);
        g.linearRampToValueAtTime(0.08, start + 0.02);
        g.setValueAtTime(0.08, start + 0.38);
        g.linearRampToValueAtTime(0, start + 0.4);
      }
    };
    schedule();
    this.ring = { oscs, gain, timer: window.setInterval(schedule, 3000) };
  }

  stopRing() {
    if (!this.ring) return;
    const { oscs, gain, timer } = this.ring;
    this.ring = null;
    window.clearInterval(timer);
    const now = this.ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.05);
    oscs.forEach((o) => { try { o.stop(now + 0.06); } catch { /* already stopped */ } });
  }

  /** Queue one base64 PCM16 chunk at the given sample rate. */
  play(b64: string, rate = 24000) {
    const pcm = base64ToInt16(b64);
    if (!pcm.length) return;
    const buf = this.ctx.createBuffer(1, pcm.length, rate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 0x8000;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.gain);
    const now = this.ctx.currentTime;
    // Small lead on the first chunk absorbs network jitter without adding noticeable latency.
    if (this.nextTime < now + 0.02) this.nextTime = now + 0.06;
    src.start(this.nextTime);
    this.nextTime += buf.duration;
    this.sources.add(src);
    src.onended = () => {
      this.sources.delete(src);
      if (this.sources.size === 0) this.onDrained?.();
    };
  }

  get playing() {
    return this.sources.size > 0;
  }

  /** Stop everything immediately (caller barged in). */
  flush() {
    for (const s of this.sources) {
      try { s.stop(); } catch { /* already stopped */ }
    }
    this.sources.clear();
    this.nextTime = 0;
  }

  /** 0..1 loudness of what the agent is saying right now. */
  level(): number {
    this.analyser.getByteTimeDomainData(this.data);
    let sum = 0;
    for (let i = 0; i < this.data.length; i++) {
      const v = (this.data[i] - 128) / 128;
      sum += v * v;
    }
    return Math.sqrt(sum / this.data.length);
  }

  close() {
    this.flush();
    this.ctx.close().catch(() => {});
  }
}
