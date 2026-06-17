import {
  CANVAS_FONT_WEIGHT,
  type TextLayer,
  type TextSettings,
} from "./settings";

/**
 * Déformation « Arc » d'Illustrator (Effet > Déformation > Arc, mode Horizontal).
 *
 * `curveAmount` = Inflexion (Bend), -100..100 (+ = arc convexe vers le haut).
 * `distortH` / `distortV` = perspectives horizontale / verticale.
 *
 * Modèle : **warp d'enveloppe vertical**. Contrairement à un « texte sur chemin »,
 * les lettres ne pivotent PAS : elles restent debout (verticales). C'est leur
 * position verticale qui suit l'arc — le haut et le bas du texte épousent deux
 * arcs parallèles, si bien que les fûts verticaux des lettres restent verticaux.
 * C'est exactement le comportement de l'effet Arc d'Illustrator. La même fonction
 * d'enveloppe sert au rendu canvas et à l'export SVG.
 */

/** % -100..100 -> ratio -1..1 (Inflexion, Distorsions…). */
function clampUnit(pct: number): number {
  return Math.max(-100, Math.min(100, pct)) / 100;
}

/** Fonction d'enveloppe : envoie (u,v) ∈ [-0.5,0.5]² vers des coords canvas. */
export type EnvelopeFn = (u: number, v: number) => [number, number];

/**
 * Construit la fonction de déformation Arc partagée canvas / SVG.
 * @param W / H largeur et hauteur de la boîte de texte à plat (px).
 * @param cx0 / cy0 centre cible du bloc (coords canvas).
 */
export function makeEnvelope(
  s: TextSettings,
  W: number,
  H: number,
  cx0: number,
  cy0: number,
): EnvelopeFn {
  const b = clampUnit(s.curveAmount);
  const dh = clampUnit(s.distortH);
  const dv = clampUnit(s.distortV);
  const theta = b * Math.PI; // 100 % = demi-cercle
  const flat0 = Math.abs(theta) < 1e-4;
  const R = flat0 ? Infinity : W / theta; // rayon signé

  // Décalage vertical de la médiane à l'abscisse u (arc de cercle), recentré pour
  // que le bloc reste centré sur cy0 (sommet remonté d'une demi-flèche).
  const sagitta = flat0 ? 0 : R * (1 - Math.cos(theta / 2));
  const midOffset = (u: number) =>
    flat0 ? 0 : R * (1 - Math.cos(theta * u)) - sagitta / 2;

  return (u, v) => {
    // Distorsion horizontale : perspective qui resserre/évase les bords.
    const uh = u + dh * u * (0.5 - Math.abs(u)) * 2;
    // Distorsion verticale (perspective) : étirement vertical doux, symétrique.
    const vScale = 1 + dv * (1 - 2 * Math.abs(uh));
    // x inchangé (pas de rotation), y suit l'arc + étirement vertical.
    const x = cx0 + uh * W;
    const y = cy0 + midOffset(uh) + v * H * vScale;
    return [x, y];
  };
}

// Interlettrage de base de Centra No.1 : -1% de la taille de police (-0.01em),
// comme dans le design. S'ajoute à un réglage manuel éventuel (s.letterSpacing).
const BASE_TRACKING_EM = -0.01;

// Auto-fit : marge horizontale conservée de chaque côté de la zone (fraction de
// la largeur du canvas), pour que le texte ne touche jamais le bord.
const FIT_MARGIN = 0.06;

/**
 * Largeur du texte déformé (arc compris) pour une taille de police donnée.
 * @param flatW largeur du texte « à plat » à cette même taille de police.
 * Sert à l'auto-fit : avec l'arc, la boîte s'élargit d'environ une demi-flèche
 * de chaque côté + ~une largeur de glyphe (cf. `measureTextBox`).
 */
function deformedWidth(s: TextSettings, flatW: number, fontSize: number): number {
  if (flatW <= 0) return 0;
  const b = clampUnit(s.curveAmount);
  if (Math.abs(b) < 0.001) return flatW + fontSize;
  const theta = b * Math.PI;
  const R = flatW / Math.abs(theta);
  const half = Math.min(Math.abs(theta) / 2, Math.PI);
  return 2 * R * Math.sin(half) + fontSize;
}

/**
 * Taille de police effective d'un calque : `s.fontSize` au maximum, réduite pour
 * que le texte déformé tienne dans la largeur de la zone (auto-fit en largeur).
 * @param flatW0 largeur du texte « à plat » mesurée à `s.fontSize`.
 *
 * La largeur déformée varie linéairement avec la taille de police (avances,
 * interlettrage et flèche de l'arc s'échelonnent tous proportionnellement à la
 * police), d'où un facteur d'échelle exact sans itération.
 */
export function fitFontSize(s: TextSettings, flatW0: number): number {
  const maxW = s.width * (1 - 2 * FIT_MARGIN);
  const d0 = deformedWidth(s, flatW0, s.fontSize);
  if (d0 <= maxW || d0 <= 0) return s.fontSize;
  return (s.fontSize * maxW) / d0;
}

/** Espacement effectif entre caractères en px canvas (em + réglage manuel). */
function tracking(s: TextSettings): number {
  return s.letterSpacing + BASE_TRACKING_EM * s.fontSize;
}

// Suréchantillonnage du bitmap de texte « à plat ». Le warp rééchantillonne ce
// bitmap : on le rend donc à une densité supérieure pour garder des bords nets.
/** Configure le contexte (police) — le canvas n'utilise que la Black. */
function applyTextStyle(ctx: CanvasRenderingContext2D, s: TextSettings) {
  const style = s.italic ? "italic" : "normal";
  ctx.font = `${style} ${CANVAS_FONT_WEIGHT} ${s.fontSize}px ${s.font}`;
}

/** Mesure la largeur totale du texte avec interlettrage (px canvas). */
function measureWidth(
  ctx: CanvasRenderingContext2D,
  s: TextSettings,
  text: string,
): number {
  const chars = [...text];
  if (chars.length === 0) return 0;
  const gap = tracking(s);
  let w = 0;
  for (const c of chars) w += ctx.measureText(c).width + gap;
  return Math.max(0, w - gap);
}

/**
 * Efface le canvas, peint le fond, puis dessine tous les calques de texte.
 * @param reveal Progression d'apparition par lettre du calque actif (0 = invisible,
 *   1 = en place). Si omis, tout est affiché à 100 %.
 * @param revealLayerId Id du calque concerné par `reveal` (les autres à 100 %).
 */
export function drawCurvedText(
  ctx: CanvasRenderingContext2D,
  s: TextSettings,
  reveal?: number[],
  revealLayerId?: string,
) {
  ctx.clearRect(0, 0, s.width, s.height);

  if (!s.bgTransparent) {
    ctx.fillStyle = s.bgColor;
    ctx.fillRect(0, 0, s.width, s.height);
  }

  for (const layer of s.texts) {
    const r = layer.id === revealLayerId ? reveal : undefined;
    drawLayer(ctx, s, layer, r);
  }
}

/** Dessine un seul calque de texte (déformation Arc, par glyphe). */
function drawLayer(
  ctx: CanvasRenderingContext2D,
  s: TextSettings,
  layer: TextLayer,
  reveal?: number[],
) {
  const chars = [...layer.text];
  if (chars.length === 0) return;

  // Auto-fit en largeur : on mesure le texte à la taille de base, puis on réduit
  // la police si le texte déformé déborderait de la zone. On travaille ensuite
  // avec une copie des réglages portant cette taille effective (tracking, boîte,
  // enveloppe… tout en dépend).
  applyTextStyle(ctx, s);
  const flatW0 = measureWidth(ctx, s, layer.text);
  const fittedSize = fitFontSize(s, flatW0);
  if (fittedSize !== s.fontSize) s = { ...s, fontSize: fittedSize };

  applyTextStyle(ctx, s);
  ctx.fillStyle = s.color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  if (s.textShadow) {
    ctx.shadowColor = s.shadowColor;
    ctx.shadowBlur = s.shadowBlur;
    ctx.shadowOffsetY = 3;
  }

  const gap = tracking(s);
  // Avance + abscisse du centre de chaque glyphe dans le texte à plat.
  const advances = chars.map((c) => ctx.measureText(c).width);
  const centers: number[] = [];
  let x = 0;
  for (const adv of advances) {
    centers.push(x + adv / 2);
    x += adv + gap;
  }
  const W = Math.max(1, x - gap);
  const H = s.fontSize; // hauteur de référence de la boîte (em)

  const cx = s.width / 2 + layer.offsetX;
  const cy = s.height / 2 + layer.offsetY;
  const env = makeEnvelope(s, W, H, cx, cy);
  const base = ctx.getTransform();

  // Warp d'enveloppe vertical : chaque glyphe reste DROIT (pas de rotation). On le
  // place à sa hauteur d'arc et on l'étire verticalement. Un léger cisaillement
  // vertical fait suivre la pente de l'arc tout en gardant les fûts verticaux.
  chars.forEach((ch, i) => {
    const u = centers[i] / W - 0.5;
    const du = advances[i] / W; // largeur normalisée du glyphe
    // Bord gauche / droit du glyphe sur la médiane, pour estimer la pente locale.
    const [, yL] = env(u - du / 2, 0);
    const [, yR] = env(u + du / 2, 0);
    const [gx, gy] = env(u, 0);
    const slope = advances[i] > 0 ? (yR - yL) / advances[i] : 0; // dy/dx local
    // Hauteur locale de l'enveloppe (distorsion verticale).
    const [, yTop] = env(u, -0.5);
    const [, yBot] = env(u, 0.5);
    const scaleV = (yBot - yTop) / H;

    // Apparition par lettre (GSAP) : scale + fondu. Sans `reveal`, p = 1.
    const p = reveal ? reveal[i] ?? 1 : 1;
    if (p <= 0) return; // lettre pas encore apparue
    const alpha = Math.min(1, Math.max(0, p));

    ctx.setTransform(base);
    ctx.translate(gx, gy);
    // Cisaillement vertical (b = slope) : penche la ligne de base, fûts verticaux.
    ctx.transform(1, slope, 0, scaleV, 0, 0);
    if (p !== 1) ctx.scale(p, p); // pop : grossit de 0 -> 1 (peut dépasser via l'ease)
    ctx.globalAlpha = alpha;
    if (s.strokeEnabled) {
      ctx.strokeStyle = s.strokeColor;
      ctx.lineWidth = s.strokeWidth;
      ctx.strokeText(ch, 0, 0);
    }
    ctx.fillText(ch, 0, 0);
    ctx.globalAlpha = 1;
  });

  ctx.setTransform(base);
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
}

/**
 * Boîte englobante approximative du texte déformé (coordonnées canvas non scalées),
 * utilisée pour le hit-test du glisser-déplacer.
 */
export function measureTextBox(
  ctx: CanvasRenderingContext2D,
  s: TextSettings,
  layer: TextLayer,
): { x: number; y: number; w: number; h: number } {
  applyTextStyle(ctx, s);
  // Même auto-fit que le rendu, pour que la boîte de hit-test suive le texte.
  const flatW0 = measureWidth(ctx, s, layer.text);
  const fittedSize = fitFontSize(s, flatW0);
  if (fittedSize !== s.fontSize) {
    s = { ...s, fontSize: fittedSize };
    applyTextStyle(ctx, s);
  }
  const total = measureWidth(ctx, s, layer.text);
  const cx = s.width / 2 + layer.offsetX;
  const cy = s.height / 2 + layer.offsetY;

  let w = total;
  let h = s.fontSize * 1.4;

  const b = clampUnit(s.curveAmount);
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

