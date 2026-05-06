// Snap route — same URL serves snap JSON to Farcaster clients (when Accept
// header is right) and a plain text fallback to browsers.
//
// Cast embeds in the feed call this URL on every render, so the snap stays
// live (re-fetched, not cached). That's the whole point of using snaps over
// frame embeds.

import {
  SPEC_VERSION,
  type SnapElementInput,
  type SnapHandlerResult,
} from "@farcaster/snap";
import { getMarket, tally } from "@/lib/market-index";
import type { Market } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SNAP_CT = "application/vnd.farcaster.snap+json";

function snapHeaders() {
  return {
    "Content-Type": SNAP_CT + "; charset=utf-8",
    "Cache-Control": "no-store",
  };
}

function textHeaders() {
  return { "Content-Type": "text/plain; charset=utf-8" };
}

function baseUrl(request: Request): string {
  const fromEnv = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const fwdHost = request.headers.get("x-forwarded-host");
  const host = (fwdHost ?? request.headers.get("host"))?.split(",")[0].trim();
  if (!host) return "http://localhost:3000";
  const isLocal = /^(localhost|127\.0\.0\.1|\[::1\]|::1)(:\d+)?$/.test(host);
  const fwdProto = request.headers.get("x-forwarded-proto");
  const proto = fwdProto?.split(",")[0].trim() ?? (isLocal ? "http" : "https");
  return `${proto}://${host}`.replace(/\/$/, "");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("market");
  const accept = request.headers.get("accept") || "";
  const wantsSnap = accept.includes(SNAP_CT);

  if (!id) {
    if (wantsSnap)
      return Response.json(notFoundCard(baseUrl(request)), { headers: snapHeaders() });
    return new Response("Takes — missing ?market= query param", { headers: textHeaders() });
  }

  const market = await getMarket(id);
  if (!market) {
    if (wantsSnap)
      return Response.json(notFoundCard(baseUrl(request), id), { headers: snapHeaders() });
    return new Response(`Takes — market ${id} not found`, { headers: textHeaders() });
  }

  if (wantsSnap) {
    return Response.json(marketCard(market, baseUrl(request)), { headers: snapHeaders() });
  }
  // Browser fallback: plain text describing the market
  const t = tally(market);
  return new Response(
    `Takes market: ${market.question}\n` +
      `${t.total_backers} backer${t.total_backers === 1 ? "" : "s"} · ` +
      `$${t.yes_amount} YES · $${t.no_amount} NO`,
    { headers: textHeaders() },
  );
}

function clamp(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

function formatVotes(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function marketCard(market: Market, base: string): SnapHandlerResult {
  const t = tally(market);
  const total = Math.max(t.total_amount, 1);
  const yesPct = Math.round((t.yes_amount / total) * 100);
  const noPct = 100 - yesPct;
  const hasVolume = t.total_amount > 0;

  const deepLinkBase = `${base}/?market=${encodeURIComponent(market.id)}`;

  const elements: Record<string, SnapElementInput> = {
    page: {
      type: "stack",
      props: {},
      children: ["title", "meta", "comparison", "actionRow"],
    },
    title: {
      type: "text",
      props: { content: clamp(market.question, 320), weight: "bold" },
    },
    meta: {
      type: "text",
      props: {
        content: hasVolume
          ? `${market.claim_type} · ${formatVotes(t.total_backers)} backer${t.total_backers === 1 ? "" : "s"} · $${t.total_amount} staked`
          : `${market.claim_type} · be the first to back this Take`,
        size: "sm",
      },
    },
    comparison: {
      type: "bar_chart",
      props: {
        max: 100,
        bars: [
          {
            label: clamp(hasVolume ? `YES — $${t.yes_amount}` : "YES", 40),
            value: hasVolume ? yesPct : 0,
            color: "green",
          },
          {
            label: clamp(hasVolume ? `NO — $${t.no_amount}` : "NO", 40),
            value: hasVolume ? noPct : 0,
            color: "red",
          },
        ],
      },
    },
    actionRow: {
      type: "stack",
      props: { direction: "horizontal" },
      children: ["yesBtn", "noBtn"],
    },
    yesBtn: {
      type: "button",
      props: { label: "Back YES", variant: "primary" },
      on: {
        press: {
          action: "open_mini_app",
          params: { target: `${deepLinkBase}&side=yes` },
        },
      },
    },
    noBtn: {
      type: "button",
      props: { label: "Back NO" },
      on: {
        press: {
          action: "open_mini_app",
          params: { target: `${deepLinkBase}&side=no` },
        },
      },
    },
  };

  return {
    version: SPEC_VERSION,
    theme: { accent: "purple" },
    ui: { root: "page", elements },
  };
}

function notFoundCard(base: string, id?: string): SnapHandlerResult {
  return {
    version: SPEC_VERSION,
    theme: { accent: "purple" },
    ui: {
      root: "page",
      elements: {
        page: { type: "stack", props: {}, children: ["title", "body", "openBtn"] },
        title: {
          type: "text",
          props: { content: "Takes", weight: "bold" },
        },
        body: {
          type: "text",
          props: {
            content: id
              ? clamp(`Couldn't find a Takes market for "${id}".`, 320)
              : "Open Takes to cast an opinion as a stake.",
            size: "sm",
          },
        },
        openBtn: {
          type: "button",
          props: { label: "Open Takes", variant: "primary" },
          on: {
            press: { action: "open_mini_app", params: { target: base } },
          },
        },
      },
    },
  };
}
