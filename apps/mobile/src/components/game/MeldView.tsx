import React from "react";
import { View, StyleSheet } from "react-native";
import type { Meld, TileId } from "@mahjong/shared";
import { MeldType } from "@mahjong/shared";
import { TileView, type TileSize } from "./TileView";

interface MeldViewProps {
  melds: Meld[];
  size?: TileSize;
}

function MeldViewInner({ melds, size = "sm" }: MeldViewProps) {
  if (melds.length === 0) return null;

  return (
    <View style={styles.container}>
      {melds.map((meld, idx) => (
        <View key={idx} style={styles.meldGroup}>
          {meld.tiles.map((tileId, tIdx) => {
            // Show the called tile rotated (sideways)
            const isCalled = tileId === meld.calledTile;
            const isClosed = meld.type === MeldType.KAN_CLOSED;

            return (
              <TileView
                key={`${tileId}-${tIdx}`}
                tileId={tileId}
                size={size}
                rotated={isCalled}
                faceDown={isClosed && tIdx === 0}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
}

export const MeldView = React.memo(MeldViewInner);

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    gap: 6,
  },
  meldGroup: {
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: "rgba(0,0,0,0.15)",
    borderRadius: 3,
    padding: 2,
  },
});
