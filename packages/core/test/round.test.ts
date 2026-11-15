import { describe, expect, it } from 'vitest';
import { calcPayments, defaultRules, Game, seededRandom, type ClaimOptions, type TurnOptions } from '../src/index.ts';
import { discard, find, mk, ok, passAll, runOut, tsumogiri, yakuIds } from './helpers.ts';

const JUNK = '147m258p369s1346z';

describe('副露手の和了', () => {
  it('ポンした手でロンできる（役牌のみ 30符1翻 = 1000点）', () => {
    const r = mk({
      hands: ['147m258p369s1235z', '234m567p78s9m55z22z', JUNK, JUNK],
      draws: ['7z', '7z'], dora: '1p',
    });
    discard(r, 0, '5z');
    const o = r.options(1) as ClaimOptions;
    expect(o.pon.length).toBe(1);
    ok(r, 1, { type: 'pon', tiles: o.pon[0] });
    expect(r.s.turn).toBe(1);
    discard(r, 1, '9m');
    expect(r.s.turn).toBe(2);
    discard(r, 2, '9s');
    expect((r.options(1) as ClaimOptions).ron).toBe(true);
    ok(r, 1, { type: 'ron' });
    expect(r.s.result?.type).toBe('agari');
    expect(yakuIds(r)).toEqual(['haku']);
    expect(r.s.result?.deltas).toEqual([0, 1000, -1000, 0]);
  });

  it('ポンした手でツモ和了できる', () => {
    const r = mk({
      hands: ['147m258p369s1235z', '234m567p78s9m55z22z', JUNK, JUNK],
      draws: ['7z', '7z', '7z', '7z', '6s'], dora: '1p',
    });
    discard(r, 0, '5z');
    ok(r, 1, { type: 'pon', tiles: (r.options(1) as ClaimOptions).pon[0] });
    discard(r, 1, '9m');
    tsumogiri(r, 2); passAll(r);
    tsumogiri(r, 3); passAll(r);
    tsumogiri(r, 0); passAll(r);
    expect(r.s.turn).toBe(1);
    expect((r.options(1) as TurnOptions).tsumo).toBe(true);
    ok(r, 1, { type: 'tsumo' });
    expect(yakuIds(r)).toEqual(['haku']);
    // 30符1翻 子のツモ: 親500 子300
    expect(r.s.result?.deltas).toEqual([-500, 1100, -300, -300]);
  });
});

describe('フリテン', () => {
  it('自分の河に待ち牌があるとロンできない', () => {
    const r = mk({
      hands: [JUNK, '234m567p78s345s22z', JUNK, JUNK],
      draws: ['7z', '9s', '6s'], dora: '1p',
    });
    discard(r, 0, '7z');
    expect((r.options(1) as TurnOptions).tsumo).toBe(true);
    tsumogiri(r, 1); // 和了らずに 9s を切る
    passAll(r);
    expect(r.isFuriten(1)).toBe(true);
    tsumogiri(r, 2); // 6s
    expect(r.options(1)).toBeNull();
  });

  it('役が無くて見逃した牌でも同巡フリテンになり、自分の打牌で解ける', () => {
    // seat2: 断幺九の形で 6s/9s 待ち。9s は役なし。
    const r = mk({
      hands: ['147m258p39s12345z', '147m258p36s12345z', '222m567p78s345s66p', JUNK],
      draws: ['7z', '6s', '7z', '6s'], dora: '1p',
    });
    discard(r, 0, '9s');
    // 役が無いのでロンの選択肢は出ない
    expect(r.options(2)).toBeNull();
    expect(r.s.turn).toBe(1);
    tsumogiri(r, 1); // 6s
    // 同巡フリテン: チーはできるがロンはできない
    expect((r.options(2) as ClaimOptions).ron).toBe(false);
    ok(r, 2, { type: 'pass' });
    expect(r.s.turn).toBe(2);
    tsumogiri(r, 2); // 自分の打牌でフリテン解除
    passAll(r);
    tsumogiri(r, 3); // 6s
    expect((r.options(2) as ClaimOptions).ron).toBe(true);
    ok(r, 2, { type: 'ron' });
    expect(yakuIds(r)).toContain('tanyao');
  });

  it('立直後に見逃すと、その局はずっとロンできない', () => {
    const r = mk({
      hands: ['234m567p78s345s22z', JUNK, JUNK, JUNK],
      draws: ['7z', '6s', '7z', '7z', '9p', '9p', '9s'], dora: '1p',
    });
    discard(r, 0, '7z', true);
    passAll(r);
    tsumogiri(r, 1); // 6s
    expect((r.options(0) as ClaimOptions).ron).toBe(true);
    ok(r, 0, { type: 'pass' });
    tsumogiri(r, 2); passAll(r);
    tsumogiri(r, 3); passAll(r);
    tsumogiri(r, 0); passAll(r);
    tsumogiri(r, 1); passAll(r);
    tsumogiri(r, 2); // 9s
    expect(r.options(0)).toBeNull();
    expect(r.isFuriten(0)).toBe(true);
  });
});

describe('鳴きの優先順位', () => {
  const setup = () =>
    mk({
      hands: ['147m258p369s1234z', '46p19m19s1234567z', '55p28m28s1234567z', '234m678m345s46p88s'],
      draws: ['7z'], dora: '1m',
    });

  it('チー・ポンが先に届いても、ロンが優先される', () => {
    const r = setup();
    discard(r, 0, '5p');
    expect(r.actors().sort()).toEqual([1, 2, 3]);
    ok(r, 1, { type: 'chi', tiles: (r.options(1) as ClaimOptions).chi[0] });
    expect(r.s.phase).toBe('claim');
    ok(r, 2, { type: 'pon', tiles: (r.options(2) as ClaimOptions).pon[0] });
    expect(r.s.phase).toBe('claim');
    ok(r, 3, { type: 'ron' });
    expect(r.s.result?.winners).toEqual([3]);
  });

  it('ロンが見送られたら、チーよりポンが優先される', () => {
    const r = setup();
    discard(r, 0, '5p');
    ok(r, 1, { type: 'chi', tiles: (r.options(1) as ClaimOptions).chi[0] });
    ok(r, 3, { type: 'pass' });
    expect(r.s.phase).toBe('claim');
    ok(r, 2, { type: 'pon', tiles: (r.options(2) as ClaimOptions).pon[0] });
    expect(r.s.phase).toBe('turn');
    expect(r.s.turn).toBe(2);
    expect(r.s.players[2].melds[0].type).toBe('pon');
    expect(r.s.players[1].melds.length).toBe(0);
  });

  it('全員が見送ればチーが通る。喰い替えは切れない', () => {
    const r = setup();
    discard(r, 0, '5p');
    ok(r, 3, { type: 'pass' });
    ok(r, 2, { type: 'pass' });
    ok(r, 1, { type: 'chi', tiles: (r.options(1) as ClaimOptions).chi[0] });
    expect(r.s.turn).toBe(1);
    expect(r.s.players[1].melds[0].type).toBe('chi');
    expect(r.s.players[1].kuikae).toEqual([13]);
  });

  it('ダブロン: 2人とも和了り、供託と本場は放銃者に近い方が取る', () => {
    const r = mk({
      hands: ['147m258p369s1234z', '234m678m345s46p88s', JUNK, '234m678m345s46p88s'],
      draws: ['7z'], dora: '1m', honba: 1, kyotaku: 1,
    });
    discard(r, 0, '5p');
    ok(r, 3, { type: 'ron' });
    expect(r.s.phase).toBe('claim');
    ok(r, 1, { type: 'ron' });
    expect(r.s.result?.winners).toEqual([1, 3]);
    // 断幺九・ドラ1 40符2翻 = 2600。seat1 は +300(本場) +1000(供託)
    expect(r.s.result?.deltas).toEqual([-5500, 3900, 0, 2600]);
  });
});

describe('不正な入力', () => {
  it('手に無い牌・手番でない席・成立しない鳴きは拒否され、状態は変わらない', () => {
    const r = mk({ hands: ['147m258p369s1234z', '46p19m19s1234567z', JUNK, JUNK], draws: ['7z'] });
    const before = JSON.stringify(r.s);
    expect(r.act(0, { type: 'discard', tile: 135 }).ok).toBe(false);
    expect(r.act(1, { type: 'discard', tile: r.s.players[1].hand[0] }).ok).toBe(false);
    expect(r.act(0, { type: 'tsumo' }).ok).toBe(false);
    expect(r.act(0, { type: 'ron' }).ok).toBe(false);
    expect(r.act(0, { type: 'discard', tile: find(r, 0, '1m'), riichi: true }).ok).toBe(false);
    expect(JSON.stringify(r.s)).toBe(before);
    discard(r, 0, '5p');
    const hand = r.s.players[1].hand;
    expect(r.act(1, { type: 'chi', tiles: [hand[0], hand[1]] }).ok).toBe(false); // 1m 9m
    expect(r.act(1, { type: 'chi', tiles: [find(r, 1, '4p'), 999] }).ok).toBe(false);
    expect(r.act(1, { type: 'pon', tiles: [find(r, 1, '4p'), find(r, 1, '6p')] }).ok).toBe(false);
    expect(r.act(2, { type: 'pass' }).ok).toBe(false);
    expect(r.s.phase).toBe('claim');
  });
});

describe('立直', () => {
  it('ダブル立直・一発・ツモ。供託は和了者に戻る', () => {
    const r = mk({
      hands: ['234m567p78s345s22z', JUNK, JUNK, JUNK],
      draws: ['7z', '9p', '9p', '9p', '9s'], dora: '1s', ura: '1s',
    });
    discard(r, 0, '7z', true);
    expect(r.s.scores[0]).toBe(24000);
    expect(r.s.kyotaku).toBe(1);
    tsumogiri(r, 1); tsumogiri(r, 2); tsumogiri(r, 3);
    ok(r, 0, { type: 'tsumo' });
    expect(yakuIds(r)).toEqual(['double_riichi', 'ippatsu', 'tsumo', 'pinfu']);
    // 20符5翻 = 満貫 親ツモ 4000オール + 供託1000
    expect(r.s.scores).toEqual([37000, 21000, 21000, 21000]);
  });

  it('一巡すると一発は消える', () => {
    const r = mk({
      hands: ['234m567p78s345s22z', JUNK, JUNK, JUNK],
      draws: ['7z', '9p', '9p', '9p', '9m', '9m', '9m', '9m', '9s'], dora: '1s', ura: '1s',
    });
    discard(r, 0, '7z', true);
    for (let i = 0; i < 7; i++) { tsumogiri(r, r.s.turn); passAll(r); }
    ok(r, 0, { type: 'tsumo' });
    expect(yakuIds(r)).not.toContain('ippatsu');
  });

  it('鳴きが入ると一発は消える', () => {
    const r = mk({
      hands: ['234m567p78s345s22z', '147m258p369s1239p', '99p147m258s12345z', JUNK],
      draws: ['7z', '6z', '', '', '9s'], dora: '1s', ura: '1s',
    });
    discard(r, 0, '7z', true);
    discard(r, 1, '9p');
    ok(r, 2, { type: 'pon', tiles: (r.options(2) as ClaimOptions).pon[0] });
    discard(r, 2, '1z'); passAll(r);
    tsumogiri(r, 3); passAll(r);
    expect(r.s.turn).toBe(0);
    expect(r.s.players[0].ippatsu).toBe(false);
  });

  it('聴牌しない牌では立直できない／立直後はツモ切りしかできない', () => {
    const r = mk({ hands: ['234m567p78s345s22z', JUNK, JUNK, JUNK], draws: ['7z', '', '', '', '1p'] });
    const o = r.options(0) as TurnOptions;
    expect(o.riichi.map((t) => t >> 2)).toEqual([33]); // 中だけ
    discard(r, 0, '7z', true);
    for (let i = 0; i < 3; i++) { passAll(r); tsumogiri(r, r.s.turn); }
    passAll(r);
    const o2 = r.options(0) as TurnOptions;
    expect(o2.discard).toEqual([r.s.players[0].drawn]);
    expect(r.act(0, { type: 'discard', tile: find(r, 0, '2m') }).ok).toBe(false);
  });

  it('立直宣言牌でロンされたら供託は出ない', () => {
    const r = mk({
      hands: ['234m567p78s345s22z', '234m678m345s46p88s', JUNK, JUNK],
      draws: ['5p'], dora: '1s',
    });
    discard(r, 0, '5p', true);
    ok(r, 1, { type: 'ron' });
    expect(r.s.kyotaku).toBe(0);
    expect(r.s.scores.reduce((a, b) => a + b, 0)).toBe(100000);
    expect(r.s.scores[0]).toBe(25000 - 1300);
    expect(r.s.players[0].riichi).toBe(0);
  });
});

describe('槓', () => {
  it('加槓は槍槓でロンできる', () => {
    const r = mk({
      hands: ['55p147m258s12345z', '234m678m345s46p88s', '147m28p369s12345z', '147m258p369s1234z'],
      draws: ['7z', '6z', '6z', '6z', '5p'], dealer: 3, dora: '1m',
    });
    discard(r, 3, '5p');
    ok(r, 1, { type: 'pass' }); // ロンを見逃す
    ok(r, 0, { type: 'pon', tiles: (r.options(0) as ClaimOptions).pon[0] });
    discard(r, 0, '1z'); passAll(r);
    tsumogiri(r, 1); passAll(r);
    tsumogiri(r, 2); passAll(r);
    tsumogiri(r, 3); passAll(r);
    const o = r.options(0) as TurnOptions;
    expect(o.kakan.length).toBe(1);
    ok(r, 0, { type: 'kakan', tile: o.kakan[0] });
    expect(r.s.phase).toBe('claim');
    ok(r, 1, { type: 'ron' });
    expect(yakuIds(r)).toEqual(['chankan', 'tanyao', 'dora', 'aka']);
    expect(r.s.result?.loser).toBe(0);
  });

  it('暗槓はすぐ新ドラがめくれ、嶺上牌で和了ると嶺上開花', () => {
    const r = mk({
      hands: ['111m234p567p78s99s', '2345678m258p258s', '2345678m258p258s', '2345678m258p258s'],
      draws: ['1m'], rinshan: '6s', dora: '3z3z',
    });
    const o = r.options(0) as TurnOptions;
    expect(o.ankan).toEqual([0]);
    ok(r, 0, { type: 'ankan', kind: 0 });
    expect(r.doraIndicators().length).toBe(2);
    expect(r.s.rinshan).toBe(true);
    ok(r, 0, { type: 'tsumo' });
    expect(yakuIds(r)).toEqual(['tsumo', 'rinshan']);
    expect(r.doraIndicators()[0] >> 2).toBe(29);
  });

  it('大明槓の新ドラは打牌の後にめくれる', () => {
    const r = mk({
      hands: ['147m258p369s1234z', '555p147m258s1234z', JUNK, JUNK].map((h, i) => (i >= 2 ? '147m28p369s12345z' : h)),
      draws: ['7z'], rinshan: '6z',
    });
    discard(r, 0, '5p');
    expect((r.options(1) as ClaimOptions).kan).toBe(true);
    ok(r, 1, { type: 'minkan' });
    expect(r.s.turn).toBe(1);
    expect(r.doraIndicators().length).toBe(1);
    tsumogiri(r, 1);
    expect(r.doraIndicators().length).toBe(2);
  });
});

describe('流局', () => {
  it('荒牌: 親だけ聴牌なら 3000点もらって連荘', () => {
    const r = mk({ hands: ['234m567p78s345s22z', '2345678m258p369s', '2345678m258p369s', '2345678m258p369s'] });
    runOut(r);
    expect(r.s.result?.type).toBe('draw');
    expect(r.s.result?.reason).toBe('exhaustive');
    expect(r.s.result?.deltas).toEqual([3000, -1000, -1000, -1000]);
    expect(r.s.result?.renchan).toBe(true);
    expect(r.remaining()).toBe(0);
  });

  it('流し満貫', () => {
    const yao = ['1m', '9m', '1p', '9p', '1s', '9s', '1z', '2z', '3z', '4z', '5z', '6z', '7z', '1m', '9m', '1p', '9p', '1s'];
    const draws: string[] = [];
    for (let i = 0; i < 70; i++) draws.push(i % 4 === 1 ? yao[(i - 1) / 4] : '');
    const h = '2345678m258p258s';
    const r = mk({ hands: [h, h, h, h], draws });
    runOut(r);
    const e = r.events[r.events.length - 1];
    expect(e.t === 'ryuukyoku' && e.nagashi).toEqual([1]);
    expect(r.s.result?.deltas).toEqual([-4000, 8000, -2000, -2000]);
  });

  it('四風連打', () => {
    const r = mk({ hands: [JUNK, JUNK, JUNK, JUNK], draws: ['7z', '7z', '7z', '7z'] });
    for (let i = 0; i < 4; i++) discard(r, i, '1z');
    expect(r.s.result?.reason).toBe('suufon');
    expect(r.s.result?.renchan).toBe(true);
  });

  it('九種九牌', () => {
    const r = mk({ hands: ['19m19p19s1234567z', JUNK, JUNK, JUNK].map((h, i) => (i ? '2345678m258p258s' : h)), draws: ['5m'] });
    expect((r.options(0) as TurnOptions).kyuushu).toBe(true);
    ok(r, 0, { type: 'kyuushu' });
    expect(r.s.result?.reason).toBe('kyuushu');
  });
});

describe('天和・国士', () => {
  it('親の配牌和了は天和', () => {
    const r = mk({ hands: ['234m567p78s345s22z', JUNK, JUNK, JUNK], draws: ['9s'] });
    ok(r, 0, { type: 'tsumo' });
    expect(yakuIds(r)).toEqual(['tenhou']);
    expect(r.s.result?.deltas).toEqual([48000, -16000, -16000, -16000]);
  });
});

describe('責任払い', () => {
  const rules = defaultRules(4);
  it('大三元ツモ: 責任者が全額払う', () => {
    expect(calcPayments({ base: 8000, n: 4, winner: 1, dealer: 0, loser: null, honba: 0, rules, pao: { seat: 2, base: 8000 } }))
      .toEqual([0, 32000, -32000, 0]);
  });
  it('大三元ロン: 放銃者と責任者で折半', () => {
    expect(calcPayments({ base: 8000, n: 4, winner: 1, dealer: 0, loser: 3, honba: 1, rules, pao: { seat: 2, base: 8000 } }))
      .toEqual([0, 32300, -16000, -16300]);
  });
});

describe('3人麻雀', () => {
  const rules = defaultRules(3);
  it('萬子2〜8が無く、チーは出ない。北抜きは嶺上から補充され、抜きドラになる', () => {
    const r = mk({
      hands: ['234p567p78s345s11z', '19m147p258s12356z', '19m147p258s12356z'],
      draws: ['4z', '6p'], rinshan: '9s', dora: '6z', rules,
    });
    expect(r.s.wall.length).toBe(108);
    expect(r.s.wall.some((t) => t >> 2 >= 1 && t >> 2 <= 7)).toBe(false);
    expect((r.options(0) as TurnOptions).nuki).toBe(true);
    ok(r, 0, { type: 'nuki' });
    expect(r.s.players[0].nuki.length).toBe(1);
    expect((r.options(0) as TurnOptions).tsumo).toBe(true);
    ok(r, 0, { type: 'tsumo' });
    expect(yakuIds(r)).toEqual(['tsumo', 'rinshan', 'nuki']);
  });

  it('ツモ損: 子の満貫ツモは 親4000 + 子2000 = 6000', () => {
    expect(calcPayments({ base: 2000, n: 3, winner: 1, dealer: 0, loser: null, honba: 0, rules })).toEqual([-4000, 6000, -2000]);
  });

  it('次の席でもチーの選択肢は出ない', () => {
    const r = mk({ hands: ['19m147p258s12356z', '46p19m19s1235567z', '19m147p258s12356z'], draws: ['5p'], rules });
    tsumogiri(r, 0);
    expect(r.s.phase).toBe('turn');
    expect(r.s.turn).toBe(1);
  });
});

describe('半荘の進行', () => {
  const finish = (g: Game, deltas: number[], renchan: boolean, agari = true) => {
    const r = g.startRound(seededRandom(1));
    r.s.phase = 'end';
    const scores = g.s.scores.map((x, i) => x + deltas[i]);
    r.s.result = { type: agari ? 'agari' : 'draw', renchan, winners: [], loser: null, deltas, scores, kyotaku: 0, resetHonba: agari && !renchan };
    return g.finishRound();
  };

  it('親の和了は連荘で本場が増える。子の和了で親が流れ本場は0に戻る', () => {
    const g = new Game(defaultRules(4));
    finish(g, [3000, -1000, -1000, -1000], true);
    expect([g.s.dealer, g.s.honba, g.s.roundWind]).toEqual([0, 1, 0]);
    finish(g, [-1000, 1000, 0, 0], false);
    expect([g.s.dealer, g.s.honba]).toEqual([1, 0]);
    finish(g, [0, 0, 0, 0], false, false); // 親ノーテン流局
    expect([g.s.dealer, g.s.honba]).toEqual([2, 1]);
  });

  it('オーラスで誰も30000点に届かなければ西入、届けば終了', () => {
    const g = new Game(defaultRules(4));
    for (let i = 0; i < 7; i++) expect(finish(g, [0, 0, 0, 0], false, false)).toBe(false);
    expect([g.s.roundWind, g.kyoku()]).toEqual([1, 3]);
    expect(finish(g, [0, 0, 0, 0], false, false)).toBe(false);
    expect(g.s.roundWind).toBe(2); // 西入
    expect(finish(g, [8000, -8000, 0, 0], false)).toBe(true); // 西場は誰かが届いた時点で終了
  });

  it('オーラスで親がトップかつ30000点以上で和了れば終了（アガリやめ）', () => {
    const g = new Game(defaultRules(4));
    for (let i = 0; i < 7; i++) finish(g, [0, 0, 0, 0], false, false);
    expect(g.s.dealer).toBe(3);
    expect(finish(g, [-2000, -2000, -2000, 6000], true)).toBe(true);
    const sum = g.summary();
    expect(sum.standings[0].seat).toBe(3);
    expect(sum.standings.reduce((a, b) => a + b.points, 0)).toBeCloseTo(0);
    // 31000点トップ: (31000-30000)/1000 + 15 + 20 = 36
    expect(sum.standings[0].points).toBe(36);
  });

  it('トビで終了', () => {
    const g = new Game(defaultRules(4));
    expect(finish(g, [32000, -32000, 0, 0], true)).toBe(true);
  });
});
