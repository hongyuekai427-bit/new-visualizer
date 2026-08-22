import { useCallback, useEffect, useRef, useState } from "react";
import { DropOverlay, EmptyState, HelpModal, PerfOverlay, Toasts } from "./components/Overlays";
import { SidePanel } from "./components/SidePanel";
import { TopBar } from "./components/TopBar";
import { Transport } from "./components/Transport";
import { engine } from "./lib/audio/engine";
import { Renderer } from "./lib/viz/renderer";
import { PALETTES, VIZ_ORDER } from "./lib/viz/types";
import { VIZ_LIST } from "./lib/viz/viz-b";
import { actions, appStore, bindRenderer, initApp, meterBus, unbindRenderer, useSelector } from "./state/app";

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const viz = useSelector(appStore, (s) => s.viz);
  const palette = useSelector(appStore, (s) => s.settings.palette);
  const showPerf = useSelector(appStore, (s) => s.showPerf);

  /* ---- render engine lifecycle (single loop, created once) ---- */
  useEffect(() => {
    initApp();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const s0 = appStore.get();
    const r = new Renderer(canvas, engine, s0.viz, s0.settings);
    r.onMeter = (m) => meterBus.cb?.(m);
    rendererRef.current = r;
    bindRenderer(r);
    return () => {
      unbindRenderer();
      r.destroy();
      rendererRef.current = null;
    };
  }, []);

  /* ---- fullscreen ---- */
  const toggleFullscreen = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    } else {
      void el.requestFullscreen().catch(() => actions.toast("Fullscreen was blocked by the browser.", "error"));
    }
  }, []);

  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  /* ---- keyboard shortcuts ---- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t?.isContentEditable) return;
      const s = appStore.get();
      switch (e.key) {
        case " ":
          if (tag === "BUTTON") return;
          e.preventDefault();
          actions.togglePlay();
          break;
        case "ArrowLeft":
          actions.seekBy(-5);
          break;
        case "ArrowRight":
          actions.seekBy(5);
          break;
        case "ArrowUp":
          e.preventDefault();
          actions.setVolume(s.volume + 0.05);
          break;
        case "ArrowDown":
          e.preventDefault();
          actions.setVolume(s.volume - 0.05);
          break;
        case "n":
        case "N":
          actions.next();
          break;
        case "p":
        case "P":
          actions.prev();
          break;
        case "m":
        case "M":
          actions.toggleMute();
          break;
        case "s":
        case "S":
          actions.toggleShuffle();
          break;
        case "r":
        case "R":
          actions.cycleRepeat();
          break;
        case "f":
        case "F":
          toggleFullscreen();
          break;
        case "l":
        case "L":
          actions.togglePanel();
          break;
        case "[":
          actions.cycleViz(-1);
          break;
        case "]":
          actions.cycleViz(1);
          break;
        case "?":
          actions.toggleHelp();
          break;
        case "Escape":
          if (s.showHelp) actions.toggleHelp();
          else if (s.panelOpen) actions.togglePanel(false);
          break;
        default:
          if (e.key >= "1" && e.key <= "6") {
            actions.setViz(VIZ_ORDER[Number(e.key) - 1]);
          }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleFullscreen]);

  /* ---- drag & drop anywhere ---- */
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      actions.setDragging(true);
    };
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) actions.setDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      actions.setDragging(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length > 0) void actions.addFiles(files);
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  const vizName = VIZ_LIST.find((v) => v.id === viz)?.name ?? viz;
  const palName = PALETTES.find((p) => p.id === palette)?.name ?? palette;

  return (
    <div ref={rootRef} className="relative flex h-full flex-col overflow-hidden bg-ink-900 text-fog">
      <TopBar isFullscreen={isFullscreen} onToggleFullscreen={toggleFullscreen} />

      <main className="relative min-h-0 flex-1">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-label="Audio visualization" />

        <div className="pointer-events-none absolute bottom-3 right-3 z-20 flex items-center gap-1.5">
          <span className="pz-chip !text-acc">{vizName}</span>
          <span className="pz-chip">{palName}</span>
        </div>

        {showPerf && <PerfOverlay getPerf={() => rendererRef.current?.getPerf() ?? null} />}
        <EmptyState />
        <DropOverlay />
        <SidePanel />
        <HelpModal />
      </main>

      <Transport />
      <Toasts />
    </div>
  );
}
