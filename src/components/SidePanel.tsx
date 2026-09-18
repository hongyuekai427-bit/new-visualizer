import {
  Activity,
  Aperture,
  BarChart3,
  Check,
  FolderOpen,
  Orbit,
  Pencil,
  Plus,
  Radio,
  Save,
  Sparkles,
  Trash2,
  Waves,
  X,
} from "lucide-react";
import { useRef, useState } from "react";
import { FFT_SIZES, PALETTES, QUALITY_MODES } from "../lib/viz/types";
import type { BarStyle, QualityMode, VizId } from "../lib/viz/types";
import { VIZ_LIST } from "../lib/viz/viz-b";
import type { Preset } from "../lib/presets";
import { actions, appStore, BUILTIN_PRESETS, STATIONS, useSelector } from "../state/app";
import { formatTime, IconBtn, SectionLabel, Seg, SliderRow, ToggleRow } from "./ui";

const VIZ_ICONS: Record<VizId, typeof BarChart3> = {
  spectrum: BarChart3,
  radial: Orbit,
  tunnel: Aperture,
  particles: Sparkles,
  scope: Activity,
  spectrogram: Waves,
};

/* ------------------------------------------------ Library tab */

function LibraryTab() {
  const tracks = useSelector(appStore, (s) => s.tracks);
  const current = useSelector(appStore, (s) => s.current);
  const playing = useSelector(appStore, (s) => s.playing);
  const fileRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");

  const total = tracks.reduce((a, t) => a + (t.duration > 0 ? t.duration : 0), 0);

  return (
    <div>
      <SectionLabel>Add audio</SectionLabel>
      <input
        ref={fileRef}
        type="file"
        accept="audio/*,.mp3,.wav,.ogg,.oga,.flac,.m4a,.aac,.opus,.webm,.aif,.aiff"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) void actions.addFiles(files);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-line-2 bg-ink-800 px-3 py-2.5 text-[13px] font-medium text-mute transition-colors hover:border-acc/60 hover:text-fog"
      >
        <FolderOpen size={15} className="text-acc" />
        Browse audio files
      </button>

      <SectionLabel>Quick stations</SectionLabel>
      <div className="grid grid-cols-2 gap-1.5">
        {STATIONS.map((st) => (
          <button
            key={st.url}
            type="button"
            onClick={() => actions.playStation(st.url, st.name)}
            title={st.url}
            className="flex items-center gap-1.5 rounded-md border border-line bg-ink-800 px-2 py-1.5 text-left text-[11px] font-medium text-mute transition-all hover:border-teal/50 hover:text-fog active:scale-95"
          >
            <Radio size={12} className="shrink-0 text-teal" />
            <span className="truncate">{st.name}</span>
          </button>
        ))}
      </div>

      <SectionLabel>Custom stream</SectionLabel>
      <div className="flex gap-1.5">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://station.example/stream"
          aria-label="Stream URL"
          className="min-w-0 flex-1 rounded-md border border-line bg-ink-800 px-2.5 py-1.5 font-mono text-[11px] text-fog placeholder:text-dim focus:border-acc/60 focus:outline-none"
        />
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          aria-label="Station name"
          className="w-20 shrink-0 rounded-md border border-line bg-ink-800 px-2.5 py-1.5 text-[11px] text-fog placeholder:text-dim focus:border-acc/60 focus:outline-none"
        />
        <button
          type="button"
          aria-label="Add stream"
          onClick={() => {
            if (url.trim()) {
              actions.addStream(url.trim(), name);
              setUrl("");
              setName("");
            }
          }}
          className="shrink-0 rounded-md border border-line bg-ink-800 px-2.5 text-teal transition-colors hover:border-teal/60"
        >
          <Plus size={15} />
        </button>
      </div>
      <p className="mt-1.5 text-[10px] leading-relaxed text-dim">
        Stations must allow cross-origin access (CORS) to be analyzable.
      </p>

      <SectionLabel>
        Playlist · {tracks.length} {tracks.length === 1 ? "track" : "tracks"}
      </SectionLabel>
      {tracks.length === 0 ? (
        <p className="rounded-md border border-line bg-ink-800/60 px-3 py-4 text-center text-[11px] text-dim">
          Empty — drop audio files anywhere in the window.
        </p>
      ) : (
        <ul className="space-y-0.5">
          {tracks.map((t, i) => {
            const active = i === current;
            return (
              <li key={t.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => actions.playTrack(i)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") actions.playTrack(i);
                  }}
                  className={[
                    "group flex w-full cursor-pointer items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left transition-all",
                    active ? "border-line bg-ink-700" : "hover:bg-ink-800",
                  ].join(" ")}
                >
                  <span className={`w-5 shrink-0 text-right font-mono text-[10px] ${active ? "text-acc" : "text-dim"}`}>
                    {active && playing ? "▶" : i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-[12px] font-medium ${active ? "text-fog" : "text-mute"}`}>
                      {t.name}
                    </span>
                    {t.artist && <span className="block truncate text-[10px] text-dim">{t.artist}</span>}
                  </span>
                  {t.kind === "stream" ? (
                    <span className="pz-chip !text-teal">{t.kind}</span>
                  ) : (
                    <span className="shrink-0 font-mono text-[10px] text-dim">
                      {t.duration > 0 ? formatTime(t.duration) : "--:--"}
                    </span>
                  )}
                  <button
                    type="button"
                    aria-label={`Remove ${t.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      actions.removeTrack(i);
                    }}
                    className="shrink-0 rounded p-1 text-dim opacity-0 transition-all hover:text-danger group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    <X size={13} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {tracks.length > 0 && (
        <div className="mt-3 flex items-center justify-between border-t border-line pt-2.5">
          <span className="font-mono text-[10px] uppercase tracking-wider text-dim">
            {total > 0 ? formatTime(total) + " total" : "live sources"}
          </span>
          <button
            type="button"
            onClick={() => actions.clearPlaylist()}
            className="rounded px-2 py-1 text-[11px] font-medium text-dim transition-colors hover:text-danger"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------ Style tab */

function StyleTab() {
  const viz = useSelector(appStore, (s) => s.viz);
  const s = useSelector(appStore, (s) => s.settings);
  const showPerf = useSelector(appStore, (s) => s.showPerf);
  const fx = s.fx;

  return (
    <div>
      <SectionLabel>Visual engine</SectionLabel>
      <div className="grid grid-cols-2 gap-1.5">
        {VIZ_LIST.map((v) => {
          const Ic = VIZ_ICONS[v.id];
          const active = v.id === viz;
          return (
            <button
              key={v.id}
              type="button"
              title={v.desc}
              aria-pressed={active}
              onClick={() => actions.setViz(v.id)}
              className={[
                "flex items-center gap-2 rounded-md border px-2.5 py-2 text-left transition-all duration-150 active:scale-95",
                active
                  ? "border-acc/60 bg-acc/10 text-fog shadow-[0_0_16px_#ffb45422]"
                  : "border-line bg-ink-800 text-mute hover:border-line-2 hover:text-fog",
              ].join(" ")}
            >
              <Ic size={15} />
              <span className="text-[12px] font-semibold">{v.name}</span>
            </button>
          );
        })}
      </div>

      <SectionLabel>Palette</SectionLabel>
      <div className="grid grid-cols-5 gap-1.5">
        {PALETTES.map((p) => {
          const css = `linear-gradient(90deg, ${p.stops.map(([h, ss, l]) => `hsl(${h} ${ss}% ${l}%)`).join(", ")})`;
          const active = s.palette === p.id;
          return (
            <button
              key={p.id}
              type="button"
              title={p.name}
              aria-label={`Palette ${p.name}`}
              aria-pressed={active}
              onClick={() => actions.patchSettings({ palette: p.id })}
              className={[
                "h-8 rounded-md border transition-all duration-150 active:scale-90",
                active ? "border-fog shadow-[0_0_12px_#ffffff22]" : "border-line hover:border-line-2",
              ].join(" ")}
              style={{ background: css }}
            />
          );
        })}
      </div>

      <SectionLabel>Engine settings</SectionLabel>
      <div className="space-y-2.5">
        {viz === "spectrum" && (
          <>
            <SliderRow label="Bars" value={s.barCount} min={16} max={2048} step={4} onChange={(v) => actions.patchSettings({ barCount: v })} />
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-medium text-mute">Bar style</span>
              <Seg<BarStyle>
                ariaLabel="Bar style"
                size="sm"
                value={s.barStyle}
                onChange={(v) => actions.patchSettings({ barStyle: v })}
                options={[
                  { value: "rounded", label: "Soft" },
                  { value: "square", label: "Block" },
                  { value: "line", label: "Line" },
                  { value: "rows", label: "Rows" },
                ]}
              />
            </div>
            <ToggleRow label="Mirrored" checked={s.mirror} onChange={(v) => actions.patchSettings({ mirror: v })} />
            <ToggleRow label="Peak indicators" checked={s.peaks} onChange={(v) => actions.patchSettings({ peaks: v })} />
            <SliderRow
              label="dB threshold"
              value={s.spectrumThreshold}
              min={0}
              max={60}
              step={1}
              onChange={(v) => actions.patchSettings({ spectrumThreshold: v })}
              format={(v) => (v === 0 ? "Off" : `-${v} dB`)}
            />
          </>
        )}
        {viz === "radial" && (
          <>
            <SliderRow label="Rays" value={s.barCount} min={16} max={2048} step={4} onChange={(v) => actions.patchSettings({ barCount: v })} />
            <SliderRow label="Core radius" value={s.radius} min={0.1} max={0.45} step={0.01} onChange={(v) => actions.patchSettings({ radius: v })} format={(v) => `${Math.round(v * 100)}%`} />
            <ToggleRow label="Symmetry" checked={s.symmetry} onChange={(v) => actions.patchSettings({ symmetry: v })} />
          </>
        )}
        {viz === "tunnel" && (
          <>
            <SliderRow label="Ring density" value={s.density} min={8} max={48} step={1} onChange={(v) => actions.patchSettings({ density: v })} />
            <SliderRow label="Forward speed" value={s.speed} min={0.05} max={1.5} step={0.05} onChange={(v) => actions.patchSettings({ speed: v })} format={(v) => v.toFixed(2)} />
            <SliderRow label="Twist" value={s.spin} min={0} max={1} step={0.01} onChange={(v) => actions.patchSettings({ spin: v })} format={(v) => `${Math.round(v * 100)}%`} />
          </>
        )}
        {viz === "particles" && (
          <>
            <SliderRow label="Particle budget" value={s.particles} min={100} max={1600} step={50} onChange={(v) => actions.patchSettings({ particles: v })} />
            <SliderRow label="Size" value={s.psize} min={0.4} max={2.5} step={0.05} onChange={(v) => actions.patchSettings({ psize: v })} format={(v) => `${v.toFixed(2)}×`} />
          </>
        )}
        {viz === "scope" && (
          <>
            <SliderRow label="Trace weight" value={s.waveThick} min={1} max={8} step={0.5} onChange={(v) => actions.patchSettings({ waveThick: v })} format={(v) => `${v}px`} />
            <ToggleRow label="Mirror trace" checked={s.scopeMirror} onChange={(v) => actions.patchSettings({ scopeMirror: v })} />
          </>
        )}
        {viz === "spectrogram" && (
          <>
            <SliderRow label="Scroll speed" value={s.spectrogramSpeed} min={1} max={6} step={1} onChange={(v) => actions.patchSettings({ spectrogramSpeed: v })} format={(v) => `${v} col/f`} />
            <ToggleRow label="Log frequency axis" checked={s.spectrogramLog} onChange={(v) => actions.patchSettings({ spectrogramLog: v })} />
          </>
        )}
      </div>

      <SectionLabel>Analysis</SectionLabel>
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-medium text-mute">FFT size</span>
          <Seg<string>
            ariaLabel="FFT size"
            size="sm"
            value={String(s.fftSize)}
            onChange={(v) => actions.patchSettings({ fftSize: Number(v) })}
            options={FFT_SIZES.map((f) => ({ value: String(f), label: f >= 1024 ? `${f / 1024}k` : String(f) }))}
          />
        </div>
        <SliderRow label="Smoothing" value={s.smoothing} min={0} max={0.97} step={0.01} onChange={(v) => actions.patchSettings({ smoothing: v })} format={(v) => `${Math.round(v * 100)}%`} />
        <SliderRow label="Low cut" value={s.minHz} min={20} max={500} step={5} onChange={(v) => actions.patchSettings({ minHz: v })} format={(v) => `${v} Hz`} />
        <SliderRow label="High cut" value={s.maxHz} min={4000} max={20000} step={500} onChange={(v) => actions.patchSettings({ maxHz: v })} format={(v) => `${(v / 1000).toFixed(1)} kHz`} />
        <ToggleRow label="Log frequency spacing" checked={s.logFreq} onChange={(v) => actions.patchSettings({ logFreq: v })} />
        <SliderRow label="Visualizer gain" value={s.visualizerGain} min={-10} max={10} step={0.5} onChange={(v) => actions.patchSettings({ visualizerGain: v })} format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`} />
        <SliderRow label="Bass sensitivity" value={s.bassSensitivity} min={-15} max={15} step={0.5} onChange={(v) => actions.patchSettings({ bassSensitivity: v })} format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`} />
      </div>

      <SectionLabel>Effects</SectionLabel>
      <div className="space-y-2.5">
        <SliderRow label="Trails" value={fx.trails} min={0} max={1} step={0.01} onChange={(v) => actions.patchFx({ trails: v })} format={(v) => `${Math.round(v * 100)}%`} fill="var(--color-teal)" />
        <SliderRow label="Glow" value={fx.glow} min={0} max={1} step={0.01} onChange={(v) => actions.patchFx({ glow: v })} format={(v) => `${Math.round(v * 100)}%`} fill="var(--color-teal)" />
        <SliderRow label="Color cycle" value={fx.cycle} min={0} max={1} step={0.01} onChange={(v) => actions.patchFx({ cycle: v })} format={(v) => `${Math.round(v * 100)}%`} fill="var(--color-teal)" />
        <SliderRow label="Beat pulse" value={fx.pulse} min={0} max={1} step={0.01} onChange={(v) => actions.patchFx({ pulse: v })} format={(v) => `${Math.round(v * 100)}%`} fill="var(--color-acc-2)" />
        <SliderRow label="Beat flash" value={fx.flash} min={0} max={1} step={0.01} onChange={(v) => actions.patchFx({ flash: v })} format={(v) => `${Math.round(v * 100)}%`} fill="var(--color-acc-2)" />
        <SliderRow label="Motion spin" value={fx.spin} min={0} max={1} step={0.01} onChange={(v) => actions.patchFx({ spin: v })} format={(v) => `${Math.round(v * 100)}%`} fill="var(--color-teal)" />
        <ToggleRow label="Ambient background" checked={fx.background} onChange={(v) => actions.patchFx({ background: v })} />
      </div>

      <SectionLabel>Performance</SectionLabel>
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-medium text-mute">Quality</span>
          <Seg<QualityMode>
            ariaLabel="Quality mode"
            size="sm"
            value={s.quality}
            onChange={(v) => actions.patchSettings({ quality: v })}
            options={QUALITY_MODES.map((qm) => ({ value: qm, label: qm }))}
          />
        </div>
        <ToggleRow label="Performance overlay" checked={showPerf} onChange={() => actions.togglePerf()} />
        <p className="text-[10px] leading-relaxed text-dim">
          Auto mode steps render scale and particle budget up or down with hysteresis to hold frame pacing — no
          oscillation.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------ Presets tab */

function PresetRow({ p, user }: { p: Preset; user?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(p.name);
  return (
    <li className="group flex items-center gap-1.5 rounded-md border border-line bg-ink-800 px-2 py-1.5 transition-colors hover:border-line-2">
      <button
        type="button"
        onClick={() => actions.loadPreset(p)}
        className="min-w-0 flex-1 text-left"
        title={`Load preset ${p.name} (${p.viz})`}
      >
        <span className="block truncate text-[12px] font-medium text-fog group-hover:text-acc">{p.name}</span>
        <span className="pz-chip mt-0.5 inline-block">{p.viz}</span>
      </button>
      {user &&
        (editing ? (
          <span className="flex shrink-0 items-center gap-1">
            <input
              type="text"
              value={draft}
              maxLength={48}
              aria-label="Preset name"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  actions.renamePreset(p.id, draft);
                  setEditing(false);
                }
                if (e.key === "Escape") setEditing(false);
              }}
              className="w-24 rounded border border-line bg-ink-900 px-1.5 py-1 text-[11px] text-fog focus:border-acc/60 focus:outline-none"
            />
            <IconBtn label="Save name" onClick={() => {
              actions.renamePreset(p.id, draft);
              setEditing(false);
            }}>
              <Check size={14} />
            </IconBtn>
          </span>
        ) : (
          <span className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <IconBtn label={`Rename ${p.name}`} onClick={() => {
              setDraft(p.name);
              setEditing(true);
            }}>
              <Pencil size={13} />
            </IconBtn>
            <IconBtn label={`Delete ${p.name}`} onClick={() => actions.deletePreset(p.id)}>
              <Trash2 size={13} />
            </IconBtn>
          </span>
        ))}
      {!user && (
        <button
          type="button"
          onClick={() => actions.loadPreset(p)}
          className="shrink-0 rounded border border-line px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-mute transition-colors hover:border-acc/60 hover:text-acc"
        >
          Load
        </button>
      )}
    </li>
  );
}

function PresetsTab() {
  const userPresets = useSelector(appStore, (s) => s.userPresets);
  const [saveName, setSaveName] = useState("");
  return (
    <div>
      <SectionLabel>Save current look</SectionLabel>
      <div className="flex gap-1.5">
        <input
          type="text"
          value={saveName}
          maxLength={48}
          onChange={(e) => setSaveName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              actions.savePreset(saveName);
              setSaveName("");
            }
          }}
          placeholder="Preset name…"
          aria-label="New preset name"
          className="min-w-0 flex-1 rounded-md border border-line bg-ink-800 px-2.5 py-1.5 text-[12px] text-fog placeholder:text-dim focus:border-acc/60 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => {
            actions.savePreset(saveName);
            setSaveName("");
          }}
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-acc/50 bg-acc/10 px-3 py-1.5 text-[12px] font-semibold text-acc transition-all hover:bg-acc/20 active:scale-95"
        >
          <Save size={13} />
          Save
        </button>
      </div>
      <p className="mt-1.5 text-[10px] leading-relaxed text-dim">
        Captures the active engine, palette, analysis, and effect settings. Stored locally.
      </p>

      <SectionLabel>Built-in</SectionLabel>
      <ul className="space-y-1.5">
        {BUILTIN_PRESETS.map((p) => (
          <PresetRow key={p.id} p={p} />
        ))}
      </ul>

      <SectionLabel>Your presets · {userPresets.length}</SectionLabel>
      {userPresets.length === 0 ? (
        <p className="rounded-md border border-line bg-ink-800/60 px-3 py-4 text-center text-[11px] text-dim">
          Nothing saved yet — dial in a look and save it.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {userPresets.map((p) => (
            <PresetRow key={p.id} p={p} user />
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------ Shell */

const TABS = [
  { id: "library" as const, label: "Library" },
  { id: "style" as const, label: "Style" },
  { id: "presets" as const, label: "Presets" },
];

export function SidePanel() {
  const open = useSelector(appStore, (s) => s.panelOpen);
  const tab = useSelector(appStore, (s) => s.panelTab);
  if (!open) return null;
  return (
    <>
      <div className="anim-fade absolute inset-0 z-30 bg-ink-950/50" onClick={() => actions.togglePanel(false)} aria-hidden="true" />
      <aside className="anim-panel absolute bottom-0 right-0 top-0 z-40 flex w-[344px] max-w-[94vw] flex-col border-l border-line bg-ink-850/[0.98] shadow-[-24px_0_48px_#00000066]">
        <div className="flex shrink-0 items-center gap-1 border-b border-line px-3 py-2.5">
          <Seg<(typeof TABS)[number]["id"]>
            ariaLabel="Panel section"
            size="sm"
            value={tab}
            onChange={(t) => actions.setTab(t)}
            options={TABS.map((t) => ({ value: t.id, label: t.label }))}
          />
          <span className="flex-1" />
          <IconBtn label="Close panel" onClick={() => actions.togglePanel(false)}>
            <X size={15} />
          </IconBtn>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3">
          {tab === "library" && <LibraryTab />}
          {tab === "style" && <StyleTab />}
          {tab === "presets" && <PresetsTab />}
        </div>
      </aside>
    </>
  );
}
