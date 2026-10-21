import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Protect the dashboard and API routes using Supabase Auth cookies.
 * The cron endpoint has its own CRON_SECRET check, so it is intentionally excluded.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === '/api/cron') return NextResponse.next();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const isLoginPage = pathname === '/login';
  const allowedEmails = (process.env.DASHBOARD_ALLOWED_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  const allowlistIsValid = allowedEmails.length > 0 && allowedEmails.every((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));

  if (!supabaseUrl || !anonKey) {
    if (isLoginPage) return NextResponse.next();
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Dashboard protection is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.' }, { status: 503 });
    }
    const loginUrl = new URL('/login?setup=missing', request.url);
    return NextResponse.redirect(loginUrl);
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll() { return request.cookies.getAll(); },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getUser validates the session with Supabase; do not rely on a client-only gate.
  const { data: { user } } = await supabase.auth.getUser();

  const isProduction = process.env.NODE_ENV === 'production';
  const email = user?.email?.toLowerCase() ?? '';

  let userAllowed = false;
  let denialCode = '';
  let denialMessage = 'Please sign in to use Website Monitor AI.';

  if (!user) {
    userAllowed = false;
    denialCode = '';
    denialMessage = 'Please sign in to use Website Monitor AI.';
  } else if (isProduction && !allowlistIsValid) {
    // Fail closed in production if DASHBOARD_ALLOWED_EMAILS is empty or misconfigured
    userAllowed = false;
    denialCode = 'misconfigured';
    denialMessage = 'Production dashboard access is locked because DASHBOARD_ALLOWED_EMAILS is missing, empty, or invalid.';
  } else if (allowlistIsValid && !allowedEmails.includes(email)) {
    userAllowed = false;
    denialCode = 'denied';
    denialMessage = 'This account is not on DASHBOARD_ALLOWED_EMAILS.';
  } else {
    // Authenticated user permitted
    userAllowed = true;
  }

  if (isLoginPage) {
    if (userAllowed) return NextResponse.redirect(new URL('/', request.url));
    return response;
  }

  if (!userAllowed) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: denialMessage }, { status: user ? 403 : 401 });
    }
    const loginUrl = new URL('/login', request.url);
    if (denialCode) loginUrl.searchParams.set('access', denialCode);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|supabase-schema.sql).*)'],
};
