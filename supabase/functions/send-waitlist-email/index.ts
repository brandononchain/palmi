// ============================================================================
// palmi: send waitlist confirmation email
// Edge Function: send-waitlist-email
// ============================================================================
//
// Called server-to-server after a waitlist signup with explicit email consent.
// Verifies a shared secret, loads the waitlist entry from Postgres, sends the
// first confirmation email via Resend, and stores delivery metadata on the row.
//
// Request:
//   POST /send-waitlist-email
//   x-waitlist-secret: <WAITLIST_EMAIL_SECRET>
//   { waitlistId: uuid }
//
// Response:
//   200 { ok: true, id?: string, skipped?: string }
//   401 { error: 'unauthorized' }
//   400 { error: string }
// ============================================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const WAITLIST_EMAIL_SECRET = Deno.env.get('WAITLIST_EMAIL_SECRET')!;
const WAITLIST_FROM_EMAIL = Deno.env.get('WAITLIST_FROM_EMAIL') ?? 'Palmi <noreply@palmi.app>';
const WAITLIST_REPLY_TO = Deno.env.get('WAITLIST_REPLY_TO') ?? 'hi@palmi.app';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-waitlist-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const sharedSecret = req.headers.get('x-waitlist-secret') ?? '';
  if (!sharedSecret || sharedSecret !== WAITLIST_EMAIL_SECRET) {
    return json({ error: 'unauthorized' }, 401);
  }

  let body: { waitlistId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid body' }, 400);
  }

  const waitlistId = typeof body.waitlistId === 'string' ? body.waitlistId.trim() : '';
  if (!waitlistId) return json({ error: 'waitlistId required' }, 400);

  const { data: entry, error: entryError } = await db
    .from('waitlist')
    .select('id, email, email_opt_in, confirmation_email_sent_at')
    .eq('id', waitlistId)
    .maybeSingle();

  if (entryError) {
    console.error('waitlist lookup error', entryError);
    return json({ error: 'waitlist lookup failed' }, 500);
  }
  if (!entry) return json({ error: 'waitlist row not found' }, 404);
  if (!entry.email_opt_in) return json({ ok: true, skipped: 'opt_in_disabled' }, 200);
  if (entry.confirmation_email_sent_at) return json({ ok: true, skipped: 'already_sent' }, 200);

  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: WAITLIST_FROM_EMAIL,
      to: [entry.email],
      reply_to: WAITLIST_REPLY_TO,
      subject: "You're on the Palmi waitlist",
      text: waitlistText(),
      html: waitlistHtml(),
    }),
  });

  if (!resendRes.ok) {
    const providerError = await resendRes.text();
    console.error('waitlist email provider error', providerError);
    return json({ error: 'email provider failed' }, 502);
  }

  const providerBody = await resendRes.json();
  const providerId = typeof providerBody?.id === 'string' ? providerBody.id : null;

  const { error: updateError } = await db
    .from('waitlist')
    .update({
      confirmation_email_sent_at: new Date().toISOString(),
      confirmation_email_provider_id: providerId,
    })
    .eq('id', waitlistId)
    .is('confirmation_email_sent_at', null);

  if (updateError) {
    console.error('waitlist email tracking update error', updateError);
    return json({ error: 'could not update waitlist row' }, 500);
  }

  return json({ ok: true, id: providerId ?? undefined }, 200);
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function waitlistText() {
  return [
    "You're on the Palmi waitlist.",
    '',
    "Palmi is opening in careful waves. We'll email you from this address when access opens for you and when there's something important worth sharing.",
    '',
    'In the meantime, you can read more at https://palmi.app.',
    '',
    'Reply to hi@palmi.app if you need anything.',
  ].join('\n');
}

function waitlistHtml() {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #faf9f6; color: #1a1a1a; padding: 32px;">
      <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid #e8e4de; border-radius: 20px; padding: 32px;">
        <p style="margin: 0 0 12px; color: #6b6760; font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase;">Palmi</p>
        <h1 style="margin: 0 0 16px; font-size: 28px; line-height: 1.15; font-weight: 600;">You\'re on the waitlist.</h1>
        <p style="margin: 0 0 14px; font-size: 16px; line-height: 1.6; color: #3d3933;">
          Palmi is opening in careful waves. We\'ll email you from this address when access opens for you and when there\'s something important worth sharing.
        </p>
        <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.6; color: #3d3933;">
          No noise. No feed tricks. Just a quieter place for your people.
        </p>
        <a href="https://palmi.app" style="display: inline-block; background: #1a1a1a; color: #faf9f6; text-decoration: none; padding: 12px 18px; border-radius: 999px; font-size: 14px; font-weight: 600;">Visit palmi.app</a>
        <p style="margin: 24px 0 0; font-size: 13px; line-height: 1.6; color: #6b6760;">
          Questions? Reply to <a href="mailto:hi@palmi.app" style="color: #d65745;">hi@palmi.app</a>.
        </p>
      </div>
    </div>
  `;
}
