import type { AudioFrame } from "../audio/engine";
import { TAU } from "./types";
import type { PaletteSampler, QualityInfo, Settings, Visualizer } from "./types";

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
    const padX = Math.max(10, w * 0.022);
    const usable = w - padX * 2;
    const step = usable / n;
    const dense = step <= 3;
    const gap = step > 4 ? Math.max(1, step * 0.24) : step * 0.2;
    const bw = Math.max(0.6, step - gap);
    const mirror = s.mirror;
    // Explicit headroom so full-scale bars never touch the top edge.
    const headroom = Math.max(18, h * 0.07);
    const baseY = mirror ? h * 0.5 : h * 0.92;
    const maxH = Math.max(40, mirror ? h * 0.5 - headroom : baseY - headroom);
    const boost = 1 + f.beatPulse * fx.pulse * 0.12;
    
    // Spectrum gate threshold: convert dB to normalized 0-1 range
    // 0 = off, positive dB = gate bars below threshold
    const thresholdDb = s.spectrumThreshold;
    const thresholdNorm = thresholdDb > 0 ? Math.pow(10, -thresholdDb / 20) : 0;
    const thresholdHeight = thresholdNorm * maxH; // Height of threshold line in pixels

    /* horizontal bars — rows grow from the left (or center when mirrored) */
    if (s.barStyle === "rows") {
      const padY = Math.max(10, h * 0.045);
      const usableH = h - padY * 2;
      const gapY = Math.min(Math.max(0.5, (usableH / n) * 0.24), 2);
      const rh = Math.max(0.75, usableH / n - gapY);
      const maxW = usable;
      const thresholdWidth = thresholdNorm * maxW; // Width of threshold line in pixels
      for (let i = 0; i < n; i++) {
        let v = f.bars[i];
        v = Math.min(1, v * boost);
        // Spectrum gate: skip rows below threshold
        if (thresholdNorm > 0 && v < thresholdNorm) continue;
        const bwid = Math.max(2, v * maxW);
        const y = padY + i * (rh + gapY);
        g.fillStyle = pal.color(i / (n - 1), 0.92);
        if (mirror) {
          // For mirrored mode with threshold, draw from threshold line
          if (thresholdNorm > 0 && v >= thresholdNorm) {
            const startX = w / 2 - thresholdWidth / 2;
            const endX = w / 2 - bwid / 2;
            g.fillRect(endX, y, startX - endX, rh);
            g.fillRect(w / 2 + thresholdWidth / 2, y, startX - endX, rh);
          } else {
            g.fillRect(w / 2 - bwid / 2, y, bwid, rh);
          }
        } else {
          // For normal mode with threshold, draw from threshold line rightward
          if (thresholdNorm > 0 && v >= thresholdNorm) {
            const startX = padX + thresholdWidth;
            g.fillRect(startX, y, bwid - thresholdWidth, rh);
          } else {
            g.fillRect(padX, y, bwid, rh);
          }
        }
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

    // Performance optimization: Path2D with thousands of shapes is expensive.
    // Switch to direct fillRect rendering when bar count exceeds threshold.
    const usePath2D = n <= 384 && s.barStyle !== "line";
    const bars = usePath2D ? new Path2D() : null;
    const rounded = s.barStyle === "rounded" && !dense && usePath2D && typeof bars?.roundRect === "function";

    for (let i = 0; i < n; i++) {
      let v = f.bars[i];
      v = Math.min(1, v * boost);
      // Spectrum gate: skip bars below threshold
      if (thresholdNorm > 0 && v < thresholdNorm) continue;
      const bh = Math.max(dense ? 1 : 2, v * maxH);
      const x = padX + i * step;

      if (s.barStyle === "line") {
        g.globalAlpha = 0.1 + 0.22 * v;
        g.fillStyle = pal.color(i / (n - 1), 1);
        if (thresholdNorm > 0 && v >= thresholdNorm) {
          // Background bar from threshold line to full height
          if (mirror) {
            g.fillRect(x, baseY - maxH / 2, bw, maxH / 2 - thresholdHeight / 2);
            g.fillRect(x, baseY + thresholdHeight / 2, bw, maxH / 2 - thresholdHeight / 2);
          } else {
            g.fillRect(x, baseY - maxH, bw, maxH - thresholdHeight);
          }
        } else {
          g.fillRect(x, baseY - maxH, bw, maxH * (mirror ? 2 : 1));
        }
        g.globalAlpha = 0.55 + 0.45 * v;
        if (thresholdNorm > 0 && v >= thresholdNorm) {
          // Amplitude bar from threshold line to actual height
          if (mirror) {
            const startY = baseY - thresholdHeight / 2;
            const endY = baseY - bh / 2;
            g.fillRect(x, endY, bw, startY - endY);
            g.fillRect(x, baseY + thresholdHeight / 2, bw, startY - endY);
          } else {
            const startY = baseY - thresholdHeight;
            const endY = baseY - bh;
            g.fillRect(x, endY, bw, startY - endY);
          }
        } else {
          g.fillRect(x, mirror ? baseY - bh / 2 : baseY - bh, bw, bh);
        }
        continue;
      }

      // High bar count: use direct fillRect for performance
      if (!usePath2D) {
        g.fillStyle = grad;
        if (mirror) {
          // For mirrored mode with threshold, draw from threshold line
          if (thresholdNorm > 0 && v >= thresholdNorm) {
            const startY = baseY - thresholdHeight / 2;
            const endY = baseY - bh / 2;
            g.fillRect(x, endY, bw, startY - endY);
          } else {
            g.fillRect(x, baseY - bh / 2, bw, bh);
          }
        } else {
          // For normal mode with threshold, draw from threshold line upward
          if (thresholdNorm > 0 && v >= thresholdNorm) {
            const startY = baseY - thresholdHeight;
            const endY = baseY - bh;
            g.fillRect(x, endY, bw, startY - endY);
          } else {
            g.fillRect(x, baseY - bh, bw, bh);
          }
        }
        continue;
      }

      // Low bar count: build Path2D for rounded corners
      if (mirror) {
        // For mirrored mode with threshold, draw from threshold line
        let y = baseY - bh / 2;
        let h = bh;
        if (thresholdNorm > 0 && v >= thresholdNorm) {
          const startY = baseY - thresholdHeight / 2;
          const endY = baseY - bh / 2;
          y = endY;
          h = startY - endY;
        }
        const r = rounded ? Math.min(bw / 2, 4) : 0;
        if (rounded) bars!.roundRect(x, y, bw, h, r);
        else bars!.rect(x, y, bw, h);
      } else {
        // For normal mode with threshold, draw from threshold line upward
        let y = baseY - bh;
        let h = bh;
        if (thresholdNorm > 0 && v >= thresholdNorm) {
          const startY = baseY - thresholdHeight;
          const endY = baseY - bh;
          y = endY;
          h = startY - endY;
        }
        const r = rounded ? Math.min(bw / 2, h / 2, 5) : 0;
        if (rounded) bars!.roundRect(x, y, bw, h, r);
        else bars!.rect(x, y, bw, h);
      }
    }

    if (usePath2D && bars) {
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

      if (s.peaks && !dense) {
        g.fillStyle = "rgba(255,255,255,0.82)";
        for (let i = 0; i < n; i++) {
          // Respect threshold: skip peaks for bars below threshold
          if (thresholdNorm > 0 && f.bars[i] * boost < thresholdNorm) continue;
          const p = Math.min(1, f.peaks[i] * boost);
          const x = padX + i * step;
          if (mirror) {
            const off = (p * maxH) / 2;
            g.fillRect(x, baseY - off - 1.5, bw, 3);
            g.fillRect(x, baseY + off - 1.5, bw, 3);
          } else {
            g.fillRect(x, baseY - p * maxH - 4, bw, 3);
          }
        }
      }
    } else if (s.peaks && !dense && s.barStyle !== "line") {
      // Draw peaks for high bar count (direct rendering mode)
      g.fillStyle = "rgba(255,255,255,0.82)";
      for (let i = 0; i < n; i++) {
        // Respect threshold: skip peaks for bars below threshold
        if (thresholdNorm > 0 && f.bars[i] * boost < thresholdNorm) continue;
        const p = Math.min(1, f.peaks[i] * boost);
        const x = padX + i * step;
        if (mirror) {
          const off = (p * maxH) / 2;
          g.fillRect(x, baseY - off - 1.5, bw, 3);
          g.fillRect(x, baseY + off - 1.5, bw, 3);
        } else {
          g.fillRect(x, baseY - p * maxH - 4, bw, 3);
        }
      }
    } else if (s.peaks && !dense) {
      g.fillStyle = "rgba(255,255,255,0.7)";
      for (let i = 0; i < n; i++) {
        // Respect threshold: skip peaks for bars below threshold
        if (thresholdNorm > 0 && f.bars[i] * boost < thresholdNorm) continue;
        const p = Math.min(1, f.peaks[i]);
        const x = padX + i * step;
        g.fillRect(x, baseY - p * maxH - 2, bw, 2);
      }
    }

    // baseline
    g.globalAlpha = 0.35;
    g.fillStyle = pal.color(0.5);
    g.fillRect(padX, mirror ? baseY - 0.5 : baseY, usable, 1);
    
    // Draw threshold line if threshold is active
    if (thresholdNorm > 0) {
      g.globalAlpha = 0.5;
      g.fillStyle = "rgba(255,255,255,0.6)";
      if (mirror) {
        // Draw threshold lines above and below center for mirrored mode
        g.fillRect(padX, baseY - thresholdHeight / 2 - 0.5, usable, 1);
        g.fillRect(padX, baseY + thresholdHeight / 2 - 0.5, usable, 1);
      } else {
        // Draw threshold line for normal mode
        g.fillRect(padX, baseY - thresholdHeight - 0.5, usable, 1);
      }
      g.globalAlpha = 1;
    }
    
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
    const coreR = R * 0.66 * (1 + f.bass * 0.5 * fx.pulse);
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
    const points = Math.min(Math.max(160, Math.floor(w / 1.5)), 860);
    const wave = f.wave;
    const wLen = wave.length;

    const path = new Path2D();
    for (let i = 0; i < points; i++) {
      // Real time-domain data only — silence renders as a flat line.
      const v = (wave[Math.floor((i / (points - 1)) * (wLen - 1))] - 128) / 128;
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
