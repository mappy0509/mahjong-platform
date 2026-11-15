"""@mj/core の点数計算を Python の mahjong ライブラリ（外部の正解）と突き合わせる。

使い方: tools/oracle/.venv/bin/python tools/oracle/check.py cases.json
"""
import json
import sys
from collections import Counter

from mahjong.hand_calculating.hand import HandCalculator
from mahjong.hand_calculating.hand_config import HandConfig, OptionalRules
from mahjong.meld import Meld

calc = HandCalculator()
cases = json.load(open(sys.argv[1]))
mism = 0
stats = Counter()
shown = 0
for i, c in enumerate(cases):
    inp = c["inp"]
    tiles = list(inp["hand"])
    melds = []
    for m in inp["melds"]:
        tiles += m["tiles"]
        t = m["type"]
        if t == "chi":
            melds.append(Meld(Meld.CHI, tiles=m["tiles"], opened=True))
        elif t == "pon":
            melds.append(Meld(Meld.PON, tiles=m["tiles"], opened=True))
        elif t == "ankan":
            melds.append(Meld(Meld.KAN, tiles=m["tiles"], opened=False))
        elif t == "minkan":
            melds.append(Meld(Meld.KAN, tiles=m["tiles"], opened=True))
        else:
            melds.append(Meld(Meld.SHOUMINKAN, tiles=m["tiles"], opened=True))
    tsumo = inp["tsumo"]
    cfg = HandConfig(
        is_tsumo=tsumo,
        is_riichi=inp["riichi"] >= 1,
        is_daburu_riichi=inp["riichi"] == 2,
        is_ippatsu=inp["ippatsu"],
        is_rinshan=inp["rinshan"],
        is_chankan=inp["chankan"],
        is_haitei=inp["lastTile"] and tsumo,
        is_houtei=inp["lastTile"] and not tsumo,
        is_tenhou=inp["tenhou"],
        is_chiihou=inp["chiihou"],
        player_wind=inp["seatWind"],
        round_wind=inp["roundWind"],
        options=OptionalRules(has_open_tanyao=True, has_aka_dora=True, has_double_yakuman=True),
    )
    dora = list(inp["doraIndicators"])
    if inp["riichi"]:
        dora += inp["uraIndicators"]
    r = calc.estimate_hand_value(sorted(tiles), inp["winTile"], melds=melds, dora_indicators=dora, config=cfg)
    mine = c["res"]
    if r.error:
        if mine is None:
            stats["both_none"] += 1
            continue
        why = f"oracle error {r.error} / mine han={mine['han']} fu={mine['fu']}"
    elif mine is None:
        why = f"mine None / oracle han={r.han} fu={r.fu} {[str(y) for y in r.yaku]}"
    else:
        pay = c["pay"]
        ok = pay["main"] == r.cost["main"] and (not tsumo or c["dealer"] or pay["additional"] == r.cost["additional"])
        if not mine["yakuman"] or mine["limit"] == "数え役満":
            ok = ok and mine["han"] == r.han and mine["fu"] == r.fu
        if ok:
            stats["match_yakuman" if mine["yakuman"] else "match"] += 1
            continue
        why = (
            f"mine han={mine['han']} fu={mine['fu']} pay={pay} {[y['name'] for y in mine['yaku']]}"
            f" / oracle han={r.han} fu={r.fu} cost={r.cost['main']},{r.cost['additional']} {[str(y) for y in r.yaku]}"
        )
    mism += 1
    if shown < 25:
        shown += 1
        print(f"#{i} tsumo={tsumo} dealer={c['dealer']} win={inp['winTile']>>2} hand={sorted(t>>2 for t in inp['hand'])} "
              f"melds={[(m['type'], sorted(t>>2 for t in m['tiles'])) for m in inp['melds']]} "
              f"seat={inp['seatWind']} round={inp['roundWind']} flags={[k for k in ('riichi','ippatsu','rinshan','chankan','lastTile','tenhou','chiihou') if inp[k]]}\n   {why}")
print(dict(stats), "mismatch", mism, "of", len(cases))
sys.exit(1 if mism else 0)
