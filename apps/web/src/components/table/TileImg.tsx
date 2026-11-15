import { isAkaTile, type Tile } from '@mj/core';

export function tileFile(t: Tile): string {
  const k = t >> 2;
  const s = k < 27 ? 'mps'[Math.floor(k / 9)] : 'z';
  if (isAkaTile(t)) return `${s}0`;
  return `${s}${k < 27 ? (k % 9) + 1 : k - 26}`;
}

/** 牌種(0..33)から、表示用の代表の牌(赤でない)を作る */
export const tileOfKind = (k: number): Tile => k * 4 + 1;

/** HUD用の平面の牌。w は幅(px)。 */
export function TileImg({ tile, w = 36, back = false, side = false, dim = false, glow = false, className = '' }: {
  tile?: Tile | null; w?: number; back?: boolean; side?: boolean; dim?: boolean; glow?: boolean; className?: string;
}) {
  const h = Math.round(w * 1.34);
  const inner = (
    <span
      className={`relative inline-block shrink-0 rounded-[14%] ${className}`}
      style={{
        width: w, height: h,
        background: back || tile == null ? 'linear-gradient(160deg,#f0b548,#c98a1f)' : 'linear-gradient(170deg,#fbf7ec,#e9e1cd)',
        boxShadow: `0 ${Math.max(2, w * 0.09)}px 0 ${back || tile == null ? '#9a6a16' : '#c9a24a'}, 0 ${Math.max(3, w * 0.14)}px ${w * 0.22}px rgba(0,0,0,.45)${glow ? ', 0 0 14px 2px rgba(255,214,106,.9)' : ''}`,
        filter: dim ? 'brightness(.55)' : undefined,
      }}
    >
      {!back && tile != null && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/tiles/${tileFile(tile)}.svg`} alt="" draggable={false} className="absolute inset-[6%] h-[88%] w-[88%] object-contain" />
      )}
    </span>
  );
  if (!side) return inner;
  // 横向き: 幅 h × 高さ w の枠の中で90度回す
  return (
    <span className="relative inline-block shrink-0" style={{ width: h, height: w + Math.max(2, w * 0.09) }}>
      <span className="absolute" style={{ left: (h - w) / 2, top: (w - h) / 2, transform: 'rotate(90deg)' }}>{inner}</span>
    </span>
  );
}
