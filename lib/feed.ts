// Read access to the committed feed snapshot, plus the transforms the UI
// needs. Pure functions over static data — no network, no wallet, no database.
// That's what lets the feed render for someone who has never opened Farcaster.

import snapshot from "./feed-snapshot.json";
import type {
  FeedItem,
  FeedMember,
  FeedSnapshot,
  FeedStance,
} from "./feed-types";

const feed = snapshot as FeedSnapshot;

export type { FeedItem, FeedMember, FeedStance } from "./feed-types";

export function getSnapshot(): FeedSnapshot {
  return feed;
}

export function listFeed(): FeedItem[] {
  return feed.items;
}

export function getFeedItem(id: string): FeedItem | null {
  return feed.items.find((i) => i.id === id) ?? null;
}

/// The cast that fronts a card. Falls back to the first member so a snapshot
/// that somehow lost its representative still renders something real rather
/// than throwing on a page view.
export function representativeOf(item: FeedItem): FeedMember {
  return (
    item.members.find((m) => m.cast.id === item.representative_cast_id) ??
    item.members[0]
  );
}

/// A real cast disagreeing with the representative, when one exists. This is
/// evidence; `challenge_reason` is an AI hypothesis. The UI must never present
/// them the same way.
export function opposingOf(item: FeedItem): FeedMember | null {
  if (!item.opposing_cast_id) return null;
  return item.members.find((m) => m.cast.id === item.opposing_cast_id) ?? null;
}

/// Everything except the lead cast and the highlighted rebuttal — shown in a
/// disclosure so the card stays readable but nothing is hidden.
export function supportingCasts(item: FeedItem): FeedMember[] {
  const rep = representativeOf(item);
  const opp = opposingOf(item);
  return item.members.filter(
    (m) => m.cast.id !== rep.cast.id && m.cast.id !== opp?.cast.id,
  );
}

/// What backing or challenging THIS CARD commits you to, in canonical terms.
///
/// Phrased relative to the person, not the question: a reader should never
/// need to understand canonical positive framing to disagree with someone. If
/// the lead cast argues `no` on a positively-framed question, "Back" is a `no`
/// stake and "Challenge" is a `yes` stake.
export function actionStances(item: FeedItem): {
  back: FeedStance;
  challenge: FeedStance;
} {
  return { back: item.back_means, challenge: item.challenge_means };
}

/// Human label for counts, keeping casts and people distinct. One author
/// posting four times is not four people, and none of this is stake or votes.
export function participation(item: FeedItem): string {
  const casts = item.yes_casts + item.no_casts;
  const people = item.distinct_authors;
  const c = `${casts} cast${casts === 1 ? "" : "s"}`;
  const p = `${people} ${people === 1 ? "person" : "people"}`;
  return `${c} · ${p}`;
}

export function formatDate(ts?: string): string {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
