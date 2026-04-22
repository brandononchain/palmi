import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Admin dashboard gate. v1: single shared password, HttpOnly cookie. The
// cookie holds SHA-256(password+secret) so a leaked cookie can't be reversed
// to the password. For 10 users this is plenty; move to Supabase session +
// admins-table lookup when there's more than one admin.
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!pathname.startsWith('/admin')) return NextResponse.next();
  if (pathname === '/admin/login') return NextResponse.next();

  const expected = process.env.ADMIN_SESSION_TOKEN;
  if (!expected) {
    return new NextResponse('Admin not configured', { status: 503 });
  }
  const got = req.cookies.get('palmi_admin')?.value;
  if (got && timingSafeEqual(got, expected)) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = '/admin/login';
  url.searchParams.set('next', pathname);
  return NextResponse.redirect(url);
}

// Constant-time string compare. Short-circuit on length mismatch is fine —
// attacker already knows cookie length from the Set-Cookie they'd have seen.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const config = { matcher: ['/admin/:path*'] };
