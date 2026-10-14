import type { Metadata } from "next";
import { Composer } from "@/app/_components/composer";
import { OnboardingModal } from "@/app/_components/onboarding-modal";

export const metadata: Metadata = {
  title: "Compose · Takes",
  description:
    "Write your own take. Takes turns it into a yes/no question and finds or creates the market.",
};

// The original product surface, now a deliberate destination rather than the
// first thing you land on. Writing a take from scratch is the harder ask; the
// feed is where someone with no opinion of their own can still participate.
export default function Compose() {
  return (
    <main className="space-y-5">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">
          Write your own take
        </h2>
        <p className="max-w-prose text-sm text-zinc-400">
          Type an opinion and Takes turns it into a yes/no question, then finds
          the matching market or opens a new one.
        </p>
      </header>
      <Composer />
      <OnboardingModal />
    </main>
  );
}
