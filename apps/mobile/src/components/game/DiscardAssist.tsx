import React, { useMemo } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import type { TileId, TileKind, Meld, SeatIndex } from "@mahjong/shared";
import { Wind } from "@mahjong/shared";
import { analyzeDiscards, type DiscardOption } from "@mahjong/engine";
import { TileView } from "./TileView";

interface DiscardAssistProps {
  hand: TileId[];
  melds: Meld[];
  roundWind: Wind;
  seatWind: Wind;
  isRiichi: boolean;
  visible: boolean;
}

const TILE_NAMES: Record<number, string> = {};
// 萬子
for (let i = 0; i < 9; i++) TILE_NAMES[i] = `${i + 1}萬`;
// 筒子
for (let i = 9; i < 18; i++) TILE_NAMES[i] = `${i - 8}筒`;
// 索子
for (let i = 18; i < 27; i++) TILE_NAMES[i] = `${i - 17}索`;
// 字牌
const HONOR_NAMES = ["東", "南", "西", "北", "白", "發", "中"];
for (let i = 27; i < 34; i++) TILE_NAMES[i] = HONOR_NAMES[i - 27];

export function DiscardAssist({
  hand,
  melds,
  roundWind,
  seatWind,
  isRiichi,
  visible,
}: DiscardAssistProps) {
  const options = useMemo(() => {
    if (!visible || hand.length === 0) return [];
    return analyzeDiscards(hand, melds, roundWind, seatWind, isRiichi);
  }, [hand, melds, roundWind, seatWind, isRiichi, visible]);

  if (!visible || options.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>待ち牌アシスト</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll}>
        <View style={styles.optionsRow}>
          {options.map((opt) => (
            <DiscardOptionCard key={opt.tileId} option={opt} />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function DiscardOptionCard({ option }: { option: DiscardOption }) {
  const bestHan = Math.max(...option.waits.map((w) => w.totalHan), 0);
  const yakuNames = [
    ...new Set(option.waits.flatMap((w) => w.yaku.map((y) => y.name))),
  ];

  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>切る</Text>
      <View style={styles.discardTile}>
        <TileView tileId={option.tileId} size="xs" />
      </View>

      <View style={styles.waitSection}>
        <Text style={styles.waitLabel}>
          待ち {option.waits.length}種
        </Text>
        <View style={styles.waitTiles}>
          {option.waits.map((w) => (
            <View key={w.tileKind} style={styles.waitTileWrapper}>
              <TileView tileId={w.tileKind * 4} size="xs" />
            </View>
          ))}
        </View>
      </View>

      {yakuNames.length > 0 && (
        <View style={styles.yakuSection}>
          <Text style={styles.yakuText}>
            {yakuNames.slice(0, 3).join(" ")}
          </Text>
          {bestHan > 0 && (
            <Text style={styles.hanText}>{bestHan}翻</Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 4,
    right: 70,
    left: 70,
    zIndex: 15,
    backgroundColor: "rgba(0,0,0,0.85)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,200,50,0.3)",
    padding: 6,
    maxHeight: 120,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  headerText: {
    color: "#ffd54f",
    fontSize: 11,
    fontWeight: "bold",
  },
  scroll: {
    flexGrow: 0,
  },
  optionsRow: {
    flexDirection: "row",
    gap: 8,
  },
  card: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 6,
    padding: 4,
    alignItems: "center",
    minWidth: 80,
  },
  cardLabel: {
    color: "#aaa",
    fontSize: 9,
    marginBottom: 2,
  },
  discardTile: {
    marginBottom: 3,
  },
  waitSection: {
    alignItems: "center",
  },
  waitLabel: {
    color: "#81d4fa",
    fontSize: 9,
    marginBottom: 2,
  },
  waitTiles: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 1,
  },
  waitTileWrapper: {
    opacity: 0.9,
  },
  yakuSection: {
    marginTop: 3,
    alignItems: "center",
  },
  yakuText: {
    color: "#c8e6c9",
    fontSize: 8,
    textAlign: "center",
  },
  hanText: {
    color: "#ffab40",
    fontSize: 10,
    fontWeight: "bold",
    marginTop: 1,
  },
});
