"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { enterPinAction } from "./actions";

const MAX_PIN_LENGTH = 8;
const DOT_COUNT = 4;

export default function PinPage() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shaking, setShaking] = useState(false);
  const [pending, startTransition] = useTransition();

  const submit = (value: string) => {
    if (!value || pending) return;
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.append("pin", value);
      const res = await enterPinAction(formData);
      if (!res.ok) {
        setError(res.message || "Incorrect PIN");
        setPin("");
        setShaking(true);
        setTimeout(() => setShaking(false), 450);
        return;
      }
      router.replace("/dashboard");
    });
  };

  const press = (digit: number) => {
    if (pending) return;
    setError(null);
    setPin((p) => (p.length >= MAX_PIN_LENGTH ? p : p + digit.toString()));
  };

  const dotTotal = Math.max(DOT_COUNT, pin.length);

  return (
    <main className="flex min-h-[85vh] flex-col items-center justify-center gap-7 fade-up">
      <div className="flex flex-col items-center gap-3 text-center">
        <Image src="/west_green_logo.png" alt="West Green Darts" width={92} height={92} className="brand-logo" priority />
        <div>
          <h1 className="text-2xl font-bold">Enter team PIN</h1>
          <p className="mt-1 text-sm text-slate-500">One PIN for all devices · stays unlocked for 30 days</p>
        </div>
      </div>

      <div className={`flex items-center gap-3 ${shaking ? "shake" : ""}`} aria-label="PIN entry">
        {Array.from({ length: dotTotal }).map((_, i) => (
          <span key={i} className={`pin-dot ${i < pin.length ? "filled" : ""}`} />
        ))}
      </div>

      <p className={`h-5 text-sm font-semibold ${error ? "text-red-600" : "text-transparent"}`} role="alert">
        {error ?? "."}
      </p>

      <div className="grid w-full max-w-[280px] grid-cols-3 gap-3">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <button key={n} type="button" className="keypad-key" onClick={() => press(n)} disabled={pending}>
            {n}
          </button>
        ))}
        <button
          type="button"
          className="keypad-key text-xl text-slate-500"
          onClick={() => setPin((p) => p.slice(0, -1))}
          disabled={pending || !pin.length}
          aria-label="Delete digit"
        >
          ⌫
        </button>
        <button type="button" className="keypad-key" onClick={() => press(0)} disabled={pending}>
          0
        </button>
        <button
          type="button"
          className="keypad-key bg-emerald-600 text-white"
          style={{ borderColor: "rgba(18,184,134,0.6)" }}
          onClick={() => submit(pin)}
          disabled={pending || !pin.length}
          aria-label="Unlock"
        >
          {pending ? "…" : "✓"}
        </button>
      </div>
    </main>
  );
}
