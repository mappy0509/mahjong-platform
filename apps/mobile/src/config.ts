import Constants from "expo-constants";

const extra = Constants.expoConfig?.extra ?? {};

export const config = {
  /**
   * Store review mode: hides point management, club economy, and
   * any monetization-related UI. Set via STORE_REVIEW_MODE=true in
   * eas.json or app.config.ts extra.
   */
  isStoreReviewMode: extra.storeReviewMode === true || extra.storeReviewMode === "true",
} as const;
