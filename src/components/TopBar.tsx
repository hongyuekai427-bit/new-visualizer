import { Gauge, Keyboard, ListMusic, Maximize2, Mic, Minimize2, MonitorUp, PanelRightClose, PanelRightOpen } from "lucide-react";
import type { SourceKind } from "../lib/audio/engine";
import { actions, appStore, useSelector } from "../state/app";
import { IconBtn, Seg } from "./ui";

function LogoMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#10141d" stroke="#222a3a" />
      <g fill="none" strokeLinecap="round" strokeWidth="3.4">
        <path d="M9 12.5v7" stroke="#3fd8c2" />
        <path d="M16 7v18" stroke="#ffb454" />
        <path d="M23 10.5v11" stroke="#ff7a6b" />
      </g>
    </svg>
  );
}

export function TopBar({
  isFullscreen,
  onToggleFullscreen,
}: {
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}) {
  const source = useSelector(appStore, (s) => s.source);
  const showPerf = useSelector(appStore, (s) => s.showPerf);
  const panelOpen = useSelector(appStore, (s) => s.panelOpen);

  return (
    <header className="relative z-30 flex h-[52px] shrink-0 items-center gap-3 border-b border-line bg-ink-850/95 px-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <LogoMark />
        <div className="leading-none">
          <div className="font-disp text-[13px] font-bold tracking-[0.3em] text-fog">
            PULSAR
          </div>
          <div className="mt-1 hidden font-mono text-[9px] uppercase tracking-[0.18em] text-dim sm:block">
            audio visualization studio
          </div>
        </div>
      </div>

      <div className="mx-auto flex items-center gap-2">
        <Seg<SourceKind>
          ariaLabel="Audio source"
          size="sm"
          value={source}
          onChange={(v) => void actions.setSource(v)}
          options={[
            {
              value: "playlist",
              label: (
                <span className="flex items-center gap-1.5">
                  <ListMusic size={13} /> <span className="hidden md:inline">Library</span>
                </span>
              ),
              title: "Play files & stations from the library",
            },
            {
              value: "mic",
              label: (
                <span className="flex items-center gap-1.5">
                  <Mic size={13} /> <span className="hidden md:inline">Mic</span>
                </span>
              ),
              title: "Visualize microphone input",
            },
            {
              value: "screen",
              label: (
                <span className="flex items-center gap-1.5">
                  <MonitorUp size={13} /> <span className="hidden md:inline">Tab</span>
                </span>
              ),
              title: "Visualize a browser tab's audio (share tab audio)",
            },
          ]}
        />
      </div>

      <div className="flex items-center gap-0.5">
        <IconBtn label="Toggle performance overlay" active={showPerf} onClick={() => actions.togglePerf()}>
          <Gauge size={16} />
        </IconBtn>
        <IconBtn label="Keyboard shortcuts" onClick={() => actions.toggleHelp()}>
          <Keyboard size={16} />
        </IconBtn>
        <IconBtn
          label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          onClick={onToggleFullscreen}
        >
          {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </IconBtn>
        <IconBtn
          label={panelOpen ? "Hide control panel" : "Show control panel"}
          active={panelOpen}
          onClick={() => actions.togglePanel()}
        >
          {panelOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
        </IconBtn>
      </div>
    </header>
  );
}
