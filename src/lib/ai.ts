import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import {
  BioOutputSchema,
  SingleProductOutputSchema,
  StoreOutputSchema,
  UnderstandOutputSchema,
  type CreatorProfile,
  type Language,
  type Product,
  type SafetyNote,
  type StoreOutput,
  type UnderstandOutput,
} from "./schemas";
import { bandsForPrompt, enforcePrice, TIER_LABELS, tierFor } from "./pricing";
import { POLICY_FOR_PROMPT, scanText } from "./guardrails";

// Primary: fast + cheap. Fallback: a different model, used only if the primary fails, times out or refuses.
const PRIMARY_MODEL = "claude-haiku-5-5";
const FALLBACK_MODEL = "claude-haiku-4-5";

const client = new Anthropic({ maxRetries: 1, timeout: 25_000 });

export class AIError extends Error {}

/** One structured LLM call with validation and model fallback. Never returns unvalidated text. */
async function structured<S extends z.ZodType>(
  schema: S,
  system: string,
  user: string,
  maxTokens = 6000
): Promise<{ data: z.infer<S>; model: string }> {
  const attempts = [
    { model: PRIMARY_MODEL, output_config: { effort: "low" as const, format: zodOutputFormat(schema) } },
    { model: FALLBACK_MODEL, output_config: { format: zodOutputFormat(schema) } },
  ];
  let lastError: unknown;
  for (const a of attempts) {
    try {
      const res = await client.messages.parse({
        model: a.model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: user }],
        output_config: a.output_config,
      });
      if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") {
        lastError = new Error(`stop_reason=${res.stop_reason}`);
        continue;
      }
      const checked = schema.safeParse(res.parsed_output);
      if (checked.success) return { data: checked.data, model: a.model };
      lastError = checked.error;
    } catch (err) {
      lastError = err;
      console.error(`[ai] ${a.model} failed:`, err instanceof Error ? err.message : err);
    }
  }
  throw new AIError(`All models failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

// ---------------------------------------------------------------------------
// Step 1: UNDERSTAND the creator
// ---------------------------------------------------------------------------
const UNDERSTAND_SYSTEM = `You help Indian creators, coaches and educators turn their expertise into products.
Read what we know about a creator and extract a structured profile.

Rules:
- Use ONLY facts present in the input. Never invent credentials, numbers or achievements.
- niche: short and specific (e.g. "Home workouts for working women", not "Fitness").
- nicheGroup: "high_roi" if buyers expect money/career/exam results (finance, tax, career, exam prep, design/tech skills); "personal" for fitness, wellness, astrology, relationships; "lifestyle" for cooking, fashion, beauty, travel, hobbies.
- language: "Hindi" if the creator writes in Devanagari, "Hinglish" if Roman-script Hindi mixed with English, else "English".
- strengths: 2–4 concrete things they are good at, from their content.
- demandSignals: evidence the audience wants something (e.g. comments asking for a plan). Empty if none.
- credentials: only if stated (e.g. "Cleared UPSC AIR 214", "CA, 8 years").
- riskFlags: claims or products in their content that break this policy (copy any provided flags too).
- followers: number if given, else null.
- If the input is too vague to build a good store (e.g. one word like "fitness"), set usable=false and give 2 followUpQuestions, each with 3–4 short tap-able options specific to their niche. Otherwise usable=true and followUpQuestions=[].
- If the input is not about a person's skill or content at all, usable=false, explain kindly in reasonIfNotUsable, and give 1–2 followUpQuestions.
- name: the creator's name if known, else a friendly placeholder like "Creator".

${POLICY_FOR_PROMPT}`;

export async function understandCreator(input: string): Promise<UnderstandOutput> {
  const { data } = await structured(UnderstandOutputSchema, UNDERSTAND_SYSTEM, input, 4000);
  return data;
}

// ---------------------------------------------------------------------------
// Step 2: GENERATE the store
// ---------------------------------------------------------------------------
function languageRule(language: Language) {
  if (language === "Hinglish")
    return "Write all creator-facing copy in natural Hinglish (Roman-script Hindi mixed with English, the way Indian creators write on Instagram). Keep product formats and prices clear.";
  if (language === "Hindi")
    return "Write all copy in simple Hindi (Devanagari script). Common English words like 'course', 'live', 'PDF' may stay in English.";
  return "Write in simple, warm Indian English.";
}

function creatorContext(profile: CreatorProfile) {
  const tier = tierFor(profile.followers);
  return `CREATOR PROFILE (JSON):
${JSON.stringify(profile, null, 2)}

AUDIENCE TIER: ${TIER_LABELS[tier]}

PRICE BANDS FOR THIS CREATOR (INR, by format). Every price MUST be inside the band for its format:
${bandsForPrompt(profile)}`;
}

const STORE_SYSTEM = `You are a product strategist and conversion copywriter for India's long-tail creators on SuperProfile, a link-in-bio store.
The creator has an audience and expertise but has never sold anything. Build them a store they are proud to share.

PRODUCT RULES:
- Create exactly 3 products (2 only if the creator's expertise is very narrow) that form a price ladder:
  1) an ENTRY product under ₹500 (easy first purchase: ebook, template pack, workshop or community),
  2) a CORE product (mini_course or workshop or community),
  3) a PREMIUM product (one_on_one or cohort_course).
- Each product must come from the creator's real strengths and demand signals. Be specific (who it is for, what they get).
- Allowed formats: ebook, template_pack, mini_course, workshop, cohort_course, one_on_one, community.
- price: a whole number in INR, inside the band for that format, ending in 9 (e.g. 199, 499, 1499).
- priceReason: ONE short sentence the creator will read, comparing to something the buyer already pays for in India and/or the creator's demand signals. E.g. "Less than one month of a gym membership, and your followers keep asking for a plan."
- description: 2–3 short sentences, benefit-first, no hype, no fake numbers or testimonials.
- deliverables: 2–4 concrete items (e.g. "28-day PDF plan", "4 live sessions on Zoom").
- whoItsFor: one line.

PAGE RULES:
- displayName: creator's name (keep as given).
- tagline: max 8 words.
- bio: 2–3 sentences, first person, builds trust using only real credentials/experience from the profile. Never invent facts.
- shareCaption: an Instagram caption (2–4 short lines, a few emojis ok) announcing the store, ending with "Link in bio 👆".
- safetyNotes: one entry per risky/prohibited item you deliberately left out or reworded (empty array if none).

${POLICY_FOR_PROMPT}`;

export type GeneratedStore = StoreOutput & { model: string };

export async function generateStore(profile: CreatorProfile, language: Language): Promise<GeneratedStore> {
  const user = `${creatorContext(profile)}\n\nLANGUAGE: ${languageRule(language)}\n\nBuild the complete store now.`;
  const { data, model } = await structured(StoreOutputSchema, STORE_SYSTEM, user);
  if (data.products.length < 2) throw new AIError("Too few products generated");
  data.products = data.products.slice(0, 4);
  return { ...(await enforceQuality(data, profile, language)), model };
}

export async function regenerateBio(profile: CreatorProfile, language: Language, current: StoreOutput) {
  const user = `${creatorContext(profile)}\n\nLANGUAGE: ${languageRule(language)}\n\nCURRENT STORE PRODUCTS: ${current.products
    .map((p) => p.title)
    .join(" | ")}\nCURRENT BIO (write a clearly DIFFERENT, better version): ${current.bio}\n\nReturn only a new tagline and bio.`;
  const { data } = await structured(BioOutputSchema, STORE_SYSTEM, user, 3000);
  const hits = scanText(`${data.tagline} ${data.bio}`);
  if (hits.length) throw new AIError("Bio failed safety check");
  return data;
}

export async function regenerateProduct(
  profile: CreatorProfile,
  language: Language,
  current: StoreOutput,
  index: number,
  avoid: string[] = []
): Promise<{ product: Product; shareCaption: string; note?: SafetyNote }> {
  const others = current.products.filter((_, i) => i !== index).map((p) => `${p.title} (${p.format}, ₹${p.price})`);
  const old = current.products[index];
  const user = `${creatorContext(profile)}\n\nLANGUAGE: ${languageRule(language)}\n\nOTHER PRODUCTS IN THE STORE (do not duplicate): ${others.join(" | ") || "none"}
PRODUCT TO REPLACE: ${old ? `${old.title} (${old.format})` : "none"} — create a clearly different idea that still fits the price ladder.
${avoid.length ? `MUST AVOID: ${avoid.join(", ")}.` : ""}
Return one product, and a refreshed shareCaption (Instagram caption, 2–4 short lines, ending with "Link in bio 👆") that fits the store's offers after this change.`;
  const { data } = await structured(SingleProductOutputSchema, STORE_SYSTEM, user, 3000);
  const product = fixPrice(data.product, profile);
  const hits = scanText(productText(product));
  if (hits.length) throw new AIError(`Product failed safety check: ${hits.map((h) => h.label).join(", ")}`);
  const shareCaption = scanText(data.shareCaption).length ? current.shareCaption : data.shareCaption;
  return { product, shareCaption };
}

// ---------------------------------------------------------------------------
// Quality control (code, not the model)
// ---------------------------------------------------------------------------
function productText(p: Product) {
  return `${p.title} ${p.description} ${p.whoItsFor} ${p.deliverables.join(" ")} ${p.priceReason}`;
}

function fixPrice(p: Product, profile: CreatorProfile): Product {
  const { price, adjusted, band } = enforcePrice(p.format, p.price, profile);
  return adjusted
    ? { ...p, price, priceReason: `${p.priceReason} (Adjusted to ₹${price} to stay within the usual ₹${band[0]}–₹${band[1]} range for this format at your audience size.)` }
    : { ...p, price };
}

async function enforceQuality(store: StoreOutput, profile: CreatorProfile, language: Language): Promise<StoreOutput> {
  const notes = [...store.safetyNotes];
  const products: Product[] = [];

  for (let i = 0; i < store.products.length; i++) {
    let p = fixPrice(store.products[i], profile);
    const hits = scanText(productText(p));
    if (hits.length) {
      const labels = hits.map((h) => h.label);
      try {
        const replacement = await regenerateProduct(profile, language, store, i, labels);
        p = replacement.product;
        notes.push({ issue: `A suggested product touched on ${labels.join(", ")}.`, action: "We replaced it with a safer product." });
      } catch {
        notes.push({ issue: `A suggested product touched on ${labels.join(", ")}.`, action: "We removed it from your store." });
        continue;
      }
    }
    products.push(p);
  }

  let { bio, tagline, shareCaption } = store;
  if (scanText(`${tagline} ${bio}`).length) {
    try {
      ({ bio, tagline } = await regenerateBio(profile, language, store));
    } catch {
      bio = bio.replace(/guarantee(d)?/gi, "aim for");
    }
    notes.push({ issue: "Your bio had a claim we can't publish.", action: "We rewrote it." });
  }
  if (scanText(shareCaption).length) shareCaption = `My store is live! 🎉\nSee what I've made for you.\nLink in bio 👆`;

  return { ...store, products, bio, tagline, shareCaption, safetyNotes: dedupeNotes(notes) };
}

function dedupeNotes(notes: SafetyNote[]) {
  const seen = new Set<string>();
  return notes.filter((n) => (seen.has(n.issue) ? false : (seen.add(n.issue), true)));
}
