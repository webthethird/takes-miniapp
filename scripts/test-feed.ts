#!/usr/bin/env tsx
// Assertions over the feed snapshot and its transforms.
//
// Two jobs. The transforms are pure and worth pinning (especially the
// back/challenge mapping, where an inversion would silently put a user on the
// side they meant to argue against). And the committed snapshot is real data
// that ships to the demo URL, so its invariants are checked here rather than
// discovered by a visitor.
//
//   pnpm test

import {
  actionStances,
  getFeedItem,
  getSnapshot,
  listFeed,
  opposingOf,
  participation,
  representativeOf,
  supportingCasts,
} from "../lib/feed";

let passed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean) {
  if (cond) passed++;
  else failures.push(name);
}
function eq<T>(name: string, actual: T, expected: T) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed++;
  else
    failures.push(
      `${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
}

const items = listFeed();
const snapshot = getSnapshot();

/* ─────────────────────── snapshot invariants ───────────────────────── */

check("snapshot has cards", items.length > 0);
check(
  "generated_at is a real date",
  !Number.isNaN(new Date(snapshot.generated_at).getTime()),
);

eq(
  "every card id is unique",
  items.length,
  new Set(items.map((i) => i.id)).size,
);

// A cast fronting two cards shows the same words twice under different
// questions — the duplication bug this guards against.
eq(
  "no cast fronts more than one card",
  items.length,
  new Set(items.map((i) => i.representative_cast_id)).size,
);

check(
  "every card's representative is one of its own members",
  items.every((i) =>
    i.members.some((m) => m.cast.id === i.representative_cast_id),
  ),
);

check(
  "every cast has non-empty text",
  items.every((i) => i.members.every((m) => m.cast.text.trim().length > 0)),
);

check(
  "every card has at least one member",
  items.every((i) => i.members.length > 0),
);

// Attribution is what makes a stance assertion checkable by a reader.
check(
  "every lead cast has an author and a source link",
  items.every((i) => {
    const r = representativeOf(i);
    return Boolean(r.cast.username) && Boolean(r.cast.url);
  }),
);

check(
  "contested cards really do have two different people on opposite sides",
  items
    .filter((i) => i.both_sides)
    .every((i) => {
      const who = (s: "yes" | "no") =>
        new Set(
          i.members
            .filter((m) => m.stance === s)
            .map((m) => m.cast.fid ?? m.cast.username ?? m.cast.id),
        );
      const yes = who("yes");
      const no = who("no");
      return [...yes].some((y) => [...no].some((n) => n !== y));
    }),
);

check(
  "an opposing cast, where present, really opposes the lead cast",
  items.every((i) => {
    const opp = opposingOf(i);
    if (!opp) return true;
    const rep = representativeOf(i);
    return opp.stance !== rep.stance && opp.cast.id !== rep.cast.id;
  }),
);

check(
  "cards with no real opposition carry an AI hypothesis instead",
  items
    .filter((i) => !i.opposing_cast_id)
    .every((i) => i.challenge_reason.trim().length > 0),
);

check(
  "author counts never exceed cast counts",
  items.every(
    (i) => i.yes_authors <= i.yes_casts && i.no_authors <= i.no_casts,
  ),
);

/* ────────────────────────── transforms ─────────────────────────────── */

// The mapping that matters most: Back means the lead author's own side, and
// Challenge is its inverse. Getting this backwards stakes a user against the
// person they meant to support.
check(
  "Back always matches the lead cast's stance",
  items.every((i) => actionStances(i).back === representativeOf(i).stance),
);
check(
  "Challenge is always the opposite of Back",
  items.every((i) => {
    const { back, challenge } = actionStances(i);
    return back !== challenge;
  }),
);

check(
  "supporting casts exclude the lead and the highlighted rebuttal",
  items.every((i) => {
    const rep = representativeOf(i);
    const opp = opposingOf(i);
    const rest = supportingCasts(i);
    return (
      !rest.some((m) => m.cast.id === rep.cast.id) &&
      !rest.some((m) => m.cast.id === opp?.cast.id)
    );
  }),
);

check(
  "every member is accounted for exactly once on a card",
  items.every((i) => {
    const rep = representativeOf(i);
    const opp = opposingOf(i);
    const shown = 1 + (opp ? 1 : 0) + supportingCasts(i).length;
    return shown === i.members.length;
  }),
);

{
  const first = items[0];
  eq("getFeedItem finds a card by id", getFeedItem(first.id)?.id, first.id);
  eq("getFeedItem returns null for an unknown id", getFeedItem("nope"), null);
}

// Counts are described as casts and people, never as stake or votes.
check(
  "participation names both casts and people",
  items.every((i) => {
    const s = participation(i);
    return (
      s.includes("cast") && (s.includes("person") || s.includes("people"))
    );
  }),
);
eq(
  "participation is singular for a one-cast, one-person card",
  participation({
    ...items[0],
    yes_casts: 1,
    no_casts: 0,
    distinct_authors: 1,
  }),
  "1 cast · 1 person",
);

/* ───────────────────────────── results ─────────────────────────────── */

if (failures.length) {
  console.error(`\n${failures.length} FAILED:`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error(`\n${passed} passed, ${failures.length} failed`);
  process.exit(1);
}
console.log(`${passed} passed (${items.length} cards in snapshot)`);
