'use server';

import { anonClient } from '@/lib/supabase';

export interface JoinWaitlistResult {
  ok: boolean;
  error?: string;
}

// RFC-5322-ish; good enough for catching typos without rejecting valid addresses.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function joinWaitlist(formData: FormData): Promise<JoinWaitlistResult> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const campusRaw = String(formData.get('campus') ?? '').trim();
  const source = String(formData.get('source') ?? 'hero');

  if (!EMAIL_RE.test(email) || email.length > 320) {
    return { ok: false, error: 'That email looks off. Try again.' };
  }
  if (source !== 'hero' && source !== 'cta') {
    return { ok: false, error: 'Invalid form.' };
  }

  const campus = campusRaw.length > 0 ? campusRaw.slice(0, 120) : null;

  try {
    const sb = anonClient();
    const { error } = await sb.from('waitlist').insert({ email, campus, source });
    // Unique-violation = already signed up. We present that as success so users
    // can't probe the list by email.
    if (error && error.code !== '23505') {
      console.error('waitlist insert error', error);
      return { ok: false, error: 'Could not save — try again in a moment.' };
    }
    return { ok: true };
  } catch (e) {
    console.error('waitlist exception', e);
    return { ok: false, error: 'Could not save — try again in a moment.' };
  }
}
