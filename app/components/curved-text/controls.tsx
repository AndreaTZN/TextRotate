"use client";

export function Section({
  title,
  badge,
  children,
}: {
  title: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[11px] font-semibold text-[#aea485] uppercase tracking-wider">
          {title}
        </h2>
        {badge && (
          <span className="text-[11px] font-mono text-[#161407] bg-[#ffdb0f] px-2 py-0.5 rounded-full">
            {badge}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

export function Slider({
  label,
  value,
  unit,
  min,
  max,
  onChange,
  compact,
}: {
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  onChange: (v: number) => void;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "mt-3" : ""}>
      <div className="flex items-center justify-between mb-2">
        <span
          className={
            compact
              ? "text-xs text-[#aea485]"
              : "text-[11px] font-semibold text-[#aea485] uppercase tracking-wider"
          }
        >
          {label}
        </span>
        <span className="text-[11px] font-mono text-[#161407]">
          {value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
    </div>
  );
}

export function StyleButton({
  active,
  onClick,
  className,
  children,
}: {
  active: boolean;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-2 text-sm rounded-xl border transition ${className ?? ""} ${
        active
          ? "bg-[#161407] text-[#ffdb0f] border-[#161407]"
          : "bg-white text-[#161407] border-[#aea485]/40 hover:border-[#aea485]"
      }`}
    >
      {children}
    </button>
  );
}

export function ColorField({
  color,
  onChange,
  compact,
}: {
  color: string;
  onChange: (c: string) => void;
  compact?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <input
        type="color"
        value={color}
        onChange={(e) => onChange(e.target.value)}
        className={`${compact ? "w-8 h-8" : "w-10 h-10"} rounded-lg border border-[#aea485]/40 cursor-pointer bg-white p-0.5`}
      />
      {!compact && (
        <input
          type="text"
          value={color}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 px-3 py-2 text-sm border border-[#aea485]/40 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-[#ffdb0f]/50"
        />
      )}
    </div>
  );
}

export function Swatch({
  color,
  active,
  onClick,
}: {
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={`Couleur ${color}`}
      className={`w-[26px] h-[26px] rounded-full border-2 transition ${
        active ? "border-[#ff6a29] scale-110" : "border-transparent hover:scale-105"
      }`}
      style={{
        backgroundColor: color,
        boxShadow:
          color.toLowerCase() === "#ffffff" ? "inset 0 0 0 1px #e5e7eb" : undefined,
      }}
    />
  );
}

export function ToggleSection({
  title,
  enabled,
  onToggle,
  children,
}: {
  title: string;
  enabled: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[11px] font-semibold text-[#aea485] uppercase tracking-wider">
          {title}
        </h2>
        <button
          onClick={onToggle}
          role="switch"
          aria-checked={enabled}
          aria-label={title}
          className={`relative w-10 h-[22px] rounded-full transition shrink-0 ${
            enabled ? "bg-[#ffdb0f]" : "bg-[#c3d9cc]"
          }`}
        >
          <span
            className={`absolute top-[3px] w-4 h-4 bg-white rounded-full shadow transition-transform ${
              enabled ? "translate-x-5" : "translate-x-0.5"
            } left-0`}
          />
        </button>
      </div>
      {enabled && <div className="space-y-3">{children}</div>}
    </section>
  );
}
