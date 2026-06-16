# Bitstack type tool

Outil web pour écrire un texte, le **déformer en arc** (à la manière de l'effet
« Déformation > Arc » d'Illustrator) et l'**exporter en SVG**. L'interface
reproduit un design Figma : fond crème, panneau latéral minimal, grand texte
courbé au centre.

## ⚠️ Next.js modifié

Ce projet utilise une version de Next.js (16.2.9) avec des **breaking changes** :
APIs, conventions et structure de fichiers peuvent différer de ce que tu connais.
**Avant d'écrire du code Next**, lis le guide concerné dans
`node_modules/next/dist/docs/` et tiens compte des avis de dépréciation.

## Stack

- **Next.js 16** (App Router) · **React 19** · **TypeScript**
- **Tailwind CSS v4** (via `@tailwindcss/postcss`, importé dans `app/globals.css`)
- Pas de librairie d'UI ni de state externe : tout est en composants clients React.

## Commandes

- `npm run dev` — serveur de dev
- `npm run build` / `npm run start` — build et serveur de prod
- `npm run lint` — ESLint
- Vérif. typage : `npx tsc --noEmit`

## Structure

- `app/layout.tsx` — root layout, métadonnées, classe `lang="fr"`.
- `app/page.tsx` — rend `<CurvedTextEditor />`.
- `app/globals.css` — tokens de palette, **@font-face PP Radio Grotesk** (locale),
  police d'interface, keyframes.
- `app/components/curved-text/`
  - `CurvedTextEditor.tsx` — composant principal (`"use client"`) : panneau latéral
    (champ **Text**, **Color text**, bouton **Export in SVG**), canvas, glisser-
    déplacer du texte, export. Le canvas a un backing store 2× (retina).
  - `settings.ts` — type `TextSettings`, `DEFAULT_SETTINGS`, pastilles de couleur,
    police canvas, et `loadCanvasFont()` qui force le chargement de la font avant
    de dessiner.
  - `render.ts` — moteur de rendu canvas + export SVG.

## Polices

- **PP Radio Grotesk** (fichiers `.otf` locaux dans `public/Font/`), déclarée en
  `@font-face` dans `globals.css` sous le nom **"PP Radio Grotesk"** (nom stable
  requis pour que le canvas puisse dessiner avec). Graisses : Ultralight (200),
  Regular (400), Black (900) + italiques.
- **Interface** : utilise la famille via `--font-sans` / `body`.
- **Canvas** : utilise **uniquement la Black (900)** —
  `CANVAS_FONT_FAMILY` / `CANVAS_FONT_WEIGHT` dans `settings.ts`.
- **Interlettrage** : -1% (-0.01em) partout. Interface = `tracking-[-0.01em]` ;
  canvas = helper `tracking()` dans `render.ts` (proportionnel à `fontSize`).
- N'utilise PAS `next/font` pour PP Radio Grotesk : il obscurcit le nom de famille,
  que le canvas ne peut alors pas cibler.

## Rendu de la déformation (render.ts)

- **`curveAmount`** = l'**Inflexion (Bend)** d'Illustrator, en % de -100 à +100
  (positif = arc convexe vers le haut). Mappé en ratio par `bend()`.
- C'est un **warp d'enveloppe**, pas un « texte sur cercle » : les lettres ne
  pivotent pas individuellement, c'est tout le bloc qui se courbe. Technique :
  on rend le texte « à plat » hors écran, puis on le découpe en fines tranches
  verticales replacées le long de l'arc (slice-warp).
- Le bitmap à plat est **suréchantillonné** (`SUPERSAMPLE = 3`) pour rester net
  une fois déformé.
- **Export SVG** (`buildSvg`) : approxime la déformation par un `<textPath>` sur
  un arc de cercle équivalent — le texte reste vectoriel et éditable, au prix
  d'une légère différence sur les bords.

## Conventions

- Commentaires et libellés d'interface en **français**.
- Couleurs de la palette Bitstack définies en variables CSS dans `globals.css`
  (`--ink`, `--yellow`, `--cream`, etc.) ; les valeurs hex sont aussi utilisées
  en dur dans les classes Tailwind arbitraires (`bg-[#161407]`).
