/**
 * palmi billing helpers (mobile)
 *
 * Thin client over the create-checkout-session and create-portal-session
 * edge functions. Opens the returned URL in the system browser so Stripe
 * hosts the checkout UI (no IAP, no in-app WebView).
 */

import * as Linking from 'expo-linking';

import { supabase } from './supabase';

type CheckoutInput =
  | { kind: 'individual'; tier: 'premium' | 'premium_plus' }
  | { kind: 'circle'; circle_id: string };

async function invokeCheckout(body: CheckoutInput): Promise<string> {
  const { data, error } = await supabase.functions.invoke('create-checkout-session', { body });
  const payload = data as { url?: string } | null;
  if (error) throw new Error(error.message);
  if (!payload?.url) throw new Error('no checkout url returned');
  return payload.url;
}

async function invokePortal(): Promise<string> {
  const { data, error } = await supabase.functions.invoke('create-portal-session', { body: {} });
  const payload = data as { url?: string } | null;
  if (error) throw new Error(error.message);
  if (!payload?.url) throw new Error('no portal url returned');
  return payload.url;
}

/** Start a subscription. Opens the Stripe Checkout URL in the system browser. */
export async function startCheckout(input: CheckoutInput): Promise<void> {
  const url = await invokeCheckout(input);
  await Linking.openURL(url);
}

/** Open the Stripe Billing Portal for the current user. */
export async function openBillingPortal(): Promise<void> {
  const url = await invokePortal();
  await Linking.openURL(url);
}

/** Friendly label shown in UI. */
export function tierLabel(tier: 'free' | 'premium' | 'premium_plus'): string {
  if (tier === 'premium') return 'palmi premium';
  if (tier === 'premium_plus') return 'palmi premium+';
  return 'palmi free';
}

export const PREMIUM_PRICE_LABEL = '$4 / month';
export const PREMIUM_PLUS_PRICE_LABEL = '$8 / month';
export const PAID_CIRCLE_PRICE_LABEL = '$15 / month';
