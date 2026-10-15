import { NextResponse } from 'next/server';
import { getHistory } from '@/lib/storage';
import { getSiteUrl } from '@/lib/config';
export const runtime = 'nodejs';
export async function GET() {
  const history = await getHistory();
  let defaultSiteUrl = '';
  try { defaultSiteUrl = getSiteUrl(); } catch { /* the dashboard allows an explicit URL without a default */ }
  return NextResponse.json({ ...history, defaultSiteUrl });
}
