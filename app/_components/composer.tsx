"use client";

import { useEffect, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import type { ClassifyResponse } from "@/app/api/classify/route";
import type { MarketResponse } from "@/app/api/markets/[id]/route";
import { MIN_STAKE, MAX_STAKE } from "@/lib/constants";
import {
  StakeError,
  progressLabel,
  stakeOnChain,
  type StakeProgress,
} from "@/lib/onchain";

type Tally = NonNullable<ClassifyResponse["market"]>["tally"];
type Status =
  | "idle"
  | "loading-classify"
  | "loading-market" // reply mode: fetching the deep-linked market
  | "classified"
  | "no-opinion"
  | "reply" // reply mode: market loaded, ready to compose
  | "market-not-found"
  | "error";

type ErrorDetail = { status?: number; message?: string };

const QUICK_STAKES = [1, 5, 20, 100] as const;

export function Composer({
  initialMarketId,
  initialSide,
}: {
  initialMarketId?: string;
  initialSide?: "yes" | "no";
}) {
  const inReplyMode = Boolean(initialMarketId);
  const [text, setText] = useState("");
  const [result, setResult] = useState<ClassifyResponse | null>(null);
  const [status, setStatus] = useState<Status>(
    inReplyMode ? "loading-market" : "idle",
  );
  const [casting, setCasting] = useState(false);
  const [stake, setStake] = useState<number>(1);
  const [tally, setTally] = useState<Tally | null>(null);
  const [error, setError] = useState<ErrorDetail | null>(null);
  // In reply mode, the side is fixed by the URL (or user toggle)
  const [replySide, setReplySide] = useState<"yes" | "no">(initialSide ?? "yes");
  const [castOutcome, setCastOutcome] = useState<
    | null
    | { kind: "ok"; hash?: string }
    | { kind: "skipped" }
    | { kind: "error"; msg: string }
  >(null);
  const [onchainStatus, setOnchainStatus] = useState<StakeProgress>("idle");
  const [onchainError, setOnchainError] = useState<string | null>(null);

  // Reply mode: fetch the deep-linked market on mount and synthesize a result
  useEffect(() => {
    if (!initialMarketId) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(
          `/api/markets/${encodeURIComponent(initialMarketId)}`,
        );
        if (!r.ok) {
          if (!cancelled) setStatus("market-not-found");
          return;
        }
        const m = (await r.json()) as MarketResponse;
        if (cancelled) return;
        setResult(synthesizeReplyResult(m, replySide));
        setTally(m.tally);
        setStatus("reply");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialMarketId, replySide]);

  // Fresh mode: classifier runs on debounced text changes
  useEffect(() => {
    if (inReplyMode) return; // skip classifier in reply mode
    const trimmed = text.trim();
    if (trimmed.length < 15) {
      setStatus("idle");
      setResult(null);
      setTally(null);
      return;
    }
    const ctrl = new AbortController();
    setStatus("loading-classify");
    setError(null);
    const t = setTimeout(async () => {
      try {
        const r = await fetch("/api/classify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: trimmed }),
          signal: ctrl.signal,
        });
        if (!r.ok) {
          let message: string | undefined;
          try {
            const body = (await r.json()) as { error?: string };
            message = body.error;
          } catch {
            try {
              message = await r.text();
            } catch {
              message = undefined;
            }
          }
          setError({ status: r.status, message });
          setStatus("error");
          return;
        }
        const data = (await r.json()) as ClassifyResponse;
        setResult(data);
        setTally(data.market?.tally ?? null);
        setStatus(data.is_opinion && data.claim ? "classified" : "no-opinion");
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError({ message: (e as Error).message });
        setStatus("error");
      }
    }, 600);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [text, inReplyMode]);

  async function castAsTake() {
    if (!result?.claim || !result.market) return;
    setCasting(true);
    setCastOutcome(null);
    setOnchainError(null);
    setOnchainStatus("idle");

    // 1) On-chain stake first. If this fails, no cast goes out.
    let stakeTxHash: `0x${string}` | undefined;
    try {
      const out = await stakeOnChain({
        question: result.market.question,
        side: result.claim.answer,
        amountDollars: stake,
        onProgress: setOnchainStatus,
      });
      stakeTxHash = out.stakeTxHash;
    } catch (e) {
      const msg =
        e instanceof StakeError
          ? `${progressLabel(e.step) || "On-chain"}: ${e.message}`
          : e instanceof Error
            ? e.message
            : "Unknown on-chain error";
      setOnchainError(msg);
      setOnchainStatus("idle");
      setCasting(false);
      return;
    }

    // 2) Compose the cast
    const sideLabel = result.claim.answer.toUpperCase();
    const userText = text.trim();
    const footer = `— ${sideLabel} on "${result.claim.question}" via Takes`;
    const composeText = userText ? `${userText}\n\n${footer}` : footer;
    const snapUrl = `${window.location.origin}/snap?market=${encodeURIComponent(result.market.id)}`;
    try {
      const out = await sdk.actions.composeCast({
        text: composeText,
        embeds: [snapUrl],
      });
      if (!out?.cast) {
        // The stake landed on-chain even though the cast was cancelled — record it.
        // No cast_hash, but the position is real.
        setCastOutcome({ kind: "skipped" });
        return;
      }
      const ctx = await sdk.context;
      const fid = ctx.user?.fid;
      if (fid && result.market) {
        const r = await fetch(
          `/api/markets/${encodeURIComponent(result.market.id)}/positions`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fid,
              side: result.claim.answer,
              amount: stake,
              cast_hash: out.cast.hash,
              stake_tx_hash: stakeTxHash,
            }),
          },
        );
        if (r.ok) {
          const data = (await r.json()) as { tally: Tally };
          if (data.tally) setTally(data.tally);
        }
      }
      setCastOutcome({ kind: "ok", hash: out.cast.hash });
    } catch (e) {
      setCastOutcome({ kind: "error", msg: (e as Error).message });
    } finally {
      setCasting(false);
    }
  }

  async function castNormally() {
    setCasting(true);
    setCastOutcome(null);
    try {
      const out = await sdk.actions.composeCast({ text: text.trim() });
      if (out?.cast) setCastOutcome({ kind: "ok", hash: out.cast.hash });
      else setCastOutcome({ kind: "skipped" });
    } catch (e) {
      setCastOutcome({ kind: "error", msg: (e as Error).message });
    } finally {
      setCasting(false);
    }
  }

  function flipReplySide(next: "yes" | "no") {
    setReplySide(next);
    if (result?.claim && result.market) {
      // Re-synthesize with the flipped side so the card + cast text update
      setResult({
        ...result,
        claim: { ...result.claim, answer: next },
      });
    }
  }

  return (
    <div className="space-y-4">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={
          inReplyMode
            ? "Why are you backing this side? (Optional — you can cast just the embed.)"
            : "What's your take?"
        }
        rows={4}
        className="w-full resize-none rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-3 text-base outline-none transition focus:border-zinc-600"
        autoFocus
      />

      <div className="min-h-[140px]">
        {status === "loading-classify" && (
          <p className="text-xs text-zinc-500">Reading your take…</p>
        )}
        {status === "loading-market" && (
          <p className="text-xs text-zinc-500">Loading market…</p>
        )}

        {status === "error" && (
          <div className="space-y-1 rounded-lg border border-red-900/50 bg-red-950/30 p-3 text-xs text-red-300">
            <p>Classifier hit an error. Try again, or just cast normally.</p>
            {(error?.status || error?.message) && (
              <p className="font-mono break-all text-[11px] text-red-400/80">
                {error.status ? `${error.status}: ` : ""}
                {error.message ?? "(no message)"}
              </p>
            )}
          </div>
        )}

        {status === "market-not-found" && (
          <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <p className="text-sm text-zinc-300">
              That market no longer exists (the dev server resets state on
              restart).
            </p>
            <a
              href="/"
              className="inline-block rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-600"
            >
              Start fresh
            </a>
          </div>
        )}

        {(status === "classified" || status === "reply") &&
          result?.claim &&
          result.market && (
            <ClassifiedCard
              response={result}
              tally={tally}
              stake={stake}
              onStakeChange={setStake}
              onCast={castAsTake}
              onSkip={castNormally}
              casting={casting}
              replyMode={status === "reply"}
              onFlipSide={status === "reply" ? flipReplySide : undefined}
            />
          )}

        {status === "no-opinion" && result && (
          <NoOpinionCard
            reason={result.reason}
            onCast={castNormally}
            casting={casting}
          />
        )}
      </div>

      {onchainStatus !== "idle" && onchainStatus !== "done" && (
        <p className="rounded-lg border border-purple-700/40 bg-purple-950/40 p-3 text-sm text-purple-200">
          {progressLabel(onchainStatus)}
        </p>
      )}
      {onchainError && (
        <p className="rounded-lg border border-red-700/40 bg-red-950/40 p-3 text-sm text-red-300">
          {onchainError}
        </p>
      )}

      {castOutcome?.kind === "ok" && (
        <p className="rounded-lg border border-emerald-700/40 bg-emerald-950/40 p-3 text-sm text-emerald-300">
          Posted! ✓ Position staked on-chain.
        </p>
      )}
      {castOutcome?.kind === "skipped" && (
        <p className="rounded-lg border border-amber-700/40 bg-amber-950/30 p-3 text-sm text-amber-200">
          Cast cancelled — but your stake already landed on-chain. The position is live.
        </p>
      )}
      {castOutcome?.kind === "error" && (
        <p className="rounded-lg border border-red-700/40 bg-red-950/40 p-3 text-sm text-red-300">
          Couldn&apos;t open the composer: {castOutcome.msg}
        </p>
      )}

      {inReplyMode && (
        <div className="flex justify-center">
          <a
            href="/"
            className="text-xs text-zinc-500 hover:text-zinc-300"
          >
            Cancel reply, write a fresh take →
          </a>
        </div>
      )}
    </div>
  );
}

// Build a synthetic ClassifyResponse from a directly-loaded market.
// Reply mode skips the classifier; the user has already chosen the market
// and side via deep-link.
function synthesizeReplyResult(
  market: MarketResponse,
  side: "yes" | "no",
): ClassifyResponse {
  return {
    is_opinion: true,
    reason: "Reply mode (deep link)",
    claim: {
      question: market.question,
      answer: side,
      claim_type: market.claim_type,
      aspect: market.aspect,
      confidence: 1,
    },
    market: {
      id: market.id,
      question: market.question,
      aspect: market.aspect,
      claim_type: market.claim_type,
      is_new: false,
      tally: market.tally,
    },
  };
}

function ClassifiedCard({
  response,
  tally,
  stake,
  onStakeChange,
  onCast,
  onSkip,
  casting,
  replyMode = false,
  onFlipSide,
}: {
  response: ClassifyResponse;
  tally: Tally | null;
  stake: number;
  onStakeChange: (n: number) => void;
  onCast: () => void;
  onSkip: () => void;
  casting: boolean;
  replyMode?: boolean;
  onFlipSide?: (side: "yes" | "no") => void;
}) {
  const claim = response.claim!;
  const market = response.market!;
  const sideColor = claim.answer === "yes" ? "text-emerald-400" : "text-rose-400";
  const sideLabel = claim.answer.toUpperCase();

  return (
    <div className="space-y-3 rounded-xl border border-purple-800/50 bg-purple-950/20 p-4">
      <div className="flex items-center gap-2 text-xs text-zinc-400">
        {replyMode ? (
          <span className="rounded-full bg-blue-900/60 px-2 py-0.5 font-medium uppercase tracking-wide text-blue-200">
            Replying
          </span>
        ) : market.is_new ? (
          <span className="rounded-full bg-purple-900/60 px-2 py-0.5 font-medium uppercase tracking-wide text-purple-200">
            New market
          </span>
        ) : (
          <span className="rounded-full bg-emerald-900/60 px-2 py-0.5 font-medium uppercase tracking-wide text-emerald-200">
            Joining market
            {market.similarity ? ` · ${(market.similarity * 100).toFixed(0)}% match` : ""}
          </span>
        )}
        <span className="text-zinc-500">·</span>
        <span className="text-zinc-300">{claim.claim_type}</span>
        {!replyMode && (
          <span className="ml-auto tabular-nums text-zinc-500">
            {(claim.confidence * 100).toFixed(0)}%
          </span>
        )}
      </div>

      <div>
        <p className="text-xs uppercase tracking-wide text-zinc-500">Market</p>
        <p className="mt-1 text-base font-medium leading-snug">{market.question}</p>
      </div>

      {claim.claim_type === "predictive" && (
        <div className="rounded-md border border-amber-900/40 bg-amber-950/20 px-3 py-2 text-[11px] leading-relaxed text-amber-200">
          🔮 <span className="font-medium">Predictive take.</span>{" "}
          Resolves by time-weighted stake at the end of the 30-day lockup —
          early stakers count more, and the side that&apos;s correct in the real
          world doesn&apos;t matter.
        </div>
      )}

      {tally && tally.total_amount > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="uppercase tracking-wide text-zinc-500">Standing</span>
            <span className="tabular-nums text-zinc-400">
              <span className="text-emerald-400">{tally.yes_standing_pct}% YES</span>
              <span className="text-zinc-600"> · </span>
              <span className="text-rose-400">{100 - tally.yes_standing_pct}% NO</span>
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-rose-900/50">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${tally.yes_standing_pct}%` }}
            />
          </div>
          <p className="text-[11px] tabular-nums text-zinc-500">
            <span className="text-zinc-400">${tally.yes_amount} YES · ${tally.no_amount} NO</span>
            <span className="text-zinc-600"> · </span>
            {tally.total_backers} backer{tally.total_backers === 1 ? "" : "s"}
          </p>
        </div>
      )}

      <div>
        <p className="text-xs uppercase tracking-wide text-zinc-500">Your side</p>
        {replyMode && onFlipSide ? (
          <div className="mt-1 flex gap-1">
            <button
              type="button"
              onClick={() => onFlipSide("yes")}
              className={
                "rounded-md px-3 py-1 text-sm font-bold transition " +
                (claim.answer === "yes"
                  ? "bg-emerald-700 text-white"
                  : "border border-zinc-700 text-zinc-400 hover:border-emerald-700/50")
              }
            >
              YES
            </button>
            <button
              type="button"
              onClick={() => onFlipSide("no")}
              className={
                "rounded-md px-3 py-1 text-sm font-bold transition " +
                (claim.answer === "no"
                  ? "bg-rose-700 text-white"
                  : "border border-zinc-700 text-zinc-400 hover:border-rose-700/50")
              }
            >
              NO
            </button>
          </div>
        ) : (
          <p className={`mt-1 text-lg font-bold ${sideColor}`}>{sideLabel}</p>
        )}
      </div>

      <div className="space-y-2 border-t border-purple-900/40 pt-3">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Your stake</p>
          <div className="flex items-center gap-1 text-zinc-300">
            <span className="text-sm">$</span>
            <input
              type="number"
              min={MIN_STAKE}
              max={MAX_STAKE}
              value={stake}
              onChange={(e) => {
                const n = Math.floor(Number(e.target.value));
                if (!Number.isFinite(n)) return;
                onStakeChange(Math.max(MIN_STAKE, Math.min(MAX_STAKE, n)));
              }}
              className="w-20 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-zinc-500"
            />
          </div>
        </div>
        <div className="flex gap-2">
          {QUICK_STAKES.map((amount) => (
            <button
              key={amount}
              type="button"
              onClick={() => onStakeChange(amount)}
              className={
                "flex-1 rounded-md border px-2 py-1 text-xs font-medium tabular-nums transition " +
                (stake === amount
                  ? "border-purple-500 bg-purple-900/50 text-purple-100"
                  : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-600")
              }
            >
              ${amount}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCast}
          disabled={casting}
          className="flex-1 rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-purple-700 disabled:opacity-60"
        >
          {casting
            ? "Opening composer…"
            : replyMode
              ? `Cast reply ($${stake})`
              : `Cast as a Take ($${stake})`}
        </button>
        {!replyMode && (
          <button
            type="button"
            onClick={onSkip}
            disabled={casting}
            className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:border-zinc-600"
          >
            Just cast
          </button>
        )}
      </div>
      <p className="text-[11px] text-zinc-500">
        Stakes USDC on Base Sepolia. Funds lock for 30 days; the side with the
        most time-weighted standing at the end takes the yield.
      </p>
    </div>
  );
}

function NoOpinionCard({
  reason,
  onCast,
  casting,
}: {
  reason: string;
  onCast: () => void;
  casting: boolean;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div>
        <p className="text-xs uppercase tracking-wide text-zinc-500">No opinion detected</p>
        <p className="mt-1 text-sm text-zinc-300">{reason}</p>
      </div>
      <button
        type="button"
        onClick={onCast}
        disabled={casting}
        className="w-full rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:border-zinc-600 disabled:opacity-60"
      >
        {casting ? "Opening composer…" : "Cast normally"}
      </button>
    </div>
  );
}
