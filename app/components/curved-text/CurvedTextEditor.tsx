"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_SETTINGS, loadCanvasFont, type TextSettings } from "./settings";
import { drawCurvedText, measureTextBox } from "./render";
import { buildSvg } from "./svg";
import type { Font } from "opentype.js";

// Police vectorisée (pour l'export SVG), chargée à la demande via opentype.js.
const CANVAS_FONT_URL = "/Font/PPRadioGrotesk-Black.otf";

// Le canvas affiché utilise un backing store 2x pour rester net sur écran retina.
const RENDER_SCALE = 2;

export default function CurvedTextEditor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Police vectorisée, chargée et mise en cache au premier export SVG.
  const svgFont = useRef<Font | null>(null);
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

  // Le canvas occupe toute la zone de travail : on suit la taille du <main> et on
  // ajuste les dimensions de rendu en conséquence.
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const apply = () => {
      const w = Math.max(1, Math.round(el.clientWidth));
      const h = Math.max(1, Math.round(el.clientHeight));
      setSettings((prev) =>
        prev.width === w && prev.height === h ? prev : { ...prev, width: w, height: h },
      );
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
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

  const downloadSVG = async () => {
    try {
      // Charge et met en cache la police vectorielle au premier export.
      // opentype 2.x : load() est déprécié -> on récupère le buffer et parse().
      if (!svgFont.current) {
        const mod = await import("opentype.js");
        const parse = mod.parse ?? mod.default?.parse;
        const buf = await (await fetch(CANVAS_FONT_URL)).arrayBuffer();
        svgFont.current = parse(buf);
      }
      const blob = new Blob([buildSvg(settings, svgFont.current)], {
        type: "image/svg+xml",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = `${settings.text.toLowerCase() || "texte"}.svg`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
      showToast("SVG exporté ✓");
    } catch (err) {
      console.error("Export SVG échoué", err);
      showToast("Export SVG échoué ✗");
    }
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-(--cream) p-4 text-[var(--ink)]">
      {/* Carte principale teintée avec coins arrondis (cf. design). */}
      <div className="relative flex h-full w-full overflow-hidden rounded-2xl bg-[#161407]/[0.04] ring-1 ring-[#161407]/[0.06]">
        {/* ── Panneau latéral ─────────────────────────────────────────── */}
        <aside className="flex w-[245px] shrink-0 flex-col justify-between border-r border-[#161407]/[0.08] p-8">
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
        <main ref={mainRef} className="relative flex-1 overflow-hidden">
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
            className="block size-full touch-none select-none"
            style={{
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
