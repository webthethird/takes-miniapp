// Persistence layer for the market index.
//
// Two backends:
//   - InMemoryStorage: zero-config, dev-only. State dies on process restart.
//   - UpstashStorage:  real persistence via Upstash Redis (works in dev and
//                      on Vercel). Activated when UPSTASH_REDIS_REST_URL +
//                      UPSTASH_REDIS_REST_TOKEN env vars are set.
//
// Setup for Upstash (free tier is plenty):
//   1. Sign in at https://console.upstash.com (GitHub OAuth)
//   2. Create a new Redis database
//   3. Copy REST_URL + REST_TOKEN into .env
//
// Public API is async on both backends so swapping is transparent.

import { Redis } from "@upstash/redis";
import type { ClaimType } from "@/lib/schema";

export type Position = {
  fid: number;
  side: "yes" | "no";
  amount: number;
  ts: number;
  cast_hash?: string;
};

export type Market = {
  id: string;
  question: string;
  claim_type: ClaimType;
  aspect: string;
  embedding: number[];
  created_at: number;
  positions: Position[];
};

export interface MarketStorage {
  getMarket(id: string): Promise<Market | null>;
  putMarket(market: Market): Promise<void>;
  listMarkets(): Promise<Market[]>;
}

// ──────────────────────────────────────────────────────────────────
// In-memory backend (dev fallback)
// ──────────────────────────────────────────────────────────────────

class InMemoryStorage implements MarketStorage {
  private markets = new Map<string, Market>();

  async getMarket(id: string) {
    return this.markets.get(id) ?? null;
  }
  async putMarket(market: Market) {
    this.markets.set(market.id, market);
  }
  async listMarkets() {
    return [...this.markets.values()];
  }
}

// ──────────────────────────────────────────────────────────────────
// Upstash Redis backend
// ──────────────────────────────────────────────────────────────────
//
// Layout:
//   market:<id>     → JSON-serialized Market (entire blob, embeddings included)
//   markets:index   → set of all market IDs (for list)
//
// Single-blob writes mean addPosition is read-modify-write. For prototype
// scale (≤ low hundreds of markets, ≤ low hundreds of positions per market)
// this is fine. Production path: split metadata from positions, atomic
// counters, dedicated vector store.

const KEY_INDEX = "markets:index";
const keyMarket = (id: string) => `market:${id}`;

class UpstashStorage implements MarketStorage {
  constructor(private redis: Redis) {}

  async getMarket(id: string): Promise<Market | null> {
    const data = await this.redis.get<Market>(keyMarket(id));
    return data ?? null;
  }

  async putMarket(market: Market): Promise<void> {
    await this.redis.set(keyMarket(market.id), market);
    await this.redis.sadd(KEY_INDEX, market.id);
  }

  async listMarkets(): Promise<Market[]> {
    const ids = await this.redis.smembers(KEY_INDEX);
    if (ids.length === 0) return [];
    // mget returns array of T | null; filter nulls (orphaned index entries)
    const blobs = await this.redis.mget<Market[]>(...ids.map(keyMarket));
    return blobs.filter((b): b is Market => b !== null);
  }
}

// ──────────────────────────────────────────────────────────────────
// Resolve backend at module load
// ──────────────────────────────────────────────────────────────────

function makeStorage(): { storage: MarketStorage; backend: "memory" | "upstash" } {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    const redis = new Redis({ url, token });
    return { storage: new UpstashStorage(redis), backend: "upstash" };
  }
  return { storage: new InMemoryStorage(), backend: "memory" };
}

const { storage, backend } = makeStorage();
console.log(`[takes-miniapp] storage backend: ${backend}`);

export { storage, backend };
