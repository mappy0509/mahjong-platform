import { sortTiles, type RoundEvent, type RoundView } from '@mj/core';

/**
 * 表示用の盤面にイベントを1つ当てる（アニメーションの途中経過を作るため）。
 * 正しい盤面はサーバーから毎回届くので、ここがずれても最後に上書きされる。
 */
export function applyEvent(v: RoundView, e: RoundEvent, mySeat: number): RoundView {
  const view: RoundView = structuredClone(v);
  const P = (seat: number) => view.players[seat];
  const total = (seat: number) => P(seat).handCount + (P(seat).hasDrawn ? 1 : 0);
  const setTotal = (seat: number, t: number) => { P(seat).handCount = t; P(seat).hasDrawn = false; };
  const removeMine = (tiles: number[]) => {
    const p = P(mySeat);
    if (!p.hand) return;
    let all = [...p.hand, ...(p.drawn != null ? [p.drawn] : [])];
    for (const t of tiles) all = all.filter((x) => x !== t);
    p.hand = sortTiles(all);
    p.drawn = null;
    p.handCount = p.hand.length;
    p.hasDrawn = false;
  };
  switch (e.t) {
    case 'draw': {
      const p = P(e.seat);
      p.hasDrawn = true;
      if (e.seat === mySeat && e.tile !== null) p.drawn = e.tile;
      view.left = e.left;
      view.turn = e.seat;
      view.phase = 'turn';
      break;
    }
    case 'discard': {
      const p = P(e.seat);
      if (e.seat === mySeat && p.hand) removeMine([e.tile]);
      else setTotal(e.seat, total(e.seat) - 1);
      p.river.push({ tile: e.tile, tsumogiri: e.tsumogiri, riichi: e.riichi });
      view.turn = e.seat;
      view.phase = 'claim';
      break;
    }
    case 'riichiAccepted': {
      P(e.seat).riichi = P(e.seat).riichi || 1;
      view.kyotaku = e.kyotaku;
      e.scores.forEach((s, i) => (P(i).score = s));
      break;
    }
    case 'riichi':
      P(e.seat).riichi = e.double ? 2 : 1;
      break;
    case 'call': {
      const from = P(e.from);
      const last = from.river[from.river.length - 1];
      if (last) last.calledBy = e.seat;
      const p = P(e.seat);
      p.melds.push(e.meld);
      const own = e.meld.tiles.filter((t) => t !== e.meld.called);
      if (e.seat === mySeat && p.hand) removeMine(own);
      else setTotal(e.seat, total(e.seat) - own.length);
      view.turn = e.seat;
      view.phase = 'turn';
      break;
    }
    case 'kan': {
      const p = P(e.seat);
      if (e.kanType === 'ankan') {
        p.melds.push(e.meld);
        if (e.seat === mySeat && p.hand) removeMine(e.meld.tiles);
        else setTotal(e.seat, total(e.seat) - 4);
      } else {
        const k = e.meld.tiles[0] >> 2;
        const i = p.melds.findIndex((m) => m.tiles[0] >> 2 === k && (m.type === 'pon' || m.type === 'kakan'));
        if (i >= 0) p.melds[i] = e.meld;
        else p.melds.push(e.meld);
        if (e.seat === mySeat && p.hand && e.meld.added !== undefined) removeMine([e.meld.added]);
        else setTotal(e.seat, total(e.seat) - 1);
      }
      break;
    }
    case 'nuki': {
      const p = P(e.seat);
      p.nuki.push(e.tile);
      if (e.seat === mySeat && p.hand) removeMine([e.tile]);
      else setTotal(e.seat, total(e.seat) - 1);
      break;
    }
    case 'dora':
      view.dora.push(e.indicator);
      break;
    case 'agari':
    case 'ryuukyoku':
      e.scores.forEach((s, i) => (P(i).score = s));
      view.phase = 'end';
      break;
    default:
      break;
  }
  view.options = null;
  return view;
}

/** 配牌直後の盤面を start イベントから作る */
export function viewFromStart(e: Extract<RoundEvent, { t: 'start' }>, mySeat: number, n: number): RoundView {
  return {
    seat: mySeat, n, dealer: e.dealer, roundWind: e.roundWind, kyoku: e.kyoku, honba: e.honba, kyotaku: e.kyotaku,
    dora: [e.dora], left: e.left, phase: 'turn', turn: e.dealer,
    players: e.hands.map((h, i) => ({
      seat: i, score: e.scores[i], wind: 27 + ((i - e.dealer + n) % n), handCount: 13, hasDrawn: false,
      ...(i === mySeat && h ? { hand: h.slice(), drawn: null } : {}),
      melds: [], river: [], nuki: [], riichi: 0 as const,
    })),
    waits: [], furiten: false, options: null,
  };
}
