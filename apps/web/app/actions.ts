'use server';

import { SITE_URL } from '@/lib/site';

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

// RFC-5322-ish; good enough for catching typos without rejecting valid addresses.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const WAITLIST_HONEYPOT_FIELD = 'company';
const INQUIRY_HONEYPOT_FIELD = 'company';
const INTAKE_WEBHOOK_URL = process.env.PALMI_INTAKE_WEBHOOK_URL?.replace(/\/$/, '');
const WEBHOOK_SECRET = process.env.PALMI_WEBHOOK_SECRET;
const PALMI_REFERRER_URL = `${SITE_URL}/`;
const PROGRAM_TYPE_LABELS = {
  university: 'University',
  accelerator: 'Accelerator',
  cohort: 'Cohort',
  community: 'Community',
  other: 'Other',
} as const;

async function postIntakeWebhook(path: string, payload: unknown) {
  if (!INTAKE_WEBHOOK_URL) {
    throw new Error('Missing PALMI_INTAKE_WEBHOOK_URL');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (WEBHOOK_SECRET) {
    headers['X-Webhook-Secret'] = WEBHOOK_SECRET;
  }

  const res = await fetch(`${INTAKE_WEBHOOK_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`intake webhook failed: ${res.status} ${await res.text()}`);
  }
}

function normalizeWebsiteInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(candidate);
    if (!url.hostname || !url.hostname.includes('.')) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export async function joinWaitlist(formData: FormData): Promise<JoinWaitlistResult> {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  const source = String(formData.get('source') ?? 'hero');
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

  try {
    await postIntakeWebhook('/webhooks/email-opt-in', {
      email,
      source: source === 'hero' ? 'palmi_hero_waitlist' : 'palmi_waitlist_waitlist',
      referrer_url: PALMI_REFERRER_URL,
      consent: true,
    });

    return {
      ok: true,
      message: "Thanks. You're on the list — we'll be in touch when there's a spot for you.",
    };
  } catch (e) {
    console.error('waitlist exception', e);
    return { ok: false, error: 'Could not save — try again in a moment.' };
  }
}

export async function submitInstitutionalInquiry(
  formData: FormData
): Promise<InstitutionalInquiryResult> {
  const websiteRaw = String(formData.get('website') ?? '').trim();
  const organizationName = String(formData.get('organizationName') ?? '').trim();
  const workEmail = String(formData.get('workEmail') ?? '')
    .trim()
    .toLowerCase();
  const programType = String(formData.get('programType') ?? 'other').trim();
  const cohortSize = String(formData.get('cohortSize') ?? '').trim();
  const note = String(formData.get('note') ?? '').trim();
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

  const website = normalizeWebsiteInput(websiteRaw);
  if (websiteRaw && !website) {
    return { ok: false, error: 'Use a valid website URL.' };
  }

  try {
    await postIntakeWebhook('/webhooks/institutional-inquiry', {
      website,
      institution_name: organizationName,
      contact_email: workEmail,
      program_type: PROGRAM_TYPE_LABELS[programType as keyof typeof PROGRAM_TYPE_LABELS],
      approximate_size: cohortSize || null,
      experience_requested: note || null,
      source: 'palmi_pricing_program_setup',
      inquiry_type: 'program_setup',
    });

    return {
      ok: true,
      message: 'Thanks. We’ll reach out about a program setup that fits your group.',
    };
  } catch (error) {
    console.error('institutional inquiry exception', error);
    return { ok: false, error: 'Could not save — try again in a moment.' };
  }
}
