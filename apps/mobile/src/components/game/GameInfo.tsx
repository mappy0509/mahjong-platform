import React from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import type { PlayerGameView, SeatIndex } from "@mahjong/shared";
import { TileView } from "./TileView";

const WIND_CHARS = ["東", "南", "西", "北"];

interface GameInfoProps {
  view: PlayerGameView;
  dealerSeat?: SeatIndex;
}

export function GameInfo({ view, dealerSeat = 0 }: GameInfoProps) {
  // Relative wind positions from my perspective:
  // mySeat is always at bottom, so:
  // bottom = mySeat's wind, right = (mySeat+1)%4, top = (mySeat+2)%4, left = (mySeat+3)%4
  const mySeat = view.mySeat;

  const bottomWind = (mySeat - dealerSeat + 4) % 4;
  const rightWind = ((mySeat + 1 - dealerSeat + 4) % 4);
  const topWind = ((mySeat + 2 - dealerSeat + 4) % 4);
  const leftWind = ((mySeat + 3 - dealerSeat + 4) % 4);

  const bottomScore = view.players[mySeat].score;
  const rightScore = view.players[((mySeat + 1) % 4) as SeatIndex].score;
  const topScore = view.players[((mySeat + 2) % 4) as SeatIndex].score;
  const leftScore = view.players[((mySeat + 3) % 4) as SeatIndex].score;

  const isCurrentBottom = view.currentTurn === mySeat;
  const isCurrentRight = view.currentTurn === ((mySeat + 1) % 4);
  const isCurrentTop = view.currentTurn === ((mySeat + 2) % 4);
  const isCurrentLeft = view.currentTurn === ((mySeat + 3) % 4);

  // Round wind character for display
  const roundWindChar = WIND_CHARS[view.roundWind];

  return (
    <View style={styles.container}>
      {/* Octagonal center panel */}
      <View style={styles.outerFrame}>
        <View style={styles.innerPanel}>
          {/* Top edge - top player's wind */}
          <View style={styles.topEdge}>
            <View style={[styles.windBadge, isCurrentTop && styles.windBadgeActive]}>
              <Text style={[styles.windChar, isCurrentTop && styles.windCharActive]}>
                {WIND_CHARS[topWind]}
              </Text>
            </View>
            <Text style={styles.edgeScore}>{topScore.toLocaleString()}</Text>
          </View>

          {/* Middle row: left wind, center info, right wind */}
          <View style={styles.middleRow}>
            {/* Left edge */}
            <View style={styles.leftEdge}>
              <View style={[styles.windBadge, isCurrentLeft && styles.windBadgeActive]}>
                <Text style={[styles.windChar, isCurrentLeft && styles.windCharActive]}>
                  {WIND_CHARS[leftWind]}
                </Text>
              </View>
              <Text style={styles.edgeScoreVertical}>{leftScore.toLocaleString()}</Text>
            </View>

            {/* Center info */}
            <View style={styles.centerInfo}>
              <Text style={styles.roundText}>
                {roundWindChar}{view.roundNumber + 1}局
              </Text>
              {view.honba > 0 && (
                <Text style={styles.honbaText}>本{view.honba}</Text>
              )}
              <Text style={styles.remainingText}>残{view.tilesRemaining}</Text>

              {/* Current round wind indicator */}
              <View style={styles.roundWindIndicator}>
                <Text style={styles.roundWindChar}>{roundWindChar}</Text>
              </View>

              {/* Dice result indicator */}
              {view.diceResult && (
                <View style={styles.diceInfo}>
                  <Text style={styles.diceText}>
                    {"\u2680\u2681\u2682\u2683\u2684\u2685"[(view.diceResult[0] ?? 1) - 1]}
                    {"\u2680\u2681\u2682\u2683\u2684\u2685"[(view.diceResult[1] ?? 1) - 1]}
                  </Text>
                </View>
              )}

              {/* Riichi sticks */}
              {view.riichiSticks > 0 && (
                <View style={styles.riichiInfo}>
                  <View style={styles.riichiStick} />
                  <Text style={styles.riichiCount}>{"\u00D7"}{view.riichiSticks}</Text>
                </View>
              )}
            </View>

            {/* Right edge */}
            <View style={styles.rightEdge}>
              <View style={[styles.windBadge, isCurrentRight && styles.windBadgeActive]}>
                <Text style={[styles.windChar, isCurrentRight && styles.windCharActive]}>
                  {WIND_CHARS[rightWind]}
                </Text>
              </View>
              <Text style={styles.edgeScoreVertical}>{rightScore.toLocaleString()}</Text>
            </View>
          </View>

          {/* Bottom edge - my wind */}
          <View style={styles.bottomEdge}>
            <View style={[styles.windBadge, isCurrentBottom && styles.windBadgeActive]}>
              <Text style={[styles.windChar, isCurrentBottom && styles.windCharActive]}>
                {WIND_CHARS[bottomWind]}
              </Text>
            </View>
            <Text style={styles.edgeScore}>{bottomScore.toLocaleString()}</Text>
          </View>
        </View>
      </View>

      {/* Dora indicators */}
      {view.doraIndicators.length > 0 && (
        <View style={styles.doraSection}>
          <Text style={styles.doraLabel}>ドラ</Text>
          <View style={styles.doraRow}>
            {view.doraIndicators.map((tileId, idx) => (
              <TileView key={idx} tileId={tileId} size="xs" />
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

// ===== Player panel (shown at each table edge) =====
interface PlayerPanelProps {
  name: string;
  score: number;
  wind: string;
  isDealer: boolean;
  isCurrentTurn: boolean;
  isRiichi: boolean;
  isMe: boolean;
  handCount: number;
  isConnected: boolean;
  position: "top" | "right" | "left" | "bottom";
}

export function PlayerPanel({
  name,
  score,
  wind,
  isDealer,
  isCurrentTurn,
  isRiichi,
  isMe,
  handCount,
  isConnected,
  position,
}: PlayerPanelProps) {
  const isVertical = position === "right" || position === "left";

  return (
    <View
      style={[
        styles.playerPanel,
        isCurrentTurn && styles.playerPanelActive,
      ]}
    >
      {/* Avatar placeholder */}
      <View style={styles.avatarContainer}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{name.charAt(0)}</Text>
        </View>
        {isCurrentTurn && <View style={styles.avatarGlow} />}
      </View>

      <View style={styles.playerInfo}>
        <View style={styles.playerWindBadge}>
          <Text style={styles.playerWind}>{wind}</Text>
          {isDealer && <Text style={styles.dealerMark}>親</Text>}
        </View>
        <Text style={styles.playerName} numberOfLines={1}>
          {name}
        </Text>
      </View>
      {isRiichi && <View style={styles.riichiBar} />}
      {!isConnected && <Text style={styles.dcText}>切断中</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  outerFrame: {
    padding: 2,
    borderRadius: 4,
    backgroundColor: "rgba(0,0,0,0.5)",
    ...Platform.select({
      web: { boxShadow: "0 0 12px rgba(0,0,0,0.6)" },
      default: {},
    }),
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 10,
  },
  innerPanel: {
    backgroundColor: "#1a2a3a",
    borderRadius: 3,
    borderWidth: 1.5,
    borderColor: "#3a5a6a",
    minWidth: 140,
    minHeight: 140,
    alignItems: "center",
    justifyContent: "center",
    padding: 4,
  },

  // Top edge
  topEdge: {
    alignItems: "center",
    marginBottom: 2,
  },

  // Bottom edge
  bottomEdge: {
    alignItems: "center",
    marginTop: 2,
  },

  // Middle row
  middleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
  },
  leftEdge: {
    alignItems: "center",
    width: 36,
  },
  rightEdge: {
    alignItems: "center",
    width: 36,
  },

  // Center info
  centerInfo: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    paddingVertical: 4,
  },
  roundText: {
    color: "#ffd600",
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 1,
    textShadowColor: "rgba(255, 214, 0, 0.4)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 4,
  },
  honbaText: {
    color: "#ffab40",
    fontSize: 10,
    fontWeight: "bold",
  },
  remainingText: {
    color: "#b0bec5",
    fontSize: 11,
    fontWeight: "bold",
    marginTop: 1,
  },
  roundWindIndicator: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#c62828",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    borderWidth: 2,
    borderColor: "#ff5252",
    ...Platform.select({
      web: { boxShadow: "0 0 8px rgba(198, 40, 40, 0.6)" },
      default: {},
    }),
    shadowColor: "#c62828",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
  },
  roundWindChar: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
  },

  // Wind badges
  windBadge: {
    width: 22,
    height: 22,
    borderRadius: 2,
    backgroundColor: "rgba(50,70,90,0.8)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#4a6a7a",
  },
  windBadgeActive: {
    backgroundColor: "#c62828",
    borderColor: "#ff5252",
    shadowColor: "#ff5252",
    shadowOpacity: 0.6,
    shadowRadius: 4,
  },
  windChar: {
    color: "#8a9aa0",
    fontSize: 12,
    fontWeight: "bold",
  },
  windCharActive: {
    color: "#fff",
  },
  edgeScore: {
    color: "#ddd",
    fontSize: 10,
    fontWeight: "bold",
    marginTop: 1,
    fontVariant: ["tabular-nums"],
  },
  edgeScoreVertical: {
    color: "#ddd",
    fontSize: 9,
    fontWeight: "bold",
    marginTop: 2,
    fontVariant: ["tabular-nums"],
  },

  // Riichi info
  riichiInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 3,
    gap: 3,
  },
  riichiStick: {
    width: 16,
    height: 4,
    backgroundColor: "#ff5252",
    borderRadius: 2,
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.3)",
  },
  riichiCount: {
    color: "#ff8a80",
    fontSize: 9,
    fontWeight: "bold",
  },

  // Dice info
  diceInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  diceText: {
    color: "#e0e0e0",
    fontSize: 14,
    letterSpacing: 2,
  },

  // Dora section
  doraSection: {
    marginTop: 6,
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
    padding: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  doraLabel: {
    color: "#ffcc80",
    fontSize: 9,
    marginBottom: 2,
    fontWeight: "bold",
    letterSpacing: 1,
  },
  doraRow: {
    flexDirection: "row",
    gap: 2,
  },

  // Player panel
  playerPanel: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(20, 35, 55, 0.9)",
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    ...Platform.select({
      web: { boxShadow: "0 2px 8px rgba(0,0,0,0.4)" },
      default: {},
    }),
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
  },
  playerPanelActive: {
    borderColor: "#ffd600",
    backgroundColor: "rgba(50, 40, 20, 0.9)",
    shadowColor: "#ffd600",
    shadowOpacity: 0.3,
    shadowRadius: 6,
    borderWidth: 1.5,
  },
  avatarContainer: {
    position: "relative",
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#2a4a6a",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#4a7a9a",
  },
  avatarGlow: {
    position: "absolute",
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: "#ffd600",
    opacity: 0.6,
  },
  avatarText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
  },
  playerInfo: {
    alignItems: "flex-start",
  },
  playerWindBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  playerWind: {
    color: "#ffd600",
    fontSize: 11,
    fontWeight: "bold",
  },
  dealerMark: {
    color: "#fff",
    fontSize: 8,
    fontWeight: "bold",
    backgroundColor: "#ffab00",
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderRadius: 2,
    overflow: "hidden",
  },
  playerName: {
    color: "#ccc",
    fontSize: 11,
    maxWidth: 70,
    fontWeight: "500",
  },
  riichiBar: {
    width: 30,
    height: 5,
    backgroundColor: "#ff5252",
    borderRadius: 3,
    borderWidth: 0.5,
    borderColor: "#b71c1c",
  },
  dcText: {
    color: "#ff5252",
    fontSize: 9,
    fontWeight: "bold",
  },
});
