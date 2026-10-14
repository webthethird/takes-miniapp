// The feed itself, extracted so it can be the landing page while /feed stays
// a working URL. Server component — no wallet, no client JS.

import { FeedCard } from "@/app/_components/feed-card";
import { getSnapshot, listFeed } from "@/lib/feed";

export function FeedList() {
  const snapshot = getSnapshot();
  const items = listFeed();
  const generated = new Date(snapshot.generated_at);

  return (
    <main className="space-y-5">
      <header className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">
          Opinions worth challenging
        </h2>
        <p className="max-w-prose text-sm text-zinc-400">
          Real casts from Farcaster, each with the yes/no question Takes derived
          from it. Backing or challenging is relative to what that person
          actually said — you never have to work out which way the question is
          phrased.
        </p>
      </header>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-zinc-800 bg-zinc-800 sm:grid-cols-4">
        <Stat label="casts read" value={snapshot.stats.casts_considered} />
        <Stat label="opinions" value={snapshot.stats.opinions_found} />
        <Stat label="questions" value={items.length} />
        <Stat label="contested" value={snapshot.stats.contested} />
      </dl>

      {items.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-4">
          {items.map((item, i) => (
            <FeedCard key={item.id} item={item} rank={i + 1} />
          ))}
        </div>
      )}

      <footer className="border-t border-zinc-800 pt-4 text-[11px] leading-relaxed text-zinc-500">
        <p>
          Snapshot of a classifier run on{" "}
          <time dateTime={snapshot.generated_at}>
            {generated.toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </time>
          {snapshot.stats.predictions_filtered > 0 ? (
            <>
              {" · "}
              {snapshot.stats.predictions_filtered} claim
              {snapshot.stats.predictions_filtered === 1 ? "" : "s"} filtered out
              as prediction-market material
            </>
          ) : null}
        </p>
        <p className="mt-1">
          Stances are the classifier&rsquo;s reading of each cast, not stakes,
          votes, or a poll. Every cast links back to its original.
        </p>
      </footer>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-zinc-950 px-3 py-2.5">
      <dd className="font-mono text-lg tabular-nums text-zinc-100">{value}</dd>
      <dt className="text-[11px] text-zinc-500">{label}</dt>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 text-center">
      <p className="text-sm text-zinc-300">No feed snapshot loaded.</p>
      <p className="mt-1 text-xs text-zinc-500">
        Run{" "}
        <code className="font-mono text-zinc-400">
          pnpm import-feed &lt;feed_*.json&gt;
        </code>{" "}
        from a takes-classifier run.
      </p>
    </div>
  );
}
