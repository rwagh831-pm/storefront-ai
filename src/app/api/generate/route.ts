import { GenerateRequestSchema, type StoreOutput, type ThemeName } from "@/lib/schemas";
import { generateStore, regenerateBio, regenerateProduct } from "@/lib/ai";
import { AI_DOWN_MESSAGE, fail, ok } from "../_lib";

export const maxDuration = 60;

function themeFor(nicheGroup: string, niche: string): ThemeName {
  if (/design|art|craft/i.test(niche)) return "forest";
  if (nicheGroup === "high_roi") return "ocean";
  if (nicheGroup === "personal") return "plum";
  return "sunset";
}

// POST /api/generate — Step 2: build the whole store, or regenerate one part of it.
export async function POST(req: Request) {
  const parsed = GenerateRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("bad_request", "Something went wrong with that request.");
  const { profile, language, target, store } = parsed.data;

  try {
    if (target.type === "all") {
      const { model, ...generated } = await generateStore(profile, language);
      return ok({
        store: { ...generated, language, theme: themeFor(profile.nicheGroup, profile.niche) },
        model,
      });
    }
    if (!store) return fail("bad_request", "Nothing to regenerate yet.");
    if (target.type === "bio") {
      const bio = await regenerateBio(profile, language, store as StoreOutput);
      return ok({ bio });
    }
    const { product, shareCaption } = await regenerateProduct(profile, language, store as StoreOutput, target.index);
    return ok({ product, shareCaption });
  } catch (err) {
    console.error("[api/generate]", err);
    return fail("ai_unavailable", AI_DOWN_MESSAGE, 503);
  }
}
