import { engine } from "../lib/audio/engine";
import type { RepeatMode, SourceKind, Track } from "../lib/audio/engine";
import { BUILTIN_PRESETS, loadUserPresets, persistUserPresets } from "../lib/presets";
import type { Preset } from "../lib/presets";
import { asRecord, loadJSON, saveJSON } from "../lib/storage";
import { createStore, useSelector } from "../lib/store";
import { sanitizeSettings } from "../lib/viz/types";
import type { FxSettings, Settings, VizId } from "../lib/viz/types";
import type { MeterData, Renderer } from "../lib/viz/renderer";

/** Zero-re-render channel from the render loop to DOM meter elements. */
export const meterBus: { cb: ((m: MeterData) => void) | null } = { cb: null };

export interface Toast {
  id: number;
  kind: "info" | "error" | "success";
  text: string;
}

export type PanelTab = "library" | "style" | "presets";

export interface AppState {
  tracks: Track[];
  current: number;
  playing: boolean;
  buffering: boolean;
  repeat: RepeatMode;
  shuffle: boolean;
  volume: number;
  muted: boolean;
  source: SourceKind;
  viz: VizId;
  settings: Settings;
  userPresets: Preset[];
  panelOpen: boolean;
  panelTab: PanelTab;
  showPerf: boolean;
  showHelp: boolean;
  dragging: boolean;
  toasts: Toast[];
}

export const STATIONS = [
  { name: "Groove Salad", url: "https://ice1.somafm.com/groovesalad-128-mp3" },
  { name: "Drone Zone", url: "https://ice1.somafm.com/dronezone-128-mp3" },
  { name: "Secret Agent", url: "https://ice1.somafm.com/secretagent-128-mp3" },
  { name: "Lush", url: "https://ice1.somafm.com/lush-128-mp3" },
];

const VIZ_IDS = ["spectrum", "radial", "tunnel", "particles", "scope", "spectrogram"] as const;
const TABS = ["library", "style", "presets"] as const;

function initialState(): AppState {
  const p = asRecord(loadJSON<unknown>("app"));
  const settings = sanitizeSettings(p.settings);
  const vizRaw = p.viz;
  const viz: VizId = typeof vizRaw === "string" && (VIZ_IDS as readonly string[]).includes(vizRaw) ? (vizRaw as VizId) : "spectrum";
  const tabRaw = p.panelTab;
  const volumeRaw = typeof p.volume === "number" ? Math.min(1, Math.max(0, p.volume)) : 0.85;
  return {
    tracks: [],
    current: -1,
    playing: false,
    buffering: false,
    repeat: "off",
    shuffle: false,
    volume: volumeRaw,
    muted: p.muted === true,
    source: "playlist",
    viz,
    settings,
    userPresets: loadUserPresets(),
    panelOpen: true,
    panelTab: typeof tabRaw === "string" && (TABS as readonly string[]).includes(tabRaw) ? (tabRaw as PanelTab) : "library",
    showPerf: p.showPerf === true,
    showHelp: false,
    dragging: false,
    toasts: [],
  };
}

export const appStore = createStore<AppState>(initialState());

/* ------------------------------------------------ wiring */

let renderer: Renderer | null = null;
let saveTimer: number | undefined;
let toastSeq = 1;
let initialized = false;

export function bindRenderer(r: Renderer): void {
  renderer = r;
}

export function unbindRenderer(): void {
  renderer = null;
}

function persistSoon(): void {
  if (saveTimer !== undefined) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    const s = appStore.get();
    saveJSON("app", {
      settings: s.settings,
      viz: s.viz,
      volume: s.volume,
      muted: s.muted,
      panelTab: s.panelTab,
      showPerf: s.showPerf,
    });
  }, 350);
}

function syncFromEngine(): void {
  appStore.set({
    tracks: [...engine.tracks],
    current: engine.current,
    playing: engine.playing,
    buffering: engine.buffering,
    shuffle: engine.shuffle,
    repeat: engine.repeat,
    source: engine.source,
  });
}

export function initApp(): void {
  if (initialized) return;
  initialized = true;
  engine.on("change", syncFromEngine);
  engine.on("meta", syncFromEngine);
  engine.on("error", (msg) => actions.toast(msg, "error"));
  engine.setVolume(appStore.get().volume);
  engine.setMuted(appStore.get().muted);
  syncFromEngine();
}

/* ------------------------------------------------ actions */

export const actions = {
  toast(text: string, kind: Toast["kind"] = "info"): void {
    const id = toastSeq++;
    appStore.set((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, text }] }));
    window.setTimeout(() => actions.dismissToast(id), 5200);
  },

  dismissToast(id: number): void {
    appStore.set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },

  async addFiles(files: File[]): Promise<void> {
    const n = await engine.addFiles(files);
    if (n > 0) actions.toast(`Added ${n} track${n > 1 ? "s" : ""} to the library`, "success");
  },

  addStream(url: string, name: string): void {
    if (engine.addStream(url, name)) actions.toast(`Station "${name.trim() || url}" added`, "success");
  },

  playStation(url: string, name: string): void {
    const existing = engine.tracks.findIndex((t) => t.url === url);
    if (existing >= 0) {
      engine.playIndex(existing);
      return;
    }
    if (engine.addStream(url, name)) engine.playIndex(engine.tracks.length - 1);
  },

  removeTrack(i: number): void {
    engine.removeTrack(i);
  },

  clearPlaylist(): void {
    engine.clearPlaylist();
  },

  playTrack(i: number): void {
    engine.playIndex(i);
  },

  togglePlay(): void {
    if (engine.source !== "playlist") {
      actions.toast("Live input is active — switch the source to Playlist to play tracks.", "info");
      return;
    }
    engine.toggle();
  },

  stop(): void {
    engine.stop();
  },

  next(): void {
    engine.next(false);
  },

  prev(): void {
    engine.prev();
  },

  seekBy(d: number): void {
    engine.seekBy(d);
  },

  seekFrac(f: number): void {
    const d = engine.duration;
    if (d > 0) engine.seekTo(f * d);
  },

  setVolume(v: number): void {
    const vol = Math.min(1, Math.max(0, v));
    engine.setVolume(vol);
    engine.setMuted(false);
    appStore.set({ volume: vol, muted: false });
    persistSoon();
  },

  toggleMute(): void {
    const m = !appStore.get().muted;
    engine.setMuted(m);
    appStore.set({ muted: m });
    persistSoon();
  },

  cycleRepeat(): void {
    const order: RepeatMode[] = ["off", "all", "one"];
    engine.repeat = order[(order.indexOf(engine.repeat) + 1) % order.length];
    syncFromEngine();
  },

  toggleShuffle(): void {
    engine.shuffle = !engine.shuffle;
    syncFromEngine();
  },

  async setSource(kind: SourceKind): Promise<void> {
    try {
      await engine.setSource(kind);
      if (kind === "mic") actions.toast("Microphone is live — visuals are driven by your input.", "success");
      if (kind === "screen") actions.toast("Tab audio is live — play something in the shared tab.", "success");
    } catch (e) {
      actions.toast(e instanceof Error ? e.message : "Could not start this input source.", "error");
      syncFromEngine();
    }
  },

  setViz(id: VizId): void {
    appStore.set({ viz: id });
    renderer?.setViz(id);
    persistSoon();
  },

  cycleViz(dir: number): void {
    const s = appStore.get();
    const i = VIZ_IDS.indexOf(s.viz as (typeof VIZ_IDS)[number]);
    actions.setViz(VIZ_IDS[(i + dir + VIZ_IDS.length) % VIZ_IDS.length]);
  },

  patchSettings(patch: Partial<Settings>): void {
    const cur = appStore.get().settings;
    const next = sanitizeSettings({ ...cur, ...patch });
    appStore.set({ settings: next });
    renderer?.applySettings(next);
    persistSoon();
  },

  patchFx(patch: Partial<FxSettings>): void {
    const cur = appStore.get().settings;
    const next = sanitizeSettings({ ...cur, fx: { ...cur.fx, ...patch } });
    appStore.set({ settings: next });
    renderer?.applySettings(next);
    persistSoon();
  },

  savePreset(name: string): void {
    const trimmed = name.trim();
    if (!trimmed) {
      actions.toast("Give the preset a name first.", "error");
      return;
    }
    const s = appStore.get();
    const preset: Preset = {
      id: "user-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: trimmed.slice(0, 48),
      builtin: false,
      viz: s.viz,
      settings: sanitizeSettings(s.settings),
    };
    const userPresets = [...s.userPresets, preset];
    appStore.set({ userPresets });
    persistUserPresets(userPresets);
    actions.toast(`Preset "${preset.name}" saved`, "success");
  },

  loadPreset(preset: Preset): void {
    const settings = sanitizeSettings(preset.settings);
    appStore.set({ viz: preset.viz, settings });
    renderer?.setViz(preset.viz);
    renderer?.applySettings(settings);
    persistSoon();
    actions.toast(`Loaded "${preset.name}"`, "success");
  },

  deletePreset(id: string): void {
    const userPresets = appStore.get().userPresets.filter((p) => p.id !== id);
    appStore.set({ userPresets });
    persistUserPresets(userPresets);
  },

  renamePreset(id: string, name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    const userPresets = appStore.get().userPresets.map((p) => (p.id === id ? { ...p, name: trimmed.slice(0, 48) } : p));
    appStore.set({ userPresets });
    persistUserPresets(userPresets);
  },

  togglePanel(open?: boolean): void {
    const s = appStore.get();
    appStore.set({ panelOpen: open !== undefined ? open : !s.panelOpen });
  },

  setTab(tab: PanelTab): void {
    appStore.set({ panelTab: tab, panelOpen: true });
    persistSoon();
  },

  togglePerf(): void {
    appStore.set((s) => ({ showPerf: !s.showPerf }));
    persistSoon();
  },

  toggleHelp(): void {
    appStore.set((s) => ({ showHelp: !s.showHelp }));
  },

  setDragging(d: boolean): void {
    if (appStore.get().dragging !== d) appStore.set({ dragging: d });
  },
};

export { BUILTIN_PRESETS, useSelector };
export type { Track, SourceKind, RepeatMode };
