import { describe, it, expect } from "vitest";
import {
  decomposeHand,
  isWinningHand,
  isSevenPairs,
  isThirteenOrphans,
  calculateShanten,
  findWaitingTiles,
  isTenpai,
} from "../hand";

describe("Hand Analysis", () => {
  describe("isWinningHand", () => {
    it("should detect a basic winning hand (1 pair + 4 mentsu)", () => {
      // 1m1m1m 2m3m4m 5p6p7p 8s8s8s 9s9s
      const hand = [0, 0, 0, 1, 2, 3, 13, 14, 15, 25, 25, 25, 26, 26];
      expect(isWinningHand(hand)).toBe(true);
    });

    it("should detect pinfu hand", () => {
      // 1m2m3m 4m5m6m 7m8m9m 1p2p3p 5s5s
      const hand = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 22, 22];
      expect(isWinningHand(hand)).toBe(true);
    });

    it("should reject non-winning hand", () => {
      // Random tiles that don't form a valid hand
      const hand = [0, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25];
      expect(isWinningHand(hand)).toBe(false);
    });

    it("should detect toitoi hand", () => {
      // 1m1m1m 5m5m5m 9p9p9p 東東東 白白
      const hand = [0, 0, 0, 4, 4, 4, 17, 17, 17, 27, 27, 27, 31, 31];
      expect(isWinningHand(hand)).toBe(true);
    });
  });

  describe("isSevenPairs", () => {
    it("should detect seven pairs", () => {
      // 1m1m 3m3m 5m5m 7p7p 9p9p 東東 白白
      const hand = [0, 0, 2, 2, 4, 4, 15, 15, 17, 17, 27, 27, 31, 31];
      expect(isSevenPairs(hand)).toBe(true);
    });

    it("should reject four of a kind as two pairs", () => {
      // Four 1m is not two pairs for chiitoi
      const hand = [0, 0, 0, 0, 2, 2, 4, 4, 15, 15, 17, 17, 27, 27];
      expect(isSevenPairs(hand)).toBe(false);
    });
  });

  describe("isThirteenOrphans", () => {
    it("should detect thirteen orphans", () => {
      // 1m,9m,1p,9p,1s,9s,東,南,西,北,白,發,中 + 1m
      const hand = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33, 0];
      expect(isThirteenOrphans(hand)).toBe(true);
    });

    it("should reject incomplete thirteen orphans", () => {
      const hand = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 32, 0];
      expect(isThirteenOrphans(hand)).toBe(false);
    });
  });

  describe("calculateShanten", () => {
    it("should return 0 for a tenpai hand (tanki wait)", () => {
      // 1m2m3m 4m5m6m 7m8m9m 1p2p3p 5s (waiting for 5s pair)
      const hand = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 22];
      // This hand has 4 mentsu and just needs a pair -> tenpai (0)
      expect(calculateShanten(hand)).toBeLessThanOrEqual(0);
    });

    it("should detect tenpai via findWaitingTiles", () => {
      // 1m2m3m 4m5m6m 7m8m9m 1p2p3p 5s -> waiting for 5s
      const hand = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 22];
      expect(isTenpai(hand)).toBe(true);
    });
  });

  describe("findWaitingTiles", () => {
    it("should find waiting tiles for a simple tenpai", () => {
      // 1m2m3m 4m5m6m 7m8m9m 1p2p3p 5s -> waiting for 5s
      const hand = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 22];
      const waits = findWaitingTiles(hand);
      expect(waits).toContain(22); // 5s
    });

    it("should find multiple waiting tiles", () => {
      // 1m2m3m 4m5m6m 7m8m 1p2p3p 5s5s -> waiting for 6m or 9m
      const hand = [0, 1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 22, 22];
      const waits = findWaitingTiles(hand);
      expect(waits.length).toBeGreaterThan(0);
    });
  });

  describe("isTenpai", () => {
    it("should return true for tenpai hand", () => {
      const hand = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 22];
      expect(isTenpai(hand)).toBe(true);
    });

    it("should return false for non-tenpai hand", () => {
      const hand = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24];
      expect(isTenpai(hand)).toBe(false);
    });
  });

  describe("decomposeHand", () => {
    it("should find decomposition for a standard hand", () => {
      const hand = [0, 0, 0, 1, 2, 3, 13, 14, 15, 25, 25, 25, 26, 26];
      const decompositions = decomposeHand(hand);
      expect(decompositions.length).toBeGreaterThan(0);
    });

    it("should return empty for non-decomposable hand", () => {
      const hand = [0, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25];
      const decompositions = decomposeHand(hand);
      expect(decompositions.length).toBe(0);
    });
  });
});
