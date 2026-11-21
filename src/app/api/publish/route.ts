import { randomBytes } from "node:crypto";
import { PublishRequestSchema } from "@/lib/schemas";
import { getStore, logTimeToPublish, saveStore } from "@/lib/db";
import { scanText } from "@/lib/guardrails";
import { fail, ok } from "../_lib";

function slugify(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/^@/, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 30) || "store"
  );
}

// POST /api/publish — save the store and return its public URL slug.
// The creator can re-publish (update) later using the editToken kept in their browser.
export async function POST(req: Request) {
  const parsed = PublishRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return fail("invalid_store", `Please check your store: ${first?.path.join(" → ") || "a field"} looks empty or too long.`);
  }
  const { store, handle, slug: wantedSlug, editToken, startedAt } = parsed.data;

  // Re-check safety on the FINAL text — the creator may have typed something new while editing.
  const allText = [store.displayName, store.tagline, store.bio, ...store.products.flatMap((p) => [p.title, p.description, ...p.deliverables])].join(" ");
  const hits = scanText(allText);
  if (hits.length) {
    return fail(
      "policy",
      `We can't publish this yet: it mentions ${[...new Set(hits.map((h) => h.label))].join(", ")}. Please edit that part, or regenerate it.`,
      422
    );
  }

  const now = Date.now();

  // Update an existing store
  if (wantedSlug && editToken) {
    const existing = await getStore(wantedSlug);
    if (existing && existing.editToken === editToken) {
      await saveStore({ ...existing, store, updatedAt: now });
      return ok({ slug: wantedSlug, editToken, updated: true });
    }
  }

  // New store: pick a free slug
  let slug = slugify(handle ?? store.displayName);
  if (await getStore(slug)) slug = `${slug}-${randomBytes(2).toString("hex")}`;
  const token = randomBytes(16).toString("hex");
  await saveStore({ slug, handle, store, editToken: token, createdAt: now, updatedAt: now });
  if (startedAt && startedAt < now) await logTimeToPublish(now - startedAt).catch(() => {});

  return ok({ slug, editToken: token, updated: false });
}
