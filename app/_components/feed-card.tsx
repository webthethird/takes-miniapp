// Cast-first feed card. A real person's words lead; the canonical question
// Takes derived from them is subordinate.
//
// This ordering is the product argument, not a style choice. The question
// supplies normalization — it's what lets two people who disagree land in the
// same market. The cast supplies the person, the context and the reason anyone
// cares. Nobody wants to argue with a debate prompt; they want to argue with
// someone who said something.
//
// Server component: no wallet, no client JS. The feed must render for a
// visitor who has never opened Farcaster.

import Link from "next/link";
import {
  formatDate,
  opposingOf,
  participation,
  representativeOf,
  type FeedItem,
  type FeedMember,
} from "@/lib/feed";

export function Provenance({ cast }: { cast: FeedMember["cast"] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-zinc-500">
      <span className="font-mono text-xs font-semibold text-zinc-300">
        @{cast.username ?? "unknown"}
      </span>
      {cast.channel ? <span>/{cast.channel}</span> : null}
      {cast.ts ? <span>{formatDate(cast.ts)}</span> : null}
      {cast.url ? (
        <a
          href={cast.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-purple-400 hover:underline"
          // The card asserts a stance on someone's behalf; the source has to
          // be one click away so that assertion is checkable.
        >
          on Farcaster ↗
        </a>
      ) : null}
    </div>
  );
}

/// A cast's own words, with its line breaks intact.
///
/// Farcaster casts are written as short paragraphs and read as walls without
/// them — the lead quote was collapsing 26 paragraph breaks into one block.
///
/// Long casts are clamped in the feed and shown whole on the detail page: a
/// 2,800-character cast otherwise pushes the question and the Back/Challenge
/// buttons off the bottom of the card, which buries the thing the card is for.
const CLAMP_OVER_CHARS = 700;

export function CastQuote({
  text,
  clamp = false,
  href,
}: {
  text: string;
  clamp?: boolean;
  href?: string;
}) {
  const long = clamp && text.length > CLAMP_OVER_CHARS;
  return (
    <div className="space-y-1.5">
      <blockquote
        className={`whitespace-pre-wrap break-words border-l-[3px] border-purple-500 pl-3.5 text-[17px] leading-relaxed text-zinc-100 ${
          long ? "line-clamp-[14]" : ""
        }`}
      >
        {text}
      </blockquote>
      {long && href ? (
        <Link
          href={href}
          className="ml-3.5 inline-block text-[12px] font-medium text-purple-400 hover:underline"
        >
          Read the full cast →
        </Link>
      ) : null}
    </div>
  );
}

export function StanceChip({ stance }: { stance: "yes" | "no" }) {
  // Amber/cyan rather than green/red: Takes does not adjudicate truth, so the
  // palette must not imply one side is correct.
  const cls =
    stance === "yes"
      ? "bg-amber-950 text-amber-400"
      : "bg-cyan-950 text-cyan-400";
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${cls}`}
    >
      {stance}
    </span>
  );
}

export function CastBlock({
  member,
  highlight,
}: {
  member: FeedMember;
  highlight?: boolean;
}) {
  const border =
    member.stance === "yes" ? "border-l-amber-500" : "border-l-cyan-500";
  return (
    <li
      className={`rounded-lg border-l-[3px] bg-zinc-900/60 p-3 ${border} ${
        highlight ? "ring-1 ring-cyan-900" : ""
      }`}
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <Provenance cast={member.cast} />
        <StanceChip stance={member.stance} />
        {member.via === "stance" ? (
          <span className="rounded border border-zinc-700 px-1.5 py-px text-[10px] uppercase tracking-wide text-zinc-500">
            reply
          </span>
        ) : null}
      </div>
      <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-zinc-300">
        {member.cast.text}
      </p>
    </li>
  );
}

export function FeedCard({ item, rank }: { item: FeedItem; rank: number }) {
  const rep = representativeOf(item);
  const opposing = opposingOf(item);
  const engagement = [
    item.members.length > 1 ? null : undefined,
    rep.cast.likes !== undefined ? `${rep.cast.likes} likes` : null,
    rep.cast.recasts !== undefined ? `${rep.cast.recasts} recasts` : null,
    rep.cast.replies !== undefined ? `${rep.cast.replies} replies` : null,
  ]
    .filter((x): x is string => typeof x === "string")
    .join(" · ");

  return (
    <article className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <header className="flex items-start justify-between gap-3">
        <Provenance cast={rep.cast} />
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-zinc-600">
          {String(rank).padStart(2, "0")}
        </span>
      </header>

      <CastQuote
        text={rep.cast.text}
        clamp
        href={`/feed/${encodeURIComponent(item.id)}`}
      />

      {engagement ? (
        <p className="font-mono text-[11px] text-zinc-600">{engagement}</p>
      ) : null}

      <div className="space-y-1 rounded-lg border border-zinc-800 bg-zinc-900/70 p-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-purple-400">
          ✦ Takes identified
        </p>
        <p className="text-sm font-semibold leading-snug text-zinc-100">
          {item.question}
        </p>
        <p className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
          <span>
            @{rep.cast.username ?? "unknown"} is arguing{" "}
            <strong
              className={
                rep.stance === "yes" ? "text-amber-400" : "text-cyan-400"
              }
            >
              {rep.stance}
            </strong>
          </span>
          {item.both_sides ? (
            <span className="rounded-full bg-purple-950 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-purple-300">
              contested
            </span>
          ) : null}
        </p>
      </div>

      {opposing ? (
        <div className="space-y-1.5 rounded-lg bg-cyan-950/40 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">
            Someone already disagrees
          </p>
          <Provenance cast={opposing.cast} />
          <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-zinc-300">
            {opposing.cast.text}
          </p>
        </div>
      ) : (
        <p className="text-[13px] leading-relaxed text-zinc-500">
          {/* An AI guess at the counterargument, visibly distinct from a real
              opposing cast. Evidence and hypothesis must not look alike. */}
          <span className="mr-1.5 rounded border border-dashed border-purple-500 px-1.5 py-px text-[10px] font-bold uppercase tracking-wider text-purple-400">
            AI hypothesis
          </span>
          {item.challenge_reason}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        <Link
          href={`/feed/${encodeURIComponent(item.id)}?side=back`}
          className="rounded-lg border border-purple-600 px-3 py-1.5 text-[13px] font-semibold text-purple-300 transition hover:bg-purple-950"
        >
          Back @{rep.cast.username ?? "this take"}
        </Link>
        <Link
          href={`/feed/${encodeURIComponent(item.id)}?side=challenge`}
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-[13px] font-semibold text-zinc-300 transition hover:border-zinc-500"
        >
          Challenge
        </Link>
        <Link
          href={`/feed/${encodeURIComponent(item.id)}`}
          className="ml-auto font-mono text-[11px] text-zinc-500 hover:text-zinc-300"
        >
          {participation(item)} →
        </Link>
      </div>
    </article>
  );
}
