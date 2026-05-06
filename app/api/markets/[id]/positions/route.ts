import { MAX_STAKE, MIN_STAKE } from "@/lib/constants";
import {
  getMarket,
  recordPosition,
  tally,
} from "@/lib/market-index";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { fid, side, amount, cast_hash } = (await request.json()) as {
    fid?: number;
    side?: "yes" | "no";
    amount?: number;
    cast_hash?: string;
  };
  if (!fid || (side !== "yes" && side !== "no")) {
    return Response.json(
      { error: "fid and side ('yes'|'no') are required" },
      { status: 400 },
    );
  }
  const stake = typeof amount === "number" ? Math.floor(amount) : MIN_STAKE;
  if (stake < MIN_STAKE || stake > MAX_STAKE) {
    return Response.json(
      { error: `amount must be between ${MIN_STAKE} and ${MAX_STAKE} USDC` },
      { status: 400 },
    );
  }
  const result = await recordPosition(id, fid, side, stake, cast_hash);
  if (!result.market) {
    return Response.json({ error: "market not found" }, { status: 404 });
  }
  return Response.json({
    market_id: result.market.id,
    side,
    amount: stake,
    already_voted: result.existed,
    tally: tally(result.market),
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const market = await getMarket(id);
  if (!market) return Response.json({ error: "market not found" }, { status: 404 });
  return Response.json({
    market_id: market.id,
    question: market.question,
    tally: tally(market),
    positions: market.positions.map((p) => ({
      fid: p.fid,
      side: p.side,
      amount: p.amount,
      ts: p.ts,
    })),
  });
}
