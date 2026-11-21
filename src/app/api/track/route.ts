import { z } from "zod";
import { allow, getStore, incr } from "@/lib/db";
import { fail, ok } from "../_lib";

const Body = z.object({ slug: z.string().min(1).max(60), type: z.enum(["views", "clicks"]) });

// POST /api/track — count page views and offer clicks on a published store.
// Protected against fake numbers: only real stores count, and each visitor is rate-limited.
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("bad_request", "Invalid event.");
  const { slug, type } = parsed.data;

  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  try {
    if (!(await allow(`${ip}:${slug}:${type}`, type === "views" ? 3 : 10, 600))) return ok({ counted: false });
    if (!(await getStore(slug))) return fail("not_found", "Store not found.", 404);
    await incr(slug, type);
    return ok({ counted: true });
  } catch {
    return ok({ counted: false }); // analytics must never break the page
  }
}
