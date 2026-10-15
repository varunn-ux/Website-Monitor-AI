'use client';

import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';

export function AuthControls() {
  const [busy, setBusy] = useState(false);
  async function signOut() {
    setBusy(true);
    try {
      const supabase = getSupabaseBrowserClient();
      await supabase.auth.signOut();
      window.location.assign('/login');
    } finally {
      setBusy(false);
    }
  }
  return <button onClick={signOut} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"><LogOut size={15}/>{busy ? 'Signing out…' : 'Sign out'}</button>;
}
