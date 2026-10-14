import { Composer } from "./_components/composer";
import { FeedList } from "./_components/feed-list";
import { OnboardingModal } from "./_components/onboarding-modal";

// The feed is the landing page: arriving at an empty composer and being asked
// to invent a take is the cold-start problem stated as a UI.
//
// `?market=` still opens the composer in reply mode, because every snap embed
// already published to Farcaster deep-links here as `/?market=<id>&side=yes`.
// Those casts are in the wild and can't be edited, so this route has to keep
// honouring them.
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ market?: string; side?: string }>;
}) {
  const { market, side } = await searchParams;
  const initialSide = side === "yes" || side === "no" ? side : undefined;

  if (!market) {
    return (
      <>
        <FeedList />
        <OnboardingModal />
      </>
    );
  }

  return (
    <main className="space-y-5">
      <p className="text-sm text-zinc-400">
        Replying to a Take. Add your reasoning, pick a stake, cast.
      </p>
      <Composer initialMarketId={market} initialSide={initialSide} />
      <OnboardingModal />
    </main>
  );
}
