"use client";

import { useEffect } from "react";
import StoreView from "@/components/StoreView";
import type { Store } from "@/lib/schemas";

function track(slug: string, type: "views" | "clicks") {
  const body = JSON.stringify({ slug, type });
  if (navigator.sendBeacon) navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }));
  else fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body }).catch(() => {});
}

export default function PublicStore({ slug, handle, store }: { slug: string; handle: string | null; store: Store }) {
  useEffect(() => {
    // Count one view per browser session, so refreshes don't inflate numbers.
    const key = `viewed:${slug}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {}
    track(slug, "views");
  }, [slug]);

  return (
    <main className="min-h-dvh bg-zinc-100">
      <StoreView store={store} handle={handle} onBuyClick={() => track(slug, "clicks")} />
    </main>
  );
}
