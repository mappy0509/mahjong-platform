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

    let handTileSize: TileSize;
    if (slotBudget >= TILE_SLOT.lg) handTileSize = "lg";
    else if (slotBudget >= TILE_SLOT.md) handTileSize = "md";
    else if (slotBudget >= TILE_SLOT.sm) handTileSize = "sm";
    else handTileSize = "xs";

    // Side player width scales with screen
    const sidePlayerWidth = Math.max(40, Math.min(60, Math.floor(w * 0.07)));

    // Side discard max width
    const sideDiscardMaxWidth = Math.max(60, Math.min(110, Math.floor(w * 0.13)));

    // Top area padding
    const topAreaPaddingH = sidePlayerWidth + 4;

    // Center info min size scales slightly
    const centerInfoMinSize = Math.max(110, Math.min(150, Math.floor(w * 0.17)));

    // Opponent tile size: xs on small, sm on larger
    const opponentTileSize: TileSize = w >= 800 ? "sm" : "xs";

    // Meld tile size based on hand tile
    const meldTileSize: TileSize =
      handTileSize === "lg" ? "md" :
      handTileSize === "md" ? "sm" :
      handTileSize === "sm" ? "xs" : "xs";

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
