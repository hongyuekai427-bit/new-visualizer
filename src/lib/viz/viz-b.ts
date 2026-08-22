import type { AudioFrame } from "../audio/engine";
import { TAU } from "./types";
import type { PaletteSampler, QualityInfo, Settings, Visualizer, VizId } from "./types";
import { RadialViz, ScopeViz, SpectrumViz } from "./viz-a";

/* ================================================================
   TUNNEL — receding perspective rings modulated by the spectrum
   ================================================================ */
interface Ring {
  z: number;
  seed: number;
}

export class TunnelViz implements Visualizer {
  readonly id = "tunnel" as const;
  private w = 0;
  private h = 0;
  private rings: Ring[] = [];
  private density = 0;

  configure(s: Settings): void {
    this.syncDensity(s.density);
  }
  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
  }
  dispose(): void {
    this.rings.length = 0;
  }

  private syncDensity(n: number): void {
    while (this.rings.length < n) {
      this.rings.push({ z: this.rings.length / n, seed: Math.random() });
    }
    if (this.rings.length > n) this.rings.length = n;
    this.density = n;
  }

  render(g: CanvasRenderingContext2D, f: AudioFrame, pal: PaletteSampler, s: Settings, q: QualityInfo): void {
    if (this.rings.length !== s.density) this.syncDensity(s.density);
    const w = this.w;
    const h = this.h;
    const cx = w / 2;
    const cy = h / 2;
    const minD = Math.min(w, h);
    const fx = s.fx;
    const idle = !f.playing && !f.live;
    const spinOn = q.reducedMotion ? 0 : 1;

    const dz = f.dt * s.speed * (0.32 + f.bass * 1.15 + (idle ? 0.1 : 0));
    const rings = this.rings;
    for (let i = 0; i < rings.length; i++) {
      const r = rings[i];
      r.z -= dz * (0.45 + r.z * 0.8);
      if (r.z <= 0.025) {
        r.z += 1;
        r.seed = Math.random();
      }
    }
    rings.sort((a, b) => b.z - a.z);

    const m = q.budget > 0.55 ? 26 : 16;
    const squash = 0.84;
    g.lineJoin = "round";

    for (let i = 0; i < rings.length; i++) {
      const ring = rings[i];
      const p = 1 - ring.z;
      const R = minD * (0.05 + 0.72 * Math.pow(p, 2.05));
      const alpha = Math.pow(p, 1.65) * 0.85;
      if (alpha < 0.02) continue;
      const dir = ring.seed > 0.5 ? 1 : -1;
      const rot =
        ring.seed * TAU +
        f.t * (0.12 + fx.spin * 0.85) * dir * 0.35 * spinOn +
        ring.z * 2.4 +
        f.beatPulse * fx.pulse * 0.25 * dir;
      const wobAmp = 0.1 + f.mid * 0.16;
      g.strokeStyle = pal.color(0.15 + 0.85 * p, alpha);
      g.lineWidth = 1 + p * 4.6;
      g.beginPath();
      for (let k = 0; k <= m; k++) {
        const ki = k % m;
        const ang = rot + (ki / m) * TAU;
        const wobble = 1 + wobAmp * Math.sin(ring.seed * 9.2 + ki * 2.3 + f.t * (0.7 + f.mid * 0.8));
        const fmod = 1 + f.bars[(ki * 7 + Math.floor(ring.seed * 89)) % f.barCount] * 0.26 * p;
        const r = R * wobble * fmod;
        const x = cx + Math.cos(ang) * r;
        const y = cy + Math.sin(ang) * r * squash;
        if (k === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.closePath();
      g.stroke();
    }

    // bright throat
    const coreR = minD * 0.16 * (1 + f.bass * fx.pulse * 0.9);
    const core = g.createRadialGradient(cx, cy, 0, cx, cy, coreR);
    core.addColorStop(0, pal.color(0.85, 0.75 * (0.35 + f.bass)));
    core.addColorStop(1, pal.color(0.4, 0));
    g.fillStyle = core;
    g.beginPath();
    g.arc(cx, cy, coreR, 0, TAU);
    g.fill();
    void this.density;
  }
}

/* ================================================================
   PARTICLES — pooled, audio-reactive emission, zero per-frame alloc
   ================================================================ */
const P_CAP = 1600;

export class ParticlesViz implements Visualizer {
  readonly id = "particles" as const;
  private w = 0;
  private h = 0;
  private px = new Float32Array(P_CAP);
  private py = new Float32Array(P_CAP);
  private vx = new Float32Array(P_CAP);
  private vy = new Float32Array(P_CAP);
  private life = new Float32Array(P_CAP);
  private maxLife = new Float32Array(P_CAP);
  private size = new Float32Array(P_CAP);
  private col = new Float32Array(P_CAP);
  private alive = 0;
  private emitAcc = 0;

  configure(): void {}
  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
  }
  dispose(): void {
    this.alive = 0;
  }
  getCount(): number {
    return this.alive;
  }

  private spawn(f: AudioFrame, burst: boolean): void {
    if (this.alive >= P_CAP) return;
    const i = this.alive++;
    const cx = this.w / 2;
    const cy = this.h / 2;
    const ang = Math.random() * TAU;
    const speed = (burst ? 160 : 46) + Math.random() * (140 + f.mid * 320 + f.bass * 180);
    this.px[i] = cx + (Math.random() - 0.5) * this.w * 0.06;
    this.py[i] = cy + (Math.random() - 0.5) * this.h * 0.06;
    this.vx[i] = Math.cos(ang) * speed;
    this.vy[i] = Math.sin(ang) * speed;
    const lf = 1.1 + Math.random() * 2.1;
    this.life[i] = lf;
    this.maxLife[i] = lf;
    const r = Math.random();
    this.col[i] = r < 0.5 ? 0.08 + Math.random() * 0.28 : r < 0.82 ? 0.4 + Math.random() * 0.3 : 0.74 + Math.random() * 0.26;
    this.size[i] = 1.4 + Math.random() * 2.8;
  }

  render(g: CanvasRenderingContext2D, f: AudioFrame, pal: PaletteSampler, s: Settings, q: QualityInfo): void {
    const dt = f.dt;
    const t = f.t;
    const idle = !f.playing && !f.live;
    const target = s.particles * q.budget;
    const energy = idle ? 0.14 : Math.min(1.5, 0.22 + f.level * 2.6 + f.bass * 0.7);
    const desired = target * Math.min(1, energy);

    this.emitAcc += Math.max(0, (desired - this.alive) * 2.4 + (idle ? target * 0.06 : 0)) * dt;
    let toSpawn = Math.min(70, Math.floor(this.emitAcc));
    this.emitAcc -= toSpawn;
    if (f.beat && !idle) toSpawn = Math.min(P_CAP - this.alive, toSpawn + Math.floor(26 * (0.4 + f.bass)));
    while (toSpawn-- > 0) this.spawn(f, f.beat && !idle);

    const damp = Math.exp(-dt * 0.55);
    const curl = 24 * (0.4 + f.high);
    let i = 0;
    while (i < this.alive) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        const last = --this.alive;
        this.px[i] = this.px[last];
        this.py[i] = this.py[last];
        this.vx[i] = this.vx[last];
        this.vy[i] = this.vy[last];
        this.life[i] = this.life[last];
        this.maxLife[i] = this.maxLife[last];
        this.size[i] = this.size[last];
        this.col[i] = this.col[last];
        continue;
      }
      const x = this.px[i];
      const y = this.py[i];
      this.vx[i] = (this.vx[i] + Math.sin(y * 0.011 + t * 0.7) * curl * dt) * damp;
      this.vy[i] = (this.vy[i] + Math.cos(x * 0.011 - t * 0.6) * curl * dt - 14 * dt) * damp;
      this.px[i] = x + this.vx[i] * dt;
      this.py[i] = y + this.vy[i] * dt;
      i++;
    }

    const psize = s.psize;
    for (let k = 0; k < this.alive; k++) {
      const a = Math.pow(this.life[k] / this.maxLife[k], 1.3) * 0.92;
      const sz = this.size[k] * psize * (0.6 + 0.8 * (this.life[k] / this.maxLife[k]));
      g.fillStyle = pal.color(this.col[k], a);
      g.fillRect(this.px[k] - sz / 2, this.py[k] - sz / 2, sz, sz);
      if (sz > 2.6 && q.budget > 0.5) {
        g.fillStyle = pal.color(this.col[k], a * 0.22);
        g.fillRect(this.px[k] - sz, this.py[k] - sz, sz * 2, sz * 2);
      }
    }
  }
}

/* ================================================================
   SPECTROGRAM — scrolling frequency history via wrapped ImageData
   ================================================================ */
export class SpectrogramViz implements Visualizer {
  readonly id = "spectrogram" as const;
  private w = 0;
  private h = 0;
  private hist: HTMLCanvasElement | null = null;
  private hctx: CanvasRenderingContext2D | null = null;
  private colImg: ImageData | null = null;
  private rows = 0;
  private cols = 640;
  private writeX = 0;
  private rowBins: Uint32Array = new Uint32Array(0);
  private rowKey = "";

  configure(): void {}

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    const rows = Math.max(60, Math.min(220, Math.round(h / 3)));
    this.rows = rows;
    this.hist = document.createElement("canvas");
    this.hist.width = this.cols;
    this.hist.height = rows;
    this.hctx = this.hist.getContext("2d");
    if (this.hctx) {
      this.hctx.fillStyle = "#07090e";
      this.hctx.fillRect(0, 0, this.cols, rows);
    }
    this.colImg = this.hctx ? this.hctx.createImageData(1, rows) : null;
    this.writeX = 0;
    this.rowKey = "";
  }

  dispose(): void {
    this.hist = null;
    this.hctx = null;
    this.colImg = null;
  }

  private ensureRowBins(bins: number, log: boolean): void {
    const key = `${bins}-${this.rows}-${log ? 1 : 0}`;
    if (key === this.rowKey) return;
    this.rowKey = key;
    const out = new Uint32Array(this.rows);
    for (let r = 0; r < this.rows; r++) {
      const x = r / (this.rows - 1); // 0 = bottom (low freq)
      const bin = log
        ? Math.round(Math.pow(Math.max(2, bins - 1), x))
        : Math.round(1 + x * (bins - 2));
      out[r] = Math.max(1, Math.min(bins - 1, bin));
    }
    this.rowBins = out;
  }

  render(g: CanvasRenderingContext2D, f: AudioFrame, pal: PaletteSampler, s: Settings, q: QualityInfo): void {
    if (!this.hist || !this.hctx || !this.colImg) return;
    const w = this.w;
    const h = this.h;
    const rows = this.rows;
    const smooth = f.smooth;
    this.ensureRowBins(smooth.length, s.spectrogramLog);

    const silent = f.level < 0.004 && !f.live && !f.playing;
    if (!silent) {
      const data = this.colImg.data;
      for (let c = 0; c < s.spectrogramSpeed; c++) {
        for (let r = 0; r < rows; r++) {
          const v = smooth[this.rowBins[r]];
          const boosted = Math.min(1, v * (1.15 + v * 0.5));
          const [cr, cg, cb] = pal.rgbTriple(boosted);
          const o = (rows - 1 - r) * 4;
          data[o] = cr;
          data[o + 1] = cg;
          data[o + 2] = cb;
          data[o + 3] = 255;
        }
        this.hctx.putImageData(this.colImg, this.writeX, 0);
        this.writeX = (this.writeX + 1) % this.cols;
      }
    }

    g.imageSmoothingEnabled = true;
    const rightW = this.cols - this.writeX;
    const split = (rightW / this.cols) * w;
    g.drawImage(this.hist, this.writeX, 0, rightW, rows, 0, 0, split, h);
    if (this.writeX > 0) g.drawImage(this.hist, 0, 0, this.writeX, rows, split, 0, w - split, h);

    // playhead edge glow
    const edge = g.createLinearGradient(w - 26, 0, w, 0);
    edge.addColorStop(0, "rgba(255,255,255,0)");
    edge.addColorStop(1, `rgba(255,255,255,${0.1 + f.level * 0.25})`);
    g.fillStyle = edge;
    g.fillRect(w - 26, 0, 26, h);

    // faint reference gridlines
    g.fillStyle = "rgba(255,255,255,0.045)";
    for (let i = 1; i < 5; i++) g.fillRect(0, (h / 5) * i, w, 1);
    void q;
  }
}

/* ================================================================
   Registry
   ================================================================ */
export interface VizMeta {
  id: VizId;
  name: string;
  desc: string;
}

export const VIZ_LIST: VizMeta[] = [
  { id: "spectrum", name: "Spectrum", desc: "Log-mapped analyzer bars with peak caps" },
  { id: "radial", name: "Radial", desc: "Circular rays around a reactive core" },
  { id: "tunnel", name: "Tunnel", desc: "Receding perspective rings in depth" },
  { id: "particles", name: "Particles", desc: "Pooled emission field driven by energy" },
  { id: "scope", name: "Scope", desc: "Time-domain oscilloscope trace" },
  { id: "spectrogram", name: "Spectrogram", desc: "Scrolling frequency history waterfall" },
];

export function createVisualizer(id: VizId): Visualizer {
  switch (id) {
    case "spectrum":
      return new SpectrumViz();
    case "radial":
      return new RadialViz();
    case "tunnel":
      return new TunnelViz();
    case "particles":
      return new ParticlesViz();
    case "scope":
      return new ScopeViz();
    case "spectrogram":
      return new SpectrogramViz();
  }
}
