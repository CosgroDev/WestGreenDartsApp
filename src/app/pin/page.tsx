"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { enterPinAction } from "./actions";

export default function PinPage() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.append("pin", pin);
      const res = await enterPinAction(formData);
      if (!res.ok) {
        setError(res.message || "Could not sign in");
        return;
      }
      router.replace("/dashboard");
    });
  };

  return (
    <main className="card flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Image src="/west_green_logo.png" alt="West Green Darts" width={78} height={78} className="brand-logo" />
        <div>
          <p className="text-sm text-slate-600">Shared access</p>
          <h1 className="text-xl font-semibold">Enter the team PIN</h1>
          <p className="text-slate-700 mt-1">One PIN for all devices. Session persists for 30 days.</p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <label className="text-sm font-medium text-slate-700" htmlFor="pin">
          PIN
        </label>
        <input
          id="pin"
          name="pin"
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-lg tracking-widest"
          placeholder="••••"
          required
        />
        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="inline-flex justify-center rounded-md bg-emerald-600 px-4 py-2 text-white font-semibold hover:bg-emerald-700 disabled:opacity-60"
        >
          {pending ? "Checking..." : "Unlock"}
        </button>
      </form>
    </main>
  );
}
