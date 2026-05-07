import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { ReadySignal } from "./_components/ready-signal";

export const metadata: Metadata = {
  title: "Takes",
  description:
    "Stake on Takes. Cast an opinion, back it with USDC, see who else is on your side.",
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
            <nav className="flex gap-1 text-sm">
              <Link
                href="/"
                className="rounded-md px-3 py-1.5 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
              >
                Compose
              </Link>
              <Link
                href="/browse"
                className="rounded-md px-3 py-1.5 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
              >
                Browse
              </Link>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
