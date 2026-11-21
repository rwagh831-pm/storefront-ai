// Two layers of safety:
// 1) INPUT checks (before spending an LLM call): empty, gibberish, too short.
// 2) OUTPUT checks (after the LLM): deterministic scan for prohibited products and risky claims.
//    The LLM is also told the policy, but we never trust the model alone for safety.

export type InputCheck =
  | { ok: true }
  | { ok: false; code: "empty" | "gibberish" | "too_short" | "too_long"; message: string };

export const MAX_DESCRIPTION = 1000;

const COMMON_WORDS = new Set(
  "i am a an the and or my me for to of in on with who help teach coach share make create sell people women men students beginners home fitness yoga finance money tax cooking food recipes design canva exam upsc neet jee astrology tarot fashion style teacher trainer doctor ca engineer developer writer artist music dance photography business marketing career english hindi hai hu main mein ki ka ke ko se aur".split(" ")
);

export function checkDescription(raw: string | undefined): InputCheck {
  const text = (raw ?? "").trim();
  if (!text) return { ok: false, code: "empty", message: "Tell us a little about yourself first." };
  if (text.length > MAX_DESCRIPTION) {
    return { ok: false, code: "too_long", message: `Please keep it under ${MAX_DESCRIPTION.toLocaleString("en-IN")} characters — two or three lines is perfect.` };
  }

  const letters = text.match(/\p{L}/gu) ?? [];
  const latin = letters.filter((c) => /[a-z]/i.test(c)).length;
  const words = text.toLowerCase().match(/[\p{L}\p{M}]+/gu) ?? [];

  if (letters.length === 0) {
    return { ok: false, code: "gibberish", message: "We couldn't understand that. Try something like: “I teach home workouts to working women”." };
  }
  // Our gibberish heuristic only understands English-letter text (English / Hinglish).
  // Hindi, Marathi, Tamil, Bengali etc. are passed to the AI, which judges them.
  if (latin / letters.length > 0.6) {
    const latinWords = words.filter((w) => /^[a-z]+$/.test(w));
    const realish = latinWords.filter((w) => COMMON_WORDS.has(w) || (w.length >= 3 && /[aeiou]/.test(w) && !/(.)\1\1/.test(w) && !/[bcdfghjklmnpqrstvwxz]{5,}/.test(w)));
    if (latinWords.length === 0 || realish.length / latinWords.length < 0.5) {
      return { ok: false, code: "gibberish", message: "We couldn't understand that. Try something like: “I teach home workouts to working women”." };
    }
  }
  if (words.length < 3) {
    // Not an error: we ask follow-up questions instead of guessing.
    return { ok: false, code: "too_short", message: "Tell us a bit more so we get it right." };
  }
  return { ok: true };
}

// ---------- Output policy ----------
// "block"  = product must not be sold on the platform (illegal / unsafe).
// "reword" = product is fine, but the claim is not (guarantees, cures).
type Rule = { pattern: RegExp; level: "block" | "reword"; label: string };

const RULES: Rule[] = [
  { pattern: /steroid|स्टेरॉयड|anabolic|\bsarms?\b|testosterone (cycle|injection)|\bcycle plan\b/i, level: "block", label: "steroid / performance drugs" },
  { pattern: /fat[- ]?burner (pill|capsule)|weight[- ]?loss (pill|capsule)|slimming pill/i, level: "block", label: "weight-loss pills" },
  { pattern: /first[- ]?copy|फर्स्ट कॉपी|replica|\bclone\b (bag|watch|shoe)|master ?copy|7a quality/i, level: "block", label: "counterfeit goods" },
  { pattern: /leak(ed)? (paper|question)|paper leak/i, level: "block", label: "leaked exam papers" },
  { pattern: /betting tips|satta|sure[- ]?shot (tips|win)|fixed match/i, level: "block", label: "betting / gambling tips" },
  { pattern: /guarantee(d)? (\d+ ?%|\d+ ?percent|returns?|profit|income)|\d+ ?(%|percent) (returns?|profit)|returns? assured|assured returns?|double your money|will double|risk[- ]?free returns?|pakka (profit|returns?|munafa)|(paisa|paise|money) double|double (paisa|paise)|गारंटी|गारंटीड|पक्का (मुनाफा|रिटर्न)|पैसा डबल|दोगुना/i, level: "reword", label: "guaranteed financial returns" },
  { pattern: /stock tips?|buy (call|signal)s?|intraday (tips|calls)|multibagger/i, level: "reword", label: "stock tips (needs SEBI registration)" },
  { pattern: /\bcures?\b|heal (your )?(thyroid|diabetes|cancer|pcos|anxiety)|no medicine needed/i, level: "reword", label: "medical cure claims" },
  { pattern: /lose \d+ ?kg in \d+ ?days|guaranteed (weight|results)/i, level: "reword", label: "unrealistic body-result guarantees" },
  { pattern: /(100%|guaranteed) (remedy|result)|get your ex back/i, level: "reword", label: "guaranteed personal outcomes" },
];

export type PolicyHit = { level: "block" | "reword"; label: string };

/**
 * Undo common tricks used to dodge keyword filters:
 * "g u a r a n t e e d" → "guaranteed", "st3roid" → "steroid", zero-width characters, odd spacing.
 */
export function normaliseForScan(text: string): string {
  let t = text.normalize("NFKC").replace(/[\u200B-\u200D\uFEFF]/g, "").toLowerCase();
  const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s" };
  t = t.replace(/(?<=[a-z])[013457@$]|[013457@$](?=[a-z])/g, (c) => LEET[c] ?? c);
  // join letters separated by single spaces/dots/dashes: "g u a r a n t e e d" → "guaranteed"
  t = t.replace(/\b(?:[a-z][\s.\-_*]){2,}[a-z]\b/g, (m) => m.replace(/[\s.\-_*]/g, ""));
  return t.replace(/\s+/g, " ");
}

export function scanText(text: string): PolicyHit[] {
  const variants = [text, normaliseForScan(text)];
  const hits: PolicyHit[] = [];
  for (const r of RULES) if (variants.some((v) => r.pattern.test(v))) hits.push({ level: r.level, label: r.label });
  return hits;
}

/** True for flags produced by our deterministic rules (short, user-facing labels). */
export function isRuleFlag(flag: string): boolean {
  const m = flag.match(/^(PROHIBITED|RISKY CLAIM): (.+)$/);
  return !!m && RULES.some((r) => r.label === m[2]);
}

/** Risk flags found in the creator's own content — passed to the LLM so it avoids them. */
export function riskFlagsFromContent(texts: string[]): string[] {
  const set = new Set<string>();
  for (const t of texts) for (const h of scanText(t)) set.add(`${h.level === "block" ? "PROHIBITED" : "RISKY CLAIM"}: ${h.label}`);
  return [...set];
}

export const POLICY_FOR_PROMPT = `
SAFETY POLICY (mandatory — this storefront is published under SuperProfile's brand in India):
- NEVER create products for: steroids or performance drugs, diet/fat-burner pills or supplements with health claims, counterfeit / "first copy" / replica goods, leaked exam papers, betting or gambling tips, adult content.
- Finance: education only (budgeting, tax basics, investing concepts). No stock tips, no "guaranteed returns", no promises of income. The creator is not a SEBI-registered adviser unless stated.
- Health & fitness: no cure claims, no "lose X kg in Y days". Use safe, realistic language; suggest consulting a doctor where relevant.
- Astrology/tarot: allowed as guidance or entertainment; no guaranteed outcomes, no health cures.
- If the creator's content contains any of the above, DO NOT reproduce it. Build safe alternatives from their legitimate skills, and record each exclusion in safetyNotes as {issue, action} in plain, polite language.
`.trim();
