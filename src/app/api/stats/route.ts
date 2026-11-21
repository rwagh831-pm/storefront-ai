import { getStats, getStore } from "@/lib/db";
import { fail, ok } from "../_lib";

// GET /api/stats?slug=...&token=... — only the store owner (who holds the edit token) can see stats.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug") ?? "";
  const token = searchParams.get("token") ?? "";
  const rec = await getStore(slug);
  if (!rec || rec.editToken !== token) return fail("not_found", "Store not found.", 404);
  return ok({ stats: await getStats(slug) });
}
