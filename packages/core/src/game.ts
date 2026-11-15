import type { Rules } from './rules.ts';
import { Round, shuffledWall, type RoundResult } from './round.ts';
import type { Tile } from './tiles.ts';

export interface GameState {
  rules: Rules;
  n: number;
  scores: number[];
  /** 0=東場 1=南場 2=西場 3=北場 */
  roundWind: number;
  dealer: number;
  honba: number;
  kyotaku: number;
  /** 起家 */
  startDealer: number;
  /** 何局打ったか（連荘を含む） */
  handsPlayed: number;
  finished: boolean;
}

export interface FinalStanding {
  seat: number;
  rank: number;
  score: number;
  /** ウマ・オカ込みの最終スコア（千点単位、小数1桁） */
  points: number;
}

export interface GameSummary {
  standings: FinalStanding[];
  scores: number[];
}

/** 半荘（または東風）1回分の進行。局そのものは Round が持つ。 */
export class Game {
  s: GameState;
  round: Round | null = null;
  history: RoundResult[] = [];

  constructor(rules: Rules, startDealer = 0) {
    const n = rules.players;
    this.s = {
      rules, n,
      scores: new Array(n).fill(rules.startPoints),
      roundWind: 0, dealer: startDealer, honba: 0, kyotaku: 0,
      startDealer, handsPlayed: 0, finished: false,
    };
  }

  /** 局番号（0始まり。東1局 = 0） */
  kyoku(): number {
    return (this.s.dealer - this.s.startDealer + this.s.n) % this.s.n;
  }

  private lastWind(): number {
    return this.s.rules.length === 'east' ? 0 : 1;
  }

  /** 次の局を始める。wall を渡さない場合は rand で洗牌する。 */
  startRound(rand: () => number, wall?: Tile[]): Round {
    if (this.s.finished) throw new Error('game is finished');
    if (this.round && this.round.s.phase !== 'end') throw new Error('round in progress');
    const s = this.s;
    this.round = new Round({
      rules: s.rules, dealer: s.dealer, roundWind: s.roundWind, kyoku: this.kyoku(),
      honba: s.honba, kyotaku: s.kyotaku, scores: s.scores,
      wall: wall ?? shuffledWall(s.rules.players, rand),
    });
    return this.round;
  }

  /** 局が終わったら呼ぶ。対局終了なら true。 */
  finishRound(): boolean {
    const r = this.round?.s.result;
    if (!r) throw new Error('round is not over');
    const s = this.s;
    this.history.push(r);
    s.scores = r.scores.slice();
    s.kyotaku = r.kyotaku;
    s.handsPlayed++;
    const target = s.rules.returnPoints;
    const top = this.topSeat();
    const anyTarget = s.scores.some((x) => x >= target);
    const inExt = s.roundWind > this.lastWind();
    const lastKyoku = this.kyoku() === s.n - 1;
    s.honba = r.type === 'agari' && r.resetHonba ? 0 : s.honba + 1;

    let end = false;
    if (s.rules.tobi && s.scores.some((x) => x < 0)) end = true;
    else if (inExt && anyTarget) end = true;
    else if ((s.roundWind === this.lastWind() || inExt) && lastKyoku) {
      if (r.renchan) {
        if (s.rules.agariYame && top === s.dealer && s.scores[s.dealer] >= target) end = true;
      } else if (anyTarget || inExt || !s.rules.extension) end = true;
    }
    if (end) {
      s.finished = true;
      this.round = null;
      return true;
    }
    if (!r.renchan) {
      s.dealer = (s.dealer + 1) % s.n;
      if (s.dealer === s.startDealer) s.roundWind++;
    }
    this.round = null;
    return false;
  }

  /** 同点は起家に近い席が上位 */
  private order(): number[] {
    const s = this.s;
    const dist = (q: number) => (q - s.startDealer + s.n) % s.n;
    return Array.from({ length: s.n }, (_, i) => i).sort((a, b) => s.scores[b] - s.scores[a] || dist(a) - dist(b));
  }

  private topSeat(): number {
    return this.order()[0];
  }

  summary(): GameSummary {
    const s = this.s;
    const order = this.order();
    const scores = s.scores.slice();
    // 残った供託はトップへ
    scores[order[0]] += s.kyotaku * 1000;
    const oka = ((s.rules.returnPoints - s.rules.startPoints) * s.n) / 1000;
    const standings: FinalStanding[] = order.map((seat, rank) => ({
      seat, rank: rank + 1, score: scores[seat],
      points: Math.round(((scores[seat] - s.rules.returnPoints) / 1000 + s.rules.uma[rank] + (rank === 0 ? oka : 0)) * 10) / 10,
    }));
    return { standings, scores };
  }
}
