// ============================================================================
// palmi: create Stripe Checkout session
// Edge Function: create-checkout-session
// ============================================================================
//
// Called by the mobile app when the user taps an Upgrade CTA.
// Authenticates via the caller's JWT (Authorization: Bearer <supabase token>),
// ensures a Stripe customer exists on the profile, creates a Checkout
// Session, returns the session.url so the app can open it in the browser.
//
// Request:
//   POST /create-checkout-session
//   Authorization: Bearer <supabase session token>
//   { kind: 'individual', tier: 'premium' | 'premium_plus' }
//   { kind: 'circle',     circle_id: uuid }
//
// Response:
//   200 { url: string }     -> open this URL in the system browser
//   401 { error: 'unauthorized' }
//   400 { error: string }
// ============================================================================

// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@17.3.1?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!;
const PRICE_PREMIUM_M = Deno.env.get('STRIPE_PRICE_PREMIUM_M')!;
const PRICE_PREMIUM_PLUS_M = Deno.env.get('STRIPE_PRICE_PREMIUM_PLUS_M')!;
const PRICE_PAID_CIRCLE_M = Deno.env.get('STRIPE_PRICE_PAID_CIRCLE_M')!;
const SUCCESS_URL = Deno.env.get('CHECKOUT_SUCCESS_URL') ?? 'https://palmi.app/subscribed';
const CANCEL_URL = Deno.env.get('CHECKOUT_CANCEL_URL') ?? 'https://palmi.app/pricing';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2024-11-20.acacia',
  httpClient: Stripe.createFetchHttpClient(),
});

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  // Authn
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return json({ error: 'unauthorized' }, 401);

  const { data: userData, error: userErr } = await db.auth.getUser(token);
  if (userErr || !userData.user) return json({ error: 'unauthorized' }, 401);
  const userId = userData.user.id;

  // Load profile
  const { data: profile } = await db
    .from('profiles')
    .select('stripe_customer_id, display_name')
    .eq('id', userId)
    .maybeSingle();
  if (!profile) return json({ error: 'profile not found' }, 404);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid body' }, 400);
  }

  const kind = body.kind as 'individual' | 'circle';
  if (kind !== 'individual' && kind !== 'circle') return json({ error: 'invalid kind' }, 400);

  // Resolve price + metadata
  let priceId: string;
  const metadata: Record<string, string> = { kind, user_id: userId };

  if (kind === 'individual') {
    const tier = body.tier === 'premium_plus' ? 'premium_plus' : 'premium';
    priceId = tier === 'premium_plus' ? PRICE_PREMIUM_PLUS_M : PRICE_PREMIUM_M;
    metadata.tier = tier;
  } else {
    const circleId = body.circle_id as string;
    if (!circleId) return json({ error: 'circle_id required' }, 400);

    // Must be the circle owner
    const { data: membership } = await db
      .from('memberships')
      .select('role')
      .eq('circle_id', circleId)
      .eq('user_id', userId)
      .is('left_at', null)
      .maybeSingle();
    if (!membership || membership.role !== 'owner') {
      return json({ error: 'only the circle owner can upgrade this circle' }, 403);
    }

    priceId = PRICE_PAID_CIRCLE_M;
    metadata.circle_id = circleId;
  }

  // Ensure Stripe customer
  let customerId = profile.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: userData.user.email ?? undefined,
      name: profile.display_name,
      metadata: { user_id: userId },
    });
    customerId = customer.id;
    await db.from('profiles').update({ stripe_customer_id: customerId }).eq('id', userId);
  }

  // Create Checkout Session
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: { metadata },
    metadata,
    success_url: SUCCESS_URL + '?session_id={CHECKOUT_SESSION_ID}',
    cancel_url: CANCEL_URL,
    allow_promotion_codes: true,
  });

  return json({ url: session.url }, 200);
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
