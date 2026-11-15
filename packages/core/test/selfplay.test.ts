import { describe, expect, it } from 'vitest';
import { playGame, type Stats } from './selfplay.ts';

describe('自動対戦の不変条件（牌の総数・点数の総和・停止しない）', () => {
  it('4人麻雀 40半荘', () => {
    const stats: Stats = {};
    for (let i = 0; i < 40; i++) playGame(5000 + i, 4, stats);
    expect(stats.games).toBe(40);
    expect(stats.openWin).toBeGreaterThan(0);
  }, 120000);
  it('3人麻雀 40半荘', () => {
    const stats: Stats = {};
    for (let i = 0; i < 40; i++) playGame(7000 + i, 3, stats);
    expect(stats.games).toBe(40);
    expect(stats.nuki).toBeGreaterThan(0);
  }, 120000);
});
