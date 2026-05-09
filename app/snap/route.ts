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

/// HTML envelope served to plain GETs (browsers, Farcaster crawlers without
/// the snap Accept header). The `Link` header advertises the snap variant
/// so snap-aware clients can fetch it — per the snap discovery spec, a snap
/// URL "must never be silently missed".
function htmlHeaders(selfUrl: string) {
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    Link: `<${selfUrl}>; rel="alternate"; type="${SNAP_CT}"`,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function htmlPreview(opts: { title: string; description: string }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(opts.title)}</title>
<meta name="description" content="${escapeHtml(opts.description)}">
</head>
<body>
<h1>${escapeHtml(opts.title)}</h1>
<p>${escapeHtml(opts.description)}</p>
</body>
</html>`;
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
  const base = baseUrl(request);
  const selfUrl = `${base}${url.pathname}${url.search}`;

  if (!id) {
    if (wantsSnap)
      return Response.json(notFoundCard(base), { headers: snapHeaders() });
    return new Response(
      htmlPreview({
        title: "Takes",
        description: "Cast an opinion. Back it with USDC.",
      }),
      { headers: htmlHeaders(selfUrl) },
    );
  }

  const market = await getMarket(id);
  if (!market) {
    if (wantsSnap)
      return Response.json(notFoundCard(base, id), { headers: snapHeaders() });
    return new Response(
      htmlPreview({
        title: `Takes — ${id} not found`,
        description: `Couldn't find a market for "${id}".`,
      }),
      { headers: htmlHeaders(selfUrl) },
    );
  }

  if (wantsSnap) {
    return Response.json(marketCard(market, base), { headers: snapHeaders() });
  }

  // Plain GET (browser, Farcaster crawler without the snap Accept header).
  // HTML preview for browsers; Link header lets snap-aware clients discover
  // the snap variant and re-fetch with the right Accept header.
  const t = tally(market);
  return new Response(
    htmlPreview({
      title: market.question,
      description:
        `${t.total_backers} backer${t.total_backers === 1 ? "" : "s"} · ` +
        `$${t.yes_amount} YES · $${t.no_amount} NO`,
    }),
    { headers: htmlHeaders(selfUrl) },
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
  const hasVolume = t.total_amount > 0;
  const isPredictive = market.claim_type === "predictive";

  // Bar chart visualizes STANDING (time-weighted), which is what determines
  // the winner at settlement. Dollar amounts shown in the caption below.
  const yesStanding = hasVolume ? t.yes_standing_pct : 0;
  const noStanding = hasVolume ? 100 - t.yes_standing_pct : 0;

  const deepLinkBase = `${base}/?market=${encodeURIComponent(market.id)}`;

  const rootChildren: string[] = ["title", "meta"];
  if (isPredictive) rootChildren.push("predictiveNote");
  rootChildren.push("comparison");
  if (hasVolume) rootChildren.push("stakesCaption");
  rootChildren.push("actionRow");

  const elements: Record<string, SnapElementInput> = {
    page: { type: "stack", props: {}, children: rootChildren },
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
          { label: "YES", value: yesStanding, color: "green" },
          { label: "NO", value: noStanding, color: "red" },
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

  if (isPredictive) {
    elements.predictiveNote = {
      type: "text",
      props: {
        content:
          "🔮 Resolves by time-weighted stake at lockup — popular side wins, regardless of real-world outcome",
        size: "sm",
      },
    };
  }

  if (hasVolume) {
    elements.stakesCaption = {
      type: "text",
      props: {
        content: `$${t.yes_amount} YES · $${t.no_amount} NO (raw stakes)`,
        size: "sm",
      },
    };
  }

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
              ? "This market is still being indexed — refresh in a moment."
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
