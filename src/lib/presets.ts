import { asRecord, loadJSON, saveJSON } from "./storage";
import { DEFAULT_SETTINGS, sanitizeSettings } from "./viz/types";
import type { Settings, VizId } from "./viz/types";

export interface Preset {
  id: string;
  name: string;
  builtin: boolean;
  viz: VizId;
  settings: Settings;
}

const VIZ_IDS = ["spectrum", "radial", "tunnel", "particles", "scope", "spectrogram"] as const;

function mk(
  id: string,
  name: string,
  viz: VizId,
  over: Partial<Settings>,
  fxOver: Partial<Settings["fx"]> = {}
): Preset {
  return {
    id,
    name,
    builtin: true,
    viz,
    settings: {
      ...DEFAULT_SETTINGS,
      ...over,
      fx: { ...DEFAULT_SETTINGS.fx, ...fxOver },
    },
  };
}

export const BUILTIN_PRESETS: Preset[] = [
  mk("builtin-solar", "Solar Flare", "spectrum", { palette: "solar", barCount: 96, peaks: true }, { trails: 0.3, glow: 0.55, flash: 0.22, pulse: 0.7 }),
  mk("builtin-orbit", "Deep Orbit", "radial", { palette: "glacier", radius: 0.27, symmetry: true, barCount: 128 }, { trails: 0.42, glow: 0.7, spin: 0.4, pulse: 0.6 }),
  mk("builtin-horizon", "Event Horizon", "tunnel", { palette: "ember", density: 30, speed: 0.7, spin: 0.45 }, { trails: 0.5, glow: 0.6, pulse: 0.85, flash: 0.3 }),
  mk("builtin-bloom", "Starfield Bloom", "particles", { palette: "prism", particles: 950, psize: 1.1 }, { trails: 0.72, glow: 0.8, pulse: 0.75, background: true }),
  mk("builtin-lab", "Lab Scope", "scope", { palette: "acid", waveThick: 2, scopeMirror: true }, { trails: 0.55, glow: 0.85, background: false }),
  mk("builtin-rain", "Frequency Rain", "spectrogram", { palette: "glacier", spectrogramSpeed: 2, spectrogramLog: true }, { trails: 0, glow: 0.3, background: false }),
  mk("builtin-mirror", "Mirror Field", "spectrum", { palette: "prism", barCount: 72, mirror: true, barStyle: "rounded" }, { trails: 0.38, glow: 0.6, cycle: 0.12, pulse: 0.65 }),
];

export function loadUserPresets(): Preset[] {
  const raw = loadJSON<unknown>("presets");
  if (!Array.isArray(raw)) return [];
  const out: Preset[] = [];
  for (const item of raw.slice(0, 64)) {
    const p = sanitizePreset(item);
    if (p) out.push(p);
  }
  return out;
}

export function persistUserPresets(presets: Preset[]): void {
  saveJSON("presets", presets);
}

export function sanitizePreset(raw: unknown): Preset | null {
  const r = asRecord(raw);
  const id = typeof r.id === "string" && r.id.length > 0 && r.id.length < 64 ? r.id : null;
  const name = typeof r.name === "string" && r.name.trim().length > 0 ? r.name.trim().slice(0, 48) : null;
  const viz = typeof r.viz === "string" && (VIZ_IDS as readonly string[]).includes(r.viz) ? (r.viz as VizId) : null;
  if (!id || !name || !viz) return null;
  return {
    id,
    name,
    builtin: false,
    viz,
    settings: sanitizeSettings(r.settings),
  };
}
