'use server';

import { serviceClient } from '@/lib/supabase';

export interface JoinWaitlistResult {
  ok: boolean;
  error?: string;
  message?: string;
}

// RFC-5322-ish; good enough for catching typos without rejecting valid addresses.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const WAITLIST_HONEYPOT_FIELD = 'company';

async function findWaitlistEntry(email: string) {
  const sb = serviceClient();
  const { data, error } = await sb
    .from('waitlist')
    .select('id, email_opt_in, confirmation_email_sent_at')
    .eq('email', email)
    .maybeSingle();

  if (error) throw error;
  return data;
}

function waitlistFunctionUrl() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) throw new Error('Missing Supabase public env vars');
  return `${supabaseUrl.replace('.supabase.co', '.functions.supabase.co')}/send-waitlist-email`;
}

async function sendWaitlistConfirmationEmail(waitlistId: string) {
  const sharedSecret = process.env.WAITLIST_EMAIL_SECRET;
  if (!sharedSecret) throw new Error('Missing WAITLIST_EMAIL_SECRET');

  const res = await fetch(waitlistFunctionUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-waitlist-secret': sharedSecret,
    },
    body: JSON.stringify({ waitlistId }),
    cache: 'no-store',
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`waitlist email failed: ${res.status} ${errorText}`);
  }
}

export async function joinWaitlist(formData: FormData): Promise<JoinWaitlistResult> {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  const campusRaw = String(formData.get('campus') ?? '').trim();
  const source = String(formData.get('source') ?? 'hero');
  const emailOptIn = true;
  const honeypot = String(formData.get(WAITLIST_HONEYPOT_FIELD) ?? '').trim();

  if (honeypot) {
    return { ok: true, message: "Thanks. You're on the list." };
  }

  if (!EMAIL_RE.test(email) || email.length > 320) {
    return { ok: false, error: 'That email looks off. Try again.' };
  }
  if (source !== 'hero' && source !== 'cta') {
    return { ok: false, error: 'Invalid form.' };
  }

  const campus = campusRaw.length > 0 ? campusRaw.slice(0, 120) : null;

  try {
    const sb = serviceClient();
    let existing = await findWaitlistEntry(email);
    let waitlistId: string;

    if (!existing) {
      const { data, error } = await sb
        .from('waitlist')
        .insert({
          email,
          campus,
          source,
          email_opt_in: emailOptIn,
          email_opted_in_at: emailOptIn ? new Date().toISOString() : null,
        })
        .select('id')
        .single();

      if (error?.code === '23505') {
        existing = await findWaitlistEntry(email);
      } else if (error) {
        console.error('waitlist insert error', error);
        return { ok: false, error: 'Could not save — try again in a moment.' };
      }

      waitlistId = data?.id ?? existing?.id;
    } else {
      waitlistId = existing.id;
    }

    if (!waitlistId) {
      console.error('waitlist missing id after upsert path', { email });
      return { ok: false, error: 'Could not save — try again in a moment.' };
    }

    if (emailOptIn && existing && !existing.email_opt_in) {
      const { error } = await sb
        .from('waitlist')
        .update({
          email_opt_in: true,
          email_opted_in_at: new Date().toISOString(),
        })
        .eq('id', waitlistId);

      if (error) {
        console.error('waitlist opt-in update error', error);
        return { ok: false, error: 'Could not save — try again in a moment.' };
      }

      existing = {
        ...existing,
        email_opt_in: true,
      };
    }

    const shouldSendConfirmation = emailOptIn && !existing?.confirmation_email_sent_at;
    let message = 'Check your inbox for a confirmation from Palmi.';

    if (shouldSendConfirmation) {
      try {
        await sendWaitlistConfirmationEmail(waitlistId);
      } catch (emailError) {
        console.error('waitlist confirmation email error', emailError);
        message =
          "You're on the list. We saved your request, but the confirmation email is still catching up.";
      }
    }

    return { ok: true, message };
  } catch (e) {
    console.error('waitlist exception', e);
    return { ok: false, error: 'Could not save — try again in a moment.' };
  }
}
