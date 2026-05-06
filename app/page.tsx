import { Composer } from "./_components/composer";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ market?: string; side?: string }>;
}) {
  const { market, side } = await searchParams;
  const initialSide = side === "yes" || side === "no" ? side : undefined;
  return (
    <main className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Takes</h1>
        <p className="text-sm text-zinc-400">
          {market
            ? "Replying to a Take. Add your reasoning, pick a stake, cast."
            : "What's your take? Type below — we'll find a market for it."}
        </p>
      </header>
      <Composer initialMarketId={market} initialSide={initialSide} />
    </main>
  );
}
