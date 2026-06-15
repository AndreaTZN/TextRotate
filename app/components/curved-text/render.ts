import { type TextSettings } from "./settings";

/**
 * curveAmount: -100..100  (0 = droit, +100 = arc maximal vers le haut, -100 vers le bas)
 * Le texte reste centré sur le canvas quel que soit le rayon.
 */
export function getRadius(curveAmount: number): number {
  if (curveAmount === 0) return Infinity;
  // map |1..100| -> rayon grand..petit (plus la valeur est haute, plus la courbe est serrée)
  const t = Math.abs(curveAmount) / 100;
  const minR = 160;
  const maxR = 2200;
  return maxR - t * (maxR - minR);
}

export function drawCurvedText(ctx: CanvasRenderingContext2D, s: TextSettings) {
  ctx.clearRect(0, 0, s.width, s.height);

  if (!s.bgTransparent) {
    ctx.fillStyle = s.bgColor;
    ctx.fillRect(0, 0, s.width, s.height);
  }

  const weight = s.bold ? "700" : "400";
  const style = s.italic ? "italic" : "normal";
  ctx.font = `${style} ${weight} ${s.fontSize}px ${s.font}`;
  ctx.fillStyle = s.color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";

  ctx.shadowColor = s.textShadow ? s.shadowColor : "transparent";
  ctx.shadowBlur = s.textShadow ? s.shadowBlur : 0;
  ctx.shadowOffsetY = s.textShadow ? 3 : 0;

  const cx = s.width / 2 + s.offsetX;
  const cy = s.height / 2 + s.offsetY;
  const chars = [...s.text];

  const paint = (char: string, x: number, y: number) => {
    if (s.strokeEnabled) {
      ctx.strokeStyle = s.strokeColor;
      ctx.lineWidth = s.strokeWidth;
      ctx.strokeText(char, x, y);
    }
    ctx.fillText(char, x, y);
  };

  if (s.curveAmount === 0) {
    if (s.letterSpacing === 0) {
      paint(s.text, cx, cy);
    } else {
      const widths = chars.map((c) => ctx.measureText(c).width + s.letterSpacing);
      const total = widths.reduce((a, b) => a + b, 0) - s.letterSpacing;
      let x = cx - total / 2;
      chars.forEach((c, i) => {
        paint(c, x + widths[i] / 2, cy);
        x += widths[i];
      });
    }
    return;
  }

  const radius = getRadius(s.curveAmount);
  const up = s.curveAmount > 0; // true = arc vers le haut ⌢
  const widths = chars.map((c) => ctx.measureText(c).width + s.letterSpacing);
  const total = widths.reduce((a, b) => a + b, 0) - s.letterSpacing;
  const totalAngle = total / radius;

  // dir = +1 pour arc haut, -1 pour arc bas.
  // Le centre du cercle est placé au-dessus (arc bas) ou au-dessous (arc haut)
  // du centre du canvas, de sorte que le sommet de l'arc reste au centre.
  const dir = up ? 1 : -1;
  const circleY = cy + dir * radius;

  // angle mesuré depuis la verticale qui relie le centre du cercle au sommet
  // de l'arc ; les caractères sont centrés autour de cette verticale.
  let angle = -totalAngle / 2;

  chars.forEach((char, i) => {
    const charAngle = widths[i] / radius;
    const a = angle + charAngle / 2;

    const x = cx + radius * Math.sin(a);
    const y = circleY - dir * radius * Math.cos(a);

    ctx.save();
    ctx.translate(x, y);
    // arc haut : la base des lettres pointe vers le centre du cercle -> rotation a
    // arc bas : on inverse -> rotation -a
    ctx.rotate(up ? a : -a);
    paint(char, 0, 0);
    ctx.restore();

    angle += charAngle;
  });
}

/**
 * Boîte englobante approximative du texte (en coordonnées canvas non scalées),
 * utilisée pour le hit-test du drag. On mesure la largeur totale via un contexte
 * configuré comme le rendu, et on majore la hauteur pour couvrir l'arc.
 */
export function measureTextBox(
  ctx: CanvasRenderingContext2D,
  s: TextSettings,
): { x: number; y: number; w: number; h: number } {
  const weight = s.bold ? "700" : "400";
  const style = s.italic ? "italic" : "normal";
  ctx.font = `${style} ${weight} ${s.fontSize}px ${s.font}`;

  const chars = [...s.text];
  const widths = chars.map((c) => ctx.measureText(c).width + s.letterSpacing);
  const total = Math.max(0, widths.reduce((a, b) => a + b, 0) - s.letterSpacing);

  const cx = s.width / 2 + s.offsetX;
  const cy = s.height / 2 + s.offsetY;

  let w = total;
  let h = s.fontSize * 1.4;

  if (s.curveAmount !== 0) {
    // Sur un arc, le texte s'étale en largeur et en hauteur : on approxime
    // l'enveloppe à partir du rayon et de l'angle balayé.
    const radius = getRadius(s.curveAmount);
    const totalAngle = total / radius;
    const half = Math.min(totalAngle / 2, Math.PI);
    w = 2 * radius * Math.sin(half) + s.fontSize;
    const sagitta = radius * (1 - Math.cos(half));
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

/** SVG vectoriel : textPath sur un arc équivalent au rendu canvas. */
export function buildSvg(s: TextSettings): string {
  const radius = getRadius(s.curveAmount);
  const cx = s.width / 2 + s.offsetX;
  const cy = s.height / 2 + s.offsetY;
  const weight = s.bold ? 700 : 400;
  const style = s.italic ? "italic" : "normal";
  const fontFamily = s.font.split(",")[0].replace(/'/g, "");

  let pathDef: string;
  if (s.curveAmount === 0) {
    pathDef = `M ${cx - 400} ${cy} L ${cx + 400} ${cy}`;
  } else {
    const up = s.curveAmount > 0;
    const circleY = up ? cy + radius : cy - radius;
    const sweep = up ? 1 : 0;
    // arc large couvrant la zone
    const span = Math.min(400, radius * 0.9);
    const x1 = cx - span;
    const x2 = cx + span;
    const yOff = up
      ? circleY - Math.sqrt(Math.max(0, radius * radius - span * span))
      : circleY + Math.sqrt(Math.max(0, radius * radius - span * span));
    pathDef = `M ${x1} ${yOff} A ${radius} ${radius} 0 0 ${sweep} ${x2} ${yOff}`;
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
  <text font-family="${escapeXml(fontFamily)}" font-size="${s.fontSize}" font-weight="${weight}" font-style="${style}" fill="${s.color}" ${strokeAttrs} letter-spacing="${s.letterSpacing}">
    <textPath href="#curve" startOffset="50%" text-anchor="middle">${escapeXml(s.text)}</textPath>
  </text>
</svg>`;
}
