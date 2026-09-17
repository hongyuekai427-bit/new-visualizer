import type { AudioFrame } from "../audio/engine";
import { asRecord, clampNum, pickBool, pickStr } from "../storage";

export type VizId = "spectrum" | "radial" | "tunnel" | "particles" | "scope" | "spectrogram";
export const VIZ_ORDER: VizId[] = ["spectrum", "radial", "tunnel", "particles", "scope", "spectrogram"];
export type BarStyle = "rounded" | "square" | "line" | "rows";
export type QualityMode = "auto" | "high" | "medium" | "low";

export interface FxSettings {
  trails: number;      // 0..1 motion persistence
  glow: number;        // 0..1 additive bloom strength
  cycle: number;       // 0..1 hue cycling speed
  pulse: number;       // 0..1 beat-reactive scaling
  flash: number;       // 0..1 beat flash intensity (capped internally)
  spin: number;        // 0..1 global rotational drift
  background: boolean; // animated ambient background wash
}

export interface Settings {
  fftSize: number;
  smoothing: number;
  minHz: number;
  maxHz: number;
  logFreq: boolean;
  barCount: number;
  barStyle: BarStyle;
  mirror: boolean;
  peaks: boolean;
  radius: number;
  symmetry: boolean;
  density: number;
  speed: number;
  spin: number;
  particles: number;
  psize: number;
  waveThick: number;
  scopeMirror: boolean;
  spectrogramSpeed: number;
  spectrogramLog: boolean;
  palette: string;
  fx: FxSettings;
  quality: QualityMode;
  /** Display brightness applied to the whole visualization surface (1 = neutral). */
  brightness: number;
  /**
   * Spectrum gate threshold in dB below peak. 0 = off (everything draws).
   * Positive values gate bars whose normalized amplitude falls below
   * 10^(-dB/20) — e.g. 20 dB only shows bars within 20 dB of peak.
   */
  spectrumThreshold: number;
}

export const FFT_SIZES = [1024, 2048, 4096, 8192] as const;
export const QUALITY_MODES = ["auto", "high", "medium", "low"] as const;
export const BAR_STYLES = ["rounded", "square", "line", "rows"] as const;

export const DEFAULT_SETTINGS: Settings = {
  fftSize: 2048,
  smoothing: 0.78,
  minHz: 20,
  maxHz: 20000,
  logFreq: true,
  barCount: 96,
  barStyle: "rounded",
  mirror: false,
  peaks: true,
  radius: 0.26,
  symmetry: true,
  density: 26,
  speed: 0.55,
  spin: 0.35,
  particles: 700,
  psize: 1,
  waveThick: 2.5,
  scopeMirror: true,
  spectrogramSpeed: 2,
  spectrogramLog: true,
  palette: "solar",
  fx: { trails: 0.3, glow: 0.55, cycle: 0, pulse: 0.65, flash: 0.2, spin: 0.25, background: true },
  quality: "auto",
  brightness: 1,
  spectrumThreshold: 0,
};

export interface PaletteDef {
  id: string;
  name: string;
  /** HSL stops, evenly spaced across 0..1 */
  stops: [number, number, number][];
}

export const PALETTES: PaletteDef[] = [
  { id: "solar", name: "Solar", stops: [[356, 74, 15], [18, 92, 42], [36, 98, 57], [48, 100, 74]] },
  { id: "glacier", name: "Glacier", stops: [[224, 62, 12], [206, 86, 38], [187, 92, 54], [164, 86, 72]] },
  { id: "ember", name: "Ember", stops: [[358, 82, 11], [9, 90, 34], [24, 96, 52], [41, 100, 67]] },
  { id: "prism", name: "Prism", stops: [[4, 86, 46], [46, 94, 54], [122, 68, 46], [190, 90, 50], [262, 78, 60], [322, 84, 56]] },
  { id: "acid", name: "Ion", stops: [[82, 88, 28], [122, 82, 44], [160, 94, 52], [182, 100, 68]] },
];

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

const LUT_SIZE = 256;

/** Precomputed palette lookup — O(1) color sampling, no per-frame allocation churn. */
export class PaletteSampler {
  private baseH: Float32Array = new Float32Array(LUT_SIZE);
  private baseS: Float32Array = new Float32Array(LUT_SIZE);
  private baseL: Float32Array = new Float32Array(LUT_SIZE);
  private rgbLut: Uint8ClampedArray = new Uint8ClampedArray(LUT_SIZE * 3);
  private strLut: string[] = [];
  private palId = "";
  private shift = Number.NaN;

  setPalette(id: string): void {
    if (id === this.palId) return;
    const def = PALETTES.find((p) => p.id === id) ?? PALETTES[0];
    this.palId = def.id;
    const stops = def.stops;
    const segs = stops.length - 1;
    for (let i = 0; i < LUT_SIZE; i++) {
      const x = (i / (LUT_SIZE - 1)) * segs;
      const s0 = Math.min(segs - 1, Math.floor(x));
      const f = x - s0;
      const a = stops[s0];
      const b = stops[s0 + 1];
      this.baseH[i] = a[0] + (b[0] - a[0]) * f;
      this.baseS[i] = a[1] + (b[1] - a[1]) * f;
      this.baseL[i] = a[2] + (b[2] - a[2]) * f;
    }
    this.shift = Number.NaN;
  }

  /** Rebuild LUTs only when the hue shift actually moved. */
  update(shiftDeg: number): void {
    const q = Math.round(shiftDeg / 1.5) * 1.5;
    if (q === this.shift) return;
    this.shift = q;
    const strs: string[] = new Array(LUT_SIZE);
    for (let i = 0; i < LUT_SIZE; i++) {
      const h = (this.baseH[i] + q) % 360;
      const [r, g, b] = hslToRgb(h < 0 ? h + 360 : h, this.baseS[i], this.baseL[i]);
      this.rgbLut[i * 3] = r;
      this.rgbLut[i * 3 + 1] = g;
      this.rgbLut[i * 3 + 2] = b;
      strs[i] = `rgb(${r},${g},${b})`;
    }
    this.strLut = strs;
  }

  idx(x: number): number {
    const i = Math.round(x * (LUT_SIZE - 1));
    return i < 0 ? 0 : i >= LUT_SIZE ? LUT_SIZE - 1 : i;
  }

  color(x: number, alpha = 1): string {
    const i = this.idx(x);
    if (alpha >= 1) return this.strLut[i];
    const j = i * 3;
    return `rgba(${this.rgbLut[j]},${this.rgbLut[j + 1]},${this.rgbLut[j + 2]},${alpha})`;
  }

  rgbTriple(x: number): [number, number, number] {
    const j = this.idx(x) * 3;
    return [this.rgbLut[j], this.rgbLut[j + 1], this.rgbLut[j + 2]];
  }

  /** CSS gradient stop strings with n stops across the palette. */
  gradientStops(n: number, alpha = 1): string[] {
    const out: string[] = [];
    for (let i = 0; i < n; i++) out.push(this.color(i / (n - 1), alpha));
    return out;
  }
}

/* ------------------------------------------------ sanitization */

const num = (v: unknown, min: number, max: number, fb: number) => clampNum(v, min, max, fb);

function sanitizeFx(raw: unknown): FxSettings {
  const r = asRecord(raw);
  const d = DEFAULT_SETTINGS.fx;
  return {
    trails: num(r.trails, 0, 1, d.trails),
    glow: num(r.glow, 0, 1, d.glow),
    cycle: num(r.cycle, 0, 1, d.cycle),
    pulse: num(r.pulse, 0, 1, d.pulse),
    flash: num(r.flash, 0, 1, d.flash),
    spin: num(r.spin, 0, 1, d.spin),
    background: pickBool(r.background, d.background),
  };
}

export function sanitizeSettings(raw: unknown): Settings {
  const r = asRecord(raw);
  const d = DEFAULT_SETTINGS;
  const fxRaw = asRecord(r.fx);
  const fft = pickStr(String(r.fftSize ?? d.fftSize), FFT_SIZES.map(String), String(d.fftSize));
  return {
    fftSize: Number(fft),
    smoothing: num(r.smoothing, 0, 0.97, d.smoothing),
    minHz: num(r.minHz, 20, 500, d.minHz),
    maxHz: num(r.maxHz, 4000, 20000, d.maxHz),
    logFreq: pickBool(r.logFreq, d.logFreq),
    barCount: Math.round(num(r.barCount, 16, 2048, d.barCount)),
    barStyle: pickStr(r.barStyle, BAR_STYLES, d.barStyle),
    mirror: pickBool(r.mirror, d.mirror),
    peaks: pickBool(r.peaks, d.peaks),
    radius: num(r.radius, 0.1, 0.45, d.radius),
    symmetry: pickBool(r.symmetry, d.symmetry),
    density: Math.round(num(r.density, 8, 48, d.density)),
    speed: num(r.speed, 0.05, 1.5, d.speed),
    spin: num(r.spin, 0, 1, d.spin),
    particles: Math.round(num(r.particles, 100, 1600, d.particles)),
    psize: num(r.psize, 0.4, 2.5, d.psize),
    waveThick: num(r.waveThick, 1, 8, d.waveThick),
    scopeMirror: pickBool(r.scopeMirror, d.scopeMirror),
    spectrogramSpeed: Math.round(num(r.spectrogramSpeed, 1, 6, d.spectrogramSpeed)),
    spectrogramLog: pickBool(r.spectrogramLog, d.spectrogramLog),
    palette: pickStr(r.palette, PALETTES.map((p) => p.id), d.palette),
    fx: sanitizeFx(fxRaw),
    quality: pickStr(r.quality, QUALITY_MODES, d.quality),
    brightness: num(r.brightness, 0.4, 1.6, d.brightness),
    spectrumThreshold: num(r.spectrumThreshold, 0, 60, d.spectrumThreshold),
  };
}

/* ------------------------------------------------ visualizer contract */

export interface QualityInfo {
  scale: number;
  budget: number;
  reducedMotion: boolean;
}

export interface Visualizer {
  readonly id: VizId;
  configure(s: Settings): void;
  resize(w: number, h: number): void;
  render(g: CanvasRenderingContext2D, f: AudioFrame, pal: PaletteSampler, s: Settings, q: QualityInfo): void;
  dispose(): void;
  /** Optional live stat surfaced in the perf overlay. */
  getCount?(): number;
}

export const TAU = Math.PI * 2;
