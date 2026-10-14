import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { ReadySignal } from "./_components/ready-signal";
import { SiteNav } from "./_components/site-nav";

export const metadata: Metadata = {
  title: "Takes",
  description:
    "Real Farcaster opinions, ranked by how much they invite an argument. Back the person who said it, or challenge them, with USDC on Base.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-zinc-950 text-zinc-100">
        <ReadySignal />
        <div className="mx-auto max-w-xl px-4 py-6">
          <header className="mb-5 flex items-center justify-between">
            <Link
              href="/"
              className="text-2xl font-semibold tracking-tight hover:text-zinc-300"
            >
              Takes
            </Link>
            <SiteNav />
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
