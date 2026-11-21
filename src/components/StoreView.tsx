"use client";

import { useState } from "react";
import { FORMAT_LABELS, type Store, type ThemeName } from "@/lib/schemas";

export const THEME_STYLES: Record<ThemeName, { hero: string; accent: string; chip: string; button: string; name: string }> = {
  sunset: { hero: "from-orange-400 via-rose-400 to-pink-500", accent: "text-rose-600", chip: "bg-rose-50 text-rose-700", button: "bg-rose-600 hover:bg-rose-700", name: "Sunset" },
  ocean: { hero: "from-sky-500 via-blue-500 to-indigo-600", accent: "text-blue-700", chip: "bg-blue-50 text-blue-700", button: "bg-blue-700 hover:bg-blue-800", name: "Ocean" },
  forest: { hero: "from-emerald-400 via-teal-500 to-cyan-600", accent: "text-emerald-700", chip: "bg-emerald-50 text-emerald-700", button: "bg-emerald-700 hover:bg-emerald-800", name: "Forest" },
  plum: { hero: "from-fuchsia-500 via-purple-500 to-violet-600", accent: "text-purple-700", chip: "bg-purple-50 text-purple-700", button: "bg-purple-700 hover:bg-purple-800", name: "Plum" },
};

export function formatINR(n: number) {
  return `₹${n.toLocaleString("en-IN")}`;
}

/** The creator's public storefront. Used both for the live page and the in-editor preview. */
export default function StoreView({
  store,
  handle,
  onBuyClick,
}: {
  store: Store;
  handle: string | null;
  onBuyClick?: (index: number) => void;
}) {
  const t = THEME_STYLES[store.theme] ?? THEME_STYLES.sunset;
  const [toast, setToast] = useState<string | null>(null);
  const initials = store.displayName
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="mx-auto w-full max-w-md bg-white text-zinc-900">
      <header className={`bg-gradient-to-br ${t.hero} px-6 pb-10 pt-12 text-center text-white`}>
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-white/25 text-2xl font-bold ring-4 ring-white/40">
          {initials || "★"}
        </div>
        <h1 className="text-2xl font-bold leading-tight">{store.displayName}</h1>
        {handle && <p className="mt-1 text-sm text-white/85">@{handle}</p>}
        {store.tagline && <p className="mt-3 text-base font-medium">{store.tagline}</p>}
      </header>

      <section className="-mt-6 px-4">
        <div className="rounded-2xl bg-white p-5 shadow-lg ring-1 ring-zinc-100">
          <p className="whitespace-pre-line text-[15px] leading-relaxed text-zinc-700">{store.bio}</p>
        </div>
      </section>

      <section className="space-y-4 px-4 py-6">
        {store.products.map((p, i) => (
          <article key={i} className="rounded-2xl p-5 ring-1 ring-zinc-200">
            <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${t.chip}`}>{FORMAT_LABELS[p.format]}</span>
            <h2 className="mt-3 text-lg font-bold leading-snug">{p.title}</h2>
            {p.whoItsFor && <p className="mt-1 text-sm text-zinc-500">{p.whoItsFor}</p>}
            <p className="mt-3 text-[15px] leading-relaxed text-zinc-700">{p.description}</p>
            {p.deliverables.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm text-zinc-700">
                {p.deliverables.map((d, j) => (
                  <li key={j} className="flex gap-2">
                    <span className={t.accent}>✓</span>
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-5 flex items-center justify-between gap-3">
              <span className="text-2xl font-extrabold">{formatINR(p.price)}</span>
              <button
                type="button"
                onClick={() => {
                  onBuyClick?.(i);
                  setToast("Checkout opens here on SuperProfile. This prototype doesn't take payments.");
                  setTimeout(() => setToast(null), 3500);
                }}
                className={`min-h-11 rounded-full px-6 py-3 text-sm font-semibold text-white ${t.button}`}
              >
                Get it
              </button>
            </div>
          </article>
        ))}
      </section>

      <footer className="px-6 pb-10 text-center text-xs text-zinc-400">
        Built with AI Storefront Generator · prototype for SuperProfile
      </footer>

      {toast && (
        <div role="status" className="fixed inset-x-4 bottom-6 z-50 mx-auto max-w-sm rounded-xl bg-zinc-900 px-4 py-3 text-center text-sm text-white shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
