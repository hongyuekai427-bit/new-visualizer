import type { AudioFrame } from "../audio/engine";
import { TAU } from "./types";
import type { PaletteSampler, QualityInfo, Settings, Visualizer } from "./types";

const idleWave = (f: AudioFrame, i: number): number =>
  0.022 + 0.018 * (0.5 + 0.5 * Math.sin(f.t * 1.35 + i * 0.43));

/* ================================================================
   SPECTRUM — log-mapped vertical bars, peaks, mirror, reflection
   ================================================================ */
export class SpectrumViz implements Visualizer {
  readonly id = "spectrum" as const;
  private w = 0;
  private h = 0;

  configure(): void {}
  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
  }
  dispose(): void {}

  render(g: CanvasRenderingContext2D, f: AudioFrame, pal: PaletteSampler, s: Settings, q: QualityInfo): void {
    const w = this.w;
    const h = this.h;
    const n = f.barCount;
    const fx = s.fx;
    const idle = !f.playing && !f.live;
    const padX = Math.max(10, w * 0.022);
    const usable = w - padX * 2;
    const gap = Math.max(1, (usable / n) * 0.24);
    const bw = usable / n - gap;
    const mirror = s.mirror;
    const baseY = mirror ? h * 0.5 : h * 0.9;
    const maxH = mirror ? h * 0.4 : h * 0.78;
    const boost = 1 + f.beatPulse * fx.pulse * 0.12;

    /* horizontal bars — rows grow from the left (or center when mirrored) */
    if (s.barStyle === "rows") {
      const padY = Math.max(10, h * 0.045);
      const usableH = h - padY * 2;
      const gapY = Math.max(1, (usableH / n) * 0.24);
      const rh = usableH / n - gapY;
      const maxW = usable;
      for (let i = 0; i < n; i++) {
        let v = f.bars[i];
        if (idle) v = Math.max(v, idleWave(f, i));
        v = Math.min(1, v * boost);
        const bwid = Math.max(2, v * maxW);
        const y = padY + i * (rh + gapY);
        g.fillStyle = pal.color(i / (n - 1), 0.92);
        if (mirror) g.fillRect(w / 2 - bwid / 2, y, bwid, rh);
        else g.fillRect(padX, y, bwid, rh);
        if (s.peaks) {
          const pw = Math.min(1, f.peaks[i] * boost) * maxW;
          g.fillStyle = "rgba(255,255,255,0.75)";
          if (mirror) g.fillRect(w / 2 + pw / 2 - 1.5, y, 3, rh);
          else g.fillRect(padX + pw - 1.5, y, 3, rh);
        }
      }
      g.globalAlpha = 0.35;
      g.fillStyle = pal.color(0.5);
      g.fillRect(mirror ? w / 2 - 0.5 : padX, padY, 1, usableH);
      g.globalAlpha = 1;
      return;
    }

    const grad = g.createLinearGradient(padX, 0, padX + usable, 0);
    const stops = pal.gradientStops(9);
    for (let i = 0; i < stops.length; i++) grad.addColorStop(i / (stops.length - 1), stops[i]);

    const bars = new Path2D();
    const rounded = s.barStyle === "rounded" && typeof bars.roundRect === "function";

    for (let i = 0; i < n; i++) {
      let v = f.bars[i];
      if (idle) v = Math.max(v, idleWave(f, i));
      v = Math.min(1, v * boost);
      const bh = Math.max(2, v * maxH);
      const x = padX + i * (bw + gap);

      if (s.barStyle === "line") {
        g.globalAlpha = 0.1 + 0.22 * v;
        g.fillStyle = pal.color(i / (n - 1), 1);
        g.fillRect(x, baseY - maxH, bw, maxH * (mirror ? 2 : 1));
        g.globalAlpha = 0.55 + 0.45 * v;
        g.fillRect(x, mirror ? baseY - bh / 2 : baseY - bh, bw, bh);
        continue;
      }

      if (mirror) {
        const y = baseY - bh / 2;
        const r = rounded ? Math.min(bw / 2, 4) : 0;
        if (rounded) bars.roundRect(x, y, bw, bh, r);
        else bars.rect(x, y, bw, bh);
      } else {
        const r = rounded ? Math.min(bw / 2, bh / 2, 5) : 0;
        if (rounded) bars.roundRect(x, baseY - bh, bw, bh, r);
        else bars.rect(x, baseY - bh, bw, bh);
      }
    }

    if (s.barStyle !== "line") {
      // soft reflection underlay (fake bloom, near-free)
      if (!mirror && fx.glow > 0.08) {
        g.save();
        g.globalAlpha = 0.16 * fx.glow;
        g.translate(0, baseY * 2);
        g.scale(1, -1);
        g.fillStyle = grad;
        g.fill(bars);
        g.restore();
      }
      g.globalAlpha = 1;
      g.fillStyle = grad;
      g.fill(bars);

      if (s.peaks) {
        g.fillStyle = "rgba(255,255,255,0.82)";
        for (let i = 0; i < n; i++) {
          const p = Math.min(1, f.peaks[i] * boost);
          const x = padX + i * (bw + gap);
          if (mirror) {
            const off = (p * maxH) / 2;
            g.fillRect(x, baseY - off - 1.5, bw, 3);
            g.fillRect(x, baseY + off - 1.5, bw, 3);
          } else {
            g.fillRect(x, baseY - p * maxH - 4, bw, 3);
          }
        }
      }
    } else if (s.peaks) {
      g.fillStyle = "rgba(255,255,255,0.7)";
      for (let i = 0; i < n; i++) {
        const p = Math.min(1, f.peaks[i]);
        const x = padX + i * (bw + gap);
        g.fillRect(x, baseY - p * maxH - 2, bw, 2);
      }
    }

    // baseline
    g.globalAlpha = 0.35;
    g.fillStyle = pal.color(0.5);
    g.fillRect(padX, mirror ? baseY - 0.5 : baseY, usable, 1);
    g.globalAlpha = 1;
    void q;
  }
}

/* ================================================================
   RADIAL — circular frequency rays with reactive core
   ================================================================ */
export class RadialViz implements Visualizer {
  readonly id = "radial" as const;
  private w = 0;
  private h = 0;

  configure(): void {}
  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
  }
  dispose(): void {}

  render(g: CanvasRenderingContext2D, f: AudioFrame, pal: PaletteSampler, s: Settings, q: QualityInfo): void {
    const w = this.w;
    const h = this.h;
    const cx = w / 2;
    const cy = h / 2;
    const minD = Math.min(w, h);
    const n = f.barCount;
    const fx = s.fx;
    const idle = !f.playing && !f.live;
    const R = minD * s.radius * (1 + f.bass * fx.pulse * 0.12);
    const spinOn = q.reducedMotion ? 0 : 1;
    const rot = f.t * (0.05 + fx.spin * 0.45) * spinOn + f.beatPulse * fx.pulse * 0.1;
    const maxLen = minD * 0.31;

    g.lineCap = "round";
    const lw = Math.max(2, ((TAU * R) / n) * 0.48);
    g.lineWidth = lw;

    for (let i = 0; i < n; i++) {
      const si = s.symmetry ? (i < n / 2 ? i : n - 1 - i) : i;
      let v = f.bars[si];
      if (idle) v = Math.max(v, idleWave(f, i) * 1.4);
      v = Math.min(1, v * (1 + f.beatPulse * fx.pulse * 0.18));
      const len = Math.max(lw * 0.6, v * maxLen);
      const a = rot + (i / n) * TAU;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      g.strokeStyle = pal.color(i / n, 0.92);
      g.beginPath();
      g.moveTo(cx + cos * (R + lw * 0.6), cy + sin * (R + lw * 0.6));
      g.lineTo(cx + cos * (R + lw * 0.6 + len), cy + sin * (R + lw * 0.6 + len));
      g.stroke();

      if (v > 0.58 && i % 5 === 0) {
        const dr = R + lw * 0.6 + len + lw;
        g.fillStyle = "rgba(255,255,255,0.75)";
        g.beginPath();
        g.arc(cx + cos * dr, cy + sin * dr, lw * 0.42, 0, TAU);
        g.fill();
      }
    }

    // reactive core
    const coreR = R * 0.66 * (1 + f.bass * 0.5 * fx.pulse + (idle ? Math.sin(f.t * 0.9) * 0.04 : 0));
    const core = g.createRadialGradient(cx, cy, 0, cx, cy, coreR);
    core.addColorStop(0, pal.color(0.72, 0.95));
    core.addColorStop(0.55, pal.color(0.45, 0.5));
    core.addColorStop(1, pal.color(0.2, 0));
    g.fillStyle = core;
    g.beginPath();
    g.arc(cx, cy, coreR, 0, TAU);
    g.fill();

    // orbit ring
    g.strokeStyle = pal.color(0.85, 0.4);
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(cx, cy, R + lw * 0.3, 0, TAU);
    g.stroke();

    // inner waveform ring — time domain wrapped around the core
    g.strokeStyle = pal.color(0.9, 0.55);
    g.lineWidth = 1.2;
    g.beginPath();
    const wPts = 120;
    const wave = f.wave;
    const wLen = wave.length;
    for (let i = 0; i <= wPts; i++) {
      const a = rot * -0.6 + (i / wPts) * TAU;
      const sample = wave[Math.floor((i / wPts) * (wLen - 1))];
      const rr = coreR * 0.72 + ((sample - 128) / 128) * coreR * 0.4;
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    g.stroke();
  }
}

/* ================================================================
   SCOPE — time-domain oscilloscope with optional mirror + bloom
   ================================================================ */
export class ScopeViz implements Visualizer {
  readonly id = "scope" as const;
  private w = 0;
  private h = 0;

  configure(): void {}
  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
  }
  dispose(): void {}

  render(g: CanvasRenderingContext2D, f: AudioFrame, pal: PaletteSampler, s: Settings, q: QualityInfo): void {
    const w = this.w;
    const h = this.h;
    const fx = s.fx;
    const midY = h / 2;
    const amp = h * 0.3 * (1 + f.bass * fx.pulse * 0.65);
    const idle = !f.playing && !f.live;
    const points = Math.min(Math.max(160, Math.floor(w / 1.5)), 860);
    const wave = f.wave;
    const wLen = wave.length;

    const path = new Path2D();
    for (let i = 0; i < points; i++) {
      let v: number;
      if (idle) {
        v = Math.sin((i / points) * 9 + f.t * 1.8) * 0.035 + Math.sin((i / points) * 23 - f.t * 1.1) * 0.015;
      } else {
        v = (wave[Math.floor((i / (points - 1)) * (wLen - 1))] - 128) / 128;
      }
      const x = (i / (points - 1)) * w;
      const y = midY + v * amp;
      if (i === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    }

    const grad = g.createLinearGradient(0, 0, w, 0);
    const stops = pal.gradientStops(7);
    for (let i = 0; i < stops.length; i++) grad.addColorStop(i / (stops.length - 1), stops[i]);

    g.lineJoin = "round";
    g.lineCap = "round";

    // bloom underlay
    if (fx.glow > 0.05) {
      g.save();
      g.globalAlpha = 0.24 * fx.glow;
      g.strokeStyle = grad;
      g.lineWidth = s.waveThick * 4.2;
      g.stroke(path);
      g.restore();
    }

    g.strokeStyle = grad;
    g.lineWidth = s.waveThick;
    g.stroke(path);

    if (s.scopeMirror) {
      g.save();
      g.globalAlpha = 0.32;
      g.translate(0, midY * 2);
      g.scale(1, -1);
      g.lineWidth = s.waveThick * 0.75;
      g.strokeStyle = grad;
      g.stroke(path);
      g.restore();
    }

    // center hairline
    g.globalAlpha = 0.16;
    g.fillStyle = pal.color(0.5);
    g.fillRect(0, midY - 0.5, w, 1);
    g.globalAlpha = 1;
    void q;
  }
}
