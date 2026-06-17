// Déclarations minimales pour opentype.js 2.x (pas de types fournis par le paquet).
// On ne déclare que ce qu'on utilise pour la vectorisation SVG.
declare module "opentype.js" {
  export interface PathCommand {
    type: "M" | "L" | "C" | "Q" | "Z";
    x?: number;
    y?: number;
    x1?: number;
    y1?: number;
    x2?: number;
    y2?: number;
  }

  export interface Path {
    commands: PathCommand[];
  }

  export interface Glyph {
    advanceWidth: number;
  }

  export interface Font {
    unitsPerEm: number;
    /** Chemin vectoriel d'un texte rendu à `fontSize`, baseline en (x, y). */
    getPath(text: string, x: number, y: number, fontSize: number): Path;
    charToGlyph(char: string): Glyph;
  }

  export function parse(buffer: ArrayBuffer): Font;
  export function load(url: string): Promise<Font>;

  const _default: { parse: typeof parse; load: typeof load };
  export default _default;
}
