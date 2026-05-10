"use client";

import { useEffect, useState } from "react";

// Bumping the version reshows the modal to everyone — useful when the
// mechanic copy changes meaningfully.
const STORAGE_KEY = "takes_onboarding_v1";

export function OnboardingModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.localStorage.getItem(STORAGE_KEY)) setOpen(true);
  }, []);

  if (!open) return null;

  function dismiss() {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Private mode / storage disabled — modal will reappear next visit, fine.
    }
    setOpen(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      onClick={dismiss}
    >
      <div
        className="w-full max-w-md space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-1">
          <h2
            id="onboarding-title"
            className="text-xl font-semibold tracking-tight"
          >
            Welcome to Takes
          </h2>
          <p className="text-sm text-zinc-400">
            Back your opinions with USDC. Be early. Be right (or popular).
          </p>
        </div>

        <ol className="space-y-3 text-sm text-zinc-200">
          <li className="flex gap-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-purple-700 text-[11px] font-semibold">
              1
            </span>
            <span>
              <strong className="text-white">Type a take.</strong> We classify
              it into a canonical YES/NO question and find or create the
              matching market.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-purple-700 text-[11px] font-semibold">
              2
            </span>
            <span>
              <strong className="text-white">Stake USDC</strong> ($1–$1000) on
              your side. Funds lock for 30 days and earn yield.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-purple-700 text-[11px] font-semibold">
              3
            </span>
            <span>
              <strong className="text-white">
                Time-weighted standing wins.
              </strong>{" "}
              At lockup end, the side with more <em>amount × time-locked</em>{" "}
              splits the yield. Early conviction counts more than late piling
              on. Losers get their principal back.
            </span>
          </li>
        </ol>

        <div className="rounded-md border border-amber-900/40 bg-amber-950/20 px-3 py-2 text-[11px] leading-relaxed text-amber-200">
          🧪 Testnet — running on Base Sepolia with mock USDC. Real funds
          coming when we move to Base mainnet.
        </div>

        <button
          type="button"
          onClick={dismiss}
          className="w-full rounded-lg bg-purple-600 px-3 py-2.5 text-sm font-medium text-white transition hover:bg-purple-700"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
