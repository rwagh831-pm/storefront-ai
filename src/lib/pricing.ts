// Price bands (INR) — ASSUMPTIONS from Indian market reference points, not SuperProfile data.
// Rule: the AI picks a price INSIDE the band and explains it; this code enforces the band.
import type { Format, Tier, CreatorProfile } from "./schemas";

type Band = [number, number];

const BASE_BANDS: Record<Format, Record<Tier, Band>> = {
  ebook:         { expert: [99, 199],   nano: [99, 199],   micro: [149, 299],  mid: [199, 499] },
  template_pack: { expert: [149, 299],  nano: [149, 299],  micro: [199, 499],  mid: [299, 799] },
  mini_course:   { expert: [299, 699],  nano: [299, 699],  micro: [499, 999],  mid: [799, 1999] },
  workshop:      { expert: [149, 399],  nano: [99, 299],   micro: [199, 499],  mid: [299, 799] },
  cohort_course: { expert: [1999, 3999], nano: [1499, 2999], micro: [2499, 4999], mid: [3999, 7999] },
  one_on_one:    { expert: [499, 1499], nano: [299, 699],   micro: [499, 1499], mid: [999, 2499] },
  community:     { expert: [99, 199],   nano: [99, 199],   micro: [149, 299],  mid: [199, 499] },
};

const NICHE_MULTIPLIER: Record<CreatorProfile["nicheGroup"], number> = {
  high_roi: 1.2, // finance, career, exam prep, design/skills
  personal: 1.0, // fitness, astrology
  lifestyle: 0.8, // cooking, fashion
};

// Indian "charm" price points
const CHARM = [49, 99, 149, 199, 249, 299, 349, 399, 499, 599, 699, 799, 999, 1199, 1499, 1999, 2499, 2999, 3499, 3999, 4999, 5999, 6999, 7999, 8999, 9999];

export const PRICE_FLOOR = 49;
export const PRICE_CEILING = 9999;

export function tierFor(followers: number | null): Tier {
  if (followers === null || followers < 5000) return "expert";
  if (followers < 15000) return "nano";
  if (followers < 50000) return "micro";
  return "mid";
}

export const TIER_LABELS: Record<Tier, string> = {
  expert: "Under 5K followers",
  nano: "5K–15K followers",
  micro: "15K–50K followers",
  mid: "50K–100K+ followers",
};

export function toCharm(n: number): number {
  let best = CHARM[0];
  for (const c of CHARM) if (Math.abs(c - n) < Math.abs(best - n)) best = c;
  return best;
}

export function bandFor(format: Format, profile: Pick<CreatorProfile, "followers" | "nicheGroup">): Band {
  const [lo, hi] = BASE_BANDS[format][tierFor(profile.followers)];
  const m = NICHE_MULTIPLIER[profile.nicheGroup];
  return [Math.max(PRICE_FLOOR, toCharm(lo * m)), Math.min(PRICE_CEILING, toCharm(hi * m))];
}

/** Text table of bands for this creator, injected into the prompt so the model prices inside them. */
export function bandsForPrompt(profile: Pick<CreatorProfile, "followers" | "nicheGroup">): string {
  return (Object.keys(BASE_BANDS) as Format[])
    .map((f) => {
      const [lo, hi] = bandFor(f, profile);
      return `- ${f}: ₹${lo}–₹${hi}`;
    })
    .join("\n");
}

/** Enforce the band. Returns the final price and whether we had to adjust it. */
export function enforcePrice(format: Format, price: number, profile: Pick<CreatorProfile, "followers" | "nicheGroup">) {
  const [lo, hi] = bandFor(format, profile);
  const safe = Number.isFinite(price) ? price : (lo + hi) / 2;
  const clamped = Math.min(hi, Math.max(lo, safe));
  const final = toCharm(clamped);
  return { price: final, adjusted: final !== price, band: [lo, hi] as Band };
}
