"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import { enterPinAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function PinPage() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [pending, startTransition] = useTransition();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const formData = new FormData();
      formData.append("pin", pin);
      const res = await enterPinAction(formData);
      if (!res.ok) {
        toast.error(res.message || "Could not sign in");
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
        <Label htmlFor="pin">PIN</Label>
        <Input
          id="pin"
          name="pin"
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          className="text-lg tracking-widest"
          placeholder="••••"
          required
        />
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Checking..." : "Unlock"}
        </Button>
      </form>
    </main>
  );
}
