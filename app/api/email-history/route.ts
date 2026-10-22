import { NextResponse } from 'next/server';
import { getEmailNotificationHistory } from '@/lib/storage';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const siteUrl = url.searchParams.get('siteUrl') || undefined;
  const history = await getEmailNotificationHistory(siteUrl);
  return NextResponse.json(history, { status: history.ready ? 200 : 503 });
}
