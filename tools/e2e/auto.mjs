// 画面に注入する自動プレイ（和了れるなら和了る／立直できるなら立直／孤立牌から切る）
export const installAuto = ({ pace }) => {
  const human = pace === 'human';
  window.__log = [];
  window.__busy = false;
  const later = (fn, lo, hi) => { window.__busy = true; setTimeout(() => { try { fn(); } finally { window.__busy = false; } }, human ? lo + Math.random() * (hi - lo) : 60); };
  window.__auto = setInterval(() => {
    const st = window.__game.getState();
    const c = window.__ctl;
    if (window.__busy) return;
    if (st.final) { if (!window.__fin) { window.__fin = true; window.__log.push({ t: 'final', at: Date.now() }); } return; }
    if (st.winShow) {
      const key = st.winShow.index + ':' + st.winShow.wins.length + ':' + (st.view ? st.view.kyoku + '-' + st.view.honba + '-' + st.view.roundWind : '');
      if (window.__wsKey !== key) {
        window.__wsKey = key;
        const w = st.winShow.wins[st.winShow.index];
        window.__log.push({ t: 'win', seat: w.seat, from: w.from, limit: w.result.limit, han: w.result.han, fu: w.result.fu, yaku: w.result.yaku.map((y) => y.name), at: Date.now() });
        later(() => c.closeWinShow(), 5200, 6200);
      }
      return;
    }
    if (st.roundEnd) {
      if (window.__reSeen !== st.roundEnd) {
        window.__reSeen = st.roundEnd;
        window.__log.push({ t: 'roundEnd', type: st.roundEnd.result.type, reason: st.roundEnd.draw ? st.roundEnd.draw.reason : '', scores: st.roundEnd.result.scores, at: Date.now() });
        later(() => c.next(), 2600, 3400);
      }
      return;
    }
    const p = st.prompt;
    if (!p) return;
    const o = p.options;
    if (o.kind === 'turn') {
      if (o.tsumo) return later(() => c.act({ type: 'tsumo' }), 900, 1500);
      if (o.nuki) return later(() => c.act({ type: 'nuki' }), 500, 900);
      if (o.riichi.length) return later(() => { c.setRiichiMode(true); setTimeout(() => c.act({ type: 'discard', tile: o.riichi[o.riichi.length - 1], riichi: true }), human ? 700 : 30); }, 700, 1300);
      // 孤立した字牌・端牌を優先して切る簡単な方針
      const me = st.view.players[st.seat];
      const tiles = o.discard;
      const cnt = {};
      for (const t of [...me.hand, ...(me.drawn != null ? [me.drawn] : [])]) cnt[t >> 2] = (cnt[t >> 2] || 0) + 1;
      const score = (t) => {
        const k = t >> 2;
        if (k >= 27) return cnt[k] >= 2 ? 50 : 0;
        const n = k % 9;
        const near = (n > 0 ? cnt[k - 1] || 0 : 0) + (n < 8 ? cnt[k + 1] || 0 : 0) + 0.5 * ((n > 1 ? cnt[k - 2] || 0 : 0) + (n < 7 ? cnt[k + 2] || 0 : 0)) + 2 * (cnt[k] - 1);
        return 5 + near * 10 - (n === 0 || n === 8 ? 3 : 0);
      };
      const pick = [...tiles].sort((a, b) => score(a) - score(b))[0];
      return later(() => c.act({ type: 'discard', tile: pick }), 700, 1900);
    }
    if (o.ron) return later(() => c.act({ type: 'ron' }), 700, 1200);
    if (o.pon.length && (o.tile >> 2) >= 31) return later(() => c.act({ type: 'pon', tiles: o.pon[0] }), 600, 1100);
    return later(() => c.act({ type: 'pass' }), 350, 800);
  }, 50);
};
