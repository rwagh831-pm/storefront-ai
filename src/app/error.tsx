"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="text-5xl">😕</div>
      <h1 className="mt-4 text-2xl font-bold text-zinc-900">Something went wrong</h1>
      <p className="mt-2 text-zinc-600">Your draft is saved on this phone. Please try again.</p>
      <button type="button" onClick={reset} className="mt-6 rounded-xl bg-zinc-900 px-6 py-3 font-semibold text-white">
        Try again
      </button>
    </main>
  );
}
