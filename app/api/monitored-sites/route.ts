import { NextRequest, NextResponse } from 'next/server';
import { validatePublicSiteUrl } from '@/lib/config';
import {
  getMonitoredSites,
  createMonitoredSite,
  updateMonitoredSite,
  deleteMonitoredSite
} from '@/lib/storage';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const result = await getMonitoredSites();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ ready: false, sites: [], reason: error instanceof Error ? error.message : 'Failed to fetch sites' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      url?: string;
      name?: string;
      crawlLimit?: number;
      checkIntervalMinutes?: number;
      alertEmail?: string;
    };

    if (!body.url || typeof body.url !== 'string') {
      return NextResponse.json({ error: 'Website URL is required.' }, { status: 400 });
    }

    let validatedUrl: string;
    try {
      validatedUrl = await validatePublicSiteUrl(body.url.trim());
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Invalid website URL' }, { status: 400 });
    }

    const crawlLimit = typeof body.crawlLimit === 'number' ? body.crawlLimit : 30;
    const checkIntervalMinutes = typeof body.checkIntervalMinutes === 'number' ? body.checkIntervalMinutes : 60;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const alertEmail = typeof body.alertEmail === 'string' ? body.alertEmail.trim() : '';

    const saveResult = await createMonitoredSite({
      url: validatedUrl,
      name,
      crawlLimit,
      checkIntervalMinutes,
      alertEmail,
    });

    if (!saveResult.saved) {
      return NextResponse.json({ error: saveResult.reason }, { status: 400 });
    }

    return NextResponse.json({ ok: true, site: saveResult.site });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to add monitored site.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json() as {
      id?: string;
      name?: string;
      isActive?: boolean;
      crawlLimit?: number;
      checkIntervalMinutes?: number;
      alertEmail?: string;
    };

    if (!body.id || typeof body.id !== 'string') {
      return NextResponse.json({ error: 'Site ID is required.' }, { status: 400 });
    }

    const patch: {
      name?: string;
      isActive?: boolean;
      crawlLimit?: number;
      checkIntervalMinutes?: number;
      alertEmail?: string;
    } = {};

    if (typeof body.name === 'string') patch.name = body.name.trim();
    if (typeof body.isActive === 'boolean') patch.isActive = body.isActive;
    if (typeof body.crawlLimit === 'number') patch.crawlLimit = body.crawlLimit;
    if (typeof body.checkIntervalMinutes === 'number') patch.checkIntervalMinutes = body.checkIntervalMinutes;
    if (typeof body.alertEmail === 'string') patch.alertEmail = body.alertEmail.trim();

    const result = await updateMonitoredSite(body.id, patch);
    if (!result.saved) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }

    return NextResponse.json({ ok: true, site: result.site });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update monitored site.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Site ID is required in query parameters.' }, { status: 400 });
    }

    const result = await deleteMonitoredSite(id);
    if (!result.deleted) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to delete monitored site.' }, { status: 500 });
  }
}

