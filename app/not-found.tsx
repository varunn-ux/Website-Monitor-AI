import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-600">404</p>
        <h1 className="mt-3 font-heading text-3xl font-semibold tracking-tight text-slate-900">Page not found</h1>
        <p className="mt-3 text-sm text-slate-500">The page you were looking for does not exist or may have moved.</p>
        <Link href="/" className="mt-6 inline-flex items-center justify-center rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(79,70,229,0.2)] transition hover:bg-indigo-700">
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
