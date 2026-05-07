import { listMarkets, tally } from "@/lib/market-index";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const markets = await listMarkets();
  return Response.json({
    markets: markets.map((m) => ({
      id: m.id,
      question: m.question,
      claim_type: m.claim_type,
      aspect: m.aspect,
      created_at: m.created_at,
      tally: tally(m),
    })),
  });
}
