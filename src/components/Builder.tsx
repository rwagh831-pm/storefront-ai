"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import StoreView, { FORMAT_EMOJI, RingAvatar, THEME_STYLES, formatINR } from "./StoreView";
import { isRuleFlag } from "@/lib/guardrails";
import {
  FORMATS,
  FORMAT_LABELS,
  LANGUAGES,
  THEMES,
  type CreatorProfile,
  type Language,
  type Product,
  type Store,
  type ThemeName,
} from "@/lib/schemas";

type Sample = { handle: string; label: string; category: string; followers: number };
type Question = { id: string; question: string; options: string[] };
type Step = "start" | "needsMore" | "confirm" | "editor" | "published";
type Published = { slug: string; editToken: string };

const DRAFT_KEY = "sfg-draft-v1";
const AUDIENCE_CHOICES = [
  { label: "Under 5K", value: 2000 },
  { label: "5K–15K", value: 10000 },
  { label: "15K–50K", value: 30000 },
  { label: "50K+", value: 75000 },
];
const PROGRESS = [
  "Reading your strengths…",
  "Finding products your audience will buy…",
  "Pricing for Indian buyers…",
  "Writing your bio and descriptions…",
  "Checking everything is safe to publish…",
];

async function api<T>(url: string, body: unknown): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 75_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const json = await res.json().catch(() => null);
    if (!json) throw new Error("We couldn't reach the server. Check your internet and try again.");
    if (!json.ok) throw new Error(json.error?.message ?? "Something went wrong. Please try again.");
    return json as T;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw new Error("This is taking too long. Please try again.");
    throw e instanceof Error ? e : new Error("Something went wrong.");
  } finally {
    clearTimeout(timer);
  }
}

export default function Builder({ samples }: { samples: Sample[] }) {
  const [step, setStep] = useState<Step>("start");
  const [tab, setTab] = useState<"handle" | "description">("handle");
  const [handleInput, setHandleInput] = useState("");
  const [descInput, setDescInput] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [profile, setProfile] = useState<CreatorProfile | null>(null);
  const [language, setLanguage] = useState<Language>("English");
  const [store, setStore] = useState<Store | null>(null);
  const [published, setPublished] = useState<Published | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState<string | null>(null); // full-screen loading message
  const [busy, setBusy] = useState<string | null>(null); // "bio" | "p0".."p3" | "publish"
  const [error, setError] = useState<{ message: string; retry?: () => void } | null>(null);
  const [view, setView] = useState<"edit" | "preview">("edit");
  const [openReason, setOpenReason] = useState<number | null>(null);
  const restored = useRef(false);

  // ---- Restore draft (so a refresh or a dropped connection never loses work) ----
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d.store && d.profile) {
          // Reading localStorage (an external system) once on mount is the intended use of an effect.
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setProfile(d.profile);
          setStore(d.store);
          setLanguage(d.language ?? "English");
          setPublished(d.published ?? null);
          setStartedAt(d.startedAt ?? null);
          setStep(d.published ? "published" : "editor");
        }
      }
    } catch {}
    restored.current = true;
  }, []);

  useEffect(() => {
    if (!restored.current) return;
    try {
      if (store && profile) localStorage.setItem(DRAFT_KEY, JSON.stringify({ store, profile, language, published, startedAt }));
    } catch {}
  }, [store, profile, language, published, startedAt]);

  // ---- Cycling progress text while generating ----
  const [progressIdx, setProgressIdx] = useState(0);
  useEffect(() => {
    if (!loading) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProgressIdx(0);
    const id = setInterval(() => setProgressIdx((i) => Math.min(i + 1, PROGRESS.length - 1)), 2500);
    return () => clearInterval(id);
  }, [loading]);

  // Errors appear at the top of the screen, so bring them into view.
  useEffect(() => {
    if (error) window.scrollTo({ top: 0, behavior: "smooth" });
  }, [error]);

  function begin() {
    if (!startedAt) setStartedAt(Date.now());
  }

  // ---------------- Step 1: understand ----------------
  async function readHandle(h?: string) {
    const handle = (h ?? handleInput).trim();
    if (!handle) {
      setError({ message: "Type your Instagram handle, or pick a sample creator below." });
      return;
    }
    begin();
    setError(null);
    setNotice(null);
    setHandleInput(handle.startsWith("@") ? handle : `@${handle}`);
    setLoading("Reading your Instagram profile…");
    try {
      const res = await api<{ status: string; message?: string; profile?: CreatorProfile }>("/api/profile", { mode: "handle", handle });
      if (res.status === "ready" && res.profile) {
        setProfile(res.profile);
        setLanguage(res.profile.language);
        setStep("confirm");
      } else {
        // not_found | private | rejected → graceful fallback to description
        setNotice(res.message ?? "We couldn't read that profile. Tell us about yourself instead.");
        setTab("description");
      }
    } catch (e) {
      setError({ message: (e as Error).message, retry: () => readHandle(handle) });
    } finally {
      setLoading(null);
    }
  }

  async function readDescription(withAnswers?: Record<string, string>) {
    if (!descInput.trim() && !withAnswers) {
      setError({ message: "Write one line about what you do — for example, “I teach home workouts to working women.”" });
      return;
    }
    begin();
    setError(null);
    setLoading("Understanding what you do…");
    try {
      const res = await api<{ status: string; message?: string; profile?: CreatorProfile; questions?: Question[] }>("/api/profile", {
        mode: "description",
        description: descInput,
        answers: withAnswers,
      });
      if (res.status === "ready" && res.profile) {
        setProfile(res.profile);
        setLanguage(res.profile.language);
        setStep("confirm");
      } else if (res.status === "needs_more" && res.questions?.length) {
        setQuestions(res.questions);
        setAnswers({});
        setNotice(res.message ?? null);
        setStep("needsMore");
      } else {
        setNotice(res.message ?? "Tell us a little more.");
        setStep("start");
        setTab("description");
      }
    } catch (e) {
      setError({ message: (e as Error).message, retry: () => readDescription(withAnswers) });
    } finally {
      setLoading(null);
    }
  }

  // ---------------- Step 2: generate ----------------
  async function generateAll(lang: Language = language) {
    if (!profile) return;
    setError(null);
    setLoading("Building your store…");
    try {
      const res = await api<{ store: Store }>("/api/generate", { profile, language: lang, target: { type: "all" } });
      setStore(published && store ? { ...res.store, theme: store.theme } : res.store);
      setLanguage(lang);
      setView("edit");
      setStep("editor");
    } catch (e) {
      setError({ message: (e as Error).message, retry: () => generateAll(lang) });
    } finally {
      setLoading(null);
    }
  }

  async function regenBio() {
    if (!profile || !store) return;
    setBusy("bio");
    setError(null);
    try {
      const res = await api<{ bio: { bio: string; tagline: string } }>("/api/generate", { profile, language, target: { type: "bio" }, store });
      setStore({ ...store, ...res.bio });
    } catch (e) {
      setError({ message: (e as Error).message, retry: regenBio });
    } finally {
      setBusy(null);
    }
  }

  async function regenProduct(index: number) {
    if (!profile || !store) return;
    setBusy(`p${index}`);
    setError(null);
    try {
      const res = await api<{ product: Product; shareCaption?: string }>("/api/generate", { profile, language, target: { type: "product", index }, store });
      const products = [...store.products];
      products[index] = res.product;
      setStore({ ...store, products, shareCaption: res.shareCaption || store.shareCaption });
    } catch (e) {
      setError({ message: (e as Error).message, retry: () => regenProduct(index) });
    } finally {
      setBusy(null);
    }
  }

  function updateProduct(i: number, patch: Partial<Product>) {
    if (!store) return;
    const products = store.products.map((p, j) => (j === i ? { ...p, ...patch } : p));
    setStore({ ...store, products });
  }

  function removeProduct(i: number) {
    if (!store || store.products.length <= 2) return;
    setStore({ ...store, products: store.products.filter((_, j) => j !== i) });
  }

  // ---------------- Step 3: publish ----------------
  async function publish() {
    if (!store) return;
    setBusy("publish");
    setError(null);
    try {
      const res = await api<{ slug: string; editToken: string }>("/api/publish", {
        store,
        handle: profile?.handle ?? null,
        slug: published?.slug,
        editToken: published?.editToken,
        startedAt,
      });
      setPublished({ slug: res.slug, editToken: res.editToken });
      setStep("published");
    } catch (e) {
      setError({ message: (e as Error).message, retry: publish });
    } finally {
      setBusy(null);
    }
  }

  function startOver() {
    // Never throw away a creator's work without asking.
    if (store && !window.confirm(published ? "Start a new store? Your published store stays live." : "Start over? Your unpublished store will be lost.")) return;
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {}
    setStep("start");
    setProfile(null);
    setStore(null);
    setPublished(null);
    setStartedAt(null);
    setHandleInput("");
    setDescInput("");
    setNotice(null);
    setError(null);
    setTab("handle");
  }

  // ======================= RENDER =======================
  const stage = step === "start" || step === "needsMore" ? 0 : step === "confirm" ? 1 : step === "editor" ? 2 : 3;
  if (loading) return <LoadingScreen title={loading} detail={loading.startsWith("Building") ? PROGRESS[progressIdx] : null} />;

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md bg-[#f0f2f5] pb-32">
      <TopBar onReset={step !== "start" ? startOver : undefined} />
      <StepBar stage={stage} />
      {error && <ErrorBox message={error.message} onRetry={error.retry} onClose={() => setError(null)} />}

      {step === "start" && (
        <>
          {/* Stories-style row of sample creators */}
          <section className="bg-white pb-3 pt-3">
            <div className="flex items-baseline justify-between px-4">
              <p className="text-sm font-semibold text-zinc-900">Try a sample creator</p>
              <p className="text-[11px] text-zinc-500">fictional · prototype</p>
            </div>
            <div className="no-scrollbar mt-3 flex gap-3 overflow-x-auto px-4 pb-1">
              {samples.map((s) => (
                <button key={s.handle} type="button" onClick={() => readHandle(s.handle)} className="flex w-[72px] shrink-0 flex-col items-center gap-1">
                  <RingAvatar name={s.label} theme={sampleTheme(s.category)} size="md" />
                  <span className="w-full truncate text-center text-[11px] text-zinc-800">{s.handle}</span>
                  <span className="w-full truncate text-center text-[10px] text-zinc-500">{s.category}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="mt-2 bg-white px-4 pb-6 pt-5">
            <h1 className="text-[26px] font-extrabold leading-tight text-zinc-900">Your store, ready in 2 minutes.</h1>
            <p className="mt-2 text-[15px] text-zinc-600">We suggest what to sell, price it in ₹ for your audience, and write your page. You can change anything.</p>

            <div className="mt-5 grid grid-cols-2 rounded-xl bg-zinc-100 p-1 text-sm font-semibold">
              {(["handle", "description"] as const).map((t) => (
                <button key={t} type="button" onClick={() => setTab(t)} className={`min-h-11 rounded-lg ${tab === t ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500"}`}>
                  {t === "handle" ? "📸 Instagram" : "✍️ Describe myself"}
                </button>
              ))}
            </div>

            {notice && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">{notice}</p>}

            {tab === "handle" ? (
              <div className="mt-4">
                <label htmlFor="handle" className="text-sm font-medium text-zinc-700">Your Instagram handle</label>
                <div className="mt-1 flex items-center gap-2 rounded-xl border border-zinc-300 bg-zinc-50 pl-4 focus-within:border-blue-600 focus-within:bg-white">
                  <span className="text-zinc-400">@</span>
                  <input
                    id="handle"
                    inputMode="text"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    maxLength={60}
                    placeholder="yourname"
                    value={handleInput.replace(/^@/, "")}
                    onChange={(e) => setHandleInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && readHandle()}
                    className="min-h-12 w-full bg-transparent text-base outline-none"
                  />
                </div>
                <button type="button" onClick={() => readHandle()} className="mt-3 min-h-12 w-full rounded-xl bg-blue-600 font-semibold text-white active:bg-blue-700">
                  Read my profile
                </button>
                <p className="mt-3 text-xs leading-relaxed text-zinc-500">
                  Prototype note: live Instagram reading isn&apos;t connected yet. The sample creators above are fictional; any other handle shows the fallback.
                </p>
              </div>
            ) : (
              <div className="mt-4">
                <label htmlFor="desc" className="text-sm font-medium text-zinc-700">What do you do, and who do you help?</label>
                <textarea
                  id="desc"
                  rows={4}
                  maxLength={1000}
                  placeholder="e.g. I'm a CA with 8 years' experience. I help freelancers file ITR and save tax."
                  value={descInput}
                  onChange={(e) => setDescInput(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-zinc-300 bg-zinc-50 p-4 text-base outline-none focus:border-blue-600 focus:bg-white"
                />
                <p className="mt-1 text-xs text-zinc-500">English, Hindi or Hinglish — all fine.</p>
                <button type="button" onClick={() => readDescription()} className="mt-3 min-h-12 w-full rounded-xl bg-blue-600 font-semibold text-white active:bg-blue-700">
                  Continue
                </button>
              </div>
            )}
          </section>
        </>
      )}

      {step === "needsMore" && (
        <section className="bg-white px-4 pb-6 pt-5">
          <h1 className="text-2xl font-bold text-zinc-900">Two quick questions</h1>
          {notice && <p className="mt-2 text-[15px] text-zinc-600">{notice}</p>}
          <div className="mt-5 space-y-6">
            {questions.map((q) => (
              <div key={q.id}>
                <p className="font-semibold text-zinc-800">{q.question}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {q.options.map((o) => (
                    <button
                      key={o}
                      type="button"
                      onClick={() => setAnswers({ ...answers, [q.id]: o })}
                      className={`min-h-10 rounded-full px-4 text-sm ring-1 ${answers[q.id] === o ? "bg-blue-600 text-white ring-blue-600" : "bg-white text-zinc-800 ring-zinc-300"}`}
                    >
                      {o}
                    </button>
                  ))}
                </div>
                <div className="mt-2">
                  <AutoText
                    singleLine
                    placeholder="Or type your own answer"
                    maxLength={200}
                    value={answers[q.id] && !q.options.includes(answers[q.id]) ? answers[q.id] : ""}
                    onChange={(v) => setAnswers({ ...answers, [q.id]: v })}
                  />
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            disabled={questions.some((q) => !answers[q.id]?.trim())}
            onClick={() => readDescription(Object.fromEntries(questions.map((q) => [q.question, answers[q.id]])))}
            className="mt-6 min-h-12 w-full rounded-xl bg-blue-600 font-semibold text-white disabled:opacity-40"
          >
            Continue
          </button>
        </section>
      )}

      {step === "confirm" && profile && (
        <ConfirmStep profile={profile} language={language} onChange={setProfile} onLanguage={setLanguage} onBuild={() => generateAll(language)} />
      )}

      {step === "editor" && store && (
        <>
          <div className="sticky top-0 z-20 bg-white/95 px-4 pb-2 pt-2 shadow-sm backdrop-blur">
            <div className="grid grid-cols-2 rounded-xl bg-zinc-100 p-1 text-sm font-semibold">
              {(["edit", "preview"] as const).map((v) => (
                <button key={v} type="button" onClick={() => setView(v)} className={`min-h-10 rounded-lg ${view === v ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500"}`}>
                  {v === "edit" ? "✏️ Edit" : "📱 Preview"}
                </button>
              ))}
            </div>
          </div>

          {view === "preview" ? (
            <div className="mt-2">
              <StoreView store={store} handle={profile?.handle ?? null} />
            </div>
          ) : (
            <div className="space-y-2 pt-2">
              {store.safetyNotes.length > 0 && (
                <div className="mx-2 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900 ring-1 ring-emerald-200">
                  <p className="font-semibold">🛡️ We kept your store safe to publish</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {store.safetyNotes.map((n, i) => (
                      <li key={i}>
                        {n.issue} <span className="text-emerald-700">{n.action}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <section className="bg-white px-4 py-4">
                <div className="flex items-center gap-3">
                  <RingAvatar name={store.displayName || "?"} theme={store.theme} size="md" />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-zinc-900">{store.displayName || "Your name"}</p>
                    <p className="truncate text-sm text-zinc-500">{profile?.handle ? `@${profile.handle}` : "Your store"}</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                  <span className="w-16 font-semibold text-zinc-700">Language</span>
                  {LANGUAGES.map((l) => (
                    <button
                      key={l}
                      type="button"
                      disabled={!!busy}
                      onClick={() => l !== language && generateAll(l)}
                      className={`min-h-9 rounded-full px-3 ring-1 disabled:opacity-40 ${l === language ? "bg-blue-600 text-white ring-blue-600" : "ring-zinc-300"}`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                  <span className="w-16 font-semibold text-zinc-700">Style</span>
                  {THEMES.map((th) => (
                    <button
                      key={th}
                      type="button"
                      aria-label={`${THEME_STYLES[th].name} style`}
                      onClick={() => setStore({ ...store, theme: th })}
                      className={`h-9 w-9 rounded-full bg-gradient-to-tr ${THEME_STYLES[th].ring} ${store.theme === th ? "ring-4 ring-blue-600/40 ring-offset-2" : ""}`}
                    />
                  ))}
                </div>
              </section>

              <Card title="Profile" subtitle="Name, tagline and bio" busy={busy === "bio"} onRegen={regenBio} regenLabel="Rewrite">
                <Field label="Name">
                  <input maxLength={80} value={store.displayName} onChange={(e) => setStore({ ...store, displayName: e.target.value })} className={inputCls} />
                </Field>
                <Field label="Tagline">
                  <AutoText singleLine maxLength={160} value={store.tagline} onChange={(v) => setStore({ ...store, tagline: v })} />
                </Field>
                <Field label="Bio">
                  <AutoText minRows={3} maxLength={600} value={store.bio} onChange={(v) => setStore({ ...store, bio: v })} />
                </Field>
              </Card>

              {store.products.map((p, i) => (
                <Card
                  key={i}
                  title={`${FORMAT_EMOJI[p.format]} Offer ${i + 1}`}
                  subtitle={`${FORMAT_LABELS[p.format]} · ${formatINR(p.price)}`}
                  busy={busy === `p${i}`}
                  onRegen={() => regenProduct(i)}
                  regenLabel="New idea"
                  onRemove={store.products.length > 2 ? () => removeProduct(i) : undefined}
                >
                  <Field label="Title">
                    <AutoText singleLine maxLength={100} value={p.title} onChange={(v) => updateProduct(i, { title: v })} />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Format">
                      <select value={p.format} onChange={(e) => updateProduct(i, { format: e.target.value as Product["format"] })} className={inputCls}>
                        {FORMATS.map((f) => (
                          <option key={f} value={f}>
                            {FORMAT_LABELS[f]}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Price (₹)">
                      <input
                        inputMode="numeric"
                        maxLength={5}
                        value={String(p.price)}
                        onChange={(e) => updateProduct(i, { price: Number(e.target.value.replace(/\D/g, "").slice(0, 5)) || 0 })}
                        className={inputCls}
                      />
                    </Field>
                  </div>
                  <button type="button" onClick={() => setOpenReason(openReason === i ? null : i)} className="text-left text-sm font-semibold text-blue-700">
                    💡 Why {formatINR(p.price)}?
                  </button>
                  {openReason === i && <p className="rounded-xl bg-blue-50 p-3 text-sm text-blue-900">{p.priceReason}</p>}
                  <Field label="Description">
                    <AutoText minRows={3} maxLength={700} value={p.description} onChange={(v) => updateProduct(i, { description: v })} />
                  </Field>
                  <Field label="Who it's for">
                    <AutoText singleLine maxLength={200} value={p.whoItsFor} onChange={(v) => updateProduct(i, { whoItsFor: v })} />
                  </Field>
                  <Field label="What they get (one per line)">
                    <AutoText
                      minRows={2}
                      value={p.deliverables.join("\n")}
                      onChange={(v) => updateProduct(i, { deliverables: v.split("\n").slice(0, 8) })}
                      onBlur={(v) => updateProduct(i, { deliverables: v.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 8) })}
                    />
                  </Field>
                </Card>
              ))}

              {store.products.length < 4 && (
                <div className="px-2">
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => regenProduct(store.products.length)}
                    className="min-h-12 w-full rounded-xl border-2 border-dashed border-zinc-300 bg-white text-sm font-semibold text-zinc-600 disabled:opacity-40"
                  >
                    {busy === `p${store.products.length}` ? "Thinking of an idea…" : "+ Add another offer"}
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200 bg-white/95 p-3 backdrop-blur">
            <div className="mx-auto flex max-w-md gap-2">
              <button
                type="button"
                disabled={!!busy}
                onClick={() => generateAll(language)}
                className="min-h-12 flex-1 rounded-xl bg-zinc-100 text-sm font-semibold text-zinc-800 disabled:opacity-40"
              >
                ↻ Regenerate all
              </button>
              <button
                type="button"
                disabled={!!busy}
                onClick={publish}
                className="min-h-12 flex-[1.4] rounded-xl bg-blue-600 text-sm font-semibold text-white active:bg-blue-700 disabled:opacity-40"
              >
                {busy === "publish" ? "Publishing…" : published ? "Update my store" : "Publish my store"}
              </button>
            </div>
          </div>
        </>
      )}

      {step === "published" && published && store && (
        <PublishedStep
          published={published}
          store={store}
          handle={profile?.handle ?? null}
          onEdit={() => {
            setStep("editor");
            setView("edit");
          }}
          onStartOver={startOver}
        />
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
const inputCls = "w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3 py-2.5 text-base outline-none focus:border-blue-600 focus:bg-white";

/**
 * A text box that grows to fit its content, so long AI text is always fully visible on a phone
 * (no sideways scrolling, no inner scrollbar). `singleLine` blocks the Enter key for fields
 * like titles that must stay one line in the data, while still wrapping visually.
 */
function AutoText({
  value,
  onChange,
  onBlur,
  singleLine = false,
  minRows = 1,
  maxLength,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: (v: string) => void;
  singleLine?: boolean;
  minRows?: number;
  maxLength?: number;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={minRows}
      value={value}
      maxLength={maxLength}
      placeholder={placeholder}
      enterKeyHint={singleLine ? "done" : undefined}
      onKeyDown={(e) => {
        if (singleLine && e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLTextAreaElement).blur();
        }
      }}
      onChange={(e) => onChange(singleLine ? e.target.value.replace(/\s*\n+\s*/g, " ") : e.target.value)}
      onBlur={(e) => onBlur?.(e.target.value)}
      className={`${inputCls} resize-none overflow-hidden leading-relaxed`}
    />
  );
}

function sampleTheme(category: string): ThemeName {
  if (/finance|tax|exam/i.test(category)) return "ocean";
  if (/design/i.test(category)) return "forest";
  if (/fitness|astrology/i.test(category)) return "plum";
  return "sunset";
}

function TopBar({ onReset }: { onReset?: () => void }) {
  return (
    <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3">
      <span className="flex items-center gap-1.5 text-[19px] font-extrabold tracking-tight text-zinc-900">
        storefront
        <span className="rounded-md bg-gradient-to-tr from-amber-400 via-rose-500 to-violet-600 px-1.5 py-0.5 text-[11px] font-bold text-white">AI</span>
      </span>
      {onReset && (
        <button type="button" onClick={onReset} className="min-h-9 rounded-full px-3 text-sm font-medium text-zinc-600 active:bg-zinc-100">
          Start over
        </button>
      )}
    </div>
  );
}

const STAGES = ["You", "Check", "Edit", "Share"];
function StepBar({ stage }: { stage: number }) {
  return (
    <div className="bg-white px-4 pb-2 pt-1">
      <div className="flex gap-1">
        {STAGES.map((s, i) => (
          <div key={s} className="flex-1">
            <div className={`h-1 rounded-full ${i <= stage ? "bg-blue-600" : "bg-zinc-200"}`} />
            <p className={`mt-1 text-[10px] font-medium ${i === stage ? "text-blue-700" : "text-zinc-400"}`}>{s}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function LoadingScreen({ title, detail }: { title: string; detail: string | null }) {
  return (
    <main className="mx-auto min-h-dvh max-w-md bg-white">
      <div className="h-28 animate-pulse bg-zinc-200" />
      <div className="px-4">
        <div className="-mt-12 h-24 w-24 animate-pulse rounded-full border-4 border-white bg-zinc-300" />
        <div className="mt-4 h-5 w-40 animate-pulse rounded bg-zinc-200" />
        <div className="mt-2 h-4 w-24 animate-pulse rounded bg-zinc-100" />
        <div className="mt-4 space-y-2">
          <div className="h-3 w-full animate-pulse rounded bg-zinc-100" />
          <div className="h-3 w-5/6 animate-pulse rounded bg-zinc-100" />
        </div>
      </div>
      <div className="mx-4 mt-8 rounded-2xl bg-blue-50 p-5 text-center" role="status" aria-live="polite">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
        <p className="mt-3 font-semibold text-zinc-900">{title}</p>
        {detail && <p className="mt-1 text-sm text-zinc-600">{detail}</p>}
        <p className="mt-3 text-xs text-zinc-400">Usually 10–20 seconds</p>
      </div>
      <div className="mt-6 space-y-3 bg-zinc-100 py-3">
        {[0, 1].map((k) => (
          <div key={k} className="bg-white p-4">
            <div className="aspect-[4/3] animate-pulse rounded bg-zinc-200" />
          </div>
        ))}
      </div>
    </main>
  );
}

function ErrorBox({ message, onRetry, onClose }: { message: string; onRetry?: () => void; onClose: () => void }) {
  return (
    <div role="alert" className="mx-2 mt-2 rounded-xl bg-red-50 p-3 text-sm text-red-900 ring-1 ring-red-200">
      <p>{message}</p>
      <div className="mt-2 flex gap-4">
        {onRetry && (
          <button type="button" onClick={onRetry} className="font-semibold underline">
            Try again
          </button>
        )}
        <button type="button" onClick={onClose} className="text-red-700">
          Dismiss
        </button>
      </div>
    </div>
  );
}

function Card({
  title,
  subtitle,
  children,
  busy,
  onRegen,
  regenLabel,
  onRemove,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  busy: boolean;
  onRegen: () => void;
  regenLabel: string;
  onRemove?: () => void;
}) {
  return (
    <section className={`space-y-3 bg-white px-4 py-4 ${busy ? "animate-pulse opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate font-bold text-zinc-900">{title}</h2>
          {subtitle && <p className="truncate text-xs text-zinc-500">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 gap-2">
          {onRemove && (
            <button type="button" onClick={onRemove} disabled={busy} className="min-h-9 rounded-full px-3 text-xs text-zinc-500 ring-1 ring-zinc-200">
              Remove
            </button>
          )}
          <button type="button" onClick={onRegen} disabled={busy} className="min-h-9 rounded-full bg-blue-50 px-3 text-xs font-semibold text-blue-700">
            {busy ? "Working…" : `↻ ${regenLabel}`}
          </button>
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</span>
      {children}
    </label>
  );
}

function ConfirmStep({
  profile,
  language,
  onChange,
  onLanguage,
  onBuild,
}: {
  profile: CreatorProfile;
  language: Language;
  onChange: (p: CreatorProfile) => void;
  onLanguage: (l: Language) => void;
  onBuild: () => void;
}) {
  const selectedAudience =
    profile.followers === null
      ? null
      : AUDIENCE_CHOICES.reduce((best, c) => (Math.abs(c.value - (profile.followers ?? 0)) < Math.abs(best.value - (profile.followers ?? 0)) ? c : best));
  const canBuild = profile.name.trim() && profile.niche.trim();
  return (
    <>
      <section className="bg-white px-4 pb-5 pt-5">
        <h1 className="text-2xl font-bold text-zinc-900">Here&apos;s what we understood</h1>
        <p className="mt-1 text-[15px] text-zinc-600">Fix anything that&apos;s wrong — your store is built from this.</p>
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-zinc-50 p-3 ring-1 ring-zinc-200">
          <RingAvatar name={profile.name || "?"} theme="plum" size="md" />
          <div className="min-w-0">
            <p className="truncate font-semibold text-zinc-900">{profile.name || "Your name"}</p>
            <p className="truncate text-sm text-zinc-500">
              {profile.handle ? `@${profile.handle}` : "No Instagram"}
              {profile.followers !== null && profile.handle ? ` · ${profile.followers.toLocaleString("en-IN")} followers` : ""}
            </p>
            <p className="line-clamp-2 text-sm text-zinc-700">{profile.niche}</p>
          </div>
        </div>
      </section>

      <section className="mt-2 space-y-4 bg-white px-4 py-5">
        <Field label="Your name">
          <input maxLength={80} value={profile.name} onChange={(e) => onChange({ ...profile, name: e.target.value })} className={inputCls} />
        </Field>
        <Field label="What you're known for">
          <AutoText singleLine maxLength={160} value={profile.niche} onChange={(v) => onChange({ ...profile, niche: v })} />
        </Field>
        <Field label="Who you help">
          <AutoText singleLine maxLength={200} value={profile.audience} onChange={(v) => onChange({ ...profile, audience: v })} />
        </Field>
        <div>
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">Followers</span>
          <div className="flex flex-wrap gap-2">
            {AUDIENCE_CHOICES.map((c) => (
              <button
                key={c.label}
                type="button"
                onClick={() => onChange({ ...profile, followers: c.value })}
                className={`min-h-10 rounded-full px-4 text-sm ring-1 ${selectedAudience?.label === c.label ? "bg-blue-600 text-white ring-blue-600" : "ring-zinc-300"}`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">Store language</span>
          <div className="flex flex-wrap gap-2">
            {LANGUAGES.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => onLanguage(l)}
                className={`min-h-10 rounded-full px-4 text-sm ring-1 ${l === language ? "bg-blue-600 text-white ring-blue-600" : "ring-zinc-300"}`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <Field label="Your strengths (one per line)">
          <AutoText
            minRows={2}
            maxLength={600}
            value={profile.strengths.join("\n")}
            onChange={(v) => onChange({ ...profile, strengths: v.split("\n").slice(0, 6) })}
            onBlur={(v) => onChange({ ...profile, strengths: v.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 6) })}
          />
        </Field>
        {profile.credentials.length > 0 && (
          <p className="text-sm text-zinc-600">
            <span className="font-semibold">Credentials we&apos;ll mention:</span> {profile.credentials.join(", ")}
          </p>
        )}
        {profile.demandSignals.length > 0 && (
          <div className="rounded-xl bg-blue-50 p-3 text-sm text-blue-900">
            <p className="font-semibold">📣 Your audience is asking for</p>
            <ul className="mt-1 list-disc pl-5">
              {profile.demandSignals.slice(0, 3).map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {profile.riskFlags.some(isRuleFlag) && (
        <div className="mx-2 mt-2 rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
          <p className="font-semibold">🛡️ Heads up</p>
          <p className="mt-1">Some of your content can&apos;t be sold on the platform as-is, so we&apos;ll leave it out and suggest safe alternatives:</p>
          <ul className="mt-2 list-disc pl-5">
            {profile.riskFlags.filter(isRuleFlag).map((f) => (
              <li key={f}>{f.replace(/^(PROHIBITED|RISKY CLAIM): /, "")}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="px-4 pt-4">
        <button
          type="button"
          disabled={!canBuild}
          onClick={() => {
            onChange({ ...profile, strengths: profile.strengths.map((s) => s.trim()).filter(Boolean) });
            onBuild();
          }}
          className="min-h-12 w-full rounded-xl bg-blue-600 font-semibold text-white active:bg-blue-700 disabled:opacity-40"
        >
          Build my store ✨
        </button>
      </div>
    </>
  );
}

function PublishedStep({
  published,
  store,
  handle,
  onEdit,
  onStartOver,
}: {
  published: Published;
  store: Store;
  handle: string | null;
  onEdit: () => void;
  onStartOver: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [stats, setStats] = useState<{ views: number; clicks: number } | null>(null);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = `${origin}/s/${published.slug}`;

  async function loadStats() {
    try {
      const r = await fetch(`/api/stats?slug=${encodeURIComponent(published.slug)}&token=${encodeURIComponent(published.editToken)}`);
      const j = await r.json();
      if (j.ok) setStats(j.stats);
    } catch {}
  }
  useEffect(() => {
    // Async fetch: state is set after the network call, not synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [published.slug]);

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
    } catch {
      setCopied("Couldn't copy — long-press the text to select it");
    }
    setTimeout(() => setCopied(null), 2200);
  }

  async function nativeShare() {
    try {
      if (navigator.share) await navigator.share({ title: store.displayName, text: store.tagline, url });
      else await copy(url, "Link copied");
    } catch {}
  }

  return (
    <>
      <section className="bg-white px-4 pb-5 pt-6 text-center">
        <div className="mx-auto w-fit">
          <RingAvatar name={store.displayName} theme={store.theme} />
        </div>
        <h1 className="mt-3 text-2xl font-extrabold text-zinc-900">Your store is live! 🎉</h1>
        <p className="mt-1 text-[15px] text-zinc-600">Share it now — the first hour matters most.</p>

        <div className="mt-5 flex items-center gap-2 rounded-xl bg-zinc-50 p-3 text-left ring-1 ring-zinc-200">
          <p className="min-w-0 flex-1 truncate font-mono text-sm text-zinc-900">{url.replace(/^https?:\/\//, "")}</p>
          <button type="button" onClick={() => copy(url, "Link copied")} className="min-h-9 shrink-0 rounded-lg bg-white px-3 text-sm font-semibold ring-1 ring-zinc-300">
            Copy
          </button>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-sm font-semibold">
          <a
            href={`https://wa.me/?text=${encodeURIComponent(`Check out my store 👉 ${url}`)}`}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-11 items-center justify-center rounded-xl bg-green-600 text-white"
          >
            WhatsApp
          </a>
          <button type="button" onClick={nativeShare} className="min-h-11 rounded-xl bg-zinc-100 text-zinc-900">
            Share…
          </button>
          <a href={`/s/${published.slug}`} target="_blank" rel="noreferrer" className="flex min-h-11 items-center justify-center rounded-xl bg-blue-600 text-white">
            Open
          </a>
        </div>
        {copied && <p className="mt-3 text-sm font-semibold text-green-700">{copied}</p>}
      </section>

      {/* Caption shown as a post preview */}
      <section className="mt-2 bg-white">
        <p className="px-4 pt-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">Ready-made post caption</p>
        <div className="flex items-center gap-3 px-4 py-3">
          <RingAvatar name={store.displayName} theme={store.theme} size="sm" />
          <p className="truncate text-sm font-semibold">{handle ?? store.displayName}</p>
        </div>
        <p className="whitespace-pre-line break-words px-4 text-sm text-zinc-800">{store.shareCaption}</p>
        <div className="p-4">
          <button type="button" onClick={() => copy(store.shareCaption, "Caption copied")} className="min-h-11 w-full rounded-xl bg-zinc-100 text-sm font-semibold">
            Copy caption
          </button>
        </div>
      </section>

      <section className="mt-2 bg-white p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Your store so far</p>
          <button type="button" onClick={loadStats} className="text-xs font-semibold text-blue-700">
            Refresh
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-center">
          <div className="rounded-xl bg-zinc-50 p-3">
            <p className="text-2xl font-bold">{stats?.views ?? 0}</p>
            <p className="text-xs text-zinc-500">Views</p>
          </div>
          <div className="rounded-xl bg-zinc-50 p-3">
            <p className="text-2xl font-bold">{stats?.clicks ?? 0}</p>
            <p className="text-xs text-zinc-500">Offer clicks</p>
          </div>
        </div>
      </section>

      <div className="mt-4 flex justify-center gap-6 text-sm">
        <button type="button" onClick={onEdit} className="font-semibold text-blue-700">
          Edit store
        </button>
        <button type="button" onClick={onStartOver} className="text-zinc-500">
          Create another
        </button>
      </div>
    </>
  );
}
