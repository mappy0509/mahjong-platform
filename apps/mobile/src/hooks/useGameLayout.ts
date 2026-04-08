import { useState, useEffect } from "react";
import { Dimensions } from "react-native";
import type { TileSize } from "../components/game/TileView";

/** Tile total width (w + depth + 2px margin) for each preset */
const TILE_SLOT: Record<TileSize, number> = {
  xs: 26, // 22+2+2
  sm: 34, // 30+2+2
  md: 43, // 38+3+2
  lg: 54, // 48+4+2
};

export interface GameLayout {
  screenW: number;
  screenH: number;
  isLandscape: boolean;

  /** Tile preset for the player's hand */
  handTileSize: TileSize;
  /** Tile preset for opponent hands & discards */
  opponentTileSize: TileSize;
  /** Tile preset for melds */
  meldTileSize: TileSize;

  /** Width for left/right player side areas */
  sidePlayerWidth: number;
  /** Max width for side discard piles */
  sideDiscardMaxWidth: number;
  /** Whether hand needs horizontal scroll (portrait) */
  handScrollable: boolean;
  /** Horizontal padding for the top area */
  topAreaPaddingH: number;
  /** Gap size between drawn tile and hand */
  drawnTileGap: number;
  /** Min size for the center GameInfo panel */
  centerInfoMinSize: number;
}

/** Min vertical space (px) needed to comfortably show a tile of each size,
 * including the player panel row, melds, action buttons, etc. */
const TILE_VERTICAL_BUDGET: Record<TileSize, number> = {
  xs: 230,
  sm: 280,
  md: 340,
  lg: 420,
};

function compute(w: number, h: number): GameLayout {
  const isLandscape = w > h;

  if (isLandscape) {
    // --- Landscape layout ---
    // Hand area: screenW - playerPanel(70) - timer(50) - padding(16)
    const handOverhead = 136;
    const handAvailable = w - handOverhead;
    // 15 tile slots (14 + 1 drawn) + drawn gap
    const drawnGap = 8;
    const slotBudget = (handAvailable - drawnGap) / 15;

    // Pick the largest size that fits BOTH the horizontal slot budget AND
    // the vertical screen budget. Phones in landscape are very short
    // (~320–400px), so the vertical check is what saves them from
    // unreadable cramped layouts.
    const candidates: TileSize[] = ["lg", "md", "sm", "xs"];
    let handTileSize: TileSize = "xs";
    for (const c of candidates) {
      if (slotBudget >= TILE_SLOT[c] && h >= TILE_VERTICAL_BUDGET[c]) {
        handTileSize = c;
        break;
      }
    }

    // Side player width scales with screen — narrower on phones
    const sidePlayerWidth =
      h < 400 ? 44 : Math.max(46, Math.min(60, Math.floor(w * 0.07)));

    // Side discard max width
    const sideDiscardMaxWidth =
      h < 400
        ? Math.max(54, Math.min(80, Math.floor(w * 0.1)))
        : Math.max(60, Math.min(110, Math.floor(w * 0.13)));

    // Top area padding
    const topAreaPaddingH = sidePlayerWidth + 4;

    // Center info min size scales slightly — smaller on phones
    const centerInfoMinSize =
      h < 400
        ? Math.max(86, Math.min(120, Math.floor(w * 0.13)))
        : Math.max(110, Math.min(150, Math.floor(w * 0.17)));

    // Opponent tile size: xs on small/short, sm on larger
    const opponentTileSize: TileSize = w >= 900 && h >= 500 ? "sm" : "xs";

    // Meld tile size based on hand tile
    const meldTileSize: TileSize =
      handTileSize === "lg"
        ? "md"
        : handTileSize === "md"
          ? "sm"
          : "xs";

    return {
      screenW: w,
      screenH: h,
      isLandscape: true,
      handTileSize,
      opponentTileSize,
      meldTileSize,
      sidePlayerWidth,
      sideDiscardMaxWidth,
      handScrollable: false,
      topAreaPaddingH,
      drawnTileGap: drawnGap,
      centerInfoMinSize,
    };
  } else {
    // --- Portrait layout ---
    // Hand always scrollable; use md tiles for good readability
    const handTileSize: TileSize = w >= 400 ? "md" : "sm";

    return {
      screenW: w,
      screenH: h,
      isLandscape: false,
      handTileSize,
      opponentTileSize: "xs",
      meldTileSize: "xs",
      sidePlayerWidth: 40,
      sideDiscardMaxWidth: 70,
      handScrollable: true,
      topAreaPaddingH: 44,
      drawnTileGap: 10,
      centerInfoMinSize: 110,
    };
  }
}

export function useGameLayout(): GameLayout {
  const [layout, setLayout] = useState<GameLayout>(() => {
    const { width, height } = Dimensions.get("window");
    return compute(width, height);
  });

  useEffect(() => {
    const sub = Dimensions.addEventListener("change", ({ window }) => {
      setLayout(compute(window.width, window.height));
    });
    return () => sub.remove();
  }, []);

  return layout;
}
