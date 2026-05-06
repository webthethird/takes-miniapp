import { getMarket, tally } from "@/lib/market-index";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const market = await getMarket(id);
  if (!market) return Response.json({ error: "market not found" }, { status: 404 });
  return Response.json({
    id: market.id,
    question: market.question,
    aspect: market.aspect,
    claim_type: market.claim_type,
    created_at: market.created_at,
    tally: tally(market),
  });
}

export type MarketResponse = {
  id: string;
  question: string;
  aspect: string;
  claim_type: "predictive" | "evaluative" | "prescriptive" | "descriptive";
  created_at: number;
  tally: ReturnType<typeof tally>;
};
