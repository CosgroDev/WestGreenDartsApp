"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export function PeaCelebration() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timeout = window.setTimeout(() => setVisible(false), 5000);
    return () => window.clearTimeout(timeout);
  }, []);

  if (!visible || typeof document === "undefined") return null;

  return createPortal(
    <div className="pea-rain" aria-hidden="true">
      {Array.from({ length: 48 }, (_, i) => {
        const size = 12 + (i * 7) % 15;
        return (
          <span
            key={i}
            className="garden-pea"
            style={{
              left: `${(i * 37) % 100}%`,
              width: size,
              height: size,
              animationDuration: `${2 + (i % 7) * 0.2}s`,
              animationDelay: `${-(i % 13) * 0.2}s`
            }}
          />
        );
      })}
    </div>,
    document.body
  );
}
