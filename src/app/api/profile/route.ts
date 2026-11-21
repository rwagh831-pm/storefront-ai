import { ProfileRequestSchema, type CreatorProfile } from "@/lib/schemas";
import { isValidHandle, lookupHandle, normaliseHandle, profileToPrompt } from "@/lib/profiles";
import { checkDescription, riskFlagsFromContent } from "@/lib/guardrails";
import { understandCreator } from "@/lib/ai";
import { AI_DOWN_MESSAGE, fail, ok } from "../_lib";

export const maxDuration = 60;

// POST /api/profile — Step 1: understand the creator from a handle or a description.
// Returns one of: ready | needs_more | not_found | private | rejected
export async function POST(req: Request) {
  const parsed = ProfileRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("bad_request", "Something went wrong with that request.");
  const { mode, handle: rawHandle, description, answers } = parsed.data;

  try {
    if (mode === "handle") {
      const handle = normaliseHandle(rawHandle ?? "");
      if (!handle || !isValidHandle(handle)) {
        return ok({ status: "rejected", message: "That doesn't look like an Instagram handle. Try something like @fitwithriya." });
      }
      const found = lookupHandle(handle);
      if (found.status === "not_found") {
        return ok({ status: "not_found", message: `We couldn't read @${handle}. No problem — tell us about yourself in one line instead.` });
      }
      if (found.status === "private") {
        return ok({ status: "private", message: `@${handle} is a private account, so we can't read it. Tell us about yourself in one line instead.` });
      }
      const { text, riskFlags } = profileToPrompt(found.profile);
      const out = await understandCreator(text);
      const profile: CreatorProfile = {
        ...out.profile,
        name: found.profile.display_name.split("|")[0].trim(),
        handle: found.profile.handle,
        followers: found.profile.followers,
        riskFlags: [...new Set([...riskFlags, ...out.profile.riskFlags])],
        source: "sample_instagram",
      };
      return ok({ status: "ready", profile });
    }

    // mode === "description"
    const answerText = answers ? Object.values(answers).filter(Boolean).join(". ") : "";
    const combined = [description?.trim(), answerText].filter(Boolean).join(". ");
    const check = checkDescription(combined);
    if (!check.ok && check.code !== "too_short") {
      return ok({ status: "rejected", message: check.message });
    }

    const out = await understandCreator(
      `SELF-DESCRIPTION FROM THE CREATOR: "${description ?? ""}"${answerText ? `\nTHEIR ANSWERS TO OUR QUESTIONS: ${answerText}` : ""}${
        !check.ok ? "\nNOTE: This is very short. Ask follow-up questions." : ""
      }`
    );
    const riskFlags = [...new Set([...riskFlagsFromContent([combined]), ...out.profile.riskFlags])];

    if (!out.usable && out.followUpQuestions.length && !answers) {
      return ok({
        status: "needs_more",
        message: out.reasonIfNotUsable || "Tell us a bit more so we get your store right.",
        questions: out.followUpQuestions.slice(0, 2),
      });
    }
    const profile: CreatorProfile = { ...out.profile, handle: null, riskFlags, source: "description" };
    return ok({ status: "ready", profile });
  } catch (err) {
    console.error("[api/profile]", err);
    return fail("ai_unavailable", AI_DOWN_MESSAGE, 503);
  }
}
