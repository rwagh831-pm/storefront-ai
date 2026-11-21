import { z } from "zod";
import { incr } from "@/lib/db";
import { fail, ok } from "../_lib";

const Body = z.object({ slug: z.string().min(1).max(40), type: z.enum(["views", "clicks"]) });

// POST /api/track — count page views and product clicks on a published store.
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("bad_request", "Invalid event.");
  await incr(parsed.data.slug, parsed.data.type).catch(() => {});
  return ok({});
}
