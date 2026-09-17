import type { AudioEngine } from "../audio/engine";
import { PaletteSampler } from "./types";
import type { QualityInfo, QualityMode, Settings, Visualizer, VizId } from "./types";
import { createVisualizer } from "./viz-b";

const TIERS = [
  { scale: 1, budget: 1 },
  { scale: 0.8, budget: 0.78 },
  { scale: 0.65, budget: 0.58 },
  { scale: 0.5, budget: 0.42 },
];

const MODE_RANGE: Record<QualityMode, [number, number]> = {
  auto: [0, 3],
  high: [0, 1],
  medium: [1, 2],
  low: [2, 3],
};

export interface PerfStats {
  fps: number;
  ms: number;
  scale: number;
  tier: number;
  particles: number;
  fft: number;
  resW: number;
  resH: number;
  viz: VizId;
}

export interface MeterData {
  level: number;
  bass: number;
  mid: number;
  high: number;
  pulse: number;
}

/**
 * Owns the single requestAnimationFrame loop, the canvas, DPR/quality scaling,
 * and the shared effects pipeline (trails, ambient wash, beat pulse/flash, vignette).
 */
export class Renderer {
  private canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D | null;
  private engine: AudioEngine;
  private viz: Visualizer;
  private settings: Settings;
  private pal = new PaletteSampler();
  private raf = 0;
  private destroyed = false;
  private lastNow = 0;
  private t0 = performance.now();
  private ro: ResizeObserver | null = null;
  private cw = 1;
  private ch = 1;
  private tier = 0;
  private workEma = 8;
  private gapEma = 16.7;
  private slowTime = 0;
  private fastTime = 0;
  private lastTierAt = 0;
  private vignette: HTMLCanvasElement | null = null;
  /** Downscaled snapshot buffer used for the cheap two-tap bloom pass. */
  private bloomC: HTMLCanvasElement | null = null;
  private bloomG: CanvasRenderingContext2D | null = null;
  private flashEnergy = 0;
  private fpsFrames = 0;
  private fpsAt = 0;
  private fps = 60;
  private reducedMotion = false;
  private motionQuery: MediaQueryList | null = null;
  private onMotionChange: (() => void) | null = null;
  private meterTick = 0;

  onMeter: ((m: MeterData) => void) | null = null;

  constructor(canvas: HTMLCanvasElement, engine: AudioEngine, vizId: VizId, settings: Settings) {
    this.canvas = canvas;
    this.engine = engine;
    this.settings = settings;
    this.g = canvas.getContext("2d", { alpha: false });
    this.viz = createVisualizer(vizId);
    this.viz.configure(settings);
    this.pal.setPalette(settings.palette);

    canvas.addEventListener("contextlost", (e) => e.preventDefault());
    canvas.addEventListener("contextrestored", () => {
      this.g = this.canvas.getContext("2d", { alpha: false });
      this.resize();
    });

    if (typeof window.matchMedia === "function") {
      this.motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
      this.reducedMotion = this.motionQuery.matches;
      this.onMotionChange = () => {
        if (this.motionQuery) this.reducedMotion = this.motionQuery.matches;
      };
      this.motionQuery.addEventListener?.("change", this.onMotionChange);
    }

    engine.configureAnalysis(settings.fftSize, settings.smoothing);
    engine.configureBars(settings.barCount, settings.logFreq, settings.minHz, settings.maxHz);
    engine.setVisualizerGain(settings.visualizerGain);
    this.applyBrightness();

    if (typeof ResizeObserver !== "undefined" && canvas.parentElement) {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(canvas.parentElement);
    }
    this.resize();

    this.fpsAt = performance.now();
    this.lastNow = performance.now();
    const tick = (now: number) => {
      if (this.destroyed) return;
      this.raf = requestAnimationFrame(tick);
      this.frame(now);
    };
    this.raf = requestAnimationFrame(tick);
  }

  /* ------------------------------------------------ public API */

  setViz(id: VizId): void {
    if (id === this.viz.id) return;
    this.viz.dispose();
    this.viz = createVisualizer(id);
    this.viz.configure(this.settings);
    this.viz.resize(this.cw, this.ch);
    if (this.g) {
      this.g.fillStyle = "#07090e";
      this.g.fillRect(0, 0, this.cw, this.ch);
    }
  }

  applySettings(s: Settings): void {
    const prev = this.settings;
    this.settings = s;
    if (s.fftSize !== prev.fftSize || s.smoothing !== prev.smoothing) {
      this.engine.configureAnalysis(s.fftSize, s.smoothing);
    }
    if (
      s.barCount !== prev.barCount ||
      s.logFreq !== prev.logFreq ||
      s.minHz !== prev.minHz ||
      s.maxHz !== prev.maxHz
    ) {
      this.engine.configureBars(s.barCount, s.logFreq, s.minHz, s.maxHz);
    }
    if (s.visualizerGain !== prev.visualizerGain) {
      this.engine.setVisualizerGain(s.visualizerGain);
    }
    this.viz.configure(s);
    if (s.brightness !== prev.brightness) this.applyBrightness();
    if (s.quality !== prev.quality) {
      const [lo, hi] = MODE_RANGE[s.quality];
      this.tier = Math.min(hi, Math.max(lo, this.tier));
      this.slowTime = 0;
      this.fastTime = 0;
      this.resize();
    }
  }

  getPerf(): PerfStats {
    return {
      fps: Math.round(this.fps),
      ms: Math.round(this.workEma * 10) / 10,
      scale: TIERS[this.tier].scale,
      tier: this.tier,
      particles: this.viz.getCount ? this.viz.getCount() : -1,
      fft: this.settings.fftSize,
      resW: this.canvas.width,
      resH: this.canvas.height,
      viz: this.viz.id,
    };
  }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    this.ro = null;
    if (this.motionQuery && this.onMotionChange) {
      this.motionQuery.removeEventListener?.("change", this.onMotionChange);
    }
    this.viz.dispose();
    this.bloomC = null;
    this.bloomG = null;
    this.g = null;
  }

  /* ------------------------------------------------ internals */

  private resize(): void {
    const parent = this.canvas.parentElement;
    if (!parent || !this.g) return;
    const rect = parent.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const scale = TIERS[this.tier].scale;
    this.canvas.width = Math.max(1, Math.round(w * dpr * scale));
    this.canvas.height = Math.max(1, Math.round(h * dpr * scale));
    this.g.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    this.cw = w;
    this.ch = h;
    this.viz.resize(w, h);
    this.buildVignette(w, h);
    // Bloom buffer at ~1/5 resolution: downscale acts as a blur kernel, and the
    // smoothed upscale back produces a wide, soft halo at a fraction of the cost
    // of a real Gaussian pass.
    if (!this.bloomC) {
      this.bloomC = document.createElement("canvas");
      this.bloomG = this.bloomC.getContext("2d");
    }
    if (this.bloomC) {
      this.bloomC.width = Math.max(2, Math.round(this.canvas.width / 5));
      this.bloomC.height = Math.max(2, Math.round(this.canvas.height / 5));
    }
  }

  private buildVignette(w: number, h: number): void {
    const c = document.createElement("canvas");
    c.width = Math.max(2, Math.round(w / 2));
    c.height = Math.max(2, Math.round(h / 2));
    const g = c.getContext("2d");
    if (!g) return;
    const grad = g.createRadialGradient(c.width / 2, c.height / 2, Math.min(c.width, c.height) * 0.36, c.width / 2, c.height / 2, Math.max(c.width, c.height) * 0.72);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, "rgba(0,0,0,0.5)");
    g.fillStyle = grad;
    g.fillRect(0, 0, c.width, c.height);
    this.vignette = c;
  }

  /**
   * Cheap real bloom: the canvas is snapshotted into a ~1/5-resolution buffer
   * (the downscale is the blur kernel), then re-composited additively with
   * smoothing so every bright shape gets a wide, soft halo. Two drawImage calls
   * per frame regardless of scene complexity.
   */
  private renderBloom(): void {
    const g = this.g;
    const bc = this.bloomC;
    const bg = this.bloomG;
    const c = this.canvas;
    if (!g || !bc || !bg) return;
    const glow = this.settings.fx.glow;
    if (glow <= 0.05) return;

    bg.clearRect(0, 0, bc.width, bc.height);
    bg.imageSmoothingEnabled = true;
    bg.drawImage(c, 0, 0, bc.width, bc.height);

    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = "lighter";
    g.imageSmoothingEnabled = true;
    g.globalAlpha = Math.min(0.85, glow * 0.75);
    g.drawImage(bc, 0, 0, bc.width, bc.height, 0, 0, c.width, c.height);
    if (glow > 0.5) {
      // A second, slightly enlarged pass widens the halo for strong glow.
      g.globalAlpha = Math.min(0.5, (glow - 0.5) * 0.8);
      const px = c.width * 0.012;
      const py = c.height * 0.012;
      g.drawImage(bc, 0, 0, bc.width, bc.height, -px, -py, c.width + px * 2, c.height + py * 2);
    }
    g.restore();
  }

  private applyBrightness(): void {
    const b = this.settings.brightness;
    this.canvas.style.filter = Math.abs(b - 1) < 0.011 ? "" : `brightness(${b.toFixed(2)})`;
  }

  private govern(dt: number, now: number): void {
    const [lo, hi] = MODE_RANGE[this.settings.quality];
    const slow = this.workEma > 15 || this.gapEma > 19.8;
    const fast = this.workEma < 9 && this.gapEma < 17.4;
    this.slowTime = slow ? this.slowTime + dt : 0;
    this.fastTime = fast ? this.fastTime + dt : 0;
    if (now - this.lastTierAt < 1400) return;
    if (this.slowTime > 0.9 && this.tier < hi) {
      this.tier++;
      this.lastTierAt = now;
      this.slowTime = 0;
      this.fastTime = 0;
      this.resize();
    } else if (this.fastTime > 4 && this.tier > lo) {
      this.tier--;
      this.lastTierAt = now;
      this.slowTime = 0;
      this.fastTime = 0;
      this.resize();
    }
  }

  private frame(now: number): void {
    const g = this.g;
    if (!g) return;
    let dt = (now - this.lastNow) / 1000;
    this.lastNow = now;
    if (dt <= 0) dt = 0.001;
    if (dt > 0.05) dt = 0.05;
    const t = (now - this.t0) / 1000;

    const workStart = performance.now();
    const f = this.engine.getFrame(t, dt);
    const fx = this.settings.fx;

    this.pal.setPalette(this.settings.palette);
    this.pal.update(t * fx.cycle * 100);

    const w = this.cw;
    const h = this.ch;

    // ---- trails / clear
    g.globalCompositeOperation = "source-over";
    if (fx.trails > 0.01) {
      const a = Math.max(0.05, 1 - fx.trails * 0.94);
      g.fillStyle = `rgba(7,9,14,${a})`;
      g.fillRect(0, 0, w, h);
    } else {
      g.fillStyle = "#07090e";
      g.fillRect(0, 0, w, h);
    }

    // ---- ambient background wash
    if (fx.background && !this.reducedMotion) {
      const cx = w * (0.5 + 0.24 * Math.sin(f.t * 0.071));
      const cy = h * (0.42 + 0.2 * Math.cos(f.t * 0.053));
      const rad = Math.max(w, h) * 0.78;
      const bg = g.createRadialGradient(cx, cy, 0, cx, cy, rad);
      bg.addColorStop(0, this.pal.color(0.16, 0.085 + f.bass * 0.05));
      bg.addColorStop(1, "rgba(7,9,14,0)");
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
    }

    // ---- beat pulse camera scale
    const pulse = f.beatPulse * fx.pulse;
    const pulsing = pulse > 0.005 && !this.reducedMotion;
    if (pulsing) {
      g.save();
      g.translate(w / 2, h / 2);
      const s = 1 + pulse * 0.017;
      g.scale(s, s);
      g.translate(-w / 2, -h / 2);
    }

    // ---- visualizer body (additive when glow is on, for bright overlapping cores)
    if (fx.glow > 0.05) g.globalCompositeOperation = "lighter";
    const qi: QualityInfo = {
      scale: TIERS[this.tier].scale,
      budget: TIERS[this.tier].budget,
      reducedMotion: this.reducedMotion,
    };
    this.viz.render(g, f, this.pal, this.settings, qi);
    g.globalCompositeOperation = "source-over";
    if (pulsing) g.restore();

    // ---- bloom halo (downscale→upscale additive pass)
    this.renderBloom();

    // ---- beat flash (intensity-capped)
    if (f.beat && fx.flash > 0) this.flashEnergy = Math.min(0.09, fx.flash * 0.09);
    if (this.flashEnergy > 0.004) {
      g.fillStyle = `rgba(255,243,228,${this.flashEnergy})`;
      g.fillRect(0, 0, w, h);
      this.flashEnergy *= Math.exp(-dt * 7.5);
    }

    // ---- vignette
    if (this.vignette) g.drawImage(this.vignette, 0, 0, w, h);

    // ---- bookkeeping
    const work = performance.now() - workStart;
    this.workEma = this.workEma * 0.9 + work * 0.1;
    this.gapEma = this.gapEma * 0.9 + dt * 1000 * 0.1;
    this.govern(dt, now);

    this.fpsFrames++;
    if (now - this.fpsAt >= 500) {
      this.fps = (this.fpsFrames * 1000) / (now - this.fpsAt);
      this.fpsFrames = 0;
      this.fpsAt = now;
    }

    this.meterTick++;
    if (this.onMeter && this.meterTick % 2 === 0) {
      this.onMeter({ level: f.level, bass: f.bass, mid: f.mid, high: f.high, pulse: f.beatPulse });
    }
  }
}
