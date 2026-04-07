// Default fallback when no platform-specific file is resolved.
// In practice Metro will pick storage-adapter.web.ts on web and
// storage-adapter.native.ts on iOS / Android, so this file should
// only be used in test environments.
export const storageAdapter = {
  getItem: async (_key: string): Promise<string | null> => null,
  setItem: async (_key: string, _value: string): Promise<void> => {},
  removeItem: async (_key: string): Promise<void> => {},
};
