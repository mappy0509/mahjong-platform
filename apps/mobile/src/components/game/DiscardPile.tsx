import React from "react";
import { View, StyleSheet } from "react-native";
import type { TileId } from "@mahjong/shared";
import { TileView, type TileSize } from "./TileView";

export type DiscardPosition = "bottom" | "top" | "left" | "right";

interface DiscardPileProps {
  tiles: TileId[];
  size?: TileSize;
  lastDiscard?: TileId; // highlight the most recent discard
  position?: DiscardPosition; // player position for orientation
}

// Rotation angles: tiles should "face" toward the center of the table
const ROTATION: Record<DiscardPosition, string> = {
  bottom: "0deg",   // player's own discards — upright
  top: "180deg",    // opposite player — flipped
  right: "-90deg",  // right player — tile tops point toward right player
  left: "90deg",    // left player — tile tops point toward left player
};

export function DiscardPile({
  tiles,
  size = "xs",
  lastDiscard,
  position = "bottom",
}: DiscardPileProps) {
  // Display in rows of 6
  const rows: TileId[][] = [];
  for (let i = 0; i < tiles.length; i += 6) {
    rows.push(tiles.slice(i, i + 6));
  }

  return (
    <View style={[styles.container, { transform: [{ rotate: ROTATION[position] }] }]}>
      {rows.map((row, rowIdx) => (
        <View key={rowIdx} style={styles.row}>
          {row.map((tileId, idx) => {
            const globalIdx = rowIdx * 6 + idx;
            const isLast =
              lastDiscard !== undefined &&
              tileId === lastDiscard &&
              globalIdx === tiles.length - 1;
            return (
              <TileView
                key={`${tileId}-${globalIdx}`}
                tileId={tileId}
                size={size}
                highlighted={isLast}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
  },
  row: {
    flexDirection: "row",
    marginVertical: 1,
  },
});
