import type { Metadata } from "next";
import "./globals.css";
import { ReadySignal } from "./_components/ready-signal";

export const metadata: Metadata = {
  title: "Takes",
  description: "Stake on Takes. Cast an opinion, back it with USDC, see who else is on your side.",
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
        <div className="mx-auto max-w-xl px-4 py-6">{children}</div>
      </body>
    </html>
  );
}
