"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";

/**
 * Loader d'entrée affiché par-dessus l'éditeur au chargement de la home.
 *
 * Un gros compteur 0 → 100 % (police Black) ancré en bas à droite, animé
 * proprement via un proxy GSAP, puis le voile crème se relève pour découvrir
 * l'éditeur. On utilise `gsap.context()` + `ctx.revert()` (pattern recommandé
 * sans @gsap/react) pour un nettoyage propre au démontage.
 */
export default function HomeLoader() {
  const rootRef = useRef<HTMLDivElement>(null);
  const numberRef = useRef<HTMLSpanElement>(null);
  // `done` démonte le voile une fois l'animation terminée.
  const [done, setDone] = useState(false);

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Proxy animé : GSAP fait varier `value`, on écrit l'entier dans le DOM.
      const counter = { value: 0 };

      const tl = gsap.timeline({
        defaults: { ease: "power3.out" },
        onComplete: () => setDone(true),
      });

      tl
        // Apparition du compteur (monte légèrement + fondu).
        .from(".loader-count", {
          yPercent: 40,
          autoAlpha: 0,
          duration: 0.6,
          ease: "power3.out",
        })
        // Comptage 0 -> 100, propre et fluide.
        .to(
          counter,
          {
            value: 100,
            duration: 1.6,
            ease: "power2.inOut",
            onUpdate: () => {
              if (numberRef.current) {
                numberRef.current.textContent = String(Math.round(counter.value));
              }
            },
          },
          "-=0.2",
        )
        // Le compteur s'efface, puis le voile se relève.
        .to(".loader-count", {
          autoAlpha: 0,
          duration: 0.35,
          ease: "power2.in",
        })
        .to(
          rootRef.current,
          { opacity: 0, duration: 0.9, ease: "power4.inOut" },
          "-=0.1",
        );
    }, rootRef);

    return () => ctx.revert();
  }, []);

  if (done) return null;

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-100 flex items-end justify-end bg-(--cream) p-6 text-(--ink) sm:p-10"
    >
      {/* Compteur 0 -> 100 %, police Black, ancré en bas à droite. */}
      <div className="loader-count flex items-end font-extrabold leading-[0.8] tracking-[-0.02em]">
        <span ref={numberRef} className="text-[17vw] tabular-nums">
          0
        </span>
        <span className="mb-[1.2vw] ml-[0.5vw] text-[6vw] sm:text-[5vw]">%</span>
      </div>
    </div>
  );
}
