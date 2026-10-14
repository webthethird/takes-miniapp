"use client";

// Primary navigation.
//
// Now that the feed is the landing page, the composer is something you have to
// notice rather than the thing you arrive at — so these read as real tabs with
// an active state, not muted text links. The previous styling was quiet enough
// that a visitor could reasonably conclude the feed was the whole app.

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Feed" },
  { href: "/compose", label: "Compose" },
  { href: "/browse", label: "Markets" },
] as const;

export function SiteNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="flex gap-0.5 rounded-lg border border-zinc-800 bg-zinc-900/80 p-0.5 text-sm"
    >
      {TABS.map((tab) => {
        // "/" is only active when it's exactly the root; /feed/<id> belongs to
        // the feed, and everything else matches by prefix.
        const active =
          tab.href === "/"
            ? pathname === "/" || pathname.startsWith("/feed")
            : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 font-medium transition ${
              active
                ? "bg-purple-600 text-white"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
