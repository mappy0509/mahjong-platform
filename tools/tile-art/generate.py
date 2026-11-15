#!/usr/bin/env python3
"""麻雀牌の絵柄SVGを生成する。

出力: apps/web/public/tiles/{m,p,s}{0-9}.svg, z1-z7.svg（37枚）
      tools/tile-art/preview.svg → render.mjs で preview.png

使い方: python3 tools/tile-art/generate.py   （どこから実行してもよい）
依存: fonttools（pip）、node + @resvg/resvg-js（tools/tile-art/node_modules）
"""
import math
import os
import subprocess
import sys

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(ROOT, "apps", "web", "public", "tiles")
FONTS = os.path.join(HERE, "fonts")

W, H = 300, 400
PAD = 24  # 面の内側の余白
IVORY = "#F6F1E4"

# 伝統的な牌の配色（象牙色の面の上でコントラストが取れる濃さ）
INK = "#16213a"      # 漢数字・風牌（濃紺寄りの墨）
RED = "#c3242b"      # 萬・中・赤
GREEN = "#127046"    # 索子・筒子の緑・發
BLUE = "#1d4f9c"     # 筒子の青
GREEN_D = "#0b4a2e"
RED_D = "#8c1519"
BLUE_D = "#123569"
FRAME = "#2f6db5"    # 白の飾り枠

# ---------------------------------------------------------------- fonts
_fonts = {}


def font(name):
    if name not in _fonts:
        f = TTFont(os.path.join(FONTS, name), lazy=True)
        _fonts[name] = (f, f.getGlyphSet(), f.getBestCmap(), f["head"].unitsPerEm)
    return _fonts[name]


F_NUM = "YujiBoku-Regular.ttf"       # 萬子の漢数字
F_MAN = "YujiBoku-Regular.ttf"       # 萬
F_HONOR = "YujiBoku-Regular.ttf"     # 東南西北發中


def ntos(v):
    s = f"{v:.1f}"
    return s[:-2] if s.endswith(".0") else s


def glyph_bounds(fname, ch):
    f, gs, cmap, upm = font(fname)
    g = gs[cmap[ord(ch)]]
    bp = BoundsPen(gs)
    g.draw(bp)
    return bp.bounds, upm


def glyph_path(fname, ch, cx, cy, scale=None, box=None, sx=1.0):
    """文字の字形を <path d> にする。中心(cx,cy)。scale は px/unit、box=(w,h) なら収まる最大。
    sx は横方向の伸縮（縦長の面に合わせて少し細くする用）。"""
    f, gs, cmap, upm = font(fname)
    g = gs[cmap[ord(ch)]]
    (x0, y0, x1, y1), _ = glyph_bounds(fname, ch)
    if box is not None:
        scale = min(box[0] / ((x1 - x0) * sx), box[1] / (y1 - y0))
    bcx, bcy = (x0 + x1) / 2, (y0 + y1) / 2
    pen = SVGPathPen(gs, ntos=ntos)
    # x' = (x-bcx)*s*sx + cx ; y' = -(y-bcy)*s + cy
    t = (scale * sx, 0, 0, -scale, cx - bcx * scale * sx, cy + bcy * scale)
    g.draw(TransformPen(pen, t))
    return pen.getCommands(), scale


def text_el(fname, ch, cx, cy, color, scale=None, box=None, sx=1.0, stroke=0.0):
    d, _ = glyph_path(fname, ch, cx, cy, scale=scale, box=box, sx=sx)
    st = f' stroke="{color}" stroke-width="{stroke}" stroke-linejoin="round"' if stroke else ""
    return f'<path d="{d}" fill="{color}"{st}/>'


# ---------------------------------------------------------------- 萬子
KANJI_NUM = "一二三四五六七八九"


def num_scale():
    # 一〜九で同じ大きさ（線の太さを揃える）。最大の字が箱に収まる倍率。
    s = 1e9
    for ch in KANJI_NUM:
        (x0, y0, x1, y1), _ = glyph_bounds(F_NUM, ch)
        s = min(s, 210 / (x1 - x0), 150 / (y1 - y0))
    return s


def manzu(n, red=False):
    ch = KANJI_NUM[n - 1]
    numc = RED if red else INK
    out = [text_el(F_NUM, ch, 150, 112, numc, scale=num_scale(), stroke=3)]
    out.append(text_el(F_MAN, "萬", 150, 282, RED, box=(220, 170), stroke=2))
    if red:
        out.append(red_mark())
    return out


def red_mark():
    # 赤五の目印は入れない（図柄全体が赤であることで区別する）。将来の差し込み口。
    return ""


# ---------------------------------------------------------------- 筒子
def pin(cx, cy, r, c, dark):
    """筒子の輪: 外輪 → 細い白線 → 色帯 → 花弁 → 芯。単なる丸にしない。"""
    p = []
    p.append(f'<circle cx="{ntos(cx)}" cy="{ntos(cy)}" r="{ntos(r)}" fill="{dark}"/>')
    p.append(f'<circle cx="{ntos(cx)}" cy="{ntos(cy)}" r="{ntos(r*0.90)}" fill="{c}"/>')
    p.append(f'<circle cx="{ntos(cx)}" cy="{ntos(cy)}" r="{ntos(r*0.72)}" fill="{IVORY}"/>')
    p.append(f'<circle cx="{ntos(cx)}" cy="{ntos(cy)}" r="{ntos(r*0.62)}" fill="{c}"/>')
    # 8枚の花弁（象牙色）
    petals = []
    for i in range(8):
        a = i * 45
        petals.append(
            f'<ellipse cx="0" cy="{ntos(-r*0.36)}" rx="{ntos(r*0.13)}" ry="{ntos(r*0.21)}" '
            f'transform="rotate({a})"/>'
        )
    p.append(f'<g transform="translate({ntos(cx)} {ntos(cy)})" fill="{IVORY}">{"".join(petals)}</g>')
    p.append(f'<circle cx="{ntos(cx)}" cy="{ntos(cy)}" r="{ntos(r*0.17)}" fill="{IVORY}"/>')
    p.append(f'<circle cx="{ntos(cx)}" cy="{ntos(cy)}" r="{ntos(r*0.09)}" fill="{dark}"/>')
    return "".join(p)


CG = (GREEN, GREEN_D)
CB = (BLUE, BLUE_D)
CR = (RED, RED_D)


def pin_one(red=False):
    cx, cy, R = 150, 200, 122
    o = []
    # 外周: 緑の帯に白い点の連なり
    o.append(f'<circle cx="{cx}" cy="{cy}" r="{R}" fill="{GREEN_D}"/>')
    o.append(f'<circle cx="{cx}" cy="{cy}" r="{R-5}" fill="{GREEN}"/>')
    dots = []
    for i in range(20):
        a = math.radians(i * 18)
        dots.append(f'<circle cx="{ntos(cx+math.cos(a)*(R-17))}" cy="{ntos(cy+math.sin(a)*(R-17))}" r="6"/>')
    o.append(f'<g fill="{IVORY}">{"".join(dots)}</g>')
    o.append(f'<circle cx="{cx}" cy="{cy}" r="{R-31}" fill="{IVORY}"/>')
    # 青の輪
    o.append(f'<circle cx="{cx}" cy="{cy}" r="{R-38}" fill="{BLUE}"/>')
    # 赤の花（16枚の花弁）
    o.append(f'<circle cx="{cx}" cy="{cy}" r="{R-52}" fill="{IVORY}"/>')
    pet = []
    for i in range(16):
        pet.append(f'<path d="M0 -12 C 9 -24 9 -50 0 -62 C -9 -50 -9 -24 0 -12 Z" transform="rotate({i*22.5})"/>')
    o.append(f'<g transform="translate({cx} {cy})" fill="{RED}">{"".join(pet)}</g>')
    o.append(f'<circle cx="{cx}" cy="{cy}" r="20" fill="{GREEN}"/>')
    o.append(f'<circle cx="{cx}" cy="{cy}" r="11" fill="{IVORY}"/>')
    o.append(f'<circle cx="{cx}" cy="{cy}" r="5" fill="{RED}"/>')
    return o


def pinzu(n, red=False):
    if n == 1:
        return pin_one()
    L = []  # (cx, cy, r, color)
    if n == 2:
        L = [(150, 112, 70, CG), (150, 288, 70, CB)]
    elif n == 3:
        L = [(82, 92, 54, CB), (150, 200, 54, CR), (218, 308, 54, CG)]
    elif n == 4:
        L = [(92, 122, 56, CB), (208, 122, 56, CG), (92, 278, 56, CG), (208, 278, 56, CB)]
    elif n == 5:
        r = 48
        L = [(84, 84, r, CB), (216, 84, r, CG), (150, 200, r, CR), (84, 316, r, CG), (216, 316, r, CB)]
    elif n == 6:
        r = 44
        L = [(96, 70, r, CG), (204, 70, r, CG),
             (96, 212, r, CR), (204, 212, r, CR), (96, 324, r, CR), (204, 324, r, CR)]
    elif n == 7:
        r = 40
        L = [(68, 66, r, CG), (150, 104, r, CG), (232, 142, r, CG),
             (102, 238, r, CR), (198, 238, r, CR), (102, 330, r, CR), (198, 330, r, CR)]
    elif n == 8:
        r = 42
        ys = [68, 156, 244, 332]
        L = [(x, y, r, CB) for y in ys for x in (98, 202)]
    elif n == 9:
        r = 40
        rows = [(80, CB), (200, CR), (320, CG)]
        L = [(x, y, r, c) for y, c in rows for x in (66, 150, 234)]
    if red:
        L = [(x, y, r, CR) for x, y, r, _ in L]
    return [pin(x, y, r, c[0], c[1]) for x, y, r, c in L]


# ---------------------------------------------------------------- 索子
def stick(cx, cy, length, c, dark, rot=0, w=28):
    """竹の棒: 上下の端と中央に節。中に白い筋。"""
    h = length
    x0, y0 = -w / 2, -h / 2
    parts = []
    parts.append(f'<rect x="{ntos(x0)}" y="{ntos(y0)}" width="{ntos(w)}" height="{ntos(h)}" rx="{ntos(w*0.42)}" fill="{c}"/>')
    # 竹の光沢: 左寄りの明るい筋（上半分・下半分）。象牙色で抜くと中空に見えるので同系の明色。
    seg = h / 2
    for k in (0, 1):
        sy = y0 + k * seg + 12
        sh = seg - 24
        parts.append(f'<rect x="{ntos(-w*0.30)}" y="{ntos(sy)}" width="{ntos(w*0.20)}" height="{ntos(sh)}" rx="{ntos(w*0.10)}" fill="{IVORY}" opacity="0.45"/>')
    # 節（端2つ＋中央）: 少し太い濃色の帯
    nw = w + 10
    for ny in (y0 + 5, 0, -y0 - 5):
        parts.append(f'<rect x="{ntos(-nw/2)}" y="{ntos(ny-6)}" width="{ntos(nw)}" height="12" rx="6" fill="{dark}"/>')
    tr = f"translate({ntos(cx)} {ntos(cy)})" + (f" rotate({rot})" if rot else "")
    return f'<g transform="{tr}">{"".join(parts)}</g>'


SG = (GREEN, GREEN_D)
SR = (RED, RED_D)
SB = (BLUE, BLUE_D)


def bird():
    """一索: 竹に止まる孔雀（オリジナル）。"""
    o = []
    # 尾羽: 下に向かって扇状に広がる
    feathers = []
    for i, a in enumerate((-44, -27, -9, 9, 27, 44)):
        col = GREEN if i % 2 == 0 else BLUE
        feathers.append(
            f'<g transform="translate(150 214) rotate({a})">'
            f'<path d="M0 0 C 22 40 26 100 0 150 C -26 100 -22 40 0 0 Z" fill="{col}"/>'
            f'<path d="M0 10 L0 120" stroke="{IVORY}" stroke-width="3" fill="none" opacity="0.7"/>'
            f'<ellipse cx="0" cy="124" rx="13" ry="16" fill="{IVORY}"/>'
            f'<ellipse cx="0" cy="125" rx="9" ry="11" fill="{RED}"/>'
            f'<circle cx="0" cy="127" r="4.5" fill="{BLUE_D}"/>'
            f'</g>'
        )
    o.extend(feathers)
    # 胴体
    o.append(f'<path d="M150 112 C 196 120 206 178 186 222 C 172 252 128 252 114 222 C 96 182 108 124 150 112 Z" fill="{GREEN}"/>')
    o.append(f'<path d="M150 112 C 196 120 206 178 186 222 C 172 252 128 252 114 222 C 96 182 108 124 150 112 Z" fill="none" stroke="{GREEN_D}" stroke-width="5"/>')
    # 胸の模様（うろこ）
    sc = []
    for row, y in enumerate((158, 182, 206)):
        for x in ((136, 164) if row != 1 else (122, 150, 178)):
            sc.append(f'<path d="M{x-10} {y} Q {x} {y+16} {x+10} {y}" fill="none" stroke="{IVORY}" stroke-width="3.5" stroke-linecap="round"/>')
    o.extend(sc)
    # 翼（青）
    o.append(f'<path d="M188 140 C 236 150 250 200 226 244 C 214 220 200 200 182 194 Z" fill="{BLUE}" stroke="{BLUE_D}" stroke-width="4" stroke-linejoin="round"/>')
    o.append(f'<path d="M112 140 C 64 150 50 200 74 244 C 86 220 100 200 118 194 Z" fill="{BLUE}" stroke="{BLUE_D}" stroke-width="4" stroke-linejoin="round"/>')
    for s in (1, -1):
        for k in range(3):
            x = 150 + s * (62 + k * 14)
            o.append(f'<path d="M{150 + s*42} {176 + k*12} L{x} {196 + k*16}" stroke="{IVORY}" stroke-width="3" stroke-linecap="round" opacity="0.8"/>')
    # 首と頭
    o.append(f'<path d="M136 120 C 132 96 136 78 150 70 C 164 78 168 96 164 120 Z" fill="{GREEN}"/>')
    o.append(f'<circle cx="150" cy="66" r="24" fill="{GREEN}" stroke="{GREEN_D}" stroke-width="4"/>')
    # 冠羽（赤）
    for a in (-28, 0, 28):
        o.append(f'<g transform="translate(150 50) rotate({a})"><path d="M0 0 L0 -16" stroke="{GREEN_D}" stroke-width="3"/><circle cx="0" cy="-19" r="6" fill="{RED}"/></g>')
    # 目とくちばし
    o.append(f'<circle cx="150" cy="62" r="8" fill="{IVORY}"/><circle cx="151" cy="62" r="4.5" fill="{INK}"/>')
    o.append(f'<path d="M140 76 L150 98 L160 76 Z" fill="#d9822b" stroke="{RED_D}" stroke-width="2" stroke-linejoin="round"/>')
    # 足と止まり木（竹）
    o.append(f'<rect x="60" y="246" width="180" height="16" rx="8" fill="{GREEN_D}"/>')
    o.append(f'<rect x="146" y="243" width="8" height="22" rx="4" fill="{IVORY}" opacity="0.8"/>')
    for x in (132, 168):
        o.append(f'<path d="M{x} 232 L{x} 252 M{x-8} 254 L{x} 248 L{x+8} 254" stroke="{RED_D}" stroke-width="5" stroke-linecap="round" fill="none"/>')
    return o


def souzu(n, red=False):
    if n == 1:
        return bird()
    L = 104  # 棒の長さ
    S = []
    if n == 2:
        S = [(150, 112, SG, 0, 150), (150, 288, SG, 0, 150)]
    elif n == 3:
        S = [(150, 112, SG, 0, 150), (96, 288, SG, 0, 150), (204, 288, SG, 0, 150)]
    elif n == 4:
        S = [(96, 112, SG, 0, 150), (204, 112, SG, 0, 150), (96, 288, SG, 0, 150), (204, 288, SG, 0, 150)]
    elif n == 5:
        S = [(78, 112, SG, 0, 150), (222, 112, SG, 0, 150), (150, 200, SR, 0, 150),
             (78, 288, SG, 0, 150), (222, 288, SG, 0, 150)]
    elif n == 6:
        S = [(x, y, SG, 0, 150) for y in (112, 288) for x in (66, 150, 234)]
    elif n == 7:
        S = [(150, 82, SR, 0, 112)] + [(x, y, SG, 0, 112) for y in (200, 318) for x in (66, 150, 234)]
    elif n == 8:
        t = 22
        # 上段は M（| \ / |）、下段は W（| / \ |）。内側の2本は先端で接する。
        top = [(48, 112, SG, 0, 150), (108, 112, SG, -t, 150), (192, 112, SG, t, 150), (252, 112, SG, 0, 150)]
        bot = [(48, 288, SG, 0, 150), (108, 288, SG, t, 150), (192, 288, SG, -t, 150), (252, 288, SG, 0, 150)]
        S = top + bot
    elif n == 9:
        cols = [(66, SG), (150, SR), (234, SB)]
        S = [(x, y, c, 0, 106) for y in (82, 200, 318) for x, c in cols]
    if red:
        S = [(x, y, SR, rot, ln) for x, y, _, rot, ln in S]
    w = {2: 44, 3: 42, 4: 42, 5: 40, 6: 38, 7: 36, 8: 34, 9: 36}[n]
    return [stick(x, y, ln, c[0], c[1], rot=rot, w=w) for x, y, c, rot, ln in S]


# ---------------------------------------------------------------- 字牌
def honor(k):
    if k == 5:  # 白: 細い青の飾り枠
        return [
            f'<rect x="44" y="44" width="212" height="312" rx="18" fill="none" stroke="{FRAME}" stroke-width="9"/>',
            f'<rect x="60" y="60" width="180" height="280" rx="10" fill="none" stroke="{FRAME}" stroke-width="3"/>',
        ]
    ch = "東南西北白發中"[k - 1]
    col = {6: GREEN, 7: RED}.get(k, INK)
    return [text_el(F_HONOR, ch, 150, 200, col, box=(236, 300), stroke=3)]


# ---------------------------------------------------------------- 出力
def tile_list():
    out = []
    for suit in "mps":
        for n in range(1, 10):
            out.append(f"{suit}{n}")
    for k in range(1, 8):
        out.append(f"z{k}")
    out += ["m0", "p0", "s0"]
    return out


def content(code):
    suit, n = code[0], int(code[1])
    if suit == "z":
        return honor(n)
    red = n == 0
    n = 5 if red else n
    return {"m": manzu, "p": pinzu, "s": souzu}[suit](n, red=red)


def svg_doc(body):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">'
        + "".join(b for b in body if b)
        + "</svg>\n"
    )


def preview(tiles):
    cols = 9
    gap = 14
    big_w, big_h = 150, 200
    sm_w, sm_h = 60, 80
    rows = [tiles[0:9], tiles[9:18], tiles[18:27], tiles[27:34], tiles[34:37]]
    margin = 30
    big_h_total = len(rows) * (big_h + gap)
    sm_gap = 8
    sm_top = margin + big_h_total + 40
    total_w = margin * 2 + cols * big_w + (cols - 1) * gap
    total_h = sm_top + len(rows) * (sm_h + sm_gap) + margin
    out = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {total_w} {total_h}" width="{total_w}" height="{total_h}">',
        f'<rect width="{total_w}" height="{total_h}" fill="#17402f"/>',
    ]

    def face(x, y, w, h, code):
        s = w / W
        rr = w * 0.09
        o = [
            f'<rect x="{ntos(x+w*0.02)}" y="{ntos(y+h*0.03)}" width="{ntos(w)}" height="{ntos(h)}" rx="{ntos(rr)}" fill="#0b2419" opacity="0.6"/>',
            f'<rect x="{ntos(x)}" y="{ntos(y)}" width="{ntos(w)}" height="{ntos(h)}" rx="{ntos(rr)}" fill="{IVORY}"/>',
            f'<g transform="translate({ntos(x)} {ntos(y)}) scale({s})">' + "".join(b for b in content(code) if b) + "</g>",
        ]
        return "".join(o)

    for ri, row in enumerate(rows):
        for ci, code in enumerate(row):
            x = margin + ci * (big_w + gap)
            y = margin + ri * (big_h + gap)
            out.append(face(x, y, big_w, big_h, code))
    for ri, row in enumerate(rows):
        for ci, code in enumerate(row):
            x = margin + ci * (sm_w + sm_gap)
            y = sm_top + ri * (sm_h + sm_gap)
            out.append(face(x, y, sm_w, sm_h, code))
    out.append("</svg>")
    return "".join(out)


def main():
    os.makedirs(OUT, exist_ok=True)
    tiles = tile_list()
    for code in tiles:
        with open(os.path.join(OUT, f"{code}.svg"), "w", encoding="utf-8") as f:
            f.write(svg_doc(content(code)))
    pv = os.path.join(HERE, "preview.svg")
    with open(pv, "w", encoding="utf-8") as f:
        f.write(preview(tiles))
    print(f"wrote {len(tiles)} tiles to {OUT}")
    if "--no-png" not in sys.argv:
        subprocess.run(["node", os.path.join(HERE, "render.mjs"), pv, os.path.join(HERE, "preview.png")], check=True)


if __name__ == "__main__":
    main()
