# takes-miniapp

The Farcaster mini app for **Takes** — an on-chain opinion market. Type a take, it gets classified into a canonical YES/NO question, and you back your side with USDC on Base. There is no oracle: the time-weighted popular side wins at lockup.

Part of a three-repo project:

- **takes-miniapp** (this repo) — Next.js mini app, the whole user-facing surface
- [takes-contracts](https://github.com/webthethird/takes-contracts) — Foundry project: factory + per-question markets on Base
- [takes-classifier](https://github.com/webthethird/takes-classifier) — offline prototype for the classification/clustering logic that ships in `lib/`

## Status

Deployed to Vercel at [takes-miniapp.vercel.app](https://takes-miniapp.vercel.app), pointed at the **Base Sepolia** factory. Works end to end inside Farcaster on mobile: classify → stake → cast.

**Development is paused.** The flow works; it never found an audience. A time-weighted market needs both sides staked before the standing means anything, and the cold-start problem — getting enough people into a two-sided market from zero — is what actually killed it, not the mechanics.

## How it works

```
cast text ──▶ Claude (structured output) ──▶ canonical YES/NO question
                                                      │
                                      embed + cosine match vs market index
                                                      │
                               ┌──────────────────────┴─────────────────┐
                        existing market                           new market
                               └──────────────────────┬─────────────────┘
                                                      ▼
                             factory.stake(hash, question, lockup, side, amount)
                                                      ▼
                                  cast with a live /snap embed showing the tally
```

**1. Classify as you type.** Debounced `POST /api/classify` sends the draft to
Claude Haiku 4.5 with a zod-enforced output schema. It decides whether the cast
carries an opinion at all (filtering news reports, airdrop spam, greetings, and
help-seeking questions), then extracts a YES/NO question in *canonical positive
framing* plus the caster's stance. Framing is the whole trick: "the airdrop was
unfair" and "the airdrop was great" must both produce `"Was the $SNAP airdrop
fair?"` and differ only in the answer, or the same argument fragments into two
markets that never meet.

**2. Match or propose.** The question is embedded (OpenAI
`text-embedding-3-small`) and compared by cosine similarity against existing
markets of the same claim type: ≥ 0.85 joins that market, ≥ 0.70 is flagged
ambiguous, below that proposes a new one. Proposed markets are *not* persisted
until someone actually stakes, so the index doesn't fill with abandoned drafts.

**3. Stake on-chain.** One `factory.stake(...)` call creates the market if needed
and records the position. Because USDC allowance is scoped to the factory — a
single fixed address — the first stake prompts a max approval and every stake
after that, on any market, is one transaction.

**4. Cast with a live embed.** The cast embeds `/snap?market=<id>`, which Farcaster
clients re-fetch on every render, so the tally in the feed stays current instead
of freezing at cast time. Its buttons deep-link back into the app at
`/?market=<id>&side=yes|no`, which opens the composer in reply mode with the side
pre-picked.

## Mechanism (what users are agreeing to)

- Stake **$1–$1,000** USDC per market. Funds lock for **30 days** — no early exit.
- Staked USDC sits in an ERC-4626 yield vault for the lockup.
- Every position accrues `amount × seconds locked`. At lockup end, the side with more units wins.
- Winners split the yield pool pro-rata to their units, plus **10%** slashed from losing principal.
- Losers get 90% of principal back. Ties pay yield to everyone and slash nobody.

Being early and staying is what pays. See
[takes-contracts](https://github.com/webthethird/takes-contracts) for the full
settlement rules, including the impaired and escrow-failure paths.

## Layout

```
app/
├── page.tsx                      compose (or reply, via ?market=&side=)
├── browse/page.tsx               all markets with live tallies
├── snap/route.ts                 Farcaster snap; serves snap JSON or HTML by Accept header
├── api/
│   ├── classify/route.ts         cast text → claim → matched/proposed market
│   └── markets/
│       ├── route.ts              GET list
│       └── [id]/
│           ├── route.ts          GET one
│           └── positions/route.ts POST a position (commits the market on first stake)
└── _components/
    ├── composer.tsx              the main surface: classify, stake, cast
    ├── onboarding-modal.tsx      first-open mechanic explainer
    └── emoji-picker.tsx
lib/
├── classify.ts                   Claude call + system prompt (canonical framing rules)
├── embed.ts                      OpenAI embeddings + cosine
├── market-index.ts               match/propose/commit, time-weighted tally
├── storage.ts                    MarketStorage: Upstash Redis, in-memory fallback
├── onchain.ts                    EIP-1193 stake flow (approve + factory.stake)
├── contracts.ts                  chain, addresses, ABIs
└── constants.ts                  stake bounds, lockup, match thresholds
```

## Setup

```sh
pnpm install
cp .env.example .env.local   # then fill in the keys below
pnpm dev
```

| Variable | Required | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | yes | classification |
| `OPENAI_API_KEY` | yes | question embeddings |
| `UPSTASH_REDIS_REST_URL` | no | persistence; falls back to in-memory |
| `UPSTASH_REDIS_REST_TOKEN` | no | — |
| `NEXT_PUBLIC_BASE_URL` | no | pins absolute URLs for snap embeds; inferred from request headers otherwise |

Without Upstash credentials the app runs on an in-memory store that resets on
every process restart — fine for local work, useless on serverless. The backend
in use is logged at startup.

Market storage is a single JSON blob per market (`market:<id>`) plus an index set,
so recording a position is read-modify-write. Fine at prototype scale; a real
deployment wants positions split out and a dedicated vector store.

### Testing inside Farcaster

The wallet flow needs a real Farcaster client — browsers have no
`sdk.wallet.getEthereumProvider()`. Deploy a preview, then open it from a cast or
via the mini-app developer tools. `public/.well-known/farcaster.json` holds the
manifest and the domain account association, so the signature is tied to the
deployed domain and must be regenerated if the domain changes.

`pnpm tsx scripts/clear-markets.ts` wipes the market index when testing against a
fresh factory deployment.

### Pointing at a new factory

Update `TAKES_FACTORY` (and `USDC`/`CHAIN` if the network changes) in
`lib/contracts.ts`. Factory signatures changed across versions, so a redeploy of
the contracts means a matching ABI update here. Clear the market index too —
stored markets reference on-chain markets that no longer exist.

## Notes for anyone picking this up

- **Next.js 16.** See `AGENTS.md`: this version has breaking changes from older App Router conventions. `params` and `searchParams` are promises.
- **`lib/onchain.ts` calls `provider.request` directly** instead of using viem's `walletClient`. That isn't a style preference — viem's abstraction layers hung the Farcaster in-app wallet's Confirm button on mobile. Transaction params are built as strings only, with a 60s timeout, because undefined values choke some mobile providers. EIP-5792 batching was tried and reverted; the factory-routed single-tx path replaced the need for it.
- **Aspect tags aren't used for matching** in the app (unlike the offline prototype). The classifier drifts between "airdrop fairness" and "fairness", and the question embedding does the real work anyway.
- **`recordPosition` is first-stake-wins per FID** in the off-chain index, while the contracts now allow same-side top-ups. The off-chain index lags the contract here.
- **The off-chain tally is display-only.** It weights by time elapsed *so far*, while the contract freezes units at `lockupEnd`. Both use the same `amount × time` formula; only the endpoint differs. Settlement is always the contract's.
