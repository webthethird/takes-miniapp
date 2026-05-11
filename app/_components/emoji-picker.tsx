"use client";

import { useEffect, useRef, useState } from "react";

// Curated set of emojis common in Farcaster casts. Kept short on purpose so
// the picker loads instantly (no library, no emoji-data fetch).
const EMOJIS = [
  "🔥", "💯", "👀", "🙏", "💀", "🤔", "⚡", "🚀",
  "✅", "❌", "🌶️", "💸", "📈", "📉", "🎯", "🧠",
  "👏", "🫡", "🤌", "🥹", "😂", "🤡", "😬", "😅",
  "❤️", "👍", "👎", "🤝", "💪", "🎉", "✨", "💎",
  "⭐", "🐂", "🐻", "🙌", "🫶", "🤷", "🫨", "🍕",
];

export function EmojiPicker({
  onPick,
}: {
  onPick: (emoji: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!popoverRef.current?.contains(e.target as Node)) setOpen(false);
    }
    // Defer so the click that opened it doesn't immediately close
    const t = setTimeout(() => {
      document.addEventListener("mousedown", onDocClick);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onDocClick);
    };
  }, [open]);

  return (
    <div className="relative" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Insert emoji"
        className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
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
          <path d="M8 14s1.5 2 4 2 4-2 4-2" />
          <line x1="9" y1="9" x2="9.01" y2="9" />
          <line x1="15" y1="9" x2="15.01" y2="9" />
        </svg>
      </button>

      {open && (
        <div
          role="dialog"
          className="absolute bottom-full left-0 z-30 mb-2 grid w-64 grid-cols-8 gap-1 rounded-xl border border-zinc-700 bg-zinc-900 p-2 shadow-xl"
        >
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                onPick(emoji);
                setOpen(false);
              }}
              className="flex h-7 w-7 items-center justify-center rounded text-base transition hover:bg-zinc-800"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
