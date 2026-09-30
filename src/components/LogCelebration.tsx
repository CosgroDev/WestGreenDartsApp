"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export function LogCelebration() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timeout = window.setTimeout(() => setVisible(false), 4000);
    return () => window.clearTimeout(timeout);
  }, []);

  if (!visible || typeof document === "undefined") return null;

  return createPortal(
    <div className="log-celebration" aria-hidden="true">
      <svg className="log-scene" viewBox="0 0 280 240" fill="none">
        {/* A little woodland log with bark grooves and rings at the cut end. */}
        <ellipse cx="138" cy="207" rx="97" ry="9" fill="#000" opacity=".18" />
        <rect x="45" y="146" width="178" height="36" rx="18" fill="#92552b" stroke="#573219" strokeWidth="3" />
        <path d="M65 155h120m-105 10h108m-119 9h95" stroke="#c18445" strokeWidth="3" strokeLinecap="round" />
        <ellipse cx="223" cy="164" rx="15" ry="18" fill="#d8ac70" stroke="#573219" strokeWidth="3" />
        <ellipse cx="223" cy="164" rx="8" ry="11" stroke="#92552b" strokeWidth="2" />
        <ellipse cx="223" cy="164" rx="3" ry="5" stroke="#92552b" strokeWidth="2" />
        <g className="log-man">
          {/* Boots and trousers, a West Green shirt, and a smiling face. */}
          <path d="M126 112l-9 29m21-29 10 29" stroke="#30465e" strokeWidth="10" strokeLinecap="round" />
          <path d="M117 141h-9m40 0h9" stroke="#182333" strokeWidth="7" strokeLinecap="round" />
          <path d="M120 80l-18 20m42-20 17 17" stroke="#f1c79c" strokeWidth="7" strokeLinecap="round" />
          <path d="M120 77h23l4 38h-31z" fill="#12b886" stroke="#087953" strokeWidth="2" />
          <circle cx="132" cy="60" r="16" fill="#f1c79c" />
          <path d="M117 57c-2-19 30-23 32-1l-9-8-20 7z" fill="#65412a" />
          <circle cx="127" cy="60" r="1.7" fill="#263238" />
          <circle cx="138" cy="60" r="1.7" fill="#263238" />
          <path d="M128 67q5 4 9-1" stroke="#9d553c" strokeWidth="2" strokeLinecap="round" />
        </g>
      </svg>
    </div>,
    document.body
  );
}
