import type { Font, PathCommand } from "opentype.js";
import { makeEnvelope } from "./render";
import {
  CANVAS_FONT_WEIGHT,
  type TextLayer,
  type TextSettings,
} from "./settings";

/**
 * Export SVG **vectorisé** : on récupère les contours des glyphes via opentype.js
 * et on leur applique exactement le même placement rigide sur l'arc que le canvas
 * (`placeGlyphs`). Chaque glyphe subit une transformation affine (translation +
 * rotation + échelle verticale) : comme une transformation affine préserve les
 * courbes de Bézier, on déplace directement les points de contrôle et on réémet
 * les commandes `C`/`Q`/`L`/`Z` d'origine — les contours restent **lisses** et les
 * **trous** (contre-formes des lettres) sont conservés. Le rendu est identique au
 * canvas et indépendant de la police chez le destinataire (texte non éditable).
 */

const BASE_TRACKING_EM = -0.01; // doit rester aligné avec render.ts

function tracking(s: TextSettings): number {
  return s.letterSpacing + BASE_TRACKING_EM * s.fontSize;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface GlyphData {
  commands: PathCommand[];
  /** Abscisse du bord gauche du glyphe dans le texte à plat. */
  leftX: number;
}

const f = (n: number) => n.toFixed(2);

/**
 * Construit le SVG vectorisé. `font` est la police Centra No.1 Black chargée
 * via opentype.js (cf. CurvedTextEditor).
 */
export function buildSvg(s: TextSettings, font: Font): string {
  // Un sous-chemin `d` par calque (même enveloppe que le canvas), combinés ensuite.
  const d = s.texts.map((layer) => buildLayerPath(s, layer, font)).join("");

  const bg = s.bgTransparent
    ? ""
    : `<rect width="${s.width}" height="${s.height}" fill="${s.bgColor}"/>`;

  const strokeAttrs = s.strokeEnabled
    ? ` stroke="${s.strokeColor}" stroke-width="${s.strokeWidth}" paint-order="stroke"`
    : "";

  const label = s.texts.map((t) => t.text).join(" · ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s.width}" height="${s.height}" viewBox="0 0 ${s.width} ${s.height}">
  ${bg}
  <path d="${d.trim()}" fill="${s.color}" fill-rule="nonzero"${strokeAttrs}/>
  <!-- ${escapeXml(`${label} · weight ${CANVAS_FONT_WEIGHT}`)} -->
</svg>`;
}

/** Construit le sous-chemin `d` vectorisé d'un calque (warp d'enveloppe). */
function buildLayerPath(s: TextSettings, layer: TextLayer, font: Font): string {
  const text = layer.text;
  const fontSize = s.fontSize;
  const gap = tracking(s);
  const unit = fontSize / font.unitsPerEm;

  // 1) Commandes vectorielles de chaque glyphe (à son origine locale) + métriques.
  const glyphs: GlyphData[] = [];
  let penX = 0;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const ch of [...text]) {
    const advance = font.charToGlyph(ch).advanceWidth * unit;
    const path = font.getPath(ch, 0, 0, fontSize); // glyphe à son origine locale
    for (const cmd of path.commands) {
      if (cmd.y != null) {
        if (cmd.y < minY) minY = cmd.y;
        if (cmd.y > maxY) maxY = cmd.y;
      }
    }
    glyphs.push({ commands: path.commands, leftX: penX });
    penX += advance + gap;
  }

  const textWidth = Math.max(1, penX - gap);
  if (!isFinite(minY)) {
    minY = -fontSize * 0.8;
    maxY = fontSize * 0.2;
  }
  const vmid = (minY + maxY) / 2; // centre vertical du texte (repère baseline)
  const boxH = Math.max(1, maxY - minY); // hauteur de la boîte de texte

  // 2) Warp d'enveloppe vertical (même géométrie que le canvas) appliqué à CHAQUE
  //    point (ancres ET points de contrôle Bézier) — les courbes restent lisses.
  const cx = s.width / 2 + layer.offsetX;
  const cy = s.height / 2 + layer.offsetY;
  const env = makeEnvelope(s, textWidth, boxH, cx, cy);

  let d = "";
  glyphs.forEach((g) => {
    // (px,py) local glyphe (origine baseline) -> coords canvas via l'enveloppe.
    const tx = (px: number, py: number): [number, number] => {
      const u = (g.leftX + px) / textWidth - 0.5;
      const v = (py - vmid) / boxH;
      return env(u, v);
    };

    for (const cmd of g.commands) {
      switch (cmd.type) {
        case "M": {
          const [x, y] = tx(cmd.x!, cmd.y!);
          d += `M${f(x)} ${f(y)} `;
          break;
        }
        case "L": {
          const [x, y] = tx(cmd.x!, cmd.y!);
          d += `L${f(x)} ${f(y)} `;
          break;
        }
        case "Q": {
          const [x1, y1] = tx(cmd.x1!, cmd.y1!);
          const [x, y] = tx(cmd.x!, cmd.y!);
          d += `Q${f(x1)} ${f(y1)} ${f(x)} ${f(y)} `;
          break;
        }
        case "C": {
          const [x1, y1] = tx(cmd.x1!, cmd.y1!);
          const [x2, y2] = tx(cmd.x2!, cmd.y2!);
          const [x, y] = tx(cmd.x!, cmd.y!);
          d += `C${f(x1)} ${f(y1)} ${f(x2)} ${f(y2)} ${f(x)} ${f(y)} `;
          break;
        }
        case "Z":
          d += "Z ";
          break;
      }
    }
  });

  return d;
}
