import Constants from "expo-constants";

const extra = Constants.expoConfig?.extra ?? {};

export const config = {
  apiUrl: (extra.apiUrl as string) || "http://localhost:3000",
  socketUrl: (extra.socketUrl as string) || "http://localhost:3000",
  /**
   * Store review mode: hides point management, club economy, and
   * any monetization-related UI. Set via STORE_REVIEW_MODE=true in
   * eas.json or app.config.ts extra.
   */
  isStoreReviewMode: extra.storeReviewMode === true || extra.storeReviewMode === "true",
} as const;
