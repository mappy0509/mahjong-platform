import type { Round, Options, RiverTile } from './round.ts';
import type { Meld } from './score.ts';
import type { Kind, Tile } from './tiles.ts';

export interface PlayerView {
  seat: number;
  score: number;
  /** 自風（27=東 … 30=北） */
  wind: Kind;
  handCount: number;
  hasDrawn: boolean;
  /** 自分の席だけ入る */
  hand?: Tile[];
  drawn?: Tile | null;
  melds: Meld[];
  river: RiverTile[];
  nuki: Tile[];
  riichi: 0 | 1 | 2;
}

export interface RoundView {
  seat: number;
  n: number;
  dealer: number;
  roundWind: number;
  kyoku: number;
  honba: number;
  kyotaku: number;
  dora: Tile[];
  left: number;
  phase: 'turn' | 'claim' | 'end';
  turn: number;
  players: PlayerView[];
  /** 自分だけの情報 */
  waits: Kind[];
  furiten: boolean;
  options: Options | null;
}

/** seat から見える情報だけの盤面。再接続時はこれを丸ごと送る。seat=-1 は観戦（誰の手牌も見えない）。 */
export function viewFor(round: Round, seat: number): RoundView {
  const s = round.s;
  return {
    seat, n: s.n, dealer: s.dealer, roundWind: s.roundWind, kyoku: s.kyoku,
    honba: s.honba, kyotaku: s.kyotaku, dora: round.doraIndicators(), left: round.remaining(),
    phase: s.phase, turn: s.turn,
    players: s.players.map((p, i) => {
      const v: PlayerView = {
        seat: i, score: s.scores[i], wind: round.seatWind(i),
        handCount: p.hand.length, hasDrawn: p.drawn !== null,
        melds: p.melds, river: p.river, nuki: p.nuki,
        riichi: p.riichi,
      };
      if (i === seat) {
        v.hand = p.hand.slice();
        v.drawn = p.drawn;
      }
      return v;
    }),
    waits: seat >= 0 ? s.players[seat].waits.slice() : [],
    furiten: seat >= 0 ? round.isFuriten(seat) : false,
    options: seat >= 0 ? round.options(seat) : null,
  };
}
