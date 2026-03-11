/**
 * Seeded pseudo-random number generator (xoshiro128**)
 * Deterministic: same seed always produces the same sequence
 */
export class SeededRNG {
  private s: Uint32Array;

  constructor(seed: number) {
    // SplitMix32 to initialize state from a single seed
    this.s = new Uint32Array(4);
    for (let i = 0; i < 4; i++) {
      seed |= 0;
      seed = (seed + 0x9e3779b9) | 0;
      let t = seed ^ (seed >>> 16);
      t = Math.imul(t, 0x21f0aaad);
      t = t ^ (t >>> 15);
      t = Math.imul(t, 0x735a2d97);
      t = t ^ (t >>> 15);
      this.s[i] = t >>> 0;
    }
  }

  /** Get next random uint32 (xoshiro128**) */
  next(): number {
    const s = this.s;
    // result = rotl(s[1] * 5, 7) * 9
    let result = Math.imul(s[1], 5);
    result = (result << 7) | (result >>> 25);
    result = Math.imul(result, 9);
    const t = s[1] << 9;
    s[2] ^= s[0];
    s[3] ^= s[1];
    s[1] ^= s[2];
    s[0] ^= s[3];
    s[2] ^= t;
    s[3] = (s[3] << 11) | (s[3] >>> 21);
    return (result >>> 0);
  }

  /** Random float in [0, 1) */
  random(): number {
    return this.next() / 0x100000000;
  }

  /** Fisher-Yates shuffle (in-place) */
  shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = this.next() % (i + 1);
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }
}
