import { classifyCast } from "@/lib/classify";
import {
  createMarket,
  findOrPropose,
  tally,
} from "@/lib/market-index";
import type { Market } from "@/lib/storage";
import type { Claim } from "@/lib/schema";

// Node runtime — @xenova/transformers needs Node, not Edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type ClassifyResponse = {
  is_opinion: boolean;
  reason: string;
  // The top claim (we keep the v0 simplification of one claim per cast)
  claim: Claim | null;
  // Market matching result
  market: {
    id: string;
    question: string;
    aspect: string;
    claim_type: Claim["claim_type"];
    is_new: boolean;
    similarity?: number; // present when matched to existing
    tally: ReturnType<typeof tally>;
  } | null;
};

function shape(market: Market, isNew: boolean, similarity?: number): NonNullable<ClassifyResponse["market"]> {
  return {
    id: market.id,
    question: market.question,
    aspect: market.aspect,
    claim_type: market.claim_type,
    is_new: isNew,
    similarity,
    tally: tally(market),
  };
}

export async function POST(request: Request) {
  const { text, parentText } = (await request.json()) as {
    text?: string;
    parentText?: string;
  };
  if (!text || text.trim().length < 10) {
    return Response.json({
      is_opinion: false,
      reason: "Text too short to classify.",
      claim: null,
      market: null,
    } satisfies ClassifyResponse);
  }
  try {
    const result = await classifyCast({ text, parentText });
    if (!result.is_opinion || result.claims.length === 0) {
      return Response.json({
        is_opinion: false,
        reason: result.reason,
        claim: null,
        market: null,
      } satisfies ClassifyResponse);
    }
    const claim = [...result.claims].sort((a, b) => b.confidence - a.confidence)[0];
    const outcome = await findOrPropose(claim);
    let marketBlock: NonNullable<ClassifyResponse["market"]>;
    if (outcome.kind === "match") {
      marketBlock = shape(outcome.market, false, outcome.similarity);
    } else {
      // Treat ambiguous + new the same in v0: create a new market and let the
      // user override later if needed. (Ambiguous-as-choice UI is v0.5.)
      const m = await createMarket(claim);
      marketBlock = shape(m, true);
    }
    return Response.json({
      is_opinion: true,
      reason: result.reason,
      claim,
      market: marketBlock,
    } satisfies ClassifyResponse);
  } catch (e) {
    console.error("classify error:", e);
    return Response.json(
      { error: (e as Error).message ?? "Classify failed" },
      { status: 500 },
    );
  }
}
