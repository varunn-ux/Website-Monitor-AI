import { NextResponse } from 'next/server';
import { getIssueTracking, saveIssueTracking } from '@/lib/storage';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const siteUrl = url.searchParams.get('siteUrl') || '';
  if (!siteUrl) return NextResponse.json({ error: 'siteUrl is required.' }, { status: 400 });
  const result = await getIssueTracking(siteUrl);
  return NextResponse.json(result, { status: result.ready ? 200 : 503 });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const requiredStrings = ['siteUrl', 'issueKey', 'issueTitle', 'category', 'severity', 'status'];
    for (const field of requiredStrings) {
      if (typeof body[field] !== 'string' || !String(body[field]).trim()) {
        return NextResponse.json({ error: `${field} is required.` }, { status: 400 });
      }
    }
    const result = await saveIssueTracking({
      siteUrl: body.siteUrl as string,
      issueKey: body.issueKey as string,
      issueTitle: body.issueTitle as string,
      category: body.category as string,
      severity: body.severity as string,
      url: typeof body.url === 'string' ? body.url : '',
      status: body.status as string,
      owner: typeof body.owner === 'string' ? body.owner : '',
      notes: typeof body.notes === 'string' ? body.notes : '',
    });
    return NextResponse.json(result, { status: result.saved ? 200 : 503 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to save issue tracking.' }, { status: 400 });
  }
}
