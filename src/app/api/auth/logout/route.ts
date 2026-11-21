import { NextResponse } from 'next/server';
import { clearSession } from '@/server/auth/session';
import { handle } from '@/server/http';

/**
 * POST /api/auth/logout. A plain form post (the user menu) is redirected to /login; fetch callers
 * (`accept: application/json`) get `{ ok: true }`.
 */
export const POST = handle(async (req) => {
  await clearSession();
  if (req.headers.get('accept')?.includes('application/json')) {
    return NextResponse.json({ ok: true });
  }
  return NextResponse.redirect(new URL('/login', req.url), 303);
});
