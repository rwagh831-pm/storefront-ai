// Storage for published stores and their view/click counts.
// Production (Vercel): Upstash Redis (free tier) via environment variables.
// Local dev without Redis: an in-memory map (data is lost on restart — fine for building).
import { Redis } from "@upstash/redis";
import type { Store } from "./schemas";

export type PublishedRecord = {
  slug: string;
  handle: string | null;
  store: Store;
  editToken: string;
  createdAt: number;
  updatedAt: number;
};

export type Stats = { views: number; clicks: number };

const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;

export const storageMode = redis ? "redis" : "memory";

// Memory fallback (survives hot reloads in dev)
const g = globalThis as unknown as { __mem?: Map<string, unknown> };
const mem = (g.__mem ??= new Map<string, unknown>());

export async function getStore(slug: string): Promise<PublishedRecord | null> {
  if (redis) return (await redis.get<PublishedRecord>(`store:${slug}`)) ?? null;
  return (mem.get(`store:${slug}`) as PublishedRecord) ?? null;
}

export async function saveStore(rec: PublishedRecord): Promise<void> {
  if (redis) await redis.set(`store:${rec.slug}`, rec);
  else mem.set(`store:${rec.slug}`, rec);
}

export async function incr(slug: string, field: "views" | "clicks"): Promise<void> {
  if (redis) await redis.hincrby(`stats:${slug}`, field, 1);
  else {
    const s = (mem.get(`stats:${slug}`) as Stats) ?? { views: 0, clicks: 0 };
    s[field] += 1;
    mem.set(`stats:${slug}`, s);
  }
}

export async function getStats(slug: string): Promise<Stats> {
  if (redis) {
    const h = await redis.hgetall<Record<string, number>>(`stats:${slug}`);
    return { views: Number(h?.views ?? 0), clicks: Number(h?.clicks ?? 0) };
  }
  return (mem.get(`stats:${slug}`) as Stats) ?? { views: 0, clicks: 0 };
}

/** Funnel metric: time from first input to first publish (ms). Feeds the success metric in the decision doc. */
export async function logTimeToPublish(ms: number): Promise<void> {
  if (redis) await redis.lpush("metrics:time_to_publish_ms", ms);
  else mem.set("metrics:last_ttp", ms);
}
