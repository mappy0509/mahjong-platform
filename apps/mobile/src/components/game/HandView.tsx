import React, { useState, useCallback } from "react";
import { View, ScrollView, StyleSheet } from "react-native";
import type { TileId } from "@mahjong/shared";
import { TileView, type TileSize } from "./TileView";

interface HandViewProps {
  tiles: TileId[];
  onDiscard?: (tileId: TileId) => void;
  interactive?: boolean;
  size?: TileSize;
  drawnTile?: TileId | null; // show separator before drawn tile
  scrollable?: boolean; // wrap in horizontal ScrollView (portrait mode)
  drawnTileGap?: number; // gap between main hand and drawn tile
}

export function HandView({
  tiles,
  onDiscard,
  interactive = false,
  size = "md",
  drawnTile,
  scrollable = false,
  drawnTileGap = 10,
}: HandViewProps) {
  const [selectedTile, setSelectedTile] = useState<TileId | null>(null);

  const handlePress = useCallback(
    (tileId: TileId) => {
      if (!interactive) return;
      if (selectedTile === tileId) {
        // Double-tap to discard
        onDiscard?.(tileId);
        setSelectedTile(null);
      } else {
        setSelectedTile(tileId);
      }
    },
    [interactive, selectedTile, onDiscard]
  );

  // Separate drawn tile (last tile if it matches drawnTile)
  let mainTiles = tiles;
  let separatedDrawn: TileId | null = null;

  if (drawnTile !== null && drawnTile !== undefined) {
    const idx = tiles.lastIndexOf(drawnTile);
    if (idx !== -1) {
      mainTiles = [...tiles.slice(0, idx), ...tiles.slice(idx + 1)];
      separatedDrawn = drawnTile;
    }
  }

  const content = (
    <View style={styles.container}>
      <View style={styles.mainHand}>
        {mainTiles.map((tileId, idx) => (
          <TileView
            key={`${tileId}-${idx}`}
            tileId={tileId}
            selected={selectedTile === tileId}
            onPress={interactive ? () => handlePress(tileId) : undefined}
            size={size}
          />
        ))}
      </View>
      {separatedDrawn !== null && (
        <View style={[styles.drawnTileSeparator, { marginLeft: drawnTileGap }]}>
          <TileView
            tileId={separatedDrawn}
            selected={selectedTile === separatedDrawn}
            onPress={
              interactive ? () => handlePress(separatedDrawn!) : undefined
            }
            size={size}
          />
        </View>
      )}
    </View>
  );

  if (scrollable) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        bounces={false}
      >
        {content}
      </ScrollView>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
  },
  mainHand: {
    flexDirection: "row",
    alignItems: "flex-end",
  },
  drawnTileSeparator: {
    flexDirection: "row",
    alignItems: "flex-end",
  },
  scrollContent: {
    paddingHorizontal: 8,
    alignItems: "flex-end",
  },
});
