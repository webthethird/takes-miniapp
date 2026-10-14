#!/usr/bin/env tsx
// Converts a takes-classifier pipeline report into the snapshot this app
// serves. Run it after a classifier run, then commit the result:
//
//   pnpm import-feed ../takes-classifier/feed_1792000264442.json
//
// Trims the report to what the UI actually renders — the classifier's report
// carries rejected casts, per-member similarity and prompt diagnostics that
// are useful when tuning the pipeline and dead weight in a page payload.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
  FeedItem,
  FeedMember,
  FeedSnapshot,
  FeedStance,
} from "../lib/feed-types";

const OUT = resolve(import.meta.dirname, "../lib/feed-snapshot.json");

/// Shape of the classifier report. Loose on purpose: an additive change
/// upstream shouldn't break the import, but anything we actually read is
/// validated below so a breaking change fails loudly here rather than
/// rendering a broken card.
type ReportMember = {
  cast?: Record<string, unknown>;
  stance?: string;
  via?: string;
  challenge_reason?: string;
  confidence?: number;
  challengeability?: number;
};
type ReportItem = Record<string, unknown> & { members?: ReportMember[] };
type Report = Record<string, unknown> & { feed?: ReportItem[] };

function fail(msg: string): never {
  console.error(`[import-feed] ${msg}`);
  process.exit(1);
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}
function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function toMember(m: ReportMember, itemIndex: number): FeedMember {
  const c = m.cast ?? {};
  const id = str(c.id);
  const text = str(c.text);
  if (!id || !text) fail(`item ${itemIndex}: member cast missing id or text`);
  if (m.stance !== "yes" && m.stance !== "no") {
    fail(`item ${itemIndex}: member ${id} has stance ${String(m.stance)}`);
  }
  return {
    cast: {
      id,
      text,
      username: str(c.username),
      fid: num(c.fid),
      ts: str(c.ts),
      channel: str(c.channel) ?? null,
      url: str(c.url),
      replies: num(c.replies),
      recasts: num(c.recasts),
      likes: num(c.likes),
    },
    stance: m.stance as FeedStance,
    via: m.via === "stance" ? "stance" : "claim",
    reason: str(m.challenge_reason) ?? "",
    confidence: num(m.confidence) ?? 0,
  };
}

function toItem(raw: ReportItem, i: number): FeedItem {
  const id = str(raw.id);
  const question = str(raw.question);
  const repId = str(raw.representative_cast_id);
  if (!id || !question) fail(`item ${i}: missing id or question`);
  if (!repId) {
    fail(
      `item ${i} has no representative_cast_id — the report predates cast-first rendering, re-run the classifier`,
    );
  }
  const members = (raw.members ?? []).map((m) => toMember(m, i));
  if (members.length === 0) fail(`item ${i}: no members`);
  if (!members.some((m) => m.cast.id === repId)) {
    fail(`item ${i}: representative ${repId} is not among its own members`);
  }

  const back = raw.back_means === "no" ? "no" : "yes";
  const challenge = back === "yes" ? "no" : "yes";
  // The report carries these too; recomputing and comparing catches an
  // upstream inconsistency rather than silently rendering a wrong button.
  if (str(raw.challenge_means) && raw.challenge_means !== challenge) {
    fail(`item ${i}: back/challenge disagree in the report`);
  }

  const opposing = str(raw.opposing_cast_id) ?? null;
  if (opposing && !members.some((m) => m.cast.id === opposing)) {
    fail(`item ${i}: opposing cast ${opposing} is not among its members`);
  }

  const claimType = str(raw.claim_type) ?? "evaluative";

  return {
    id,
    question,
    claim_type: claimType as FeedItem["claim_type"],
    aspect: str(raw.aspect) ?? "",
    challengeability: Math.max(
      ...members.map((_, idx) => num(raw.members?.[idx]?.challengeability) ?? 0),
      0,
    ),
    score: num(raw.score) ?? 0,
    both_sides: raw.both_sides === true,
    challenge_reason: str(raw.challenge_reason) ?? "",
    representative_cast_id: repId,
    back_means: back,
    challenge_means: challenge,
    opposing_cast_id: opposing,
    members,
    yes_casts: num(raw.yes_casts) ?? 0,
    no_casts: num(raw.no_casts) ?? 0,
    yes_authors: num(raw.yes_authors) ?? 0,
    no_authors: num(raw.no_authors) ?? 0,
    distinct_authors: num(raw.distinct_authors) ?? 0,
  };
}

function main() {
  const input = process.argv[2];
  if (!input) {
    console.error(
      "Usage: pnpm import-feed <path to takes-classifier feed_*.json>",
    );
    process.exit(1);
  }

  let report: Report;
  try {
    report = JSON.parse(readFileSync(input, "utf8")) as Report;
  } catch (e) {
    fail(`could not read ${input}: ${String(e)}`);
  }
  if (!Array.isArray(report.feed) || report.feed.length === 0) {
    fail("report has no feed array — did the classifier run produce cards?");
  }

  const items = report.feed.map(toItem);

  // One cast must front at most one card; the classifier guarantees this, and
  // checking here means a stale report can't reintroduce duplicates.
  const reps = items.map((it) => it.representative_cast_id);
  const dupes = reps.filter((r, i) => reps.indexOf(r) !== i);
  if (dupes.length > 0) {
    fail(`${dupes.length} cast(s) front more than one card: ${dupes.join(", ")}`);
  }

  const snapshot: FeedSnapshot = {
    generated_at: str(report.generated_at) ?? new Date().toISOString(),
    sources: Array.isArray(report.sources)
      ? report.sources.filter((s): s is string => typeof s === "string")
      : [],
    items,
    stats: {
      casts_considered: num(report.total_casts) ?? 0,
      opinions_found: num(report.opinion_casts) ?? 0,
      rejected: num(report.rejected_casts) ?? 0,
      threads: num(report.threads) ?? 0,
      contested: num(report.both_sides_clusters) ?? 0,
      predictions_filtered: num(report.resolvable_claims_dropped) ?? 0,
    },
  };

  writeFileSync(OUT, JSON.stringify(snapshot, null, 2) + "\n");

  const withOpposition = items.filter((i) => i.opposing_cast_id).length;
  console.error(
    `[import-feed] ${items.length} cards -> lib/feed-snapshot.json\n` +
      `  contested: ${items.filter((i) => i.both_sides).length}\n` +
      `  with a real opposing cast: ${withOpposition}\n` +
      `  generated: ${snapshot.generated_at}`,
  );
}

main();
