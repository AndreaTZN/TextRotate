export interface TextSettings {
  text: string;
  font: string;
  fontSize: number;
  color: string;
  bold: boolean;
  italic: boolean;
  /** Inflexion (Bend) de l'Arc Illustrator, en % de -100 à +100. */
  curveAmount: number;
  /** Distorsion horizontale (perspective) en % de -100 à +100. */
  distortH: number;
  /** Distorsion verticale (perspective) en % de -100 à +100. */
  distortV: number;
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

/**
 * Police du canvas : PP Radio Grotesk en graisse Black (900).
 * Seule la Black est utilisée pour le grand texte, comme dans le design.
 */
export const CANVAS_FONT_FAMILY = "'PP Radio Grotesk', sans-serif";
export const CANVAS_FONT_WEIGHT = 900;

export const DEFAULT_SETTINGS: TextSettings = {
  text: "BITSTACK",
  font: CANVAS_FONT_FAMILY,
  fontSize: 150,
  color: "#161407",
  bold: true,
  italic: false,
  // Réglages d'après la boîte « Options de déformation » d'Illustrator :
  // Arc horizontal, Inflexion 30 %, Distorsion H 0 %, Distorsion V 5 %.
  curveAmount: 30,
  distortH: 0,
  distortV: 5,
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
  width: 1100,
  height: 760,
};

/**
 * Force le chargement de la police canvas (PP Radio Grotesk Black) puis appelle
 * `onLoad`. Le canvas ne peut dessiner avec une @font-face que si elle est déjà
 * chargée : on la demande explicitement via l'API document.fonts.
 */
export function loadCanvasFont(onLoad: () => void) {
  if (typeof document === "undefined" || !document.fonts) {
    onLoad();
    return;
  }
  document.fonts
    .load(`${CANVAS_FONT_WEIGHT} 150px "PP Radio Grotesk"`)
    .then(onLoad)
    .catch(onLoad);
}
