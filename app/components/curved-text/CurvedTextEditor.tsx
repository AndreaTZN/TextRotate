"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import gsap from "gsap";
import {
  DEFAULT_SETTINGS,
  loadCanvasFont,
  makeLayerId,
  type TextLayer,
  type TextSettings,
} from "./settings";
import { drawCurvedText, measureTextBox } from "./render";
import { buildSvg } from "./svg";
import type { Font } from "opentype.js";

// Police vectorisée (pour l'export SVG), chargée à la demande via opentype.js.
const CANVAS_FONT_URL = "/Font/CentraNo.1-ExtraBold-Trial.otf";

// Le canvas affiché utilise un backing store 2x pour rester net sur écran retina.
const RENDER_SCALE = 2;

// Slider « Deformation » : la position va de 10 à 60 (défaut 30), et curveAmount
// est interpolé linéairement entre 25 et 35 sur cette plage
// (10 → 25, 30 → 30, 60 → 35).
const DEFORMATION_MIN = 10;
const DEFORMATION_MAX = 60;
const CURVE_MIN = 25;
const CURVE_MAX = 35;

// position du slider (10..60) → curveAmount (25..35)
function sliderToCurve(pos: number): number {
  const t = (pos - DEFORMATION_MIN) / (DEFORMATION_MAX - DEFORMATION_MIN);
  return CURVE_MIN + t * (CURVE_MAX - CURVE_MIN);
}

// curveAmount (25..35) → position du slider (10..60)
function curveToSlider(curve: number): number {
  const t = (curve - CURVE_MIN) / (CURVE_MAX - CURVE_MIN);
  return DEFORMATION_MIN + t * (DEFORMATION_MAX - DEFORMATION_MIN);
}

export default function CurvedTextEditor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  // Police vectorisée, chargée et mise en cache au premier export SVG.
  const svgFont = useRef<Font | null>(null);
  // Progression d'apparition par lettre (0 -> 1), animée par GSAP.
  const reveal = useRef<number[]>([]);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const [settings, setSettings] = useState<TextSettings>(DEFAULT_SETTINGS);
  // Calque de texte actuellement sélectionné (édité par le panneau, déplaçable).
  const [activeId, setActiveId] = useState<string>(
    DEFAULT_SETTINGS.texts[0].id,
  );
  const [fontTick, setFontTick] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [hovering, setHovering] = useState(false);
  const [dragging, setDragging] = useState(false);
  // État du glisser-déplacer du texte : null quand on ne déplace pas.
  const drag = useRef<{
    pointerId: number;
    layerId: string;
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
  } | null>(null);

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
        prev.width === w && prev.height === h
          ? prev
          : { ...prev, width: w, height: h },
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
    drawCurvedText(ctx, settings, reveal.current, activeId);
  }, [settings, activeId]);

  useEffect(() => {
    draw();
  }, [draw, fontTick]);

  // Apparition « pop » des lettres (GSAP) : chaque lettre grossit + apparaît en
  // cascade. On anime un tableau de progressions par lettre (un proxy { i: 0->1 })
  // et on redessine le canvas à chaque tick. Le timeline vit dans un gsap.context
  // pour être proprement nettoyé.
  const revealCtx = useRef<gsap.Context | null>(null);
  const playReveal = useCallback(() => {
    revealCtx.current?.revert();
    const active = settings.texts.find((t) => t.id === activeId);
    const n = active ? [...active.text].length : 0;
    if (n === 0) {
      reveal.current = [];
      draw();
      return;
    }
    // Un objet { p } par lettre : GSAP peut alors les décaler (stagger).
    const items = Array.from({ length: n }, () => ({ p: 0 }));
    const sync = () => {
      reveal.current = items.map((it) => it.p);
      draw();
    };
    revealCtx.current = gsap.context(() => {
      // fromTo : GSAP applique l'état de départ (p=0) dans son propre cycle de
      // rendu, puis anime jusqu'à 1. Pas de frame intermédiaire avec le mot plein,
      // donc le texte ne « clignote » pas avant l'animation.
      gsap.fromTo(
        items,
        { p: 0 },
        {
          p: 1,
          duration: 0.45,
          ease: "back.out(2)",
          stagger: 0.05,
          onUpdate: sync,
          onComplete: () => {
            reveal.current = []; // 100 % : on repasse en rendu normal
            draw();
          },
        },
      );
    });
  }, [settings.texts, activeId, draw]);

  // Joue l'apparition au montage (police prête) puis, après chaque modification du
  // texte, à la fin de la frappe (debounce ~400 ms) pour ne pas rejouer à chaque
  // caractère.
/*   useEffect(() => {
    if (fontTick === 0) return; // attend le 1er chargement de police
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(playReveal, 400);
    return () => {
      clearTimeout(typingTimer.current);
      revealCtx.current?.revert();
    };
  }, [fontTick, playReveal]);  */

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const update = (patch: Partial<TextSettings>) =>
    setSettings((prev) => ({ ...prev, ...patch }));

  // Applique un patch au calque actif uniquement (contenu, position…).
  const updateActiveLayer = (patch: Partial<TextLayer>) =>
    setSettings((prev) => ({
      ...prev,
      texts: prev.texts.map((t) =>
        t.id === activeId ? { ...t, ...patch } : t,
      ),
    }));

  // Ajoute un nouveau calque au centre (légèrement décalé) et le sélectionne.
  const addLayer = () => {
    const layer: TextLayer = {
      id: makeLayerId(),
      text: "TEXTE",
      offsetX: 0,
      offsetY: 0,
    };
    setSettings((prev) => ({ ...prev, texts: [...prev.texts, layer] }));
    setActiveId(layer.id);
  };

  // Supprime un calque (on garde toujours au moins un calque).
  const removeLayer = (id: string) =>
    setSettings((prev) => {
      if (prev.texts.length <= 1) return prev;
      const texts = prev.texts.filter((t) => t.id !== id);
      if (id === activeId) setActiveId(texts[0].id);
      return { ...prev, texts };
    });

  // Réinitialise tous les réglages par défaut (texte, position…) en conservant les
  // dimensions courantes du canvas (qui suivent la taille de la zone de travail).
  const reset = () => {
    setSettings((prev) => ({
      ...DEFAULT_SETTINGS,
      width: prev.width,
      height: prev.height,
    }));
    setActiveId(DEFAULT_SETTINGS.texts[0].id);
  };

  // Calque actuellement sélectionné (toujours présent : au moins un calque).
  const activeLayer =
    settings.texts.find((t) => t.id === activeId) ?? settings.texts[0];

  // Convertit un événement pointeur en coordonnées canvas (non scalées).
  const toCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * settings.width,
      y: ((e.clientY - rect.top) / rect.height) * settings.height,
    };
  };

  // Renvoie le calque dont la boîte englobante contient le point (canvas), en
  // testant du dessus vers le dessous (les derniers calques sont dessinés au-dessus).
  const layerAt = (x: number, y: number): TextLayer | null => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return null;
    for (let i = settings.texts.length - 1; i >= 0; i--) {
      const layer = settings.texts[i];
      const box = measureTextBox(ctx, settings, layer);
      if (x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h) {
        return layer;
      }
    }
    return null;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = toCanvasPoint(e);
    const layer = layerAt(p.x, p.y);
    if (!layer) return;
    setActiveId(layer.id); // sélectionne le calque cliqué
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      pointerId: e.pointerId,
      layerId: layer.id,
      startX: p.x,
      startY: p.y,
      baseX: layer.offsetX,
      baseY: layer.offsetY,
    };
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = toCanvasPoint(e);
    const d = drag.current;
    if (!d) {
      setHovering(layerAt(p.x, p.y) !== null);
      return;
    }
    setSettings((prev) => ({
      ...prev,
      texts: prev.texts.map((t) =>
        t.id === d.layerId
          ? {
              ...t,
              offsetX: Math.round(d.baseX + (p.x - d.startX)),
              offsetY: Math.round(d.baseY + (p.y - d.startY)),
            }
          : t,
      ),
    }));
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
      const name = settings.texts
        .map((t) => t.text)
        .join("-")
        .toLowerCase();
      link.download = `${name || "texte"}.svg`;
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
    <div className="h-screen w-screen overflow-hidden bg-(--cream) p-4 text-(--ink)">
      {/* Carte principale teintée avec coins arrondis (cf. design). */}
      <div className="relative flex h-full w-full overflow-hidden rounded-2xl bg-[#161407]/[0.04] ring-1 ring-[#161407]/[0.06]">
        {/* ── Panneau latéral ─────────────────────────────────────────── */}
        <aside className="flex w-61.25 shrink-0 flex-col justify-between border-r border-[#161407]/[0.08] p-8">
          <div className="flex flex-col gap-11">
            <h1 className="flex justify-center">
              <span className="sr-only">Bitstack type tool</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 665 102"
                fill="none"
                role="img"
                aria-hidden="true"
                className="h-auto w-32 text-(--ink)"
              >
                <g clipPath="url(#bitstack-a)">
                  <path
                    fill="currentColor"
                    d="M270.594 24.532c5.001 0 8.952-3.952 8.952-8.952 0-5.001-3.951-8.952-8.952-8.952-5 0-8.952 3.951-8.952 8.952 0 5 3.952 8.952 8.952 8.952ZM221.18 98.475l-36.391-.234V5.461l34.529.234c22.555-.233 30.112 9.768 30.112 24.3 0 8.485-4.534 14.53-10.347 18.486 7.557 3.373 13.603 11.396 13.603 21.51 0 18.72-12.091 28.254-31.506 28.484Zm-20.694-55.923h15.231c7.79 0 17.67-.35 17.67-12.558 0-10.58-10.23-10.696-17.67-10.696h-15.231v23.254Zm0 13.953v27.671h15.231c8.023 0 20.581 0 20.581-14.185 0-13.37-11.509-13.486-20.581-13.486h-15.231Zm62.551-26.51V98.24h15.814V29.994h-15.814Zm50.693 69.641c-11.163 0-16.276-5.233-16.276-15.93V43.71h-9.885V30.457h9.885V14.414h15.93v16.043h11.742V43.71h-11.742v34.995c0 7.208 3.023 8.603 13.137 6.862v12.441a50.555 50.555 0 0 1-12.791 1.628Zm44.759 0c-16.625 0-28.716-11.28-28.716-25.694h13.835c0 18.02 27.556 15.464 27.556 5.463 0-13.37-38.835-6.629-38.835-30.928 0-13.72 12.558-19.881 26.16-19.881 15.231 0 25.695 7.557 26.277 20.464l-14.302.233c-.583-10.463-22.671-10.696-22.671-1.395 0 12.325 38.951 5.696 38.951 30.462 0 14.185-12.441 21.276-28.255 21.276Zm57.089 0c-11.163 0-16.043-5.233-16.043-15.93V43.71h-9.997V30.457h9.997V14.414h15.814v16.043h11.858V43.71h-11.858v34.995c0 7.208 2.906 8.603 13.253 6.862v12.441c-3.14.812-7.674 1.628-13.02 1.628h-.004Zm40.229 0c-14.419 0-23.833-8.023-23.833-21.393 0-14.419 10.23-18.37 20.581-20.231l17.325-3.14c3.489-.582 4.768-1.161 4.768-5 0-4.185-3.373-8.719-12.092-8.719-8.718 0-13.02 5.117-13.02 11.396l-15.813-.35c1.045-15.464 11.046-23.603 29.533-23.603 20.693 0 26.393 11.046 26.393 33.25v36.391h-13.836v-6.745c-4.184 5-10.813 8.14-19.998 8.14l-.008.004Zm2.906-12.44c10.814 0 15.814-8.603 15.931-21.86-1.512.466-3.14.7-16.626 3.372-6.046 1.162-10.114 3.723-10.114 9.535 0 5.117 3.606 8.952 10.813 8.952h-.004Zm71.154 12.44c-19.882 0-32.902-12.79-32.902-35.112 0-22.322 14.419-35.925 32.789-35.925 13.603 0 26.739 7.208 29.067 24.183h-13.02c-6.974-16.975-33.018-14.764-33.018 11.046 0 25.811 26.393 28.95 33.018 10.813h13.603c-2.907 15.464-14.186 25-29.533 25l-.004-.005Zm52.899-94.058h-15.813v92.663h15.813V69.987l7.091-3.723 20.927 31.973h18.953l-28.95-43.135 25.344-24.65h-19.182L582.766 54.52V5.579Z"
                  />
                </g>
                <g clipPath="url(#bitstack-b)">
                  <path
                    fill="currentColor"
                    d="M150.655 75.418c-7.062-16-22.834-20.706-35.31-17.647 11.299-14.589 4.002-31.53-11.064-42.118C89.216 4.829 64.028.123 34.603 6.24v8.941s35.781-1.882 46.845 8.236c-10.358-3.765-30.367-4.471-44.49-.706v6.823s24.952-.47 33.426 6.824c-7.062-2.118-22.598-.941-30.366 1.412v4.706c0-.236 17.89-2.353 17.89 9.882 0 22.118-42.372 30.824-57.908 35.06v14.352c52.258-24.706 110.637-24.706 162.425 0V91.183c-8.475-3.059-8.71-8.941-11.77-15.765Z"
                  />
                </g>
                <path
                  fill="currentColor"
                  d="M650.314 0c2.674 0 5.134.65 7.383 1.947a14.315 14.315 0 0 1 5.338 5.256c1.31 2.223 1.965 4.677 1.965 7.363 0 2.703-.664 5.193-1.992 7.47a14.952 14.952 0 0 1-5.364 5.415c-2.249 1.316-4.692 1.974-7.33 1.974-2.726 0-5.214-.65-7.462-1.948a14.592 14.592 0 0 1-5.338-5.362c-1.293-2.258-1.939-4.74-1.939-7.443 0-2.667.646-5.122 1.939-7.362a14.334 14.334 0 0 1 5.364-5.336C645.144.658 647.623 0 650.314 0Zm0 3.148a10.87 10.87 0 0 0-5.656 1.547c-1.718 1.014-3.081 2.401-4.09 4.162-1.009 1.743-1.514 3.646-1.514 5.709 0 2.116.505 4.063 1.514 5.842a11.638 11.638 0 0 0 4.09 4.215 10.87 10.87 0 0 0 5.656 1.547c2.072 0 3.966-.507 5.683-1.52a11.217 11.217 0 0 0 4.063-4.189c1.01-1.778 1.514-3.708 1.514-5.789 0-2.08-.513-4.001-1.54-5.762a11.364 11.364 0 0 0-4.116-4.188 10.553 10.553 0 0 0-5.604-1.574Zm.213 3.548c1.77 0 3.116.409 4.036 1.227.939.8 1.408 1.948 1.408 3.441 0 1.05-.239 1.939-.717 2.668-.478.73-1.169 1.254-2.072 1.574l3.267 5.362-2.39 1.307-3.692-6.215h-2.124v5.895h-2.789V6.695h5.073Zm0 6.91c.832 0 1.46-.187 1.885-.56.443-.392.664-.952.664-1.682 0-.693-.221-1.227-.664-1.6-.425-.391-1.053-.587-1.885-.587h-2.284v4.428h2.284Z"
                />
                <defs>
                  <clipPath id="bitstack-a">
                    <path
                      fill="#fff"
                      d="M184.789 5.462h444.952v94.174H184.789z"
                    />
                  </clipPath>
                  <clipPath id="bitstack-b">
                    <path fill="#fff" d="M0 3.531h162.425v98.241H0z" />
                  </clipPath>
                </defs>
              </svg>
            </h1>

            {/* Text : liste des calques (sélection + suppression), ajout, et
               champ d'édition du calque actif. */}
            <section className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h2 className="text-[16px] font-medium leading-[0.85] tracking-[-0.01em]">
                  Text
                </h2>
                <button
                  type="button"
                  onClick={addLayer}
                  aria-label="Ajouter un texte"
                  className="flex size-6 items-center justify-center rounded-full border border-[#161407]/20 text-(--ink) transition hover:border-[#161407]/40 hover:bg-[#161407]/4"
                >
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 12 12"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <path
                      d="M6 1v10M1 6h10"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>

              {/* Liste des calques : clic = sélectionne, croix = supprime. */}
              {settings.texts.length > 1 && (
                <ul className="flex flex-col gap-1.5">
                  {settings.texts.map((layer) => {
                    const isActive = layer.id === activeId;
                    return (
                      <li key={layer.id} className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setActiveId(layer.id)}
                          className={`flex-1 truncate rounded-lg px-3 py-1.5 text-left text-[13px] uppercase leading-[1.2] tracking-[-0.01em] transition ${
                            isActive
                              ? "bg-[#161407]/10 text-(--ink) ring-1 ring-[#161407]/30"
                              : "text-[#161407]/60 hover:bg-[#161407]/4"
                          }`}
                        >
                          {layer.text || "(vide)"}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeLayer(layer.id)}
                          aria-label="Supprimer ce texte"
                          className="flex size-6 shrink-0 items-center justify-center rounded-full text-[14px] leading-none text-[#161407]/40 transition hover:bg-[#161407]/8 hover:text-(--ink)"
                        >
                          ×
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              <input
                type="text"
                value={activeLayer.text}
                onChange={(e) =>
                  updateActiveLayer({ text: e.target.value.toUpperCase() })
                }
                placeholder="VOTRE TEXTE…"
                spellCheck={false}
                aria-label="Texte du calque sélectionné"
                className="w-full rounded-lg bg-white/60 px-3 py-2.25 text-[14px] uppercase leading-[1.2] tracking-[-0.01em] text-(--ink) outline-none ring-1 ring-[#161407]/12 transition placeholder:text-[#161407]/36 focus:bg-white focus:ring-[1.5px] focus:ring-[#161407]/50"
              />
            </section>

            {/* Deformation : pilote l'inflexion (Bend) de l'Arc — cf. design Figma.
               Le slider va de 10 à 60 (défaut 30) ; curveAmount est interpolé
               linéairement entre 25 et 35 (10 → 25, 30 → 30, 60 → 35). */}
            <section className="flex flex-col gap-3.5">
              <h2 className="text-base font-medium leading-[0.85] tracking-[-0.01em]">
                Deformation
              </h2>
              <div className="flex flex-col gap-2 w-full">
                <input
                  type="range"
                  min={DEFORMATION_MIN}
                  max={DEFORMATION_MAX}
                  step={1}
                  value={curveToSlider(settings.curveAmount)}
                  onChange={(e) =>
                    update({
                      curveAmount: sliderToCurve(Number(e.target.value)),
                    })
                  }
                  aria-label="Déformation"
                  className="range-deformation w-full"
                />
                <div className="flex w-full justify-between">
                  <span className="slider-tick">+ 10</span>
                  <span className="slider-tick text-center">+ 30</span>
                  <span className="slider-tick text-right">+ 60</span>
                </div>
              </div>
            </section>
          </div>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={reset}
              className="flex h-10.25 items-center justify-center rounded-full border border-[#161407]/20 px-6 text-[16px] leading-6 text-(--ink) transition hover:border-[#161407]/40 hover:bg-[#161407]/4"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={downloadSVG}
              className="flex h-10.25 items-center justify-center rounded-full bg-[#161407] px-6 text-[16px] leading-6 text-white backdrop-blur transition hover:bg-[#161407]/90"
            >
              Export in SVG
            </button>
          </div>
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
