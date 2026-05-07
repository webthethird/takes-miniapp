import Link from "next/link";
import { listMarkets, tally } from "@/lib/market-index";
import type { Market } from "@/lib/storage";

export const dynamic = "force-dynamic";

export default async function Browse() {
  const markets = await listMarkets();
  return (
    <main className="space-y-5">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight">Markets</h2>
          <p className="text-sm text-zinc-400">
            {markets.length} active · tap any to back a side.
          </p>
        </div>
        <Link
          href="/"
          className="rounded-lg border border-zinc-800 px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-600"
        >
          + Cast a take
        </Link>
      </header>

      {markets.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="space-y-2">
          {markets.map((m) => (
            <MarketRow key={m.id} market={m} />
          ))}
        </ul>
      )}
    </main>
  );
}

function MarketRow({ market }: { market: Market }) {
  const t = tally(market);
  const total = Math.max(t.total_amount, 1);
  const yesPct = Math.round((t.yes_amount / total) * 100);
  return (
    <li>
      <Link
        href={`/?market=${encodeURIComponent(market.id)}`}
        className="block rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 transition hover:border-zinc-700 hover:bg-zinc-900"
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium leading-snug text-zinc-100">
            {market.question}
          </p>
          <span className="shrink-0 rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
            {market.claim_type}
          </span>
        </div>

        {t.total_amount > 0 ? (
          <div className="mt-3 space-y-1.5">
            <div className="h-1.5 overflow-hidden rounded-full bg-rose-900/50">
              <div
                className="h-full bg-emerald-500"
                style={{ width: `${yesPct}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] tabular-nums text-zinc-400">
              <span>
                <span className="text-emerald-400">${t.yes_amount} YES</span>
                <span className="text-zinc-600"> · </span>
                <span className="text-rose-400">${t.no_amount} NO</span>
              </span>
              <span>
                {t.total_backers} backer{t.total_backers === 1 ? "" : "s"}
              </span>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-[11px] text-zinc-500">
            No backers yet. Be the first.
          </p>
        )}
      </Link>
    </li>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 text-center">
      <p className="text-sm text-zinc-300">No markets yet.</p>
      <p className="mt-1 text-xs text-zinc-500">
        Cast a take to start the first one.
      </p>
      <Link
        href="/"
        className="mt-4 inline-block rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
      >
        Cast a take →
      </Link>
    </div>
  );
}
