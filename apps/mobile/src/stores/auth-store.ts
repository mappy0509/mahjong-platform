import { create } from "zustand";
import { supabase } from "../lib/supabase";

type AuthSubscription = { unsubscribe: () => void } | null;

interface AuthState {
  isLoggedIn: boolean;
  user: { id: string; username: string; displayName: string } | null;
  isLoading: boolean;
  error: string | null;
  _authSub: AuthSubscription;
  init: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  register: (
    username: string,
    password: string,
    displayName: string
  ) => Promise<void>;
  logout: () => Promise<void>;
  updateDisplayName: (displayName: string) => Promise<void>;
  changePassword: (
    currentPassword: string,
    newPassword: string
  ) => Promise<void>;
}

async function fetchProfile(userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, display_name")
    .eq("id", userId)
    .single();
  if (error || !data) return null;
  return {
    id: data.id,
    username: data.username,
    displayName: data.display_name,
  };
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isLoggedIn: false,
  user: null,
  isLoading: true,
  error: null,
  _authSub: null,

  init: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const profile = await fetchProfile(session.user.id);
        if (profile) {
          set({ isLoggedIn: true, user: profile, isLoading: false });
        } else {
          set({ isLoggedIn: false, user: null, isLoading: false });
        }
      } else {
        set({ isLoggedIn: false, user: null, isLoading: false });
      }
    } catch {
      set({ isLoggedIn: false, user: null, isLoading: false });
    }

    // Tear down any previously-registered listener before attaching a new one
    // (avoids duplicate subscriptions on Fast Refresh / re-init).
    const prev = get()._authSub;
    if (prev) {
      try { prev.unsubscribe(); } catch { /* noop */ }
    }

    const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_OUT") {
        set({ isLoggedIn: false, user: null });
      } else if (event === "TOKEN_REFRESHED" && session?.user) {
        const profile = await fetchProfile(session.user.id);
        if (profile) {
          set({ isLoggedIn: true, user: profile });
        }
      }
    });
    set({ _authSub: data.subscription });
  },

  login: async (username, password) => {
    set({ isLoading: true, error: null });
    try {
      // Supabase Auth uses email — we use username@mahjong.local as convention
      const email = `${username}@mahjong.local`;
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw new Error(error.message);
      if (!data.user) throw new Error("ログインに失敗しました");

      const profile = await fetchProfile(data.user.id);
      if (!profile) throw new Error("プロフィールが見つかりません");

      set({ isLoggedIn: true, user: profile, isLoading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "ログインに失敗しました",
        isLoading: false,
      });
    }
  },

  register: async (username, password, displayName) => {
    set({ isLoading: true, error: null });
    try {
      const email = `${username}@mahjong.local`;
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { username, display_name: displayName },
        },
      });
      if (error) throw new Error(error.message);
      if (!data.user) throw new Error("登録に失敗しました");

      // Profile is auto-created by trigger; fetch it
      // Small delay to allow trigger to execute
      await new Promise<void>((r) => setTimeout(r, 500));
      const profile = await fetchProfile(data.user.id);
      if (!profile) throw new Error("プロフィール作成に失敗しました");

      set({ isLoggedIn: true, user: profile, isLoading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "登録に失敗しました",
        isLoading: false,
      });
    }
  },

  logout: async () => {
    await supabase.auth.signOut();
    set({ isLoggedIn: false, user: null });
  },

  updateDisplayName: async (displayName) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("ログインしていません");

    const { error } = await supabase
      .from("profiles")
      .update({ display_name: displayName })
      .eq("id", user.id);
    if (error) throw new Error(error.message);

    set((state) => ({
      user: state.user ? { ...state.user, displayName } : null,
    }));
  },

  changePassword: async (_currentPassword, newPassword) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw new Error(error.message);
  },
}));
