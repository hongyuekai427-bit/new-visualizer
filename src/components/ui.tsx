import type { CSSProperties, ReactNode } from "react";

export function IconBtn({
  label,
  onClick,
  active,
  disabled,
  className = "",
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={[
        "inline-flex items-center justify-center rounded-md border border-transparent p-2 text-mute transition-all duration-150",
        "hover:text-fog hover:border-line hover:bg-ink-700 active:scale-90",
        active ? "text-acc border-line bg-ink-700" : "",
        disabled ? "opacity-35 pointer-events-none" : "",
        className,
      ].join(" ")}
    >
      {children}
    </button>
  );
}

export function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
  fill,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  fill?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  const style = { "--val": `${pct}%`, "--range-fill": fill ?? "var(--color-acc)" } as CSSProperties;
  return (
    <label className="block">
      <div className="mb-0.5 flex items-baseline justify-between">
        <span className="text-[12px] font-medium text-mute">{label}</span>
        <span className="font-mono text-[11px] text-fog/80">{format ? format(value) : value}</span>
      </div>
      <input
        type="range"
        className="pz-range"
        style={style}
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-[12px] font-medium text-mute">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={[
          "relative h-[18px] w-[34px] rounded-full border transition-colors duration-150",
          checked ? "bg-acc/90 border-acc" : "bg-ink-600 border-line-2",
        ].join(" ")}
      >
        <span
          className={[
            "absolute top-[2px] h-[12px] w-[12px] rounded-full bg-ink-900 transition-all duration-150",
            checked ? "left-[18px]" : "left-[3px] bg-mute",
          ].join(" ")}
        />
      </button>
    </div>
  );
}

export function Seg<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = "md",
}: {
  options: { value: T; label: ReactNode; title?: string }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
  size?: "sm" | "md";
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-0.5 rounded-lg border border-line bg-ink-800 p-0.5"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.title ?? o.value}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={[
            "rounded-[6px] font-medium transition-all duration-150",
            size === "sm" ? "px-2 py-1 text-[11px]" : "px-2.5 py-1.5 text-[12px]",
            o.value === value
              ? "bg-ink-600 text-fog shadow-[inset_0_0_0_1px_var(--color-line-2)]"
              : "text-dim hover:text-mute",
          ].join(" ")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h3 className="font-disp mb-2 mt-5 text-[10px] font-bold uppercase tracking-[0.22em] text-dim first:mt-0">
      {children}
    </h3>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

export function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
