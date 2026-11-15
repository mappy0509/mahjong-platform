/** 卓ごとのルール設定。既定値は docs/RENEWAL_PLAN.md の「既定ルール」。 */
export interface Rules {
  players: 3 | 4;
  /** 'east' = 東風戦, 'south' = 半荘戦 */
  length: 'east' | 'south';
  startPoints: number;
  /** 返し点。これに誰も届かなければ延長（西入）。 */
  returnPoints: number;
  /** 順位ウマ（1位→最下位、千点単位） */
  uma: number[];
  aka: boolean;
  kuitan: boolean;
  ippatsu: boolean;
  uraDora: boolean;
  kanDora: boolean;
  /** 13翻以上を役満にする */
  kazoeYakuman: boolean;
  /** 四暗刻単騎・国士十三面・純正九蓮・大四喜をダブル役満にする */
  doubleYakuman: boolean;
  /** 30符4翻・60符3翻を満貫に切り上げ */
  kiriageMangan: boolean;
  /** 途中流局（九種九牌・四風連打・四槓散了・四家立直） */
  abortiveDraws: boolean;
  nagashiMangan: boolean;
  /** 3人同時ロンを流局にする（false なら3人とも和了） */
  tripleRonAbort: boolean;
  /** 0点未満で終了 */
  tobi: boolean;
  /** 延長（西入）あり */
  extension: boolean;
  /** オーラスの親がトップで返し点以上なら連荘せず終了 */
  agariYame: boolean;
  /** 責任払い（大三元・大四喜） */
  pao: boolean;
  /** 国士無双は暗槓をロンできる */
  kokushiAnkanRon: boolean;
  /** 3人麻雀: ツモ損（ツモ和了の支払いを2人分のままにする） */
  tsumoLoss: boolean;
  /** 本場1つあたりの点（ロン時の合計）。ツモ時は 1人あたり honbaValue / 3。 */
  honbaValue: number;
  /** 持ち時間（秒）: 1手ごとの基本時間と、半荘を通した追加時間 */
  timeBase: number;
  timeBank: number;
}

export function defaultRules(players: 3 | 4 = 4, length: 'east' | 'south' = 'south'): Rules {
  const four = players === 4;
  return {
    players,
    length,
    startPoints: four ? 25000 : 35000,
    returnPoints: four ? 30000 : 40000,
    uma: four ? [15, 5, -5, -15] : [15, 0, -15],
    aka: true,
    kuitan: true,
    ippatsu: true,
    uraDora: true,
    kanDora: true,
    kazoeYakuman: true,
    doubleYakuman: true,
    kiriageMangan: false,
    abortiveDraws: true,
    nagashiMangan: true,
    tripleRonAbort: false,
    tobi: true,
    extension: true,
    agariYame: true,
    pao: true,
    kokushiAnkanRon: true,
    tsumoLoss: true,
    honbaValue: 300,
    timeBase: 5,
    timeBank: 20,
  };
}

export function normalizeRules(partial: Partial<Rules> | undefined): Rules {
  const players = partial?.players === 3 ? 3 : 4;
  const base = defaultRules(players, partial?.length === 'east' ? 'east' : 'south');
  const out: Rules = { ...base, ...(partial ?? {}), players };
  if (!Array.isArray(out.uma) || out.uma.length !== players) out.uma = base.uma;
  return out;
}
