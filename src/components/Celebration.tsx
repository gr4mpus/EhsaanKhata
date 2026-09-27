"use client";

import { useEffect, useState } from "react";

const EMOJI = ["💛", "🧡", "✨", "🤝", "🌟", "🎉", "💖"];
const COUNT = 26;
const DURATION_MS = 3200;

type Particle = { id: number; emoji: string; left: number; delay: number; size: number; drift: number; duration: number };

export type CelebrationEvent = { id: number; title: string; subtitle?: string };

/** Full-screen, click-through burst of emoji floating upward, with a small message in the middle. */
export function Celebration({ event }: { event: CelebrationEvent | null }) {
  const [active, setActive] = useState<{ event: CelebrationEvent; particles: Particle[] } | null>(null);

  useEffect(() => {
    if (!event) return;
    const particles = Array.from({ length: COUNT }, (_, i) => ({
      id: i,
      emoji: EMOJI[Math.floor(Math.random() * EMOJI.length)],
      left: Math.random() * 100,
      delay: Math.random() * 700,
      size: 16 + Math.random() * 18,
      drift: (Math.random() - 0.5) * 120,
      duration: 2000 + Math.random() * 1000,
    }));
    // Randomised particles have to be generated on the client when the event fires.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActive({ event, particles });
    const timer = setTimeout(() => setActive(null), DURATION_MS);
    return () => clearTimeout(timer);
  }, [event]);

  if (!active) return null;

  return (
    <div className="celebration" aria-live="polite">
      {active.particles.map((p) => (
        <span
          key={p.id}
          className="celebration-particle"
          style={
            {
              left: `${p.left}%`,
              fontSize: p.size,
              animationDelay: `${p.delay}ms`,
              animationDuration: `${p.duration}ms`,
              "--drift": `${p.drift}px`,
            } as React.CSSProperties
          }
        >
          {p.emoji}
        </span>
      ))}
      <div className="celebration-toast card">
        <p className="brand text-2xl font-bold">{active.event.title}</p>
        {active.event.subtitle && <p className="text-sm text-muted">{active.event.subtitle}</p>}
      </div>
    </div>
  );
}
