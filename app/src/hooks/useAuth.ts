import { Session, User } from '@supabase/supabase-js';
import { create } from 'zustand';

import { supabase } from '../lib/supabase';
import type { Profile } from '../lib/database.types';

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  initialized: boolean;
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
    set({ session: null, user: null, profile: null });
  },

  refreshProfile: async () => {
    const userId = get().user?.id;
    if (!userId) return;
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    set({ profile: data });
  },

  _setSession: (session) => {
    set({
      session,
      user: session?.user ?? null,
      initialized: true,
    });
    if (session) void get().refreshProfile();
  },
}));

// Wire up Supabase auth listener once at module load
supabase.auth.getSession().then(({ data }) => {
  useAuth.getState()._setSession(data.session);
});

supabase.auth.onAuthStateChange((_event, session) => {
  useAuth.getState()._setSession(session);
});
