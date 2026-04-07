// Web storage adapter — backed by window.localStorage.
// expo-secure-store is intentionally NOT imported here, so the native
// module never gets pulled into the web bundle.

const memoryStore: Record<string, string> = {};

interface WebLocalStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function safeLocal(): WebLocalStorage | null {
  try {
    const w = (globalThis as any).window;
    if (w && w.localStorage) {
      return w.localStorage as WebLocalStorage;
    }
  } catch {
    // localStorage may throw in private mode / iframes
  }
  return null;
}

export const storageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    const ls = safeLocal();
    if (ls) return ls.getItem(key);
    return memoryStore[key] ?? null;
  },
  setItem: async (key: string, value: string): Promise<void> => {
    const ls = safeLocal();
    if (ls) {
      ls.setItem(key, value);
    } else {
      memoryStore[key] = value;
    }
  },
  removeItem: async (key: string): Promise<void> => {
    const ls = safeLocal();
    if (ls) {
      ls.removeItem(key);
    } else {
      delete memoryStore[key];
    }
  },
};
