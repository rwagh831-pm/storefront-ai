import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="text-5xl">🔍</div>
      <h1 className="mt-4 text-2xl font-bold text-zinc-900">This store doesn&apos;t exist (yet)</h1>
      <p className="mt-2 text-zinc-600">The link may be mistyped, or the store hasn&apos;t been published.</p>
      <Link href="/" className="mt-6 rounded-xl bg-zinc-900 px-6 py-3 font-semibold text-white">
        Create your own store
      </Link>
    </main>
  );
}
