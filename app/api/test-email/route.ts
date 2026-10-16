import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const recipientList = (process.env.ALERT_EMAIL_TO ?? '').split(',').map((item) => item.trim()).filter(Boolean);
  const from = process.env.ALERT_EMAIL_FROM?.trim();

  if (!apiKey || !recipientList.length || !from) {
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
      return NextResponse.json({
        ok: false,
        error: `Resend API error (${response.status}): ${payload.message || 'Check your API key and verified sender domain.'}`,
      }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      message: `Test email sent successfully to ${recipientList.join(', ')}!`,
      id: payload.id,
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Network error communicating with Resend',
    }, { status: 500 });
  }
}

