/**
 * Un calque de texte : contenu + position. Les réglages de style (déformation,
 * couleur, taille…) sont globaux et partagés (cf. `TextSettings`).
 */
export interface TextLayer {
  /** Identifiant stable pour la liste de calques et la sélection. */
  id: string;
  text: string;
  /** Décalage du texte par rapport au centre du canvas, en px canvas. */
  offsetX: number;
  offsetY: number;
}

export interface TextSettings {
  /** Calques de texte (au moins un). Tous partagent les réglages de style. */
  texts: TextLayer[];
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
 * Police du canvas : Centra No.1 en graisse Black (900).
 * Seule la Black est utilisée pour le grand texte, comme dans le design.
 */
export const CANVAS_FONT_FAMILY = "'Centra No1', sans-serif";
export const CANVAS_FONT_WEIGHT = 600;

/** Génère un identifiant de calque unique. */
export function makeLayerId(): string {
  return `t-${Math.random().toString(36).slice(2, 9)}`;
}

export const DEFAULT_SETTINGS: TextSettings = {
  texts: [{ id: "t-bitstack", text: "BITSTACK", offsetX: 0, offsetY: 0 }],
  font: CANVAS_FONT_FAMILY,
  fontSize: 150,
  color: "#161407",
  bold: true,
  italic: false,
  // Réglages d'après la boîte « Options de déformation » d'Illustrator :
  // Arc horizontal, Distorsion H 0 %, Distorsion V 5 %.
  // curveAmount 30 = position 30 (défaut) du slider Deformation (plage 25–35).
  curveAmount: 30,
  distortH: 0,
  distortV: 10,
  letterSpacing: 0,
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
 * Force le chargement de la police canvas (Centra No.1 Black) puis appelle
 * `onLoad`. Le canvas ne peut dessiner avec une @font-face que si elle est déjà
 * chargée : on la demande explicitement via l'API document.fonts.
 */
export function loadCanvasFont(onLoad: () => void) {
  if (typeof document === "undefined" || !document.fonts) {
    onLoad();
    return;
  }
  document.fonts
    .load(`${CANVAS_FONT_WEIGHT} 150px "Centra No1"`)
    .then(onLoad)
    .catch(onLoad);
}
