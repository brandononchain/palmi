'use server';

import { serviceClient } from '@/lib/supabase';

export interface JoinWaitlistResult {
  ok: boolean;
  error?: string;
  message?: string;
}

export interface InstitutionalInquiryResult {
  ok: boolean;
  error?: string;
  message?: string;
}

interface InstitutionalInquiryNotificationPayload {
  id?: string;
  organizationName: string;
  workEmail: string;
  programType: string;
  cohortSize: string | null;
  note: string | null;
  source: string;
  createdAt?: string;
}

// RFC-5322-ish; good enough for catching typos without rejecting valid addresses.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const WAITLIST_HONEYPOT_FIELD = 'company';
const INQUIRY_HONEYPOT_FIELD = 'website';
const INQUIRY_NOTIFY_TO = process.env.INSTITUTIONAL_INQUIRY_TO_EMAIL ?? 'hi@palmi.app';
const INQUIRY_NOTIFY_FROM =
  process.env.INSTITUTIONAL_INQUIRY_FROM_EMAIL ?? 'Palmi <noreply@palmi.app>';
const INQUIRY_REPLY_TO = process.env.INSTITUTIONAL_INQUIRY_REPLY_TO ?? 'hi@palmi.app';
const INQUIRY_WEBHOOK_URL = process.env.INSTITUTIONAL_INQUIRY_WEBHOOK_URL;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

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

async function notifyInstitutionalInquiry(payload: InstitutionalInquiryNotificationPayload) {
  const deliveries: Promise<unknown>[] = [];

  if (INQUIRY_WEBHOOK_URL) {
    deliveries.push(
      fetch(INQUIRY_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `New institutional inquiry: ${payload.organizationName}`,
          inquiry: payload,
        }),
      }).then(async (res) => {
        if (!res.ok) {
          throw new Error(`institutional webhook failed: ${res.status} ${await res.text()}`);
        }
      })
    );
  }

  if (RESEND_API_KEY) {
    deliveries.push(
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: INQUIRY_NOTIFY_FROM,
          to: [INQUIRY_NOTIFY_TO],
          reply_to: INQUIRY_REPLY_TO,
          subject: `New Palmi institutional inquiry: ${payload.organizationName}`,
          text: institutionalInquiryText(payload),
          html: institutionalInquiryHtml(payload),
        }),
      }).then(async (res) => {
        if (!res.ok) {
          throw new Error(`institutional email failed: ${res.status} ${await res.text()}`);
        }
      })
    );
  }

  if (deliveries.length === 0) {
    console.warn('institutional inquiry saved but no notification channel is configured');
    return;
  }

  const results = await Promise.allSettled(deliveries);
  const failures = results.filter((result) => result.status === 'rejected');
  if (failures.length === results.length) {
    throw new Error(
      failures
        .map((failure) => (failure.status === 'rejected' ? String(failure.reason) : 'unknown'))
        .join(' | ')
    );
  }

  failures.forEach((failure) => {
    if (failure.status === 'rejected') {
      console.error('institutional inquiry notification partial failure', failure.reason);
    }
  });
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

export async function submitInstitutionalInquiry(
  formData: FormData
): Promise<InstitutionalInquiryResult> {
  const organizationName = String(formData.get('organizationName') ?? '').trim();
  const workEmail = String(formData.get('workEmail') ?? '')
    .trim()
    .toLowerCase();
  const programType = String(formData.get('programType') ?? 'other').trim();
  const cohortSize = String(formData.get('cohortSize') ?? '').trim();
  const note = String(formData.get('note') ?? '').trim();
  const source = String(formData.get('source') ?? 'pricing-programs').trim();
  const honeypot = String(formData.get(INQUIRY_HONEYPOT_FIELD) ?? '').trim();

  if (honeypot) {
    return { ok: true, message: 'Thanks. We received it.' };
  }

  if (organizationName.length < 2 || organizationName.length > 160) {
    return { ok: false, error: 'Add the organization or program name.' };
  }
  if (!EMAIL_RE.test(workEmail) || workEmail.length > 320) {
    return { ok: false, error: 'Use a valid work email.' };
  }
  if (!['university', 'accelerator', 'cohort', 'community', 'other'].includes(programType)) {
    return { ok: false, error: 'Choose the kind of program.' };
  }
  if (note.length > 1200) {
    return { ok: false, error: 'Keep the note under 1,200 characters.' };
  }

  try {
    const sb = serviceClient();
    const { data, error } = await sb
      .from('institutional_inquiries')
      .insert({
        organization_name: organizationName,
        work_email: workEmail,
        program_type: programType,
        cohort_size: cohortSize || null,
        note: note || null,
        source,
      })
      .select(
        'id, organization_name, work_email, program_type, cohort_size, note, source, created_at'
      )
      .single();

    if (error) {
      console.error('institutional inquiry insert error', error);
      return { ok: false, error: 'Could not save — try again in a moment.' };
    }

    try {
      await notifyInstitutionalInquiry({
        id: data?.id,
        organizationName: data?.organization_name ?? organizationName,
        workEmail: data?.work_email ?? workEmail,
        programType: data?.program_type ?? programType,
        cohortSize: data?.cohort_size ?? (cohortSize || null),
        note: data?.note ?? (note || null),
        source: data?.source ?? source,
        createdAt: data?.created_at,
      });
    } catch (notificationError) {
      console.error('institutional inquiry notification error', notificationError);
    }

    return {
      ok: true,
      message: 'Thanks. We’ll reach out about a program setup that fits your group.',
    };
  } catch (error) {
    console.error('institutional inquiry exception', error);
    return { ok: false, error: 'Could not save — try again in a moment.' };
  }
}

function institutionalInquiryText(payload: InstitutionalInquiryNotificationPayload) {
  return [
    'New Palmi institutional inquiry',
    '',
    `Organization: ${payload.organizationName}`,
    `Work email: ${payload.workEmail}`,
    `Program type: ${payload.programType}`,
    `Approximate size: ${payload.cohortSize ?? '—'}`,
    `Source: ${payload.source}`,
    `Created: ${payload.createdAt ?? new Date().toISOString()}`,
    '',
    'Note:',
    payload.note ?? '—',
  ].join('\n');
}

function institutionalInquiryHtml(payload: InstitutionalInquiryNotificationPayload) {
  const details = [
    ['Organization', payload.organizationName],
    ['Work email', payload.workEmail],
    ['Program type', payload.programType],
    ['Approximate size', payload.cohortSize ?? '—'],
    ['Source', payload.source],
    ['Created', payload.createdAt ?? new Date().toISOString()],
  ]
    .map(
      ([label, value]) =>
        `<tr><td style="padding: 8px 12px; color: #6b6760; border-bottom: 1px solid #e8e4de;">${label}</td><td style="padding: 8px 12px; color: #1a1a1a; border-bottom: 1px solid #e8e4de;">${escapeHtml(
          value
        )}</td></tr>`
    )
    .join('');

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #faf9f6; color: #1a1a1a; padding: 32px;">
      <div style="max-width: 640px; margin: 0 auto; background: #ffffff; border: 1px solid #e8e4de; border-radius: 20px; padding: 32px;">
        <p style="margin: 0 0 12px; color: #6b6760; font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase;">Palmi / Institutional inquiry</p>
        <h1 style="margin: 0 0 20px; font-size: 28px; line-height: 1.15; font-weight: 600;">${escapeHtml(
          payload.organizationName
        )}</h1>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 15px;">
          ${details}
        </table>
        <div style="padding: 18px; background: #f4f1eb; border-radius: 16px; color: #3d3933; font-size: 15px; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(
          payload.note ?? '—'
        )}</div>
      </div>
    </div>
  `;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
