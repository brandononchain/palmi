import { type AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { create } from 'zustand';

import { supabase } from '../lib/supabase';
import type { Profile } from '../lib/database.types';

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  initialized: boolean;
  // True once we've attempted to load the profile for the current session.
  // Used by the auth gate so we don't flash onboarding while the profile
  // fetch is in-flight on cold start / token refresh.
  profileLoaded: boolean;
  loading: boolean;

  signInWithOtp: (phone: string) => Promise<{ error: string | null }>;
  verifyOtp: (phone: string, token: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;

  _setSession: (session: Session | null) => void;
}

export const useAuth = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  profile: null,
  initialized: false,
  profileLoaded: false,
  loading: false,

  signInWithOtp: async (phone) => {
    set({ loading: true });
    const { error } = await supabase.auth.signInWithOtp({ phone });
    set({ loading: false });
    return { error: error?.message ?? null };
  },

  verifyOtp: async (phone, token) => {
    set({ loading: true });
    const { error } = await supabase.auth.verifyOtp({
      phone,
      token,
      type: 'sms',
    });
    set({ loading: false });
    return { error: error?.message ?? null };
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null, profile: null, profileLoaded: true });
  },

  refreshProfile: async () => {
    const userId = get().user?.id;
    if (!userId) {
      set({ profileLoaded: true });
      return;
    }
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    set({ profile: data, profileLoaded: true });
  },

  _setSession: (session) => {
    const prevUserId = get().user?.id;
    const nextUserId = session?.user?.id ?? null;
    // Only reset profileLoaded when the user actually changed (sign in / sign
    // out / account swap). Token refreshes keep the existing profile visible
    // so the auth gate doesn't flash onboarding mid-session.
    const userChanged = prevUserId !== nextUserId;
    set({
      session,
      user: session?.user ?? null,
      initialized: true,
      ...(userChanged ? { profile: null, profileLoaded: !session } : {}),
    });
    if (session && userChanged) {
      void get().refreshProfile();
    }
  },
}));

// Wire up Supabase auth listener once at module load
supabase.auth.getSession().then((result: { data: { session: Session | null } }) => {
  useAuth.getState()._setSession(result.data.session);
});

supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
  useAuth.getState()._setSession(session);
});

// ---------------------------------------------------------------------------
// Tier helpers. Kept as plain selectors (not hooks) so they also work in
// loaders, event handlers, and non-React code paths. For components prefer
// `useAuth(s => s.profile?.subscription_tier)` so re-renders stay scoped.
// Source of truth is always `profile.subscription_tier` + status, mutated
// only by the stripe-webhook edge function.
// ---------------------------------------------------------------------------

const ACTIVE_STATUSES = new Set(['active', 'trialing', 'past_due']);

export function tierFromProfile(profile: Profile | null): 'free' | 'premium' | 'premium_plus' {
  if (!profile) return 'free';
  if (!ACTIVE_STATUSES.has(profile.subscription_status)) return 'free';
  if (profile.current_period_end && new Date(profile.current_period_end) < new Date())
    return 'free';
  return profile.subscription_tier;
}

export function isPremium(profile: Profile | null): boolean {
  const t = tierFromProfile(profile);
  return t === 'premium' || t === 'premium_plus';
}

export function isPremiumPlus(profile: Profile | null): boolean {
  return tierFromProfile(profile) === 'premium_plus';
}
