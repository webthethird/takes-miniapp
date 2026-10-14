"use client";

// Back / Challenge for one feed card.
//
// Two rules this component exists to enforce:
//
// 1. Stances are relative to the PERSON, not the question. "Back @alice" puts
//    you on whatever side alice took; "Challenge" puts you opposite her. The
//    canonical yes/no is shown underneath as a detail, never as the control.
//
// 2. Staking is only offered where it can actually happen. The wallet comes
//    from the Farcaster host app, so in an ordinary browser there is nothing
//    to connect to. Rather than render buttons that fail on click, we detect
//    the host first and say plainly that staking needs the Farcaster app.

import { useCallback, useEffect, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { MAX_STAKE, MIN_STAKE } from "@/lib/constants";
import {
  StakeError,
  progressLabel,
  stakeOnChain,
  type StakeProgress,
  type StakeSide,
} from "@/lib/onchain";

const QUICK_STAKES = [1, 5, 20] as const;
/// Host detection shouldn't hang the page if the SDK never settles.
const DETECT_TIMEOUT_MS = 2500;

type Host = "checking" | "farcaster" | "browser";

export function StakeActions({
  question,
  backStance,
  challengeStance,
  author,
  initialSide,
}: {
  question: string;
  backStance: StakeSide;
  challengeStance: StakeSide;
  author: string;
  initialSide?: "back" | "challenge";
}) {
  const [host, setHost] = useState<Host>("checking");
  const [choice, setChoice] = useState<"back" | "challenge" | null>(
    initialSide ?? null,
  );
  const [amount, setAmount] = useState<number>(MIN_STAKE);
  const [progress, setProgress] = useState<StakeProgress>("idle");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ market: string; tx: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ctx = await Promise.race([
          sdk.context,
          new Promise<null>((resolve) =>
            setTimeout(() => resolve(null), DETECT_TIMEOUT_MS),
          ),
        ]);
        if (cancelled) return;
        setHost(ctx && (ctx as { user?: unknown }).user ? "farcaster" : "browser");
      } catch {
        if (!cancelled) setHost("browser");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const stance = choice === "challenge" ? challengeStance : backStance;
  const busy = progress !== "idle" && progress !== "done";

  const submit = useCallback(async () => {
    if (!choice) return;
    setError(null);
    try {
      const { marketAddress, txHashes } = await stakeOnChain({
        question,
        side: choice === "challenge" ? challengeStance : backStance,
        amountDollars: amount,
        onProgress: setProgress,
      });
      setDone({
        market: marketAddress,
        tx: txHashes[txHashes.length - 1] ?? "",
      });
    } catch (e) {
      setProgress("idle");
      setError(
        e instanceof StakeError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Something went wrong.",
      );
    }
  }, [choice, question, amount, backStance, challengeStance]);

  if (done) {
    return (
      <div className="space-y-2 rounded-xl border border-purple-800 bg-purple-950/40 p-4">
        <p className="text-sm font-semibold text-purple-200">
          Staked ${amount} on {stance.toUpperCase()} ✓
        </p>
        <p className="break-all font-mono text-[11px] text-zinc-400">
          market {done.market}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="flex flex-wrap gap-2">
        <ChoiceButton
          active={choice === "back"}
          onClick={() => setChoice("back")}
          disabled={busy}
          label={`Back @${author}`}
          sub={backStance}
          tone="back"
        />
        <ChoiceButton
          active={choice === "challenge"}
          onClick={() => setChoice("challenge")}
          disabled={busy}
          label="Challenge"
          sub={challengeStance}
          tone="challenge"
        />
      </div>

      {choice ? (
        <p className="text-xs leading-relaxed text-zinc-400">
          You&rsquo;d be backing{" "}
          <strong className="text-zinc-200">{stance.toUpperCase()}</strong>{" "}
          on &ldquo;{question}&rdquo;
          {choice === "challenge" ? (
            <> — the opposite of what @{author} argued.</>
          ) : (
            <> — the same side @{author} took.</>
          )}
        </p>
      ) : null}

      {host === "checking" ? (
        <p className="text-xs text-zinc-500">Checking for a wallet…</p>
      ) : host === "browser" ? (
        <div className="space-y-1 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          <p className="text-xs font-semibold text-zinc-300">
            Staking needs the Farcaster app
          </p>
          <p className="text-[11px] leading-relaxed text-zinc-500">
            Takes stakes USDC on Base, and the wallet comes from your Farcaster
            client — there&rsquo;s nothing to connect to in a normal browser.
            You can read the whole feed here; open it inside Farcaster to put
            money behind a side.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {QUICK_STAKES.map((v) => (
              <button
                key={v}
                type="button"
                disabled={busy}
                onClick={() => setAmount(v)}
                className={`rounded-lg border px-3 py-1.5 font-mono text-xs tabular-nums transition disabled:opacity-50 ${
                  amount === v
                    ? "border-purple-500 bg-purple-950 text-purple-200"
                    : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                }`}
              >
                ${v}
              </button>
            ))}
            <span className="text-[11px] text-zinc-500">
              ${MIN_STAKE}–${MAX_STAKE}, locked 30 days
            </span>
          </div>

          <button
            type="button"
            disabled={!choice || busy}
            onClick={submit}
            className="w-full rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
          >
            {busy
              ? progressLabel(progress)
              : choice
                ? `Stake $${amount} on ${stance.toUpperCase()}`
                : "Pick a side first"}
          </button>
        </>
      )}

      {error ? (
        <p className="rounded-lg bg-red-950/50 p-2 text-xs text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function ChoiceButton({
  active,
  onClick,
  disabled,
  label,
  sub,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  disabled: boolean;
  label: string;
  sub: string;
  tone: "back" | "challenge";
}) {
  const activeCls =
    tone === "back"
      ? "border-purple-500 bg-purple-950 text-purple-200"
      : "border-cyan-600 bg-cyan-950 text-cyan-200";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition disabled:opacity-50 ${
        active ? activeCls : "border-zinc-700 text-zinc-300 hover:border-zinc-500"
      }`}
    >
      {label}
      <span className="border-l border-zinc-700 pl-2 font-mono text-[10px] uppercase tracking-wide text-zinc-500">
        {sub}
      </span>
    </button>
  );
}
