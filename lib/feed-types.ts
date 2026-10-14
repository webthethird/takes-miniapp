// The contract between takes-classifier's pipeline output and this app.
//
// The app reads a committed snapshot rather than classifying on demand:
// classification is slow and paid, the feed changes on the order of hours, and
// a demo URL has to load fast for someone who has never heard of Takes. Import
// a fresh one with `pnpm import-feed <path-to-feed_*.json>`.
//
// Deliberately NOT a live ingestion service. See README.

export type FeedStance = "yes" | "no";

export type FeedCast = {
  /// Farcaster cast hash.
  id: string;
  text: string;
  username?: string;
  fid?: number;
  /// ISO timestamp.
  ts?: string;
  channel?: string | null;
  /// Permalink back to the original cast.
  url?: string;
  replies?: number;
  recasts?: number;
  likes?: number;
};

export type FeedMember = {
  cast: FeedCast;
  stance: FeedStance;
  /// "claim" — the question was extracted from this cast (stage 1).
  /// "stance" — this cast was judged against an existing question (stage 2).
  via: "claim" | "stance";
  /// Why the classifier placed this cast on this side. For stage-2 members
  /// this is a reading of a real reply; for stage-1 it describes the claim.
  reason: string;
  confidence: number;
};

export type FeedItem = {
  id: string;
  /// Canonical YES/NO question. Secondary to the cast in presentation — the
  /// person and their words lead.
  question: string;
  claim_type: "predictive" | "evaluative" | "prescriptive" | "descriptive";
  aspect: string;
  /// How much the question invites someone to take the other side.
  challengeability: number;
  /// Ranking score. Challengeability banded, then corroboration within band.
  score: number;
  /// True only when DIFFERENT PEOPLE hold opposing stances.
  both_sides: boolean;
  /// An AI-generated hypothesis about what the other side would say. Shown
  /// only when no real opposing cast exists, and always labelled as such.
  challenge_reason: string;
  /// The real cast that fronts this card.
  representative_cast_id: string;
  /// What Back / Challenge mean relative to the representative cast's own
  /// stance. Resolved upstream so the UI can never disagree with the pipeline.
  back_means: FeedStance;
  challenge_means: FeedStance;
  /// A real opposing cast, when one exists. Evidence, not hypothesis.
  opposing_cast_id: string | null;
  members: FeedMember[];
  /// Casts per side, and distinct people per side. These are different
  /// numbers: one author posting four times is not four people. Neither is a
  /// stake, a vote, or a poll.
  yes_casts: number;
  no_casts: number;
  yes_authors: number;
  no_authors: number;
  distinct_authors: number;
};

export type FeedSnapshot = {
  /// When the underlying classifier run happened.
  generated_at: string;
  /// Where the casts came from (channels, searches).
  sources: string[];
  items: FeedItem[];
  stats: {
    casts_considered: number;
    opinions_found: number;
    rejected: number;
    threads: number;
    contested: number;
    predictions_filtered: number;
  };
};
