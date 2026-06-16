"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_SETTINGS,
  TEXT_SWATCHES,
  loadCanvasFont,
  type TextSettings,
} from "./settings";
import { buildSvg, drawCurvedText, measureTextBox } from "./render";

// Le canvas affiché utilise un backing store 2x pour rester net sur écran retina.
const RENDER_SCALE = 2;

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

  // Redessine quand les webfonts arrivent.
  useEffect(() => {
    let cancelled = false;
    const bump = () => {
      if (!cancelled) setFontTick((t) => t + 1);
    };
    loadCanvasFont(bump);
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

  const showToast = (msg: string) => {
    clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 2000);
  };

  const downloadSVG = () => {
    const blob = new Blob([buildSvg(settings)], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = `${settings.text.toLowerCase() || "texte"}.svg`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
    showToast("SVG exporté ✓");
  };

  // Échelle d'affichage : on tient le canvas dans la zone de travail sans
  // jamais l'agrandir au-delà de sa taille réelle (scale <= 1).
  const MAX_VIEW_W = 1400;
  const MAX_VIEW_H = 900;
  const displayScale = Math.min(
    1,
    MAX_VIEW_W / settings.width,
    MAX_VIEW_H / settings.height,
  );
  const displayW = settings.width * displayScale;
  const displayH = settings.height * displayScale;

  return (
    <div className="h-screen w-screen overflow-hidden bg-[var(--cream)] p-4 text-[var(--ink)]">
      {/* Carte principale teintée avec coins arrondis (cf. design). */}
      <div className="relative flex h-full w-full overflow-hidden rounded-2xl bg-[#161407]/[0.04] ring-1 ring-[#161407]/[0.06]">
        {/* ── Panneau latéral ─────────────────────────────────────────── */}
        <aside className="flex w-[245px] shrink-0 flex-col justify-between border-r border-[#161407]/[0.08] px-[48px] py-[44px]">
          <div className="flex flex-col gap-[44px]">
            <h1 className="text-[17px] font-medium leading-[0.85] tracking-[-0.01em] text-[var(--ink)]">
              Bitstack type tool
            </h1>

            {/* Text */}
            <section className="flex flex-col gap-[16px]">
              <h2 className="text-[16px] font-medium leading-[0.85] tracking-[-0.01em]">
                Text
              </h2>
              <input
                type="text"
                value={settings.text}
                onChange={(e) => update({ text: e.target.value })}
                placeholder="Votre texte…"
                spellCheck={false}
                aria-label="Texte"
                className="w-full rounded-lg bg-white/60 px-3 py-2.25 text-[14px] leading-[1.2] tracking-[-0.01em] text-(--ink) outline-none ring-1 ring-[#161407]/12 transition placeholder:text-[#161407]/36 focus:bg-white focus:ring-[1.5px] focus:ring-[#161407]/50"
              />
            </section>

            {/* Color text */}
            <section className="flex flex-col gap-[16px]">
              <h2 className="text-[16px] font-medium leading-[0.85] tracking-[-0.01em]">
                Color text
              </h2>
              <div className="flex gap-[6px]">
                {TEXT_SWATCHES.map((c) => {
                  const active = settings.color.toLowerCase() === c.toLowerCase();
                  return (
                    <button
                      key={c}
                      type="button"
                      aria-label={`Couleur ${c}`}
                      aria-pressed={active}
                      onClick={() => update({ color: c })}
                      className="size-[24px] rounded-[4.6px] transition"
                      style={{
                        backgroundColor: c,
                        boxShadow: active
                          ? "0 0 0 1.5px var(--ink), 0 0 0 3px rgba(22,20,7,0.18)"
                          : "inset 0 0 0 1px rgba(22,20,7,0.16)",
                      }}
                    />
                  );
                })}
              </div>
            </section>
          </div>

          <button
            type="button"
            onClick={downloadSVG}
            className="flex h-10.25 items-center justify-center rounded-full bg-[#161407] px-[24px] text-[16px] leading-[24px] text-white backdrop-blur transition hover:bg-[#161407]/90"
          >
            Export in SVG
          </button>
        </aside>

        {/* ── Zone de travail ─────────────────────────────────────────── */}
        <main className="flex flex-1 items-center justify-center overflow-hidden p-6">
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
        </main>
      </div>

      {toast && (
        <div className="fixed bottom-8 left-1/2 z-50 -translate-x-1/2 animate-[fadeIn_.2s_ease] rounded-full bg-[#161407] px-5 py-2.5 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
