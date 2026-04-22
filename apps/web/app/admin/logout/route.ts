import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const store = await cookies();
  store.delete('palmi_admin');
  return NextResponse.redirect(new URL('/admin/login', req.url));
}
