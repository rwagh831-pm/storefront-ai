"use client";

import { useState } from "react";
import { FORMAT_LABELS, type Format, type Store, type ThemeName } from "@/lib/schemas";

export const THEME_STYLES: Record<
  ThemeName,
  { ring: string; cover: string; accent: string; soft: string; button: string; name: string }
> = {
  sunset: { ring: "from-amber-400 via-orange-500 to-rose-500", cover: "from-amber-200 via-orange-200 to-rose-300", accent: "text-rose-600", soft: "bg-rose-50 text-rose-700", button: "bg-rose-600 active:bg-rose-700", name: "Sunset" },
  ocean: { ring: "from-cyan-400 via-sky-500 to-indigo-600", cover: "from-cyan-100 via-sky-200 to-indigo-300", accent: "text-sky-700", soft: "bg-sky-50 text-sky-700", button: "bg-sky-700 active:bg-sky-800", name: "Ocean" },
  forest: { ring: "from-lime-400 via-emerald-500 to-teal-600", cover: "from-lime-100 via-emerald-200 to-teal-300", accent: "text-emerald-700", soft: "bg-emerald-50 text-emerald-700", button: "bg-emerald-700 active:bg-emerald-800", name: "Forest" },
  plum: { ring: "from-pink-400 via-fuchsia-500 to-violet-600", cover: "from-pink-100 via-fuchsia-200 to-violet-300", accent: "text-violet-700", soft: "bg-violet-50 text-violet-700", button: "bg-violet-700 active:bg-violet-800", name: "Plum" },
};

export const FORMAT_EMOJI: Record<Format, string> = {
  ebook: "📘",
  template_pack: "🧩",
  mini_course: "🎬",
  workshop: "🎤",
  cohort_course: "👥",
  one_on_one: "💬",
  community: "🤝",
};

export function formatINR(n: number) {
  return `₹${n.toLocaleString("en-IN")}`;
}

export function initialsOf(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "★"
  );
}

/** Gradient "story ring" avatar — a familiar social pattern, in the store's own colours. */
export function RingAvatar({ name, theme, size = "lg" }: { name: string; theme: ThemeName; size?: "sm" | "md" | "lg" }) {
  const t = THEME_STYLES[theme] ?? THEME_STYLES.sunset;
  const dims = size === "lg" ? "h-24 w-24 text-3xl" : size === "md" ? "h-16 w-16 text-xl" : "h-9 w-9 text-xs";
  const pad = size === "sm" ? "p-[2px]" : "p-[3px]";
  return (
    <div className={`shrink-0 rounded-full bg-gradient-to-tr ${t.ring} ${pad}`}>
      <div className="rounded-full bg-white p-[2px]">
        <div className={`flex ${dims} items-center justify-center rounded-full bg-gradient-to-br ${t.cover} font-bold text-zinc-800`}>{initialsOf(name)}</div>
      </div>
    </div>
  );
}

/** The creator's public storefront. Used for the live page and the in-editor preview. */
export default function StoreView({
  store,
  handle,
  onBuyClick,
  shareUrl,
}: {
  store: Store;
  handle: string | null;
  onBuyClick?: (index: number) => void;
  shareUrl?: string;
}) {
  const t = THEME_STYLES[store.theme] ?? THEME_STYLES.sunset;
  const [toast, setToast] = useState<string | null>(null);
  const minPrice = store.products.length ? Math.min(...store.products.map((p) => p.price)) : 0;

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  }

  async function share() {
    const url = shareUrl ?? (typeof window !== "undefined" ? window.location.href : "");
    try {
      if (navigator.share) await navigator.share({ title: store.displayName, text: store.tagline, url });
      else {
        await navigator.clipboard.writeText(url);
        flash("Link copied");
      }
    } catch {
      /* user closed the share sheet */
    }
  }

  return (
    <div className="mx-auto w-full max-w-md bg-white pb-24 text-zinc-900">
      {/* Cover + profile header */}
      <div className={`h-28 bg-gradient-to-br ${t.cover}`} />
      <div className="px-4">
        <div className="-mt-12 flex items-end justify-between gap-3">
          <RingAvatar name={store.displayName} theme={store.theme} />
          <div className="mb-1 flex gap-5 text-center">
            <div>
              <p className="text-lg font-bold leading-none">{store.products.length}</p>
              <p className="mt-1 text-xs text-zinc-500">offers</p>
            </div>
            <div>
              <p className="text-lg font-bold leading-none">{formatINR(minPrice)}</p>
              <p className="mt-1 text-xs text-zinc-500">from</p>
            </div>
          </div>
        </div>

        <h1 className="mt-3 break-words text-xl font-bold leading-tight">{store.displayName}</h1>
        {handle && <p className="text-sm text-zinc-500">@{handle}</p>}
        {store.tagline && <p className={`mt-1 break-words text-sm font-semibold ${t.accent}`}>{store.tagline}</p>}
        <p className="mt-2 whitespace-pre-line break-words text-[15px] leading-relaxed text-zinc-700">{store.bio}</p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <a href="#offers" className={`flex min-h-10 items-center justify-center rounded-lg text-sm font-semibold text-white ${t.button}`}>
            View offers
          </a>
          <button type="button" onClick={share} className="min-h-10 rounded-lg bg-zinc-100 text-sm font-semibold text-zinc-900 active:bg-zinc-200">
            Share
          </button>
        </div>

        {/* "Highlights" row: one circle per offer */}
        <div className="no-scrollbar -mx-4 mt-5 flex gap-4 overflow-x-auto px-4 pb-1">
          {store.products.map((p, i) => (
            <a key={i} href={`#offer-${i}`} className="flex w-16 shrink-0 flex-col items-center gap-1">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-50 text-2xl ring-1 ring-zinc-200">{FORMAT_EMOJI[p.format]}</span>
              <span className="w-full truncate text-center text-[11px] text-zinc-700">{FORMAT_LABELS[p.format].split(" ")[0]}</span>
            </a>
          ))}
        </div>
      </div>

      {/* Offers as "posts" */}
      <div id="offers" className="mt-4 space-y-3 bg-zinc-100 py-3">
        {store.products.map((p, i) => (
          <article id={`offer-${i}`} key={i} className="scroll-mt-4 bg-white">
            <header className="flex items-center gap-3 px-4 py-3">
              <RingAvatar name={store.displayName} theme={store.theme} size="sm" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{handle ? handle : store.displayName}</p>
                <p className="text-xs text-zinc-500">{FORMAT_LABELS[p.format]}</p>
              </div>
            </header>

            <div className={`relative flex aspect-[4/3] flex-col justify-end bg-gradient-to-br ${t.cover} p-5`}>
              <span className="absolute right-4 top-3 text-5xl drop-shadow-sm">{FORMAT_EMOJI[p.format]}</span>
              <h2 className="break-words text-2xl font-extrabold leading-tight text-zinc-900">{p.title}</h2>
              {p.whoItsFor && <p className="mt-1 break-words text-sm text-zinc-800/80">{p.whoItsFor}</p>}
            </div>

            <div className="flex items-center justify-between gap-3 px-4 pt-3">
              <span className="text-2xl font-extrabold">{formatINR(p.price)}</span>
              <button
                type="button"
                onClick={() => {
                  onBuyClick?.(i);
                  flash("Checkout opens here on SuperProfile. This prototype doesn't take payments.");
                }}
                className={`min-h-11 rounded-lg px-6 text-sm font-semibold text-white ${t.button}`}
              >
                Get it
              </button>
            </div>

            <div className="px-4 pb-4 pt-2">
              <p className="break-words text-[15px] leading-relaxed text-zinc-700">{p.description}</p>
              {p.deliverables.length > 0 && (
                <ul className="mt-3 space-y-1.5 text-sm text-zinc-700">
                  {p.deliverables.map((d, j) => (
                    <li key={j} className="flex gap-2">
                      <span className={`font-bold ${t.accent}`}>✓</span>
                      <span className="break-words">{d}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </article>
        ))}
      </div>

      <footer className="px-6 pt-6 text-center text-xs text-zinc-400">Built with Storefront AI · prototype for SuperProfile</footer>

      {toast && (
        <div role="status" className="fixed inset-x-4 bottom-6 z-50 mx-auto max-w-sm rounded-xl bg-zinc-900 px-4 py-3 text-center text-sm text-white shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
