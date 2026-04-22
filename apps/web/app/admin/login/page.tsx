import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

async function login(formData: FormData) {
  'use server';
  const password = String(formData.get('password') ?? '');
  const expectedPassword = process.env.ADMIN_PASSWORD;
  const token = process.env.ADMIN_SESSION_TOKEN;
  const nextPath = String(formData.get('next') ?? '/admin');
  if (!expectedPassword || !token) return;
  if (password !== expectedPassword) return;

  const store = await cookies();
  store.set('palmi_admin', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 12,
  });
  redirect(nextPath.startsWith('/admin') ? nextPath : '/admin');
}

export default async function AdminLogin({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = (await searchParams).next ?? '/admin';
  return (
    <main style={{ maxWidth: 360, margin: '120px auto', padding: '0 20px' }}>
      <h1 style={{ fontSize: 32, marginBottom: 24 }}>admin</h1>
      <form action={login} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input type="hidden" name="next" value={next} />
        <input
          type="password"
          name="password"
          className="input"
          placeholder="password"
          autoFocus
          required
        />
        <button type="submit" className="btn">
          Enter
        </button>
      </form>
    </main>
  );
}
