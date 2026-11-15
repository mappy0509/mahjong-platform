# tile-art — 麻雀牌の絵柄SVG

牌の「表面の絵柄」だけを描いたSVG（37枚）を生成する。牌の本体（象牙色の面・厚み・影・裏面）はゲーム側（PixiJS）が描く。

- 出力: `apps/web/public/tiles/`  m1〜m9 / p1〜p9 / s1〜s9 / z1〜z7（東南西北白發中）/ 赤五 m0・p0・s0
- 規格: viewBox `0 0 300 400`、背景透明、絵柄は内側24pxの余白の中。`<text>` は使わない（字形はすべて `<path>`）
- 確認用: `tools/tile-art/preview.png`（上段＝150×200、下段＝実寸に近い60×80）

## 再生成

```bash
cd tools/tile-art
npm install                 # 初回のみ（@resvg/resvg-js）
python3 generate.py         # SVG 37枚 + preview.png
node bbox-check.mjs ../../apps/web/public/tiles   # 枚数・viewBox・<text>無し・余白内に収まっているか
```

Python 依存は `fonttools` のみ（字形をパスに変換）。

## 使ったフォント

| フォント | 用途 | ライセンス | 取得元 |
|---|---|---|---|
| Yuji Boku (Regular) | 萬子の漢数字・萬・東南西北發中 | SIL Open Font License 1.1（`fonts/OFL-YujiBoku.txt`） | github.com/google/fonts `ofl/yujiboku/` |

Copyright 2021 The Yuji Project Authors (https://github.com/Kinutafontfactory/Yuji)

OFL はフォントから作った図形（アウトライン化したパス）の埋め込み・商用利用を妨げない。フォントファイル自体を単体で販売しないこと。

## 配色

| 名前 | 値 | 使う所 |
|---|---|---|
| INK | #16213a | 漢数字・風牌 |
| RED | #c3242b | 萬・中・赤五・五索の中央 |
| GREEN | #127046 | 索子・筒子・發 |
| BLUE | #1d4f9c | 筒子・九索の右列・一索の翼 |
| FRAME | #2f6db5 | 白の飾り枠 |

各色に濃色（*_D）があり、筒子の外輪と竹の節に使う。
