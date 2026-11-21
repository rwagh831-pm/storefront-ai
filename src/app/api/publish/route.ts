import { createHash, randomBytes } from "node:crypto";
import { PublishRequestSchema } from "@/lib/schemas";
import { getRecentPublish, getStore, logTimeToPublish, saveStore, setRecentPublish } from "@/lib/db";
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
    const path = first?.path ?? [];
    const FIELD: Record<string, string> = { displayName: "your name", bio: "your bio", tagline: "your tagline", title: "the title", description: "the description", price: "the price", products: "your offers (keep 1–4)" };
    const field = FIELD[String(path[path.length - 1])] ?? FIELD[String(path[1])] ?? "a field";
    const offer = path[1] === "products" && typeof path[2] === "number" ? ` in offer ${path[2] + 1}` : "";
    return fail("invalid_store", `Please check ${field}${offer} — it looks empty, too long, or not a whole number.`);
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

  // New store. If the exact same store was published in the last 2 minutes (double-tap), return that one.
  const fingerprint = createHash("sha256").update(JSON.stringify({ handle, store })).digest("hex");
  const recent = await getRecentPublish(fingerprint);
  if (recent) return ok({ ...recent, updated: false });

  let slug = slugify(handle ?? store.displayName);
  if (await getStore(slug)) slug = `${slug}-${randomBytes(2).toString("hex")}`;
  const token = randomBytes(16).toString("hex");
  await saveStore({ slug, handle, store, editToken: token, createdAt: now, updatedAt: now });
  await setRecentPublish(fingerprint, { slug, editToken: token });
  if (startedAt && startedAt < now) await logTimeToPublish(now - startedAt).catch(() => {});

  return ok({ slug, editToken: token, updated: false });
}
