// One-shot admin: delete every market and its index entry from Upstash.
// Run with: pnpm tsx scripts/clear-markets.ts
import { Redis } from "@upstash/redis";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Tiny .env loader so this works without dotenv installed.
function loadEnv() {
  try {
    const text = readFileSync(resolve(process.cwd(), ".env"), "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // no .env, fall through to whatever's in the env already
  }
}

async function main() {
  loadEnv();
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    console.error(
      "Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN in env",
    );
    process.exit(1);
  }
  const redis = new Redis({ url, token });

  const ids = (await redis.smembers("markets:index")) as string[];
  console.log(`Found ${ids.length} market(s) in markets:index`);
  if (ids.length === 0) {
    console.log("Nothing to clear.");
    return;
  }
  for (const id of ids) {
    console.log(`  - market:${id}`);
  }

  const keys = ids.map((id) => `market:${id}`);
  const deleted = await redis.del(...keys);
  console.log(`Deleted ${deleted} market blob(s).`);

  await redis.del("markets:index");
  console.log("Cleared markets:index.");

  // Sanity check
  const remaining = await redis.smembers("markets:index");
  console.log(`Index now contains: ${remaining.length} market(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
