import React from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import type { TileId, SeatIndex } from "@mahjong/shared";
import { TileView } from "./TileView";

interface WinnerDisplay {
  seat: SeatIndex;
  name: string;
  hand: TileId[];
  winTile: TileId;
  isTsumo: boolean;
  yaku: { name: string; han: number }[];
  han: number;
  fu: number;
  score: number;
}

interface RoundResultProps {
  visible: boolean;
  winners?: WinnerDisplay[];
  isDraw?: boolean;
  drawReason?: string;
  scoreChanges: Record<number, number>;
  playerNames: string[];
  onClose: () => void;
}

const WIND_NAMES = ["東", "南", "西", "北"];

export function RoundResultModal({
  visible,
  winners,
  isDraw,
  drawReason,
  scoreChanges,
  playerNames,
  onClose,
}: RoundResultProps) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <ScrollView>
            {/* Title */}
            <Text style={styles.title}>
              {isDraw
                ? drawReason || "流局"
                : winners && winners.length > 0
                ? winners[0].isTsumo
                  ? "ツモ"
                  : "ロン"
                : ""}
            </Text>

            {/* Winner details */}
            {winners?.map((winner, idx) => (
              <View key={idx} style={styles.winnerSection}>
                <Text style={styles.winnerName}>
                  {WIND_NAMES[winner.seat]}家 {winner.name}
                </Text>

                {/* Hand display */}
                <View style={styles.handRow}>
                  {winner.hand.map((tileId, tIdx) => (
                    <TileView
                      key={tIdx}
                      tileId={tileId}
                      size="sm"
                      highlighted={tileId === winner.winTile}
                    />
                  ))}
                </View>

                {/* Yaku list */}
                <View style={styles.yakuList}>
                  {winner.yaku.map((y, yIdx) => (
                    <View key={yIdx} style={styles.yakuRow}>
                      <Text style={styles.yakuName}>{y.name}</Text>
                      <Text style={styles.yakuHan}>
                        {y.han >= 13 ? "役満" : `${y.han}翻`}
                      </Text>
                    </View>
                  ))}
                </View>

                {/* Score summary */}
                <View style={styles.scoreSummary}>
                  <Text style={styles.scoreDetail}>
                    {winner.fu}符 {winner.han}翻
                  </Text>
                  <Text style={styles.scoreTotal}>
                    {winner.score.toLocaleString()}点
                  </Text>
                </View>
              </View>
            ))}

            {/* Score changes for all players */}
            <View style={styles.changesSection}>
              <Text style={styles.changesTitle}>点数変動</Text>
              {[0, 1, 2, 3].map((seat) => {
                const change = scoreChanges[seat] || 0;
                return (
                  <View key={seat} style={styles.changeRow}>
                    <Text style={styles.changeName}>
                      {WIND_NAMES[seat]} {playerNames[seat]}
                    </Text>
                    <Text
                      style={[
                        styles.changeValue,
                        { color: change > 0 ? "#4caf50" : change < 0 ? "#f44336" : "#fff" },
                      ]}
                    >
                      {change > 0 ? "+" : ""}
                      {change.toLocaleString()}
                    </Text>
                  </View>
                );
              })}
            </View>
          </ScrollView>

          {/* Close button */}
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>次へ</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  modal: {
    width: "85%",
    maxHeight: "80%",
    backgroundColor: "#1e1e2e",
    borderRadius: 16,
    padding: 20,
    borderWidth: 2,
    borderColor: "#ffd600",
  },
  title: {
    fontSize: 28,
    fontWeight: "900",
    color: "#ffd600",
    textAlign: "center",
    marginBottom: 16,
  },
  winnerSection: {
    marginBottom: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 8,
    padding: 12,
  },
  winnerName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 8,
  },
  handRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 12,
    gap: 1,
  },
  yakuList: {
    marginBottom: 8,
  },
  yakuRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  yakuName: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  yakuHan: {
    color: "#ffd600",
    fontSize: 16,
    fontWeight: "bold",
  },
  scoreSummary: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 2,
    borderTopColor: "#ffd600",
  },
  scoreDetail: {
    color: "#aaa",
    fontSize: 14,
  },
  scoreTotal: {
    color: "#ffd600",
    fontSize: 24,
    fontWeight: "900",
  },
  changesSection: {
    marginTop: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 8,
    padding: 12,
  },
  changesTitle: {
    color: "#aaa",
    fontSize: 14,
    marginBottom: 8,
  },
  changeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  changeName: {
    color: "#fff",
    fontSize: 16,
  },
  changeValue: {
    fontSize: 16,
    fontWeight: "bold",
  },
  closeBtn: {
    marginTop: 16,
    backgroundColor: "#ffd600",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  closeBtnText: {
    color: "#1e1e2e",
    fontSize: 18,
    fontWeight: "bold",
  },
});
