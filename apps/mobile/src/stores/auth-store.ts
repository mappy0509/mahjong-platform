import { create } from "zustand";
import * as api from "../api/client";

interface AuthState {
  isLoggedIn: boolean;
  user: { id: string; username: string; displayName: string } | null;
  isLoading: boolean;
  error: string | null;
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

export const useAuthStore = create<AuthState>((set) => ({
  isLoggedIn: false,
  user: null,
  isLoading: true,
  error: null,

  init: async () => {
    const hasToken = await api.initAuth();
    if (hasToken) {
      try {
        const user = await api.apiRequest<any>("/users/me");
        set({ isLoggedIn: true, user, isLoading: false });
      } catch {
        await api.clearTokens();
        set({ isLoggedIn: false, user: null, isLoading: false });
      }
    } else {
      set({ isLoading: false });
    }
  },

  login: async (username, password) => {
    set({ isLoading: true, error: null });
    try {
      const data = await api.login(username, password);
      set({ isLoggedIn: true, user: data.user, isLoading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Login failed",
        isLoading: false,
      });
    }
  },

  register: async (username, password, displayName) => {
    set({ isLoading: true, error: null });
    try {
      const data = await api.register(username, password, displayName);
      set({ isLoggedIn: true, user: data.user, isLoading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Registration failed",
        isLoading: false,
      });
    }
  },

  logout: async () => {
    await api.logout();
    set({ isLoggedIn: false, user: null });
  },

  updateDisplayName: async (displayName) => {
    const updated = await api.updateProfile(displayName);
    set((state) => ({
      user: state.user ? { ...state.user, displayName: updated.displayName } : null,
    }));
  },

  changePassword: async (currentPassword, newPassword) => {
    await api.changePassword(currentPassword, newPassword);
  },
}));
