import { describe, it, expect } from "vitest";
import {
  calculateBasePoints,
  calculatePayment,
  calculateUmaOka,
} from "../rules/scoring";

describe("Scoring", () => {
  describe("calculateBasePoints", () => {
    it("should calculate mangan", () => {
      expect(calculateBasePoints(5, 30)).toBe(2000);
      expect(calculateBasePoints(4, 30)).toBe(1920);
      expect(calculateBasePoints(3, 60)).toBe(1920);
    });

    it("should cap at mangan for high fu", () => {
      expect(calculateBasePoints(4, 40)).toBe(2000); // 40 * 2^6 = 2560 -> capped
    });

    it("should calculate haneman", () => {
      expect(calculateBasePoints(6, 30)).toBe(3000);
      expect(calculateBasePoints(7, 30)).toBe(3000);
    });

    it("should calculate baiman", () => {
      expect(calculateBasePoints(8, 30)).toBe(4000);
    });

    it("should calculate sanbaiman", () => {
      expect(calculateBasePoints(11, 30)).toBe(6000);
    });

    it("should calculate yakuman", () => {
      expect(calculateBasePoints(13, 30)).toBe(8000);
    });
  });

  describe("calculatePayment", () => {
    it("should calculate non-dealer ron", () => {
      const payment = calculatePayment(2000, false, false, 0, 0);
      expect(payment.ron).toBe(8000); // 2000 * 4 = 8000
    });

    it("should calculate dealer ron", () => {
      const payment = calculatePayment(2000, true, false, 0, 0);
      expect(payment.ron).toBe(12000); // 2000 * 6 = 12000
    });

    it("should calculate non-dealer tsumo", () => {
      const payment = calculatePayment(2000, false, true, 0, 0);
      expect(payment.tsumoDealer).toBe(4000); // 2000 * 2
      expect(payment.tsumoNonDealer).toBe(2000); // 2000 * 1
    });

    it("should calculate dealer tsumo", () => {
      const payment = calculatePayment(2000, true, true, 0, 0);
      expect(payment.tsumoAll).toBe(4000); // 2000 * 2
    });

    it("should add honba bonus", () => {
      const payment = calculatePayment(2000, false, false, 1, 0);
      expect(payment.ron).toBe(8300); // 8000 + 300
    });
  });

  describe("calculateUmaOka", () => {
    it("should calculate uma/oka for standard game", () => {
      const scores = [30000, 25000, 22000, 23000];
      const result = calculateUmaOka(scores, 30000, [30, 10, -10, -30]);

      // Sorted: 30000(idx0), 25000(idx1), 23000(idx3), 22000(idx2)
      // 1st(idx0): (30000-30000)/1000 + 30 = 30
      // 2nd(idx1): (25000-30000)/1000 + 10 = 5
      // 3rd(idx3): (23000-30000)/1000 + (-10) = -17
      // 4th(idx2): (22000-30000)/1000 + (-30) = -38
      expect(result.finalScores).toHaveLength(4);
      expect(result.finalScores[0]).toBe(30);
      expect(result.finalScores[1]).toBe(5);
      expect(result.finalScores[3]).toBe(-17);
      expect(result.finalScores[2]).toBe(-38);
    });
  });
});
