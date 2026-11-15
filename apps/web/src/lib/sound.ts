/**
 * 効果音。素材ファイルは使わず、Web Audio でその場で合成する（権利の問題が出ない）。
 */
type Name =
  | 'draw' | 'discard' | 'select' | 'click' | 'call' | 'kan' | 'riichi' | 'dora' | 'deal' | 'tick'
  | 'ron' | 'tsumo' | 'yaku' | 'score' | 'win' | 'winBig' | 'yakuman' | 'dealin' | 'ryuukyoku' | 'start' | 'end' | 'turn';

class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  volume = 0.7;
  muted = false;

  /** 最初の操作（タップ・クリック）で呼ぶ。ブラウザは操作なしに音を鳴らせない。 */
  unlock() {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as any).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4;
      this.master.connect(comp).connect(this.ctx.destination);
      this.master.gain.value = this.volume;
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
  }
  setMuted(m: boolean) { this.muted = m; this.setVolume(this.volume); }

  private tone(freq: number, t: number, dur: number, type: OscillatorType, gain: number, slideTo?: number) {
    const c = this.ctx!, o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master!);
    o.start(t); o.stop(t + dur + 0.02);
  }

  private noise(t: number, dur: number, gain: number, freq: number, q = 1, type: BiquadFilterType = 'bandpass', slideTo?: number) {
    const c = this.ctx!, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf;
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master!);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }

  /** 牌が卓に当たる硬い音 */
  private clack(t: number, gain = 0.5, pitch = 1) {
    this.noise(t, 0.035, gain, 2600 * pitch, 2.2);
    this.tone(1250 * pitch, t, 0.03, 'triangle', gain * 0.35, 700 * pitch);
    this.tone(190 * pitch, t, 0.07, 'sine', gain * 0.5, 90);
  }

  private chord(freqs: number[], t: number, dur: number, gain: number, type: OscillatorType = 'triangle') {
    for (const f of freqs) this.tone(f, t, dur, type, gain / freqs.length);
  }

  play(name: Name, opt: { tier?: number } = {}) {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.ctx.currentTime + 0.005;
    switch (name) {
      case 'draw': this.noise(t, 0.05, 0.12, 4200, 1.2); break;
      case 'select': this.tone(880, t, 0.05, 'sine', 0.08); break;
      case 'click': this.tone(620, t, 0.06, 'triangle', 0.14, 420); break;
      case 'discard': this.clack(t, 0.55, 0.95 + Math.random() * 0.12); break;
      case 'deal': for (let i = 0; i < 4; i++) this.clack(t + i * 0.06, 0.22, 1.1 + i * 0.05); break;
      case 'turn': this.tone(1320, t, 0.12, 'sine', 0.09); this.tone(1760, t + 0.07, 0.16, 'sine', 0.08); break;
      case 'tick': this.tone(1000, t, 0.04, 'square', 0.05); break;
      case 'call':
        this.clack(t, 0.6, 0.8); this.clack(t + 0.07, 0.5, 0.9);
        this.tone(440, t, 0.2, 'sawtooth', 0.12, 660);
        break;
      case 'kan':
        for (let i = 0; i < 4; i++) this.clack(t + i * 0.055, 0.5, 0.75 + i * 0.06);
        this.tone(220, t, 0.35, 'sawtooth', 0.16, 440);
        this.noise(t + 0.2, 0.3, 0.12, 5000, 0.8, 'highpass');
        break;
      case 'riichi':
        this.tone(110, t, 0.5, 'sine', 0.6, 55); // 太鼓
        this.noise(t, 0.12, 0.4, 300, 0.8, 'lowpass');
        this.noise(t + 0.02, 0.6, 0.16, 6000, 0.7, 'highpass', 9000); // 刃の残響
        this.chord([587, 880, 1175], t + 0.05, 0.9, 0.2, 'sine');
        break;
      case 'dora': this.chord([1568, 2093, 2637], t, 0.5, 0.16, 'sine'); this.tone(3136, t + 0.1, 0.4, 'sine', 0.05); break;
      case 'yaku': this.clack(t, 0.3, 1.4); this.tone(988, t, 0.18, 'triangle', 0.12); break;
      case 'score': this.tone(1320 + Math.random() * 200, t, 0.04, 'square', 0.035); break;
      case 'ron':
      case 'tsumo': {
        // 一撃: 低い衝撃 + 金属の伸び
        this.tone(140, t, 0.7, 'sine', 0.8, 40);
        this.noise(t, 0.25, 0.55, 900, 0.6, 'lowpass', 200);
        this.noise(t, 0.9, 0.2, 7000, 0.6, 'highpass');
        const root = name === 'ron' ? 293.66 : 329.63;
        this.chord([root, root * 1.5, root * 2, root * 3], t + 0.03, 1.3, 0.34, 'sawtooth');
        break;
      }
      case 'win': {
        const tier = opt.tier ?? 0;
        const base = 523.25;
        const seq = [1, 1.25, 1.5, 2, 2.5, 3].slice(0, 3 + Math.min(3, tier));
        seq.forEach((m, i) => this.chord([base * m, base * m * 1.5], t + i * 0.09, 0.5, 0.22, 'triangle'));
        this.noise(t + seq.length * 0.09, 0.8, 0.1 + tier * 0.02, 8000, 0.5, 'highpass');
        break;
      }
      case 'winBig': {
        this.tone(82, t, 1.4, 'sine', 0.9, 36);
        this.noise(t, 0.5, 0.6, 500, 0.5, 'lowpass', 120);
        [1, 1.26, 1.5, 2, 2.52, 3, 4].forEach((m, i) => this.chord([392 * m, 392 * m * 1.5], t + 0.08 + i * 0.07, 1.1, 0.26, 'sawtooth'));
        this.noise(t + 0.5, 1.6, 0.16, 9000, 0.4, 'highpass');
        break;
      }
      case 'yakuman': {
        for (let i = 0; i < 3; i++) { this.tone(70, t + i * 0.42, 0.9, 'sine', 0.95, 30); this.noise(t + i * 0.42, 0.35, 0.6, 400, 0.5, 'lowpass', 100); }
        [1, 1.5, 2, 2.5, 3, 4, 5, 6].forEach((m, i) => this.chord([261.63 * m, 261.63 * m * 1.26, 261.63 * m * 1.5], t + 1.25 + i * 0.08, 2.2, 0.3, 'sawtooth'));
        this.noise(t + 1.2, 3, 0.2, 9000, 0.3, 'highpass');
        break;
      }
      case 'dealin':
        this.tone(220, t, 0.9, 'sawtooth', 0.3, 55);
        this.noise(t, 0.4, 0.5, 1200, 0.7, 'bandpass', 150);
        this.tone(58, t, 1.0, 'sine', 0.7, 30);
        break;
      case 'ryuukyoku': this.chord([392, 466, 587], t, 1.4, 0.25, 'sine'); this.tone(98, t, 1.2, 'sine', 0.3); break;
      case 'start':
        this.tone(98, t, 0.6, 'sine', 0.6, 49); this.noise(t, 0.15, 0.35, 320, 0.8, 'lowpass');
        this.chord([392, 587, 784], t + 0.12, 0.9, 0.22, 'triangle');
        break;
      case 'end': [523, 659, 784, 1046].forEach((f, i) => this.chord([f, f * 1.5], t + i * 0.14, 1.0, 0.24, 'triangle')); break;
    }
  }
}

export const sound = new Sound();
