"use client";

import { useState, useEffect } from "react";
import { X, FlaskConical } from "lucide-react";

const IS_MOCK = process.env.NEXT_PUBLIC_MOCK === "1";
const STORAGE_KEY = "neuropeer_demo_dismissed";

export function DemoBanner() {
  const [dismissed, setDismissed] = useState(true); // start hidden to avoid flash

  useEffect(() => {
    if (!IS_MOCK) return;
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (!stored) setDismissed(false);
  }, []);

  if (!IS_MOCK || dismissed) return null;

  return (
    <div className="sticky top-0 z-50 flex items-center justify-center gap-2 px-4 py-1.5 bg-gradient-to-r from-brand-600/90 to-brand-500/90 backdrop-blur-sm text-white text-xs font-medium">
      <FlaskConical className="w-3 h-3" />
      <span>Demo Mode — Neural predictions shown are simulated</span>
      <button
        onClick={() => {
          setDismissed(true);
          sessionStorage.setItem(STORAGE_KEY, "1");
        }}
        className="ml-2 p-0.5 rounded hover:bg-white/20 transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
