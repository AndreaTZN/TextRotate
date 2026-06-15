"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CANVAS_MAX,
  CANVAS_MIN,
  DEFAULT_SETTINGS,
  FONTS,
  SWATCHES,
  curveLabel,
  loadGoogleFonts,
  type TextSettings,
} from "./settings";
import { buildSvg, drawCurvedText, measureTextBox } from "./render";
import {
  ColorField,
  Section,
  Slider,
  StyleButton,
  Swatch,
  ToggleSection,
} from "./controls";

// Le canvas affiché utilise un backing store 2x pour rester net sur écran retina.
const RENDER_SCALE = 2;

const CURVE_PRESETS = [
  { label: "⌢ Haut", value: 60 },
  { label: "— Droit", value: 0 },
  { label: "⌣ Bas", value: -60 },
];

export default function CurvedTextEditor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [settings, setSettings] = useState<TextSettings>(DEFAULT_SETTINGS);
  const [fontTick, setFontTick] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [hovering, setHovering] = useState(false);
  const [dragging, setDragging] = useState(false);
  // État du glisser-déplacer du texte : null quand on ne déplace pas.
  const drag = useRef<
    | { pointerId: number; startX: number; startY: number; baseX: number; baseY: number }
    | null
  >(null);
  // État du redimensionnement du canvas via la poignée bas-gauche.
  const resize = useRef<
    | { pointerId: number; startX: number; startY: number; baseW: number; baseH: number }
    | null
  >(null);

  // Redessine quand les webfonts arrivent (chargement de la feuille de style,
  // puis document.fonts.ready, plus un filet de sécurité).
  useEffect(() => {
    let cancelled = false;
    const bump = () => {
      if (!cancelled) setFontTick((t) => t + 1);
    };
    loadGoogleFonts(bump);
    document.fonts?.ready.then(bump);
    const fallback = setTimeout(bump, 1500);
    return () => {
      cancelled = true;
      clearTimeout(fallback);
    };
  }, []);

  const draw = useCallback(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
    drawCurvedText(ctx, settings);
  }, [settings]);

  useEffect(() => {
    draw();
  }, [draw, fontTick]);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const update = (patch: Partial<TextSettings>) =>
    setSettings((prev) => ({ ...prev, ...patch }));

  // Convertit un événement pointeur en coordonnées canvas (non scalées).
  const toCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * settings.width,
      y: ((e.clientY - rect.top) / rect.height) * settings.height,
    };
  };

  // Vrai si le point (canvas) tombe sur la boîte englobante du texte.
  const hitsText = (x: number, y: number) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return false;
    const box = measureTextBox(ctx, settings);
    return x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = toCanvasPoint(e);
    if (!hitsText(p.x, p.y)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      pointerId: e.pointerId,
      startX: p.x,
      startY: p.y,
      baseX: settings.offsetX,
      baseY: settings.offsetY,
    };
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = toCanvasPoint(e);
    const d = drag.current;
    if (!d) {
      setHovering(hitsText(p.x, p.y));
      return;
    }
    update({
      offsetX: Math.round(d.baseX + (p.x - d.startX)),
      offsetY: Math.round(d.baseY + (p.y - d.startY)),
    });
  };

  const endDrag = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (drag.current?.pointerId === e.pointerId) {
      e.currentTarget.releasePointerCapture(e.pointerId);
      drag.current = null;
      setDragging(false);
    }
  };

  const clamp = (v: number) => Math.max(CANVAS_MIN, Math.min(CANVAS_MAX, v));

  // Poignée de redimensionnement (coin bas-gauche) : on travaille en pixels écran
  // convertis en unités canvas via l'échelle d'affichage. Tirer vers la gauche
  // élargit, tirer vers le bas agrandit la hauteur.
  const onResizeDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    resize.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      baseW: settings.width,
      baseH: settings.height,
    };
  };

  const onResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = resize.current;
    if (!r) return;
    const dx = (e.clientX - r.startX) / displayScale;
    const dy = (e.clientY - r.startY) / displayScale;
    update({
      width: Math.round(clamp(r.baseW - dx)),
      height: Math.round(clamp(r.baseH + dy)),
    });
  };

  const onResizeUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (resize.current?.pointerId === e.pointerId) {
      e.currentTarget.releasePointerCapture(e.pointerId);
      resize.current = null;
    }
  };

  const showToast = (msg: string) => {
    clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 2000);
  };

  const downloadFile = (href: string, filename: string) => {
    const link = document.createElement("a");
    link.download = filename;
    link.href = href;
    link.click();
  };

  const downloadPNG = () => {
    const off = document.createElement("canvas");
    off.width = settings.width * RENDER_SCALE;
    off.height = settings.height * RENDER_SCALE;
    const ctx = off.getContext("2d");
    if (!ctx) return;
    ctx.scale(RENDER_SCALE, RENDER_SCALE);
    drawCurvedText(ctx, settings);
    downloadFile(off.toDataURL("image/png"), "texte-courbe.png");
    showToast("PNG exporté ✓");
  };

  const downloadSVG = () => {
    const blob = new Blob([buildSvg(settings)], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    downloadFile(url, "texte-courbe.svg");
    URL.revokeObjectURL(url);
    showToast("SVG exporté ✓");
  };

  const selectedFont = FONTS.find((f) => f.value === settings.font);

  // Échelle d'affichage : on tient le canvas dans une zone max sans jamais
  // l'agrandir au-delà de sa taille réelle (scale <= 1).
  const MAX_VIEW_W = 680;
  const MAX_VIEW_H = 500;
  const displayScale = Math.min(
    1,
    MAX_VIEW_W / settings.width,
    MAX_VIEW_H / settings.height,
  );
  const displayW = settings.width * displayScale;
  const displayH = settings.height * displayScale;

  return (
    <div className="h-screen flex flex-col bg-[#fffdeb] text-[#161407] overflow-hidden">
      <header className="h-16 bg-white/80 backdrop-blur border-b border-[#aea485]/30 px-6 flex items-center justify-between shrink-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#ffdb0f] rounded-xl flex items-center justify-center shadow-sm">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#161407" strokeWidth="2.5">
              <path d="M3 18 Q12 2 21 18" strokeLinecap="round" />
            </svg>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={downloadSVG}
            className="px-4 py-2 text-sm font-medium text-[#161407] bg-white border border-[#aea485]/40 rounded-lg hover:bg-[#fffdeb] hover:border-[#aea485] transition shadow-sm"
          >
            ↓ SVG
          </button>
          <button
            onClick={downloadPNG}
            className="px-4 py-2 text-sm font-semibold text-[#161407] bg-[#ffdb0f] rounded-lg hover:bg-[#ff6a29] hover:text-white transition shadow-sm"
          >
            ↓ Exporter PNG
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-[340px] bg-white border-r border-[#aea485]/30 overflow-y-auto shrink-0">
          <div className="p-5 space-y-7">
            <Section title="Texte">
              <textarea
                value={settings.text}
                onChange={(e) => update({ text: e.target.value })}
                rows={2}
                className="w-full px-3.5 py-2.5 text-sm border border-[#aea485]/40 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-[#ffdb0f]/50 focus:border-[#ffdb0f] transition"
                placeholder="Entrez votre texte..."
              />
            </Section>

            <Section title="Police">
              <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
                {FONTS.map((f) => (
                  <button
                    key={f.value}
                    onClick={() => update({ font: f.value })}
                    className={`px-2.5 py-2.5 text-[13px] rounded-xl border transition text-left truncate ${
                      settings.font === f.value
                        ? "border-[#ffdb0f] bg-[#fffdeb] text-[#161407] ring-1 ring-[#ffdb0f]"
                        : "border-[#aea485]/40 hover:border-[#aea485] text-[#161407]"
                    }`}
                    style={{ fontFamily: f.value }}
                  >
                    {f.name}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 mt-3">
                <StyleButton active={settings.bold} onClick={() => update({ bold: !settings.bold })} className="font-bold">
                  B
                </StyleButton>
                <StyleButton active={settings.italic} onClick={() => update({ italic: !settings.italic })} className="italic">
                  I
                </StyleButton>
              </div>
            </Section>

            <Slider
              label="Taille"
              value={settings.fontSize}
              unit="px"
              min={12}
              max={160}
              onChange={(v) => update({ fontSize: v })}
            />

            <Section title="Courbe" badge={curveLabel(settings.curveAmount)}>
              <input
                type="range"
                min={-100}
                max={100}
                value={settings.curveAmount}
                onChange={(e) => update({ curveAmount: Number(e.target.value) })}
                className="w-full"
              />
              <div className="flex justify-between text-[11px] text-[#aea485] mt-1">
                <span>⌣ bas</span>
                <span>— droit</span>
                <span>⌢ haut</span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {CURVE_PRESETS.map(({ label, value }) => (
                  <button
                    key={value}
                    onClick={() => update({ curveAmount: value })}
                    className={`py-2 text-xs rounded-xl border transition ${
                      settings.curveAmount === value
                        ? "bg-[#161407] text-[#ffdb0f] border-[#161407]"
                        : "bg-white text-[#161407] border-[#aea485]/40 hover:border-[#ffdb0f]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Section>

            <Slider
              label="Espacement"
              value={settings.letterSpacing}
              unit="px"
              min={-15}
              max={50}
              onChange={(v) => update({ letterSpacing: v })}
            />

            <Section title="Couleur du texte">
              <ColorField color={settings.color} onChange={(c) => update({ color: c })} />
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {SWATCHES.map((c) => (
                  <Swatch key={c} color={c} active={settings.color === c} onClick={() => update({ color: c })} />
                ))}
              </div>
            </Section>

            <ToggleSection
              title="Contour"
              enabled={settings.strokeEnabled}
              onToggle={() => update({ strokeEnabled: !settings.strokeEnabled })}
            >
              <ColorField color={settings.strokeColor} onChange={(c) => update({ strokeColor: c })} />
              <Slider
                label="Épaisseur"
                value={settings.strokeWidth}
                unit="px"
                min={1}
                max={14}
                onChange={(v) => update({ strokeWidth: v })}
                compact
              />
            </ToggleSection>

            <ToggleSection
              title="Ombre portée"
              enabled={settings.textShadow}
              onToggle={() => update({ textShadow: !settings.textShadow })}
            >
              <ColorField color={settings.shadowColor} onChange={(c) => update({ shadowColor: c })} />
              <Slider
                label="Flou"
                value={settings.shadowBlur}
                unit="px"
                min={0}
                max={40}
                onChange={(v) => update({ shadowBlur: v })}
                compact
              />
            </ToggleSection>

            <Section title="Arrière-plan">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-[#161407] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.bgTransparent}
                    onChange={(e) => update({ bgTransparent: e.target.checked })}
                    className="accent-[#ffdb0f] w-4 h-4"
                  />
                  Transparent
                </label>
                {!settings.bgTransparent && (
                  <ColorField color={settings.bgColor} onChange={(c) => update({ bgColor: c })} compact />
                )}
              </div>
            </Section>

            <button
              onClick={() => setSettings(DEFAULT_SETTINGS)}
              className="w-full py-2.5 text-sm text-[#aea485] border border-[#aea485]/40 rounded-xl hover:bg-[#fffdeb] hover:text-[#161407] transition"
            >
              ↺ Réinitialiser
            </button>
          </div>
        </aside>

        <main className="flex-1 flex flex-col items-center justify-center p-10 overflow-auto">
          <div className="relative" style={{ width: displayW, height: displayH }}>
            <div
              className="rounded-2xl shadow-xl overflow-hidden ring-1 ring-black/5"
              style={{
                background: settings.bgTransparent
                  ? "repeating-conic-gradient(#f3f4f6 0% 25%, #ffffff 0% 50%) 50% / 24px 24px"
                  : "#fff",
              }}
            >
              <canvas
                ref={canvasRef}
                width={settings.width * RENDER_SCALE}
                height={settings.height * RENDER_SCALE}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerLeave={(e) => {
                  endDrag(e);
                  setHovering(false);
                }}
                className="block touch-none select-none"
                style={{
                  width: displayW,
                  height: displayH,
                  cursor: dragging ? "grabbing" : hovering ? "grab" : "default",
                }}
              />
            </div>

            {/* Poignée de redimensionnement, coin bas-gauche */}
            <div
              onPointerDown={onResizeDown}
              onPointerMove={onResizeMove}
              onPointerUp={onResizeUp}
              role="slider"
              aria-label="Redimensionner le canvas"
              aria-valuenow={settings.width}
              title="Glisser pour redimensionner"
              className="absolute -bottom-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#ffdb0f] border-2 border-white shadow-md touch-none"
              style={{ cursor: "nesw-resize" }}
            />
          </div>
          <p className="text-center text-xs text-[#aea485] mt-4">
            {selectedFont?.name} · {settings.fontSize}px · {curveLabel(settings.curveAmount)} ·{" "}
            {settings.width}×{settings.height}
          </p>
        </main>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#161407] text-[#ffdb0f] text-sm px-4 py-2.5 rounded-xl shadow-lg z-50 animate-[fadeIn_.2s_ease]">
          {toast}
        </div>
      )}
    </div>
  );
}
