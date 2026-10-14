import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CastBlock, CastQuote, Provenance } from "@/app/_components/feed-card";
import { StakeActions } from "@/app/_components/stake-actions";
import {
  getFeedItem,
  listFeed,
  opposingOf,
  representativeOf,
  supportingCasts,
} from "@/lib/feed";
import { LOCKUP_DAYS, MAX_STAKE, MIN_STAKE } from "@/lib/constants";

export async function generateStaticParams() {
  return listFeed().map((item) => ({ id: item.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const item = getFeedItem(decodeURIComponent(id));
  if (!item) return { title: "Not found · Takes" };
  return { title: `${item.question} · Takes`, description: item.challenge_reason };
}

export default async function FeedDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ side?: string }>;
}) {
  const { id } = await params;
  const { side } = await searchParams;
  const item = getFeedItem(decodeURIComponent(id));
  if (!item) notFound();

  const rep = representativeOf(item);
  const opposing = opposingOf(item);
  const others = supportingCasts(item);
  const initialSide =
    side === "back" || side === "challenge" ? side : undefined;

  return (
    <main className="space-y-5">
      {/* The feed is the landing page; /feed only exists as a redirect, so
          link straight to / and skip the hop. */}
      <Link
        href="/"
        className="inline-block font-mono text-[11px] text-zinc-500 hover:text-zinc-300"
      >
        ← back to feed
      </Link>

      <article className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <Provenance cast={rep.cast} />
        {/* Full text here — this is where someone comes to read it. */}
        <CastQuote text={rep.cast.text} />
      </article>

      <section className="space-y-1 rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-purple-400">
          ✦ Takes identified
        </p>
        <h2 className="text-base font-semibold leading-snug text-zinc-100">
          {item.question}
        </h2>
        <p className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-zinc-500">
          <span className="rounded-full border border-zinc-700 px-2 py-0.5 uppercase tracking-wide">
            {item.claim_type}
          </span>
          {item.aspect ? (
            <span className="rounded-full border border-zinc-800 px-2 py-0.5 text-zinc-600">
              {item.aspect}
            </span>
          ) : null}
          {item.both_sides ? (
            <span className="rounded-full bg-purple-950 px-2 py-0.5 font-semibold uppercase tracking-wide text-purple-300">
              contested
            </span>
          ) : null}
        </p>
      </section>

      <StakeActions
        question={item.question}
        backStance={item.back_means}
        challengeStance={item.challenge_means}
        author={rep.cast.username ?? "this take"}
        initialSide={initialSide}
      />

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Where people landed
        </h3>
        <p className="text-[11px] leading-relaxed text-zinc-500">
          {item.yes_casts} yes · {item.no_casts} no{" "}
          <span className="text-zinc-600">
            (casts, from {item.distinct_authors}{" "}
            {item.distinct_authors === 1 ? "person" : "people"})
          </span>
          . These are the classifier&rsquo;s reading of each cast — not stakes,
          votes, or a poll.
        </p>
        <ul className="space-y-2">
          <CastBlock member={rep} />
          {opposing ? <CastBlock member={opposing} highlight /> : null}
          {others.map((m) => (
            <CastBlock key={m.cast.id} member={m} />
          ))}
        </ul>
      </section>

      {!opposing ? (
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <p className="text-[13px] leading-relaxed text-zinc-400">
            <span className="mr-1.5 rounded border border-dashed border-purple-500 px-1.5 py-px text-[10px] font-bold uppercase tracking-wider text-purple-400">
              AI hypothesis
            </span>
            {item.challenge_reason}
          </p>
          <p className="mt-2 text-[11px] text-zinc-600">
            Nobody has actually argued the other side of this one yet. That is a
            guess at what they&rsquo;d say.
          </p>
        </section>
      ) : null}

      <footer className="border-t border-zinc-800 pt-4 text-[11px] leading-relaxed text-zinc-500">
        A stake locks USDC on Base for {LOCKUP_DAYS} days (${MIN_STAKE}–$
        {MAX_STAKE}). At lockup the side with more{" "}
        <em>amount × time staked</em> wins; winners split the yield plus 10%
        slashed from the losing side&rsquo;s principal. There is no oracle — the
        crowd settles it.
      </footer>
    </main>
  );
}
