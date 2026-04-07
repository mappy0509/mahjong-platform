// Native (iOS / Android) storage adapter — backed by expo-secure-store.
// On web, Metro will resolve storage-adapter.web.ts instead.
import * as SecureStore from "expo-secure-store";

export const storageAdapter = {
  getItem: (key: string): Promise<string | null> => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string): Promise<void> =>
    SecureStore.setItemAsync(key, value),
  removeItem: (key: string): Promise<void> => SecureStore.deleteItemAsync(key),
};
