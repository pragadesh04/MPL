import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from './server/auth/session-token';

/**
 * Next 16 Proxy (formerly middleware). It ONLY redirects to /login when there is no session
 * cookie on an app page. It is NOT an authorisation layer: every Route Handler and Server Action
 * still calls a service that checks the role (PLAN §9 item 21). It does not verify the JWT.
 */
export function proxy(request: NextRequest): NextResponse {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  const login = new URL('/login', request.url);
  login.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  // App pages that need a session. Public: /, /login, /register*, /i/*, /reset/*, /live/*, /api/*, /dev/*.
  matcher: ['/dashboard/:path*', '/t/:path*', '/settings/:path*'],
};
