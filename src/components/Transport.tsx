import { Loader2, Music2, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Square, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { engine } from "../lib/audio/engine";
import { actions, appStore, meterBus, useSelector } from "../state/app";
import { formatTime, IconBtn } from "./ui";

function Meter() {
  const barsRef = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => {
    meterBus.cb = (m) => {
      const vals = [m.bass * 1.9, m.mid * 1.7, m.high * 1.6, m.level * 1.5];
      for (let i = 0; i < vals.length; i++) {
        const el = barsRef.current[i];
        if (el) {
          const v = Math.max(0.07, Math.min(1, vals[i]));
          el.style.transform = `scaleY(${v})`;
        }
      }
    };
    return () => {
      meterBus.cb = null;
    };
  }, []);
  const colors = ["#ff7a6b", "#ffb454", "#3fd8c2", "#e9edf5"];
  return (
    <div className="flex h-8 items-end gap-[3px]" aria-hidden="true">
      {colors.map((c, i) => (
        <div key={i} className="w-[3px] overflow-hidden rounded-full bg-ink-600" style={{ height: "100%" }}>
          <div
            ref={(el) => {
              barsRef.current[i] = el;
            }}
            className="h-full w-full origin-bottom rounded-full"
            style={{ background: c, transform: "scaleY(0.07)" }}
          />
        </div>
      ))}
    </div>
  );
}

export function Transport() {
  const tracks = useSelector(appStore, (s) => s.tracks);
  const current = useSelector(appStore, (s) => s.current);
  const playing = useSelector(appStore, (s) => s.playing);
  const buffering = useSelector(appStore, (s) => s.buffering);
  const repeat = useSelector(appStore, (s) => s.repeat);
  const shuffle = useSelector(appStore, (s) => s.shuffle);
  const volume = useSelector(appStore, (s) => s.volume);
  const muted = useSelector(appStore, (s) => s.muted);
  const source = useSelector(appStore, (s) => s.source);

  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const seekRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    const id = window.setInterval(() => {
      setTime(engine.currentTime);
      setDur(engine.duration);
    }, 250);
    return () => window.clearInterval(id);
  }, [current]);

  const track = current >= 0 ? tracks[current] : undefined;
  const isFileSource = source === "playlist";
  const frac = dur > 0 ? Math.min(1, time / dur) : 0;

  const seekFromEvent = (clientX: number) => {
    const el = seekRef.current;
    if (!el || dur <= 0) return;
    const rect = el.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    actions.seekFrac(f);
    setTime(f * dur);
  };

  return (
    <footer className="relative z-30 shrink-0 border-t border-line bg-ink-850/95">
      <div className="grid grid-cols-1 items-center gap-x-4 gap-y-2 px-3 py-2.5 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        {/* track info */}
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md border border-line"
            style={{ background: "linear-gradient(135deg,#1d2433,#10141d)" }}
          >
            {track?.artwork ? (
              <img src={track.artwork} alt="" className="h-full w-full object-cover" draggable={false} />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-dim">
                <Music2 size={18} />
              </div>
            )}
            {playing && (
              <div className="absolute inset-x-0 bottom-0 h-[3px] bg-gradient-to-r from-acc via-acc-2 to-teal" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-[14px] font-bold text-fog">
                {track ? track.name : source === "playlist" ? "Nothing loaded" : "Live input"}
              </p>
              {!isFileSource && (
                <span className="flex shrink-0 items-center gap-1 rounded bg-danger/15 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest text-danger">
                  <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-danger" />
                  live
                </span>
              )}
            </div>
            <p className="truncate text-[11px] text-mute">
              {track
                ? [track.artist, track.album].filter(Boolean).join(" — ") || (track.kind === "stream" ? "streaming" : "unknown artist")
                : source === "playlist"
                  ? "Add files, a station, or switch to a live input"
                  : source === "mic"
                    ? "microphone → analyzer"
                    : "shared tab audio → analyzer"}
            </p>
          </div>
        </div>

        {/* transport controls */}
        <div className="flex flex-col items-center gap-1.5">
          <div className="flex items-center gap-1">
            <IconBtn label={shuffle ? "Shuffle on" : "Shuffle off"} active={shuffle} disabled={!isFileSource} onClick={() => actions.toggleShuffle()}>
              <Shuffle size={15} />
            </IconBtn>
            <IconBtn label="Previous track" disabled={!isFileSource || tracks.length === 0} onClick={() => actions.prev()}>
              <SkipBack size={17} />
            </IconBtn>
            <button
              type="button"
              aria-label={playing ? "Pause" : "Play"}
              onClick={() => actions.togglePlay()}
              className="mx-1 inline-flex h-10 w-10 items-center justify-center rounded-full bg-acc text-ink-900 shadow-[0_0_22px_#ffb45455] transition-all duration-150 hover:brightness-110 active:scale-90"
            >
              {buffering ? (
                <Loader2 size={18} className="anim-spin" />
              ) : playing ? (
                <Pause size={18} fill="currentColor" />
              ) : (
                <Play size={18} fill="currentColor" className="ml-0.5" />
              )}
            </button>
            <IconBtn label="Next track" disabled={!isFileSource || tracks.length === 0} onClick={() => actions.next()}>
              <SkipForward size={17} />
            </IconBtn>
            <IconBtn
              label={repeat === "off" ? "Repeat off" : repeat === "all" ? "Repeat playlist" : "Repeat current track"}
              active={repeat !== "off"}
              disabled={!isFileSource}
              onClick={() => actions.cycleRepeat()}
            >
              {repeat === "one" ? <Repeat1 size={15} /> : <Repeat size={15} />}
            </IconBtn>
          </div>
          <div className="flex w-[min(520px,70vw)] items-center gap-2">
            <span className="w-10 text-right font-mono text-[11px] tabular-nums text-mute">
              {isFileSource ? formatTime(time) : "--:--"}
            </span>
            <div
              ref={seekRef}
              role="slider"
              aria-label="Seek position"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(frac * 100)}
              tabIndex={0}
              className="group relative h-4 flex-1 cursor-pointer touch-none"
              onPointerDown={(e) => {
                if (!isFileSource || dur <= 0) return;
                draggingRef.current = true;
                e.currentTarget.setPointerCapture(e.pointerId);
                seekFromEvent(e.clientX);
              }}
              onPointerMove={(e) => {
                if (draggingRef.current) seekFromEvent(e.clientX);
              }}
              onPointerUp={() => {
                draggingRef.current = false;
              }}
              onPointerCancel={() => {
                draggingRef.current = false;
              }}
            >
              <div className="absolute inset-x-0 top-1/2 h-[4px] -translate-y-1/2 overflow-hidden rounded-full bg-ink-600">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-teal via-acc to-acc-2"
                  style={{ width: `${frac * 100}%` }}
                />
              </div>
              <div
                className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-acc bg-fog opacity-0 shadow-[0_0_10px_#ffb45488] transition-opacity group-hover:opacity-100"
                style={{ left: `${frac * 100}%` }}
              />
            </div>
            <span className="w-10 font-mono text-[11px] tabular-nums text-mute">
              {isFileSource && dur > 0 ? formatTime(dur) : "--:--"}
            </span>
          </div>
        </div>

        {/* meter + volume */}
        <div className="flex items-center justify-start gap-3 md:justify-end">
          <IconBtn label="Stop" disabled={!isFileSource} onClick={() => actions.stop()}>
            <Square size={13} fill="currentColor" />
          </IconBtn>
          <Meter />
          <div className="flex items-center gap-1.5">
            <IconBtn label={muted ? "Unmute" : "Mute"} onClick={() => actions.toggleMute()}>
              {muted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </IconBtn>
            <input
              type="range"
              className="pz-range w-24"
              style={{ "--val": `${(muted ? 0 : volume) * 100}%`, "--range-fill": "var(--color-teal)" } as CSSProperties}
              min={0}
              max={1}
              step={0.01}
              value={muted ? 0 : volume}
              aria-label="Volume"
              onChange={(e) => actions.setVolume(Number(e.target.value))}
            />
          </div>
        </div>
      </div>
    </footer>
  );
}
