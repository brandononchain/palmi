// ============================================================================
// palmi: Stripe webhook
// Edge Function: stripe-webhook
// ============================================================================
//
// Receives Stripe webhook events and reconciles subscription state into
// public.profiles and public.circles. This is the ONLY writer to billing
// columns (enforced by trigger guards in migration 026).
//
// Events handled:
//   checkout.session.completed
//   customer.subscription.created
//   customer.subscription.updated
//   customer.subscription.deleted
//   invoice.payment_failed
//
// Idempotency:
//   Every event is recorded in public.billing_events with stripe_event_id as
//   a unique key. Duplicate deliveries are no-ops.
//
// Metadata convention (set at Checkout Session creation):
//   { kind: 'individual', tier: 'premium' | 'premium_plus', user_id }
//   { kind: 'circle',     circle_id, user_id }
// ============================================================================

// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@17.3.1?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!;
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2024-11-20.acacia',
  httpClient: Stripe.createFetchHttpClient(),
});

const cryptoProvider = Stripe.createSubtleCryptoProvider();

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) return new Response('missing signature', { status: 400 });

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      STRIPE_WEBHOOK_SECRET,
      undefined,
      cryptoProvider
    );
  } catch (err) {
    console.error('webhook signature failed', err);
    return new Response('invalid signature', { status: 400 });
  }

  // Idempotency: skip if we've seen this event id.
  const { data: existing } = await db
    .from('billing_events')
    .select('id')
    .eq('stripe_event_id', event.id)
    .maybeSingle();

  if (existing) {
    return new Response(JSON.stringify({ ok: true, duplicate: true }), { status: 200 });
  }

  try {
    const { user_id, circle_id } = await routeEvent(event);

    await db.from('billing_events').insert({
      stripe_event_id: event.id,
      type: event.type,
      user_id: user_id ?? null,
      circle_id: circle_id ?? null,
      payload: event as any,
    });
  } catch (err) {
    console.error('webhook handler failed', event.type, err);
    return new Response('handler error', { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});

// ----------------------------------------------------------------------------

async function routeEvent(event: Stripe.Event): Promise<{ user_id?: string; circle_id?: string }> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const md = session.metadata ?? {};
      // Nothing to do here yet — subscription.created fires right after and
      // carries the subscription object we really care about. We just log.
      return { user_id: md.user_id, circle_id: md.circle_id };
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      return await applySubscription(sub);
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      return await applySubscription(sub, /* deleted */ true);
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const subId = (invoice as any).subscription as string | null;
      if (!subId) return {};
      const sub = await stripe.subscriptions.retrieve(subId);
      return await applySubscription(sub);
    }

    default:
      return {};
  }
}

async function applySubscription(sub: Stripe.Subscription, deleted = false) {
  const md = (sub.metadata ?? {}) as Record<string, string>;
  const kind = md.kind ?? 'individual';

  const status: string = deleted ? 'canceled' : sub.status;
  const periodEnd = (sub as any).current_period_end
    ? new Date(((sub as any).current_period_end as number) * 1000).toISOString()
    : null;

  if (kind === 'individual') {
    const userId = md.user_id;
    if (!userId) return {};

    const tier =
      deleted || status === 'canceled'
        ? 'free'
        : md.tier === 'premium_plus'
          ? 'premium_plus'
          : 'premium';

    const patch: Record<string, unknown> = {
      subscription_tier: tier,
      subscription_status: tier === 'free' ? 'none' : status,
      stripe_subscription_id: sub.id,
      current_period_end: periodEnd,
    };
    if (tier !== 'free') patch.premium_since = patch.premium_since ?? new Date().toISOString();

    const { error } = await db.from('profiles').update(patch).eq('id', userId);
    if (error) throw error;
    return { user_id: userId };
  }

  if (kind === 'circle') {
    const circleId = md.circle_id;
    const userId = md.user_id;
    if (!circleId) return { user_id: userId };

    const tier = deleted || status === 'canceled' ? 'free' : 'paid';
    const patch: Record<string, unknown> = {
      tier,
      host_stripe_subscription_id: tier === 'paid' ? sub.id : null,
    };
    if (tier === 'paid') patch.paid_since = new Date().toISOString();

    const { error } = await db.from('circles').update(patch).eq('id', circleId);
    if (error) throw error;
    return { user_id: userId, circle_id: circleId };
  }

  return {};
}
