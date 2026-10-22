import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSiteUrl } from '@/lib/config';
import { recordEmailNotification } from '@/lib/storage';

export const runtime = 'nodejs';

export async function POST() {
  const eventId = randomUUID();
  let siteUrl = '';
  try { siteUrl = getSiteUrl(); } catch { /* Logging test notifications is optional without a default site URL. */ }
  const logTestEvent = (status: 'accepted' | 'failed', triggerReason: string, providerMessageId?: string, errorReason?: string) => siteUrl
    ? recordEmailNotification({
        idempotencyKey: `test:${eventId}`,
        siteUrl,
        notificationType: 'test',
        triggerReason,
        status,
        providerMessageId,
        errorReason,
      })
    : Promise.resolve({ saved: false, reason: 'SITE_URL is not configured, so the test event cannot be associated with a website.' });
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const recipientList = (process.env.ALERT_EMAIL_TO ?? '').split(',').map((item) => item.trim()).filter(Boolean);
  const from = process.env.ALERT_EMAIL_FROM?.trim();

  if (!apiKey || !recipientList.length || !from) {
    await logTestEvent('failed', 'Test email requested with incomplete Resend configuration.', undefined, 'Email configuration is incomplete.');
    return NextResponse.json({
      ok: false,
      error: 'Email configuration is incomplete. Check RESEND_API_KEY, ALERT_EMAIL_TO, and ALERT_EMAIL_FROM in your environment.',
    }, { status: 400 });
  }

  const subject = `[Website Monitor AI] Test Alert Email`;
  const text = `This is a test notification from Website Monitor AI to verify that your Resend email delivery is working properly.\n\nSent to: ${recipientList.join(', ')}\nSent at: ${new Date().toLocaleString()}`;
  const html = `
    <div style="font-family:Arial,sans-serif;color:#0f172a;max-width:600px;margin:auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
      <div style="background:#2563eb;color:#fff;padding:20px">
        <h1 style="margin:0;font-size:20px">Website Monitor AI — Test Email</h1>
        <p style="margin:6px 0 0;font-size:14px;opacity:0.9">Email notification system verification</p>
      </div>
      <div style="padding:24px">
        <p style="font-size:15px;line-height:1.6;color:#334155">
          Great news! Your <strong>Website Monitor AI</strong> email alert pipeline is successfully connected to Resend.
        </p>
        <div style="background:#f8fafc;border-left:4px solid #2563eb;padding:12px 16px;margin:20px 0;border-radius:4px">
          <p style="margin:0 0 6px;font-size:13px;color:#64748b"><strong>Configured Recipients:</strong> ${recipientList.join(', ')}</p>
          <p style="margin:0;font-size:13px;color:#64748b"><strong>Sent from:</strong> ${from}</p>
          <p style="margin:6px 0 0;font-size:13px;color:#64748b"><strong>Timestamp:</strong> ${new Date().toLocaleString()}</p>
        </div>
        <p style="font-size:13px;color:#64748b">
          When any monitored website goes down or a critical security/SEO issue is detected, an alert will be sent immediately.
        </p>
      </div>
    </div>
  `;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: recipientList,
        subject,
        text,
        html,
      }),
      signal: AbortSignal.timeout(12000),
      cache: 'no-store',
    });

    const payload = await response.json().catch(() => ({})) as { message?: string; id?: string };

    if (!response.ok) {
      await logTestEvent('failed', 'Resend test email request rejected.', undefined, `Resend returned HTTP ${response.status}.`);
      return NextResponse.json({
        ok: false,
        error: `Resend API error (${response.status}). Check the API key, verified sender domain, and recipient configuration.`,
      }, { status: 400 });
    }

    const history = await logTestEvent('accepted', 'Test email requested by dashboard user.', payload.id);
    return NextResponse.json({
      ok: true,
      message: `Resend accepted the test email request for ${recipientList.join(', ')}. Delivery is not confirmed.${history.saved ? '' : ` Notification history was not saved: ${history.reason}`}`,
      id: payload.id,
    });
  } catch (error) {
    await logTestEvent('failed', 'Test email request failed before provider acceptance.', undefined, 'Network error communicating with Resend.');
    return NextResponse.json({
      ok: false,
      error: 'Network error communicating with Resend. Check server connectivity and provider status.',
    }, { status: 500 });
  }
}
