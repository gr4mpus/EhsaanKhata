"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import type { Standing } from "@/lib/balances";

const DURATION_MS = 3800;

const looks = {
  "trust-master": { src: "/trust-master.jpg", width: 150, height: 150, framed: true, sway: "standing-nod" },
  burden: { src: "/owe-sticker.png", width: 160, height: 148, framed: false, sway: "standing-sway" },
} as const;

/** Brief sticker shown when a member opens a group: Trust Master or Burden, based on their standing there. */
export function StandingPopup({ standing }: { standing: Standing }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), DURATION_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  const look = looks[standing.kind];
  const trust = standing.kind === "trust-master";

  return (
    <div className="standing" role="status" onClick={() => setVisible(false)}>
      <div className="standing-card card">
        <Image
          src={look.src}
          alt=""
          width={look.width}
          height={look.height}
          priority
          className={`mx-auto ${look.sway} ${look.framed ? "rounded-md border-2 border-ink shadow-[3px_3px_0_var(--ink)]" : ""}`}
        />
        <p className="mt-3 text-2xl font-bold">
          {trust ? (
            <>
              <span className="brand">Trust Master</span> 😎
            </>
          ) : (
            <>
              You owe <span className="brand">{standing.taken - standing.done} EP</span>
            </>
          )}
        </p>
        <p className="text-sm text-muted">
          {trust
            ? `You've done ${standing.done} EP of favours and taken ${standing.taken}. The group can count on you.`
            : `You've taken ${standing.taken} EP of favours but done only ${standing.done}. Time to return the favour!`}
        </p>
        <p className="mt-2 text-xs text-muted">Tap to dismiss</p>
      </div>
    </div>
  );
}
