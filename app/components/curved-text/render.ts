import { CANVAS_FONT_WEIGHT, type TextSettings } from "./settings";

/**
 * Déformation « Arc » d'Illustrator (Effet > Déformation > Arc, mode Horizontal).
 *
 * `curveAmount` joue le rôle de l'Inflexion (Bend) d'Illustrator, en pourcentage
 * de -100 à +100. Contrairement à un « texte sur cercle », les lettres ne pivotent
 * pas individuellement : c'est tout le bloc de texte (l'enveloppe) qui se courbe.
 * La ligne médiane du texte suit un arc de cercle ; les bords haut/bas suivent des
 * arcs concentriques, ce qui fait varier la hauteur apparente des lettres comme
 * dans Illustrator.
 *
 * Implémentation : on rend le texte « à plat » sur un canvas hors écran, puis on le
 * découpe en fines tranches verticales que l'on replace le long de l'arc (slice-warp).
 */

/** Bend -100..100 -> ratio -1..1. */
function bend(curveAmount: number): number {
  return Math.max(-100, Math.min(100, curveAmount)) / 100;
}

// Interlettrage de base de PP Radio Grotesk : -1% de la taille de police (-0.01em),
// comme dans le design. S'ajoute à un réglage manuel éventuel (s.letterSpacing).
const BASE_TRACKING_EM = -0.01;

/** Espacement effectif entre caractères en px canvas (em + réglage manuel). */
function tracking(s: TextSettings): number {
  return s.letterSpacing + BASE_TRACKING_EM * s.fontSize;
}

// Suréchantillonnage du bitmap de texte « à plat ». Le warp rééchantillonne ce
// bitmap : on le rend donc à une densité supérieure pour garder des bords nets.
const SUPERSAMPLE = 3;

interface FlatText {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  /** Échelle du bitmap par rapport aux unités canvas (px bitmap = px canvas × scale). */
  scale: number;
  width: number; // largeur du texte rendu en px bitmap (sans marge)
  height: number; // hauteur de la boîte rendue en px bitmap
  pad: number; // marge en px bitmap autour pour ne pas rogner contour/ombre
}

function createCanvas(w: number, h: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/**
 * Configure le contexte (police, fill, contour, ombre) comme le rendu final.
 * `scale` permet de rendre le texte à une densité supérieure (suréchantillonnage).
 */
function applyTextStyle(ctx: CanvasRenderingContext2D, s: TextSettings, scale = 1) {
  // Le canvas n'utilise que la graisse Black de PP Radio Grotesk.
  const style = s.italic ? "italic" : "normal";
  ctx.font = `${style} ${CANVAS_FONT_WEIGHT} ${s.fontSize * scale}px ${s.font}`;
  ctx.fillStyle = s.color;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.lineJoin = "round";
}

/** Mesure la largeur du texte (à l'échelle du contexte) avec l'espacement. */
function measureWidth(ctx: CanvasRenderingContext2D, s: TextSettings, scale = 1): number {
  const chars = [...s.text];
  if (chars.length === 0) return 0;
  const gap = tracking(s) * scale;
  let w = 0;
  for (const c of chars) w += ctx.measureText(c).width + gap;
  return Math.max(0, w - gap);
}

/**
 * Rend le texte « à plat » sur un canvas hors écran, suréchantillonné d'un facteur
 * `SUPERSAMPLE`, et renvoie ses métriques (toutes en px bitmap).
 */
function renderFlatText(s: TextSettings): FlatText | null {
  const ss = SUPERSAMPLE;
  const probe = createCanvas(8, 8).getContext("2d") as CanvasRenderingContext2D | null;
  if (!probe) return null;
  applyTextStyle(probe, s, ss);
  const m = probe.measureText(s.text || " ");
  const ascent = m.actualBoundingBoxAscent || s.fontSize * ss * 0.8;
  const descent = m.actualBoundingBoxDescent || s.fontSize * ss * 0.25;
  const textWidth = measureWidth(probe, s, ss);
  const textHeight = ascent + descent;

  // Marge (px bitmap) pour le contour / l'ombre afin de ne pas rogner.
  const pad = Math.ceil(
    (Math.max(s.strokeEnabled ? s.strokeWidth : 0, s.textShadow ? s.shadowBlur + 3 : 0) +
      4) *
      ss,
  );

  const w = Math.ceil(textWidth) + pad * 2;
  const h = Math.ceil(textHeight) + pad * 2;
  if (w <= 0 || h <= 0) return null;

  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | null;
  if (!ctx) return null;
  applyTextStyle(ctx, s, ss);

  if (s.textShadow) {
    ctx.shadowColor = s.shadowColor;
    ctx.shadowBlur = s.shadowBlur * ss;
    ctx.shadowOffsetY = 3 * ss;
  }

  const baselineY = pad + ascent;
  const gap = tracking(s) * ss;
  const chars = [...s.text];
  let x = pad;
  for (const c of chars) {
    if (s.strokeEnabled) {
      ctx.strokeStyle = s.strokeColor;
      ctx.lineWidth = s.strokeWidth * ss;
      ctx.strokeText(c, x, baselineY);
    }
    ctx.fillText(c, x, baselineY);
    x += ctx.measureText(c).width + gap;
  }

  return { canvas, scale: ss, width: textWidth, height: h, pad };
}

export function drawCurvedText(ctx: CanvasRenderingContext2D, s: TextSettings) {
  ctx.clearRect(0, 0, s.width, s.height);

  if (!s.bgTransparent) {
    ctx.fillStyle = s.bgColor;
    ctx.fillRect(0, 0, s.width, s.height);
  }

  const flat = renderFlatText(s);
  if (!flat || flat.width <= 0) return;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const cx = s.width / 2 + s.offsetX;
  const cy = s.height / 2 + s.offsetY;
  const b = bend(s.curveAmount);

  // Texte à plat : on recentre et on redimensionne le bitmap suréchantillonné.
  if (Math.abs(b) < 0.001) {
    const dw = flat.canvas.width / flat.scale;
    const dh = flat.canvas.height / flat.scale;
    ctx.drawImage(flat.canvas as CanvasImageSource, cx - dw / 2, cy - dh / 2, dw, dh);
    return;
  }

  warpArc(ctx, flat, cx, cy, b);
}

/**
 * Découpe le texte à plat en tranches verticales et les place le long de l'arc.
 *
 * Géométrie (Arc horizontal d'Illustrator) :
 *  - l'axe horizontal du texte (largeur W) est posé sur un arc d'angle θ = b·π ;
 *  - rayon de la ligne médiane R = W / |θ| ;
 *  - chaque tranche à l'abscisse normalisée u ∈ [-0.5, 0.5] est tournée de l'angle
 *    a = θ·u et translatée sur l'arc, sa verticale suivant la normale au cercle.
 */
function warpArc(
  ctx: CanvasRenderingContext2D,
  flat: FlatText,
  cx: number,
  cy: number,
  b: number,
) {
  const img = flat.canvas as CanvasImageSource;
  const scale = flat.scale; // px bitmap -> px canvas : on divise par scale
  const srcW = flat.canvas.width;
  const srcH = flat.canvas.height;
  const W = flat.width / scale; // largeur utile en px canvas
  const pad = flat.pad;
  const dH = srcH / scale; // hauteur de la boîte en px canvas

  const theta = b * Math.PI; // angle total balayé (signé)
  const R = W / Math.abs(theta); // rayon de la ligne médiane (px canvas)
  const up = b > 0; // arc convexe vers le haut
  const dir = up ? -1 : 1; // sens vertical du centre du cercle

  // Centre du cercle : décalé verticalement pour que le sommet de l'arc reste sur cy.
  const circleY = cy - dir * R;

  // Nombre de tranches : assez fin pour rester lisse même sur grand rayon.
  const slices = Math.max(64, Math.ceil(W));
  const step = srcW / slices; // largeur d'une tranche en px bitmap

  for (let i = 0; i < slices; i++) {
    const sx = i * step;
    const sliceW = Math.min(step, srcW - sx);
    if (sliceW <= 0) continue;

    // Abscisse normalisée du milieu de la tranche le long du texte utile (canvas).
    const midSrc = (sx + sliceW / 2 - pad) / scale; // px canvas depuis le bord gauche
    const u = (midSrc - W / 2) / W; // ∈ ~[-0.5, 0.5]
    const a = theta * u; // angle de cette tranche

    // Position du milieu de la tranche sur la ligne médiane de l'arc.
    const mx = cx + R * Math.sin(a);
    const my = circleY + dir * R * Math.cos(a);

    // Tranche de destination, légèrement élargie pour recouvrir les coutures.
    const dW = (sliceW / scale) + 0.6;

    ctx.save();
    ctx.translate(mx, my);
    // La tranche s'oriente le long de la tangente à l'arc.
    ctx.rotate(-dir * a);
    // On dessine la tranche centrée sur son milieu (la verticale suit la normale).
    ctx.drawImage(img, sx, 0, sliceW, srcH, -dW / 2, -dH / 2, dW, dH);
    ctx.restore();
  }
}

/**
 * Boîte englobante approximative du texte déformé (coordonnées canvas non scalées),
 * utilisée pour le hit-test du glisser-déplacer.
 */
export function measureTextBox(
  ctx: CanvasRenderingContext2D,
  s: TextSettings,
): { x: number; y: number; w: number; h: number } {
  applyTextStyle(ctx, s);
  const total = measureWidth(ctx, s);
  const cx = s.width / 2 + s.offsetX;
  const cy = s.height / 2 + s.offsetY;

  let w = total;
  let h = s.fontSize * 1.4;

  const b = bend(s.curveAmount);
  if (Math.abs(b) >= 0.001 && total > 0) {
    const theta = b * Math.PI;
    const R = total / Math.abs(theta);
    const half = Math.min(Math.abs(theta) / 2, Math.PI);
    w = 2 * R * Math.sin(half) + s.fontSize;
    const sagitta = R * (1 - Math.cos(half));
    h = sagitta + s.fontSize * 1.4;
  }

  const pad = s.fontSize * 0.5;
  return {
    x: cx - w / 2 - pad,
    y: cy - h / 2 - pad,
    w: w + pad * 2,
    h: h + pad * 2,
  };
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Export SVG. On approxime la déformation Arc par un `textPath` sur un arc de
 * cercle équivalent (même rayon / même angle que le rendu canvas). Le texte
 * reste vectoriel et éditable, au prix d'une légère différence sur les bords.
 */
export function buildSvg(s: TextSettings): string {
  const cx = s.width / 2 + s.offsetX;
  const cy = s.height / 2 + s.offsetY;
  const weight = CANVAS_FONT_WEIGHT;
  const style = s.italic ? "italic" : "normal";
  const fontFamily = s.font.split(",")[0].replace(/'/g, "");
  const b = bend(s.curveAmount);

  // Largeur estimée du texte (sans contexte canvas côté SVG) : approximation.
  const gap = tracking(s);
  const approxW = s.text.length * s.fontSize * 0.6 + Math.max(0, s.text.length - 1) * gap;

  let pathDef: string;
  if (Math.abs(b) < 0.001) {
    pathDef = `M ${cx - approxW / 2} ${cy} L ${cx + approxW / 2} ${cy}`;
  } else {
    const theta = b * Math.PI;
    const R = approxW / Math.abs(theta);
    const up = b > 0;
    const dir = up ? -1 : 1;
    const circleY = cy - dir * R;
    const half = Math.min(Math.abs(theta) / 2, Math.PI * 0.99);
    const x1 = cx - R * Math.sin(half);
    const x2 = cx + R * Math.sin(half);
    const yEdge = circleY + dir * R * Math.cos(half);
    const sweep = up ? 1 : 0;
    pathDef = `M ${x1} ${yEdge} A ${R} ${R} 0 0 ${sweep} ${x2} ${yEdge}`;
  }

  const bg = s.bgTransparent
    ? ""
    : `<rect width="${s.width}" height="${s.height}" fill="${s.bgColor}"/>`;

  const strokeAttrs = s.strokeEnabled
    ? `stroke="${s.strokeColor}" stroke-width="${s.strokeWidth}" paint-order="stroke"`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s.width}" height="${s.height}" viewBox="0 0 ${s.width} ${s.height}">
  ${bg}
  <defs><path id="curve" d="${pathDef}" fill="none"/></defs>
  <text font-family="${escapeXml(fontFamily)}" font-size="${s.fontSize}" font-weight="${weight}" font-style="${style}" fill="${s.color}" ${strokeAttrs} letter-spacing="${gap}">
    <textPath href="#curve" startOffset="50%" text-anchor="middle">${escapeXml(s.text)}</textPath>
  </text>
</svg>`;
}
