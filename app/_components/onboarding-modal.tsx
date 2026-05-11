"use client";

import { useEffect, useState } from "react";

// Bumping the version reshows the modal to everyone — useful when the
// mechanic copy changes meaningfully. v2 added the 10% loser slash.
const STORAGE_KEY = "takes_onboarding_v2";

export function OnboardingModal() {
  const [open, setOpen] = useState(false);

  // First-visit auto-open (gated by localStorage). The info button below
  // can re-open the modal at any time.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.localStorage.getItem(STORAGE_KEY)) setOpen(true);
  }, []);

  function close() {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Private mode / storage disabled — modal will reappear next visit, fine.
    }
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="How Takes works"
        className="fixed bottom-4 right-4 z-40 flex h-10 w-10 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900/90 text-zinc-300 shadow-lg backdrop-blur transition hover:border-zinc-600 hover:text-white"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="onboarding-title"
          onClick={close}
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
                Skin in the game for your opinions. Be right early, take a slice
                of the wrong side.
              </p>
            </div>

            <ol className="space-y-3 text-sm text-zinc-200">
              <li className="flex gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-purple-700 text-[11px] font-semibold">
                  1
                </span>
                <span>
                  <strong className="text-white">Type a take.</strong> We
                  classify it into a canonical YES/NO question and find or
                  create the matching market.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-purple-700 text-[11px] font-semibold">
                  2
                </span>
                <span>
                  <strong className="text-white">Stake USDC</strong> ($1–$1000)
                  on your side. Funds lock for 30 days and earn yield from a
                  Morpho vault.
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
                  At lockup end, the side with more{" "}
                  <em>amount × time-locked</em> wins. Winners get their
                  principal, the yield, plus{" "}
                  <strong className="text-white">
                    10% of the losing side&apos;s principal
                  </strong>
                  . Early conviction counts more than late piling on.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-700 text-[11px] font-semibold">
                  !
                </span>
                <span>
                  <strong className="text-white">Losers forfeit 10%</strong> of
                  their principal to the winning side. Get back 90% if
                  you&apos;re on the wrong side. Pick a side you&apos;d defend.
                </span>
              </li>
            </ol>

            <div className="rounded-md border border-amber-900/40 bg-amber-950/20 px-3 py-2 text-[11px] leading-relaxed text-amber-200">
              🧪 Testnet — running on Base Sepolia with mock USDC. Real funds
              coming when we move to Base mainnet.
            </div>

            <button
              type="button"
              onClick={close}
              className="w-full rounded-lg bg-purple-600 px-3 py-2.5 text-sm font-medium text-white transition hover:bg-purple-700"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
