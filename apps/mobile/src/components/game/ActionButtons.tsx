import React from "react";
import { View, TouchableOpacity, Text, StyleSheet, Animated } from "react-native";
import { ActionType } from "@mahjong/shared";
import type { TileId } from "@mahjong/shared";
import { TileView } from "./TileView";

const ACTION_CONFIG: Record<
  string,
  { label: string; bg: string; border: string; priority: number }
> = {
  [ActionType.TSUMO]: { label: "ツモ", bg: "#c62828", border: "#ff5252", priority: 1 },
  [ActionType.RON]: { label: "ロン", bg: "#c62828", border: "#ff5252", priority: 2 },
  [ActionType.RIICHI]: { label: "リーチ", bg: "#e65100", border: "#ff9800", priority: 3 },
  [ActionType.KAN_CLOSED]: { label: "暗カン", bg: "#6a1b9a", border: "#ab47bc", priority: 4 },
  [ActionType.KAN_ADDED]: { label: "加カン", bg: "#6a1b9a", border: "#ab47bc", priority: 5 },
  [ActionType.KAN_OPEN]: { label: "大明カン", bg: "#6a1b9a", border: "#ab47bc", priority: 6 },
  [ActionType.PON]: { label: "ポン", bg: "#1565c0", border: "#42a5f5", priority: 7 },
  [ActionType.CHI]: { label: "チー", bg: "#2e7d32", border: "#66bb6a", priority: 8 },
  [ActionType.SKIP]: { label: "パス", bg: "#37474f", border: "#78909c", priority: 9 },
};

interface ActionButtonsProps {
  availableActions: ActionType[];
  onAction: (action: ActionType) => void;
  lastDiscardTileId?: TileId;
}

export function ActionButtons({
  availableActions,
  onAction,
  lastDiscardTileId,
}: ActionButtonsProps) {
  // Filter and sort actions
  const buttons = availableActions
    .filter((a) => a !== ActionType.DISCARD && a !== ActionType.DRAW_TILE)
    .filter((a) => ACTION_CONFIG[a])
    .sort(
      (a, b) =>
        (ACTION_CONFIG[a]?.priority ?? 99) - (ACTION_CONFIG[b]?.priority ?? 99)
    );

  if (buttons.length === 0) return null;

  const isClaim = buttons.some(
    (a) => a === ActionType.PON || a === ActionType.CHI || a === ActionType.RON || a === ActionType.KAN_OPEN
  );

  return (
    <View style={styles.container}>
      {isClaim && lastDiscardTileId !== undefined && (
        <View style={styles.targetTile}>
          <TileView tileId={lastDiscardTileId} size="sm" highlighted />
        </View>
      )}
      {buttons.map((action) => {
        const config = ACTION_CONFIG[action]!;
        const isWin = action === ActionType.TSUMO || action === ActionType.RON;
        return (
          <TouchableOpacity
            key={action}
            style={[
              styles.button,
              {
                backgroundColor: config.bg,
                borderColor: config.border,
              },
              isWin && styles.winButton,
            ]}
            onPress={() => onAction(action)}
            activeOpacity={0.7}
          >
            <Text style={[styles.buttonText, isWin && styles.winButtonText]}>
              {config.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  button: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    minWidth: 72,
    alignItems: "center",
    borderWidth: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },
  winButton: {
    minWidth: 90,
    paddingVertical: 12,
    shadowColor: "#ff5252",
    shadowOpacity: 0.5,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },
  winButtonText: {
    fontSize: 20,
    fontWeight: "900",
  },
  targetTile: {
    marginRight: 4,
    alignSelf: "center",
  },
});
