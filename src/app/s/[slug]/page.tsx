import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getStore } from "@/lib/db";
import PublicStore from "./PublicStore";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const slug = decodeURIComponent((await params).slug).toLowerCase();
  const rec = await getStore(slug).catch(() => null);
  if (!rec) return { title: "Store not found" };
  return {
    title: `${rec.store.displayName} — Store`,
    description: rec.store.tagline || rec.store.bio.slice(0, 150),
    openGraph: { title: rec.store.displayName, description: rec.store.tagline },
  };
}

// Public, shareable store page: /s/<slug>
// The store is read from the database at request time, so it sits inside <Suspense> (required by cacheComponents).
export default function StorePage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-zinc-100" />}>
      <StoreContent params={params} />
    </Suspense>
  );
}

async function StoreContent({ params }: { params: Promise<{ slug: string }> }) {
  const slug = decodeURIComponent((await params).slug).toLowerCase();
  const rec = await getStore(slug).catch(() => null);
  if (!rec) notFound();
  return <PublicStore slug={slug} handle={rec.handle} store={rec.store} />;
}
