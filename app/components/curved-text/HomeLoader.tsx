"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";

/**
 * Loader d'entrée affiché par-dessus l'éditeur au chargement de la home.
 *
 * Séquence (GSAP) : le titre se révèle mot à mot, une barre de progression se
 * remplit, puis le voile crème se relève vers le haut pour découvrir l'éditeur.
 * On utilise `gsap.context()` + `ctx.revert()` (pattern recommandé sans
 * @gsap/react) pour un nettoyage propre au démontage.
 */
export default function HomeLoader() {
  const rootRef = useRef<HTMLDivElement>(null);
  // `done` démonte le voile une fois l'animation terminée.
  const [done, setDone] = useState(false);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        defaults: { ease: "power3.out" },
        onComplete: () => setDone(true),
      });

      tl
        // Titre : chaque mot monte depuis le bas (masqué par overflow-hidden).
        .from(".loader-word", {
          yPercent: 120,
          duration: 0.7,
          stagger: 0.08,
          ease: "power4.out",
        })
        // Barre de progression : remplissage gauche -> droite.
        .fromTo(
          ".loader-bar-fill",
          { scaleX: 0 },
          { scaleX: 1, duration: 1, ease: "power2.inOut" },
          "-=0.3",
        )
        // Le pourcentage compte de 0 à 100 en parallèle de la barre.
        .to(
          ".loader-percent",
          {
            duration: 1,
            ease: "power2.inOut",
            // Compteur entier via snap sur un proxy texte.
            innerText: 100,
            snap: { innerText: 1 },
          },
          "<",
        )
        // Petite pause, puis le voile se relève.
        .to(".loader-content", {
          autoAlpha: 0,
          duration: 0.4,
          ease: "power2.in",
        })
        .to(rootRef.current, {
          yPercent: -100,
          duration: 0.9,
          ease: "power4.inOut",
        });
    }, rootRef);

    return () => ctx.revert();
  }, []);

  if (done) return null;

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-(--cream) text-[var(--ink)]"
    >
      <div className="loader-content flex w-[min(440px,80vw)] flex-col items-center gap-8">
        {/* Titre, révélé mot à mot. */}
        <h1 className="flex flex-wrap justify-center gap-x-[0.28em] overflow-hidden text-[34px] font-medium leading-[1] tracking-[-0.01em]">
          <span className="loader-word inline-block">Bitstack</span>
          <span className="loader-word inline-block">type</span>
          <span className="loader-word inline-block">tool</span>
        </h1>

        {/* Barre de progression + pourcentage. */}
        <div className="flex w-full flex-col gap-2">
          <div className="h-[3px] w-full overflow-hidden rounded-full bg-[#161407]/12">
            <div className="loader-bar-fill h-full w-full origin-left rounded-full bg-[var(--ink)]" />
          </div>
          <div className="flex justify-end text-[13px] tabular-nums tracking-[-0.01em] text-[#161407]/55">
            <span className="loader-percent">0</span>
            <span>%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
