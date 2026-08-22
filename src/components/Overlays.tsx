import { AlertTriangle, Check, FolderOpen, Info, Mic, Radio, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PerfStats } from "../lib/viz/renderer";
import { actions, appStore, STATIONS, useSelector } from "../state/app";
import { Kbd } from "./ui";

/* ------------------------------------------------ Toasts */

export function Toasts() {
  const toasts = useSelector(appStore, (s) => s.toasts);
  return (
    <div className="pointer-events-none absolute bottom-4 left-4 z-50 flex w-[min(360px,80vw)] flex-col gap-2" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={[
            "anim-toast pointer-events-auto flex items-start gap-2.5 rounded-lg border bg-ink-800/95 px-3 py-2.5 shadow-[0_8px_28px_#00000066] backdrop-blur",
            t.kind === "error" ? "border-danger/50" : t.kind === "success" ? "border-ok/40" : "border-line-2",
          ].join(" ")}
        >
          <span className={`mt-0.5 shrink-0 ${t.kind === "error" ? "text-danger" : t.kind === "success" ? "text-ok" : "text-teal"}`}>
            {t.kind === "error" ? <AlertTriangle size={15} /> : t.kind === "success" ? <Check size={15} /> : <Info size={15} />}
          </span>
          <p className="min-w-0 flex-1 text-[12px] leading-snug text-fog">{t.text}</p>
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => actions.dismissToast(t.id)}
            className="shrink-0 rounded p-0.5 text-dim transition-colors hover:text-fog"
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------ Help modal */

const SHORTCUTS: [string, string][] = [
  ["Space", "Play / pause"],
  ["← / →", "Seek ±5 s"],
  ["↑ / ↓", "Volume"],
  ["N / P", "Next / previous track"],
  ["M", "Mute"],
  ["S", "Shuffle"],
  ["R", "Cycle repeat mode"],
  ["1 – 6", "Select visual engine"],
  ["[ / ]", "Cycle visual engines"],
  ["F", "Fullscreen"],
  ["L", "Toggle control panel"],
  ["?", "Show this panel"],
];

export function HelpModal() {
  const show = useSelector(appStore, (s) => s.showHelp);
  if (!show) return null;
  return (
    <div
      className="anim-fade absolute inset-0 z-50 flex items-center justify-center bg-ink-950/70 p-4"
      onClick={() => actions.toggleHelp()}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
    >
      <div
        className="anim-rise w-full max-w-md rounded-xl border border-line bg-ink-850 p-5 shadow-[0_24px_80px_#000000aa]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-disp text-[13px] font-bold uppercase tracking-[0.25em] text-fog">Keyboard map</h2>
          <button type="button" aria-label="Close shortcuts" onClick={() => actions.toggleHelp()} className="rounded p-1 text-dim transition-colors hover:text-fog">
            <X size={16} />
          </button>
        </div>
        <ul className="space-y-1.5">
          {SHORTCUTS.map(([key, desc]) => (
            <li key={key} className="flex items-center justify-between gap-4 rounded-md px-2 py-1.5 transition-colors hover:bg-ink-700">
              <span className="text-[12.5px] text-mute">{desc}</span>
              <Kbd>{key}</Kbd>
            </li>
          ))}
        </ul>
        <p className="mt-4 border-t border-line pt-3 text-[11px] leading-relaxed text-dim">
          Shortcuts stay out of the way while you type in inputs. Drag &amp; drop audio files anywhere in the window to
          build the library.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------ Perf overlay */

export function PerfOverlay({ getPerf }: { getPerf: () => PerfStats | null }) {
  const [st, setSt] = useState<PerfStats | null>(null);
  useEffect(() => {
    const id = window.setInterval(() => setSt(getPerf()), 500);
    return () => window.clearInterval(id);
  }, [getPerf]);
  if (!st) return null;
  const rows: [string, string][] = [
    ["fps", String(st.fps)],
    ["frame", `${st.ms} ms`],
    ["scale", `${Math.round(st.scale * 100)}%`],
    ["render", `${st.resW}×${st.resH}`],
    ["fft", String(st.fft)],
    ...(st.particles >= 0 ? ([["parts", String(st.particles)]] as [string, string][]) : []),
  ];
  return (
    <div className="pointer-events-none absolute left-3 top-3 z-20 rounded-lg border border-line bg-ink-900/85 px-3 py-2 font-mono text-[10.5px] leading-[1.7] text-mute backdrop-blur" aria-hidden="true">
      <div className="mb-0.5 flex items-center gap-2">
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${st.fps >= 50 ? "bg-ok" : st.fps >= 30 ? "bg-acc" : "bg-danger"}`} />
        <span className="uppercase tracking-[0.2em] text-dim">{st.viz}</span>
      </div>
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-6">
          <span className="text-dim">{k}</span>
          <span className="text-fog/90">{v}</span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------ Drop overlay */

export function DropOverlay() {
  const dragging = useSelector(appStore, (s) => s.dragging);
  if (!dragging) return null;
  return (
    <div className="anim-fade pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-ink-950/70 p-6">
      <div className="flex w-full max-w-md flex-col items-center gap-3 rounded-xl border-2 border-dashed border-acc bg-ink-900/80 px-8 py-12">
        <FolderOpen size={30} className="text-acc" />
        <p className="font-disp text-[14px] font-bold uppercase tracking-[0.2em] text-fog">Drop audio files</p>
        <p className="text-[12px] text-mute">They'll be added to the library and decoded for analysis.</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------ Empty state */

export function EmptyState() {
  const tracks = useSelector(appStore, (s) => s.tracks);
  const source = useSelector(appStore, (s) => s.source);
  const fileRef = useRef<HTMLInputElement>(null);
  if (tracks.length > 0 || source !== "playlist") return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
      <div className="anim-rise pointer-events-auto w-full max-w-sm rounded-xl border border-line bg-ink-850/90 p-6 shadow-[0_24px_70px_#000000aa] backdrop-blur">
        <div className="mb-4 flex items-center gap-3">
          <svg width="34" height="34" viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" rx="8" fill="#10141d" stroke="#222a3a" />
            <g fill="none" strokeLinecap="round" strokeWidth="3.4">
              <path d="M9 12.5v7" stroke="#3fd8c2" />
              <path d="M16 7v18" stroke="#ffb454" />
              <path d="M23 10.5v11" stroke="#ff7a6b" />
            </g>
          </svg>
          <div>
            <h2 className="font-disp text-[15px] font-bold leading-tight text-fog">The spectrum is silent.</h2>
            <p className="text-[11px] text-mute">Feed it something — three ways in.</p>
          </div>
        </div>
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
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex w-full items-center gap-3 rounded-lg border border-acc/50 bg-acc/10 px-4 py-3 text-left transition-all hover:bg-acc/20 active:scale-[0.98]"
          >
            <FolderOpen size={17} className="shrink-0 text-acc" />
            <span>
              <span className="block text-[13px] font-bold text-fog">Open audio files</span>
              <span className="block text-[11px] text-mute">MP3 · WAV · FLAC · OGG · M4A — or drop them anywhere</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => actions.playStation(STATIONS[0].url, STATIONS[0].name)}
            className="flex w-full items-center gap-3 rounded-lg border border-line bg-ink-800 px-4 py-3 text-left transition-all hover:border-teal/50 active:scale-[0.98]"
          >
            <Radio size={17} className="shrink-0 text-teal" />
            <span>
              <span className="block text-[13px] font-bold text-fog">Tune into {STATIONS[0].name}</span>
              <span className="block text-[11px] text-mute">Instant sound + visuals from SomaFM internet radio</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => void actions.setSource("mic")}
            className="flex w-full items-center gap-3 rounded-lg border border-line bg-ink-800 px-4 py-3 text-left transition-all hover:border-acc-2/50 active:scale-[0.98]"
          >
            <Mic size={17} className="shrink-0 text-acc-2" />
            <span>
              <span className="block text-[13px] font-bold text-fog">Go live with the microphone</span>
              <span className="block text-[11px] text-mute">Clap, hum, play an instrument — watch it move</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
