'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Activity, Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showSetupWarning, setShowSetupWarning] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const access = params.get('access');
    if (access === 'denied') {
      void getSupabaseBrowserClient().auth.signOut().then(() => setError('This account is not allowed to access the dashboard. Sign in with an approved account.')).catch(() => setError('This account is not allowed. Sign out in Supabase or clear this browser session, then sign in with an approved account.'));
    } else if (access === 'misconfigured') {
      void getSupabaseBrowserClient().auth.signOut().then(() => setError('Production access is locked: DASHBOARD_ALLOWED_EMAILS is empty or not configured on the server. Set DASHBOARD_ALLOWED_EMAILS to permit authorized accounts.')).catch(() => setError('Production access is locked: DASHBOARD_ALLOWED_EMAILS is empty or not configured on the server.'));
    }
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (signInError) throw signInError;
      setNotice('Signed in successfully. Opening your dashboard…');
      window.location.assign('/');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sign in failed. Verify the email and password.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
    <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9">
      <div className="mb-7 flex items-center gap-3"><div className="rounded-xl bg-brand-700 p-3 text-white"><Activity size={24}/></div><div><h1 className="text-xl font-bold">Website Monitor <span className="text-brand-700">AI</span></h1><p className="text-sm text-slate-500">Sign in to your protected dashboard</p></div></div>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <label className="block"><span className="mb-1.5 block text-sm font-semibold text-slate-700">Email address</span><span className="relative block"><Mail size={17} className="absolute left-3 top-3 text-slate-400"/><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required placeholder="you@example.com" className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-3 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"/></span></label>
        <label className="block"><span className="mb-1.5 block text-sm font-semibold text-slate-700">Password</span><span className="relative block"><LockKeyhole size={17} className="absolute left-3 top-3 text-slate-400"/><input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required placeholder="Your password" className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-11 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"/><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute right-3 top-3 text-slate-400 hover:text-slate-700">{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></span></label>
        {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
        <button disabled={busy} className="w-full rounded-xl bg-brand-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60">{busy ? 'Signing in…' : 'Sign in securely'}</button>
      </form>
      <div className="mt-6 rounded-xl bg-slate-50 p-4 text-xs leading-5 text-slate-600"><b>First-time setup:</b> create an allowed account from Supabase Dashboard → Authentication → Users → Add user. Public sign-up is intentionally not provided here. Also disable user sign-ups in Supabase Auth settings so strangers cannot register through the provider API.</div>
      {showSetupWarning && <p className="mt-3 text-xs leading-5 text-amber-800">Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local, then restart the development server.</p>}
    </section>
  </main>;
}
