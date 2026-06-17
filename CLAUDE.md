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
  - `render.ts` — moteur de déformation : `makeEnvelope()` (géométrie de l'Arc,
    partagée) + `drawCurvedText()` (rendu canvas).
  - `svg.ts` — export SVG vectorisé via opentype.js (`buildSvg`), réutilise
    `makeEnvelope`.
  - `opentype.d.ts` — types ambient minimaux pour opentype.js (non fournis).

## Animations

Pour **toute animation**, utilise **GSAP** via les skills dédiées (ne pas
réinventer avec des `keyframes` CSS ou des `setInterval` ad hoc) :

- `gsap-core` — base : `gsap.to/from/fromTo`, easing, durée, stagger,
  `matchMedia()` (responsive + `prefers-reduced-motion`).
- `gsap-react` — **à utiliser ici** (React/Next) : hook `useGSAP`, refs,
  `gsap.context()`, nettoyage au démontage.
- `gsap-timeline` — séquencer / chorégraphier plusieurs animations.
- `gsap-scrolltrigger` — animations liées au scroll, pinning, parallaxe.
- `gsap-plugins` — Draggable, Flip, SplitText, SVG, CustomEase, etc.
- `gsap-performance` — viser 60 fps (transforms, éviter le layout thrashing).
- `gsap-utils` — helpers (`clamp`, `mapRange`, `random`, `snap`, `interpolate`…).

Invoque la skill correspondante **avant** d'écrire le code d'animation.
Le rendu du texte courbé reste sur `<canvas>` (cf. `render.ts`) ; GSAP sert à
animer l'interface et les transitions, ou à piloter dans le temps les valeurs
passées au rendu canvas.

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

## Rendu de la déformation (render.ts + svg.ts)

Reproduit l'effet **« Effet > Déformation > Arc » (mode Horizontal)** d'Illustrator.

- ⚠️ **Le bon modèle = warp d'enveloppe VERTICAL, PAS un « texte sur chemin ».**
  Piège déjà tombé plusieurs fois : placer chaque glyphe rigide et le **tourner**
  le long de la tangente d'un cercle → FAUX. Mesuré sur le SVG de référence
  Illustrator, la barre du « I » n'est inclinée que ~5° : Illustrator **ne pivote
  quasiment pas** les lettres. Elles restent **debout** (fûts verticaux verticaux) ;
  c'est leur **position verticale** qui suit l'arc (haut et bas = arcs parallèles),
  avec un léger cisaillement vertical pour suivre la pente.
- Paramètres (`TextSettings`, calés sur la boîte Illustrator de référence) :
  - **`curveAmount`** = Inflexion (Bend), % de -100 à +100. Mapping `theta = curveAmount/100 * PI`.
  - **`distortH`** / **`distortV`** = perspectives horizontale / verticale. La
    distorsion V **doit être symétrique gauche/droite** (`1 + dv*(1-2|uh|)`), sinon
    un côté plonge plus que l'autre.
- **`makeEnvelope(s, W, H, cx, cy)`** renvoie une `EnvelopeFn (u,v) -> [x,y]`,
  **partagée** par le canvas (`drawCurvedText`) et l'export SVG (`svg.ts`) → rendu
  identique garanti. Pas de bitmap offscreen ni de slice-warp : le canvas dessine
  chaque glyphe directement (translate + cisaillement/échelle vertical, sans rotation).
- **Export SVG vectorisé** (`svg.ts`, via **opentype.js**) : on lit les contours des
  glyphes et on applique la même enveloppe. Ne PAS aplatir les Bézier en polylignes
  (lettres facettées + trous bouchés) : transformer directement les **points de
  contrôle** et réémettre les commandes `M/L/Q/C/Z` (`fill-rule="nonzero"` garde les
  trous). Texte non éditable mais identique au canvas et indépendant de la police
  chez le destinataire.
- **opentype.js v2** : `load(url)` est **déprécié** → `fetch(url).arrayBuffer()` puis
  `opentype.parse(buffer)`. Pas de types fournis → `opentype.d.ts` (déclaration
  ambient minimale). Chargé en lazy + caché au premier export.

## Conventions

- Commentaires et libellés d'interface en **français**.
- Couleurs de la palette Bitstack définies en variables CSS dans `globals.css`
  (`--ink`, `--yellow`, `--cream`, etc.) ; les valeurs hex sont aussi utilisées
  en dur dans les classes Tailwind arbitraires (`bg-[#161407]`).
