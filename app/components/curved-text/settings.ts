export interface TextSettings {
  text: string;
  font: string;
  fontSize: number;
  color: string;
  bold: boolean;
  italic: boolean;
  curveAmount: number;
  letterSpacing: number;
  /** Décalage du texte par rapport au centre du canvas, en px canvas. */
  offsetX: number;
  offsetY: number;
  textShadow: boolean;
  shadowColor: string;
  shadowBlur: number;
  strokeEnabled: boolean;
  strokeColor: string;
  strokeWidth: number;
  bgColor: string;
  bgTransparent: boolean;
  /** Dimensions du canvas en px. */
  width: number;
  height: number;
}

export const DEFAULT_SETTINGS: TextSettings = {
  text: "Votre texte ici",
  font: "Montserrat, sans-serif",
  fontSize: 56,
  color: "#161407",
  bold: true,
  italic: false,
  curveAmount: 50,
  letterSpacing: 0,
  offsetX: 0,
  offsetY: 0,
  textShadow: false,
  shadowColor: "#000000",
  shadowBlur: 8,
  strokeEnabled: false,
  strokeColor: "#000000",
  strokeWidth: 2,
  bgColor: "#ffffff",
  bgTransparent: true,
  width: 900,
  height: 560,
};

export const CANVAS_W = DEFAULT_SETTINGS.width;
export const CANVAS_H = DEFAULT_SETTINGS.height;

/** Bornes du redimensionnement du canvas (px). */
export const CANVAS_MIN = 200;
export const CANVAS_MAX = 1600;

export const FONTS = [
  { name: "Arial", value: "Arial, sans-serif", google: false },
  { name: "Georgia", value: "Georgia, serif", google: false },
  { name: "Courier New", value: "'Courier New', monospace", google: false },
  { name: "Impact", value: "Impact, sans-serif", google: false },
  { name: "Playfair Display", value: "'Playfair Display', serif", google: true },
  { name: "Montserrat", value: "'Montserrat', sans-serif", google: true },
  { name: "Lobster", value: "'Lobster', cursive", google: true },
  { name: "Pacifico", value: "'Pacifico', cursive", google: true },
  { name: "Oswald", value: "'Oswald', sans-serif", google: true },
  { name: "Raleway", value: "'Raleway', sans-serif", google: true },
  { name: "Dancing Script", value: "'Dancing Script', cursive", google: true },
  { name: "Bebas Neue", value: "'Bebas Neue', cursive", google: true },
  { name: "Righteous", value: "'Righteous', cursive", google: true },
  { name: "Permanent Marker", value: "'Permanent Marker', cursive", google: true },
  { name: "Roboto", value: "'Roboto', sans-serif", google: true },
  { name: "Caveat", value: "'Caveat', cursive", google: true },
  { name: "Anton", value: "'Anton', sans-serif", google: true },
] as const;

export const SWATCHES = [
  // Brand
  "#161407", "#ffdb0f", "#ff6a29", "#fffdeb", "#c3d9cc",
  "#aea485", "#ffffff",
  // Couleurs additionnelles
  "#ef4444", "#22c55e", "#3b82f6",
];

export function curveLabel(curveAmount: number): string {
  if (curveAmount === 0) return "droit";
  return curveAmount > 0
    ? `arc haut ${curveAmount}`
    : `arc bas ${Math.abs(curveAmount)}`;
}

const FONT_LINK_ID = "curved-text-google-fonts";

/**
 * Injecte (une seule fois) la feuille de style Google Fonts pour toutes les
 * polices marquées `google`. `onLoad` est appelé quand la feuille est chargée.
 */
export function loadGoogleFonts(onLoad: () => void) {
  const existing = document.getElementById(FONT_LINK_ID);
  if (existing) {
    onLoad();
    return;
  }
  const families = FONTS.filter((f) => f.google)
    .map((f) => `${f.name.replace(/ /g, "+")}:wght@400;700`)
    .join("&family=");
  const link = document.createElement("link");
  link.id = FONT_LINK_ID;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${families}&display=swap`;
  link.onload = onLoad;
  document.head.appendChild(link);
}
