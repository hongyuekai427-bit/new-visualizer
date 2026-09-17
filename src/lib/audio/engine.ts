import { parseID3 } from "./id3";

export interface Track {
  id: string;
  name: string;
  artist: string;
  album: string;
  url: string;
  kind: "file" | "stream";
  duration: number;
  artwork?: string;
}

export type RepeatMode = "off" | "one" | "all";
export type SourceKind = "playlist" | "mic" | "screen";

/** One reusable snapshot of everything visualizers need for a frame. */
export interface AudioFrame {
  t: number;
  dt: number;
  freq: Uint8Array<ArrayBuffer>;
  smooth: Float32Array;
  wave: Uint8Array<ArrayBuffer>;
  bars: Float32Array;
  peaks: Float32Array;
  barCount: number;
  bass: number;
  mid: number;
  high: number;
  rms: number;
  level: number;
  peakHold: number;
  beat: boolean;
  beatPulse: number;
  playing: boolean;
  live: boolean;
}

interface EngineEvents {
  change: () => void;
  meta: () => void;
  error: (msg: string) => void;
}

function uid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

const FILE_RE = /\.(mp3|wav|ogg|oga|flac|m4a|aac|opus|weba|webm|aif|aiff|mp4)$/i;

export class AudioEngine {
  private el: HTMLAudioElement;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private elementSrc: MediaElementAudioSourceNode | null = null;
  private inputBus: GainNode | null = null;
  private outGain: GainNode | null = null;

  private micStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private screenEndedHandler: (() => void) | null = null;
  /** Live-source graph nodes, kept so stopLive() can fully detach them. */
  private liveNodes: { src: MediaStreamAudioSourceNode; gate: GainNode } | null = null;
  /**
   * Monotonic token guarding async source activation. Starting a capture awaits a
   * permission prompt; if the user switches away mid-await, the stale continuation
   * must not re-activate the capture. Every source switch bumps the token.
   */
  private sourceToken = 0;

  private fftSize = 2048;
  private smoothingUser = 0.8;

  private freq: Uint8Array<ArrayBuffer> = new Uint8Array(1024);
  private waveArr: Uint8Array<ArrayBuffer> = new Uint8Array(2048);
  private smooth: Float32Array = new Float32Array(1024);

  private barCount = 96;
  private barLog = true;
  private minHz = 30;
  private maxHz = 16000;
  private barRanges: Uint32Array = new Uint32Array(192);
  private bandRanges: Uint32Array = new Uint32Array(6);

  private bassS = 0;
  private midS = 0;
  private highS = 0;
  private levelS = 0;
  private peakHoldS = 0;
  private beatAvg = 0;
  private beatAvgFast = 0;
  private lastBeat = -10;
  private beatPulseS = 0;
  private prevBass = 0;

  tracks: Track[] = [];
  current = -1;
  shuffle = false;
  repeat: RepeatMode = "off";
  source: SourceKind = "playlist";
  buffering = false;
  private history: number[] = [];

  frame: AudioFrame;

  private listeners: { [K in keyof EngineEvents]: Set<EngineEvents[K]> } = {
    change: new Set(),
    meta: new Set(),
    error: new Set(),
  };

  constructor() {
    this.el = new Audio();
    this.el.preload = "metadata";

    this.el.addEventListener("play", () => this.emit("change"));
    this.el.addEventListener("pause", () => this.emit("change"));
    this.el.addEventListener("ended", () => this.handleEnded());
    this.el.addEventListener("waiting", () => {
      this.buffering = true;
      this.emit("change");
    });
    this.el.addEventListener("playing", () => {
      this.buffering = false;
      this.emit("change");
    });
    this.el.addEventListener("loadedmetadata", () => {
      const tr = this.tracks[this.current];
      if (tr && Number.isFinite(this.el.duration)) {
        tr.duration = this.el.duration;
        this.emit("meta");
      }
    });
    this.el.addEventListener("error", () => {
      if (!this.el.src || this.el.src === window.location.href) return;
      const tr = this.tracks[this.current];
      const name = tr ? tr.name : "stream";
      this.emit(
        "error",
        tr?.kind === "stream"
          ? `"${name}" failed to load. The station may be offline or blocking cross-origin analysis (CORS).`
          : `Could not decode "${name}" — the file may be corrupt or in an unsupported format.`
      );
    });

    this.frame = {
      t: 0, dt: 0,
      freq: this.freq, smooth: this.smooth, wave: this.waveArr,
      bars: new Float32Array(this.barCount), peaks: new Float32Array(this.barCount),
      barCount: this.barCount,
      bass: 0, mid: 0, high: 0, rms: 0, level: 0, peakHold: 0,
      beat: false, beatPulse: 0, playing: false, live: false,
    };
  }

  on<K extends keyof EngineEvents>(ev: K, fn: EngineEvents[K]): () => void {
    this.listeners[ev].add(fn);
    return () => {
      this.listeners[ev].delete(fn);
    };
  }

  private emit<K extends keyof EngineEvents>(ev: K, ...args: Parameters<EngineEvents[K]>): void {
    const set = this.listeners[ev] as Set<(...a: Parameters<EngineEvents[K]>) => void>;
    set.forEach((fn) => fn(...args));
  }

  /* ------------------------------------------------ context & graph */

  ensureCtx(): AudioContext {
    if (this.ctx) return this.ctx;
    const AC: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) throw new Error("Web Audio is not supported in this browser.");
    const ctx = new AC();
    this.ctx = ctx;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = this.fftSize;
    this.analyser.smoothingTimeConstant = Math.min(0.95, this.smoothingUser * 0.7);
    this.elementSrc = ctx.createMediaElementSource(this.el);
    this.inputBus = ctx.createGain();
    this.outGain = ctx.createGain();
    this.elementSrc.connect(this.inputBus);
    this.inputBus.connect(this.analyser);
    this.analyser.connect(this.outGain);
    this.outGain.connect(ctx.destination);
    this.allocateAnalysisBuffers();
    this.computeBarRanges();
    this.computeBandRanges();
    return ctx;
  }

  private allocateAnalysisBuffers(): void {
    if (!this.analyser) return;
    const bins = this.analyser.frequencyBinCount;
    this.freq = new Uint8Array(bins);
    this.smooth = new Float32Array(bins);
    this.waveArr = new Uint8Array(this.analyser.fftSize);
    this.frame.freq = this.freq;
    this.frame.smooth = this.smooth;
    this.frame.wave = this.waveArr;
  }

  configureAnalysis(fftSize: number, smoothing: number): void {
    this.fftSize = Math.min(8192, Math.max(1024, fftSize));
    this.smoothingUser = Math.min(0.97, Math.max(0, smoothing));
    if (this.ctx && this.analyser) {
      this.analyser.fftSize = this.fftSize;
      this.analyser.smoothingTimeConstant = Math.min(0.95, this.smoothingUser * 0.7);
      this.allocateAnalysisBuffers();
      this.computeBarRanges();
      this.computeBandRanges();
    }
  }

  configureBars(count: number, log: boolean, minHz: number, maxHz: number): void {
    this.barCount = Math.round(Math.min(2048, Math.max(16, count)));
    this.barLog = log;
    this.minHz = minHz;
    this.maxHz = maxHz;
    this.frame.bars = new Float32Array(this.barCount);
    this.frame.peaks = new Float32Array(this.barCount);
    this.frame.barCount = this.barCount;
    this.computeBarRanges();
  }

  private computeBarRanges(): void {
    if (!this.ctx || !this.analyser) return;
    const binHz = this.ctx.sampleRate / this.analyser.fftSize;
    const bins = this.analyser.frequencyBinCount;
    const f0 = this.minHz;
    const f1 = this.maxHz;
    const ranges = new Uint32Array(this.barCount * 2);
    
    for (let i = 0; i < this.barCount; i++) {
      const a = i / (this.barCount - 1);
      const b = (i + 1) / (this.barCount - 1);
      let fa: number;
      let fb: number;
      
      if (this.barLog) {
        // f(i) = f_min * (f_max / f_min) ^ (i / (N - 1))
        // Apply logarithmic mapping to both frequency and FFT bins
        fa = f0 * Math.pow(f1 / f0, a);
        fb = f0 * Math.pow(f1 / f0, b);
      } else {
        fa = f0 + (f1 - f0) * a;
        fb = f0 + (f1 - f0) * b;
      }
      
      // Map frequency to FFT bin index
      const b0 = Math.max(0, Math.min(bins - 1, Math.floor(fa / binHz)));
      const b1 = Math.max(b0 + 1, Math.min(bins, Math.ceil(fb / binHz)));
      ranges[i * 2] = b0;
      ranges[i * 2 + 1] = b1;
    }
    this.barRanges = ranges;
  }

  private computeBandRanges(): void {
    if (!this.ctx || !this.analyser) return;
    const binHz = this.ctx.sampleRate / this.analyser.fftSize;
    const bins = this.analyser.frequencyBinCount;
    const to = (hz: number) => Math.max(0, Math.min(bins, Math.round(hz / binHz)));
    this.bandRanges = new Uint32Array([to(20), to(160), to(160), to(2000), to(2000), Math.max(to(2000) + 1, to(11000))]);
  }

  /* ------------------------------------------------ playlist */

  async addFiles(files: File[]): Promise<number> {
    const ok: File[] = [];
    let skipped = 0;
    for (const f of files) {
      if (f.type.startsWith("audio/") || FILE_RE.test(f.name)) ok.push(f);
      else skipped++;
    }
    for (const f of ok) {
      const tr: Track = {
        id: uid(),
        name: f.name.replace(/\.[^.]+$/, ""),
        artist: "",
        album: "",
        url: URL.createObjectURL(f),
        kind: "file",
        duration: 0,
      };
      this.tracks.push(tr);
      this.readMeta(f, tr);
    }
    if (skipped > 0) this.emit("error", `Skipped ${skipped} unsupported file${skipped > 1 ? "s" : ""}.`);
    if (ok.length > 0) {
      if (this.current === -1) this.select(0);
      this.emit("change");
    }
    return ok.length;
  }

  private readMeta(file: File, tr: Track): void {
    parseID3(file)
      .then((meta) => {
        if (!meta) return;
        if (meta.title) tr.name = meta.title;
        if (meta.artist) tr.artist = meta.artist;
        if (meta.album) tr.album = meta.album;
        if (meta.artwork) tr.artwork = URL.createObjectURL(meta.artwork);
        this.emit("meta");
      })
      .catch(() => undefined);
  }

  addStream(url: string, name: string): boolean {
    let parsed: URL;
    try {
      parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("bad protocol");
    } catch {
      this.emit("error", "Invalid stream URL — must be http(s).");
      return false;
    }
    this.tracks.push({
      id: uid(),
      name: name.trim() || parsed.hostname,
      artist: "internet radio",
      album: "",
      url: parsed.toString(),
      kind: "stream",
      duration: 0,
    });
    this.emit("change");
    return true;
  }

  removeTrack(index: number): void {
    const tr = this.tracks[index];
    if (!tr) return;
    const wasCurrent = index === this.current;
    if (wasCurrent) {
      this.el.pause();
      this.el.removeAttribute("src");
      this.el.load();
    }
    if (tr.kind === "file") {
      URL.revokeObjectURL(tr.url);
      if (tr.artwork) URL.revokeObjectURL(tr.artwork);
    }
    this.tracks.splice(index, 1);
    this.history = this.history.filter((h) => h !== index).map((h) => (h > index ? h - 1 : h));
    if (wasCurrent) {
      this.current = -1;
      if (this.tracks.length > 0) this.select(Math.min(index, this.tracks.length - 1));
    } else if (index < this.current) {
      this.current--;
    }
    this.emit("change");
  }

  clearPlaylist(): void {
    this.el.pause();
    this.el.removeAttribute("src");
    this.el.load();
    for (const tr of this.tracks) {
      if (tr.kind === "file") {
        URL.revokeObjectURL(tr.url);
        if (tr.artwork) URL.revokeObjectURL(tr.artwork);
      }
    }
    this.tracks = [];
    this.current = -1;
    this.history = [];
    this.emit("change");
  }

  private backToPlaylist(): void {
    if (this.source === "playlist") return;
    this.stopLive();
    this.source = "playlist";
    if (this.outGain) this.outGain.gain.value = 1;
    this.emit("change");
  }

  select(index: number, autoplay = false): void {
    if (index < 0 || index >= this.tracks.length) return;
    // Selecting a track is a source switch: cancel any capture still negotiating.
    this.sourceToken++;
    this.backToPlaylist();
    try {
      this.ensureCtx();
    } catch (e) {
      this.emit("error", e instanceof Error ? e.message : "Audio init failed.");
      return;
    }
    const tr = this.tracks[index];
    this.current = index;
    if (tr.kind === "stream") this.el.crossOrigin = "anonymous";
    else this.el.removeAttribute("crossorigin");
    this.el.src = tr.url;
    if (autoplay) void this.play();
    this.emit("change");
  }

  playIndex(index: number): void {
    this.select(index, true);
  }

  async play(): Promise<void> {
    if (this.source !== "playlist") return;
    let ctx: AudioContext;
    try {
      ctx = this.ensureCtx();
    } catch (e) {
      this.emit("error", e instanceof Error ? e.message : "Audio init failed.");
      return;
    }
    if (ctx.state === "suspended") await ctx.resume().catch(() => undefined);
    if (!this.el.src) return;
    try {
      await this.el.play();
    } catch (e) {
      const err = e as DOMException;
      if (err.name === "NotAllowedError") this.emit("error", "Playback was blocked by the browser — press play once more.");
      else this.emit("error", `Playback failed: ${err.message || err.name || "unknown error"}`);
    }
  }

  pause(): void {
    this.el.pause();
  }

  stop(): void {
    this.el.pause();
    try {
      this.el.currentTime = 0;
    } catch {
      /* not seekable yet */
    }
    this.emit("change");
  }

  toggle(): void {
    if (this.source !== "playlist") return;
    if (!this.el.src) {
      if (this.tracks.length > 0) this.playIndex(0);
      else this.emit("error", "Add audio files or a station to begin.");
      return;
    }
    if (this.el.paused) void this.play();
    else this.el.pause();
  }

  next(auto = false): void {
    const n = this.tracks.length;
    if (n === 0) {
      if (auto) this.stop();
      return;
    }
    let idx: number;
    if (this.shuffle && n > 1) {
      do {
        idx = Math.floor(Math.random() * n);
      } while (idx === this.current);
    } else {
      idx = this.current + 1;
      if (idx >= n) {
        if (this.repeat === "all") idx = 0;
        else {
          if (auto) this.stop();
          return;
        }
      }
    }
    if (this.current >= 0) {
      this.history.push(this.current);
      if (this.history.length > 64) this.history.shift();
    }
    this.select(idx, auto || !this.el.paused);
  }

  prev(): void {
    const n = this.tracks.length;
    if (n === 0) return;
    if (this.el.currentTime > 3) {
      this.seekTo(0);
      return;
    }
    const fromHist = this.history.pop();
    const idx = fromHist !== undefined ? fromHist : (this.current - 1 + n) % n;
    this.select(idx, !this.el.paused);
  }

  private handleEnded(): void {
    if (this.repeat === "one") {
      try {
        this.el.currentTime = 0;
      } catch {
        /* ignore */
      }
      void this.play();
      return;
    }
    this.next(true);
  }

  seekTo(t: number): void {
    if (!this.el.src) return;
    const d = this.el.duration;
    const max = Number.isFinite(d) && d > 0 ? d - 0.05 : Number.MAX_SAFE_INTEGER;
    try {
      this.el.currentTime = Math.max(0, Math.min(t, max));
    } catch {
      /* stream without seek support */
    }
    this.emit("change");
  }

  seekBy(delta: number): void {
    this.seekTo((this.el.currentTime || 0) + delta);
  }

  setVolume(v: number): void {
    this.el.volume = Math.min(1, Math.max(0, v));
  }

  setMuted(m: boolean): void {
    this.el.muted = m;
  }

  get currentTime(): number {
    return Number.isFinite(this.el.currentTime) ? this.el.currentTime : 0;
  }

  get duration(): number {
    if (Number.isFinite(this.el.duration) && this.el.duration > 0) return this.el.duration;
    return this.tracks[this.current]?.duration ?? 0;
  }

  get playing(): boolean {
    return this.source === "playlist" && !this.el.paused && !this.el.ended && this.el.src !== "";
  }

  /* ------------------------------------------------ live sources */

  async setSource(kind: SourceKind): Promise<void> {
    // Any switch invalidates a capture that is still being negotiated.
    const token = ++this.sourceToken;
    if (kind === "playlist") {
      this.backToPlaylist();
      return;
    }
    const ctx = this.ensureCtx();
    if (ctx.state === "suspended") await ctx.resume().catch(() => undefined);
    if (token !== this.sourceToken) return;
    this.el.pause();

    if (kind === "mic") {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Microphone capture is not supported in this browser.");
      this.stopLive();
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
      } catch (e) {
        const err = e as DOMException;
        if (err.name === "NotAllowedError" || err.name === "SecurityError")
          throw new Error("Microphone permission was denied. Allow access in the browser bar and retry.");
        if (err.name === "NotFoundError") throw new Error("No microphone was found on this device.");
        throw new Error(`Microphone unavailable: ${err.message || err.name}`);
      }
      if (token !== this.sourceToken) {
        // The user switched away while the permission prompt was open — don't hijack.
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.micStream = stream;
      const src = ctx.createMediaStreamSource(stream);
      const gate = ctx.createGain();
      src.connect(gate);
      gate.connect(this.inputBus!);
      this.liveNodes = { src, gate };
      // Analysis-only: live input feeds the analyser but never the speakers.
      if (this.outGain) this.outGain.gain.value = 0;
      this.source = "mic";
      this.emit("change");
      return;
    }

    if (kind === "screen") {
      if (!navigator.mediaDevices?.getDisplayMedia)
        throw new Error("Screen/tab audio capture is not supported in this browser (try Chrome or Edge).");
      this.stopLive();
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      } catch (e) {
        const err = e as DOMException;
        if (err.name === "NotAllowedError") throw new Error("Screen capture was cancelled or denied.");
        throw new Error(`Screen capture failed: ${err.message || err.name}`);
      }
      if (token !== this.sourceToken) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      if (stream.getAudioTracks().length === 0) {
        stream.getTracks().forEach((t) => t.stop());
        throw new Error('No audio was shared. Pick a browser tab and enable "Also share tab audio".');
      }
      this.screenStream = stream;
      const src = ctx.createMediaStreamSource(stream);
      const gate = ctx.createGain();
      src.connect(gate);
      gate.connect(this.inputBus!);
      this.liveNodes = { src, gate };
      if (this.outGain) this.outGain.gain.value = 0;
      this.screenEndedHandler = () => {
        if (this.source === "screen") this.backToPlaylist();
      };
      stream.getVideoTracks().forEach((t) => t.addEventListener("ended", this.screenEndedHandler!));
      this.source = "screen";
      this.emit("change");
      return;
    }
  }

  private stopLive(): void {
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
    if (this.screenStream) {
      if (this.screenEndedHandler)
        this.screenStream.getVideoTracks().forEach((t) => t.removeEventListener("ended", this.screenEndedHandler!));
      this.screenStream.getTracks().forEach((t) => t.stop());
      this.screenStream = null;
      this.screenEndedHandler = null;
    }
    if (this.liveNodes) {
      try {
        this.liveNodes.src.disconnect();
        this.liveNodes.gate.disconnect();
      } catch {
        /* already detached */
      }
      this.liveNodes = null;
    }
  }

  /* ------------------------------------------------ analysis */

  getFrame(t: number, dt: number): AudioFrame {
    const f = this.frame;
    f.t = t;
    f.dt = dt;
    f.live = this.source !== "playlist";
    f.playing = this.playing;

    if (this.analyser) {
      this.analyser.getByteFrequencyData(this.freq);
      this.analyser.getByteTimeDomainData(this.waveArr);

      const ka = 1 - Math.exp(-dt * 42);
      const kr = 1 - Math.exp(-dt * 8.5);
      const smooth = this.smooth;
      const freq = this.freq;
      for (let i = 0; i < freq.length; i++) {
        const v = freq[i] / 255;
        const s = smooth[i];
        smooth[i] = v > s ? s + (v - s) * ka : s + (v - s) * kr;
      }

      const avgRange = (a: number, b: number): number => {
        if (b <= a) return 0;
        let sum = 0;
        const end = Math.min(b, smooth.length);
        for (let i = a; i < end; i++) sum += smooth[i];
        return sum / (end - a);
      };
      const br = this.bandRanges;
      const kb = 1 - Math.exp(-dt * 13);
      this.bassS += (avgRange(br[0], br[1]) - this.bassS) * kb;
      this.midS += (avgRange(br[2], br[3]) - this.midS) * kb;
      this.highS += (avgRange(br[4], br[5]) - this.highS) * kb;
      f.bass = this.bassS;
      f.mid = this.midS;
      f.high = this.highS;

      let sum = 0;
      let pk = 0;
      const stride = Math.max(1, Math.floor(this.waveArr.length / 512));
      let count = 0;
      for (let i = 0; i < this.waveArr.length; i += stride) {
        const d = (this.waveArr[i] - 128) / 128;
        sum += d * d;
        const ad = d < 0 ? -d : d;
        if (ad > pk) pk = ad;
        count++;
      }
      f.rms = Math.sqrt(sum / Math.max(1, count));
      this.levelS = f.rms > this.levelS
        ? this.levelS + (f.rms - this.levelS) * Math.min(1, dt * 26)
        : this.levelS + (f.rms - this.levelS) * Math.min(1, dt * 4.5);
      f.level = this.levelS;
      this.peakHoldS = Math.max(pk, this.peakHoldS - dt * 0.55);
      f.peakHold = this.peakHoldS;

      const e = this.bassS;
      // Fast average for baseline (adapts quickly to sustained bass)
      this.beatAvgFast += (e - this.beatAvgFast) * (1 - Math.exp(-dt * 8));
      // Slow average for overall level (adapts slowly)
      this.beatAvg += (e - this.beatAvg) * (1 - Math.exp(-dt * 1.35));
      
      // Onset detection: measure the rate of bass energy increase
      const bassDelta = Math.max(0, e - this.prevBass);
      this.prevBass = e;
      
      f.beat = false;
      // Trigger beat if:
      // 1. Refractory period passed (0.15s for faster music)
      // 2. Bass energy above minimum threshold (0.05 for quieter tracks)
      // 3. Bass is rising significantly (onset detection)
      // 4. Current bass exceeds fast average by 15% (lower threshold)
      if (t - this.lastBeat > 0.15 && e > 0.05 && bassDelta > 0.03 && e > this.beatAvgFast * 1.15) {
        f.beat = true;
        this.lastBeat = t;
        this.beatPulseS = 1;
      }
      this.beatPulseS *= Math.exp(-dt * 5.2);
      f.beatPulse = this.beatPulseS;

      const bars = f.bars;
      const peaks = f.peaks;
      const ranges = this.barRanges;
      const n = this.barCount;
      for (let i = 0; i < n; i++) {
        const a = ranges[i * 2];
        const b = ranges[i * 2 + 1];
        let m = 0;
        for (let j = a; j < b; j++) {
          if (smooth[j] > m) m = smooth[j];
        }
        const v = Math.min(1, m * 1.12);
        bars[i] = v;
        const decayed = peaks[i] - dt * (0.2 + peaks[i] * 0.55);
        peaks[i] = decayed > v ? decayed : v;
      }
    } else {
      this.beatPulseS *= Math.exp(-dt * 5.2);
      f.beatPulse = this.beatPulseS;
      this.levelS += (0 - this.levelS) * Math.min(1, dt * 4);
      f.level = this.levelS;
    }
    return f;
  }

  dispose(): void {
    this.stopLive();
    this.el.pause();
    this.el.removeAttribute("src");
    for (const tr of this.tracks) {
      if (tr.kind === "file") {
        URL.revokeObjectURL(tr.url);
        if (tr.artwork) URL.revokeObjectURL(tr.artwork);
      }
    }
    if (this.ctx) void this.ctx.close().catch(() => undefined);
    this.ctx = null;
  }
}

export const engine = new AudioEngine();
