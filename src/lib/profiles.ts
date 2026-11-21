import data from "@/data/demo-profiles.json";
import { riskFlagsFromContent } from "./guardrails";

type SampleProfile = (typeof data.profiles)[number];

export const SAMPLE_HANDLES = data.profiles.map((p) => ({
  handle: p.handle,
  label: p.display_name.split("|")[0].trim(),
  category: p.category ?? "Private account",
  followers: p.followers,
}));

export function normaliseHandle(raw: string): string {
  return raw.trim().split(/[?#]/)[0].replace(/^@+/, "").replace(/^(https?:\/\/)?(www\.|m\.)?instagram\.com\//i, "").replace(/\/.*$/, "").toLowerCase();
}

export function isValidHandle(h: string): boolean {
  return /^[a-z0-9._]{1,30}$/.test(h);
}

export type LookupResult =
  | { status: "found"; profile: SampleProfile }
  | { status: "private"; handle: string }
  | { status: "not_found"; handle: string };

/** Stands in for an Instagram API call. Only the fields a real API would return are used (never test_purpose). */
export function lookupHandle(handle: string): LookupResult {
  const p = data.profiles.find((x) => x.handle === handle);
  if (!p) return { status: "not_found", handle };
  if (p.is_private) return { status: "private", handle };
  return { status: "found", profile: p };
}

/** Builds the text the LLM reads — like a real Instagram profile payload. */
export function profileToPrompt(p: SampleProfile): { text: string; riskFlags: string[] } {
  const posts = p.recent_posts.map((x) => `- [${x.type}, ${x.likes} likes, ${x.comments} comments] ${x.caption}`).join("\n");
  const riskFlags = riskFlagsFromContent([p.bio ?? "", ...p.recent_posts.map((x) => x.caption)]);
  const text = `INSTAGRAM PROFILE
Name: ${p.display_name}
Handle: @${p.handle}
Followers: ${p.followers}
Posts: ${p.posts_count}
Bio: ${p.bio}
Recent posts:
${posts}
${riskFlags.length ? `\nAUTOMATED POLICY FLAGS FOUND IN THIS CONTENT:\n${riskFlags.map((f) => `- ${f}`).join("\n")}` : ""}`;
  return { text, riskFlags };
}
