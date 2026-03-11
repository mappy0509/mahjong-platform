import { create } from "zustand";
import { api, setTokens, clearTokens, getAccessToken } from "../api/client";

/** デモモード: サーバー不要でUIプレビュー可能 */
const DEMO_MODE = true;

const DEMO_USER = {
  id: "demo-admin-001",
  username: "admin",
  displayName: "Administrator",
  role: "PLATFORMER",
};

interface User {
  id: string;
  username: string;
  displayName: string;
  role?: string;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  isLoggedIn: boolean;

  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  init: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  error: null,
  isLoggedIn: false,

  login: async (username, password) => {
    if (DEMO_MODE) {
      set({ user: DEMO_USER, isLoggedIn: true, isLoading: false });
      return;
    }
    set({ isLoading: true, error: null });
    try {
      const data = await api<{
        accessToken: string;
        refreshToken: string;
        user: User;
      }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      setTokens(data.accessToken, data.refreshToken);
      set({ user: data.user, isLoggedIn: true, isLoading: false });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "ログインに失敗しました",
        isLoading: false,
      });
      throw e;
    }
  },

  logout: () => {
    if (DEMO_MODE) {
      set({ user: null, isLoggedIn: false, error: null });
      return;
    }
    clearTokens();
    set({ user: null, isLoggedIn: false, error: null });
  },

  init: async () => {
    if (DEMO_MODE) {
      set({ user: DEMO_USER, isLoggedIn: true, isLoading: false });
      return;
    }
    const token = getAccessToken();
    if (!token) {
      set({ isLoading: false });
      return;
    }
    try {
      const user = await api<User>("/users/me");
      set({ user, isLoggedIn: true, isLoading: false });
    } catch {
      clearTokens();
      set({ isLoading: false });
    }
  },
}));
