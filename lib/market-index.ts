// Topic-matching layer over a pluggable storage backend (lib/storage.ts).
//
// findOrPropose runs claim_type filter + question-embedding cosine match.
// Aspect tag is intentionally NOT used in matching — the classifier drifts
// between similar phrasings ("airdrop fairness" vs "fairness") and the
// question embedding does the real work.

import { embed, cosine } from "@/lib/embed";
import {
  AMBIGUOUS_THRESHOLD,
  MATCH_THRESHOLD,
} from "@/lib/constants";
import { storage, type Market, type Position } from "@/lib/storage";
import type { Claim } from "@/lib/schema";

export { MATCH_THRESHOLD, AMBIGUOUS_THRESHOLD };
export type { Market, Position };

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export type MatchOutcome =
  | { kind: "match"; market: Market; similarity: number }
  | { kind: "ambiguous"; candidates: Array<{ market: Market; similarity: number }> }
  | { kind: "new" };

export async function findOrPropose(claim: Claim): Promise<MatchOutcome> {
  const emb = await embed(claim.question);
  const all = await storage.listMarkets();
  const candidates = all
    .filter((m) => m.claim_type === claim.claim_type)
    .map((m) => ({ market: m, similarity: cosine(emb, m.embedding) }))
    .sort((a, b) => b.similarity - a.similarity);

  if (candidates.length === 0) return { kind: "new" };
  const top = candidates[0];
  if (top.similarity >= MATCH_THRESHOLD) {
    return { kind: "match", market: top.market, similarity: top.similarity };
  }
  if (top.similarity >= AMBIGUOUS_THRESHOLD) {
    return { kind: "ambiguous", candidates: candidates.slice(0, 3) };
  }
  return { kind: "new" };
}

export async function createMarket(claim: Claim): Promise<Market> {
  const emb = await embed(claim.question);
  const baseSlug = slugify(claim.question);
  const all = await storage.listMarkets();
  let id = baseSlug || `market-${all.length + 1}`;
  let n = 1;
  while (all.some((m) => m.id === id)) {
    n++;
    id = `${baseSlug}-${n}`;
  }
  const m: Market = {
    id,
    question: claim.question,
    claim_type: claim.claim_type,
    aspect: claim.aspect,
    embedding: emb,
    created_at: Date.now(),
    positions: [],
  };
  await storage.putMarket(m);
  return m;
}

export async function getMarket(id: string): Promise<Market | null> {
  return storage.getMarket(id);
}

export async function listMarkets(): Promise<Market[]> {
  const all = await storage.listMarkets();
  return all.sort((a, b) => b.created_at - a.created_at);
}

export type Tally = {
  // Raw stake totals (USDC dollars)
  yes_amount: number;
  no_amount: number;
  total_amount: number;
  // Time-weighted standing — units = amount × seconds_locked.
  // This is what determines the winner at settlement and yield distribution.
  yes_units: number;
  no_units: number;
  total_units: number;
  // Standing percentage 0-100 (yes_units / total_units * 100).
  // 0 when total_units is 0 (no stakes yet, or all stakes are ts=now).
  yes_standing_pct: number;
  // Backers
  yes_backers: number;
  no_backers: number;
  total_backers: number;
};

export function tally(market: Market): Tally {
  const nowMs = Date.now();
  let yes_amount = 0;
  let no_amount = 0;
  let yes_units = 0;
  let no_units = 0;
  let yes_backers = 0;
  let no_backers = 0;
  for (const p of market.positions) {
    const elapsedSec = Math.max(0, Math.floor((nowMs - p.ts) / 1000));
    const units = p.amount * elapsedSec;
    if (p.side === "yes") {
      yes_amount += p.amount;
      yes_units += units;
      yes_backers++;
    } else {
      no_amount += p.amount;
      no_units += units;
      no_backers++;
    }
  }
  const total_units = yes_units + no_units;
  const yes_standing_pct =
    total_units > 0 ? Math.round((yes_units / total_units) * 100) : 0;
  return {
    yes_amount,
    no_amount,
    total_amount: yes_amount + no_amount,
    yes_units,
    no_units,
    total_units,
    yes_standing_pct,
    yes_backers,
    no_backers,
    total_backers: yes_backers + no_backers,
  };
}

export async function recordPosition(
  marketId: string,
  fid: number,
  side: "yes" | "no",
  amount: number,
  cast_hash?: string,
): Promise<{ existed: boolean; market: Market | null }> {
  const market = await storage.getMarket(marketId);
  if (!market) return { existed: false, market: null };
  const existing = market.positions.find((p) => p.fid === fid);
  if (existing) {
    // v0: idempotent — first stake wins. v2 contracts will allow flips with
    // a small SRP fee.
    return { existed: true, market };
  }
  market.positions.push({
    fid,
    side,
    amount,
    ts: Date.now(),
    cast_hash,
  });
  await storage.putMarket(market);
  return { existed: false, market };
}
