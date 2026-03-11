import type { TileKind, TileId, SeatIndex, Meld } from "@mahjong/shared";
import { Wind } from "@mahjong/shared";
import type { HandDecomposition } from "../../hand";

/** Context for yaku evaluation */
export interface YakuContext {
  /** The winning hand decomposition (null for special forms like chiitoi/kokushi) */
  decomposition: HandDecomposition | null;

  /** All tile kinds in the closed hand (including win tile) */
  handKinds: TileKind[];

  /** All tile IDs in the closed hand (including win tile) */
  handTileIds: TileId[];

  /** Open melds (called tiles) */
  melds: Meld[];

  /** The winning tile kind */
  winTileKind: TileKind;

  /** The winning tile ID */
  winTileId: TileId;

  /** Is the win by tsumo (self-draw)? */
  isTsumo: boolean;

  /** Is the hand fully closed (menzen)? */
  isMenzen: boolean;

  /** Is the player in riichi? */
  isRiichi: boolean;

  /** Is the player in double riichi? */
  isDoubleRiichi: boolean;

  /** Is ippatsu (win within 1 turn of riichi)? */
  isIppatsu: boolean;

  /** Round wind */
  roundWind: Wind;

  /** Player's seat wind */
  seatWind: Wind;

  /** Is this the very first draw (for tenhou/chiihou)? */
  isFirstDraw: boolean;

  /** Is this the last tile from the wall (haitei)? */
  isLastTileDraw: boolean;

  /** Is this the last discard (houtei)? */
  isLastDiscard: boolean;

  /** Is this a rinshan (after kan draw)? */
  isRinshan: boolean;

  /** Is this chankan (robbing a kan)? */
  isChankan: boolean;

  /** Is seven pairs form? */
  isChiitoi: boolean;

  /** Is kokushi form? */
  isKokushi: boolean;
}

export interface YakuResult {
  name: string;
  han: number;
  isYakuman?: boolean;
}

export type YakuChecker = (ctx: YakuContext) => YakuResult | null;
