import React, { useEffect, useRef, useState } from "react";
import { View, Text, Animated, StyleSheet, Easing } from "react-native";
import type { TileId } from "@mahjong/shared";
import { TileView, BackTile } from "./TileView";

interface DealingOverlayProps {
  visible: boolean;
  diceTotal: number;
  wallBreakPosition: number;
  myHand: TileId[];
  doraIndicators: TileId[];
  dealerSeat: number;
  mySeat: number;
  onFinish: () => void;
}

const PLAYER_LABELS = ["自分", "右", "対面", "左"];
const DEAL_ROUNDS = 3;
const TILES_PER_DEAL = 4;
const LAST_ROUND_TILES = 1;

type Phase = "dealing" | "complete" | "dora" | "done";

/**
 * Dealing animation overlay.
 * Flow: 配牌演出 → 配牌完了 → ドラオープン → 閉じる
 */
export function DealingOverlay({
  visible,
  diceTotal,
  wallBreakPosition,
  myHand,
  doraIndicators,
  dealerSeat,
  mySeat,
  onFinish,
}: DealingOverlayProps) {
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const [phase, setPhase] = useState<Phase>("dealing");
  const [dealStep, setDealStep] = useState(-1);
  const [doraRevealed, setDoraRevealed] = useState(false);
  const doraFlipAnim = useRef(new Animated.Value(0)).current;

  const myRelativePos = ((mySeat - dealerSeat + 4) % 4);

  const getMyTileCount = (step: number): number => {
    let count = 0;
    for (let s = 0; s <= step; s++) {
      if (s % 4 === myRelativePos) {
        count += s < 12 ? TILES_PER_DEAL : LAST_ROUND_TILES;
      }
    }
    return Math.min(count, myHand.length);
  };

  const getPlayerTileCount = (relPos: number): number => {
    if (dealStep < 0) return 0;
    let count = 0;
    for (let s = 0; s <= dealStep; s++) {
      if (s % 4 === relPos) {
        count += s < 12 ? TILES_PER_DEAL : LAST_ROUND_TILES;
      }
    }
    return Math.min(count, 14);
  };

  useEffect(() => {
    if (!visible) {
      opacityAnim.setValue(0);
      setPhase("dealing");
      setDealStep(-1);
      setDoraRevealed(false);
      doraFlipAnim.setValue(0);
      return;
    }

    // Fade in
    Animated.timing(opacityAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();

    const timers: ReturnType<typeof setTimeout>[] = [];

    // === Phase 1: Dealing (配牌) ===
    const totalSteps = DEAL_ROUNDS * 4 + 4; // 16 steps
    const stepDelay = 120;
    const startDelay = 400;

    for (let i = 0; i < totalSteps; i++) {
      timers.push(
        setTimeout(() => setDealStep(i), startDelay + i * stepDelay)
      );
    }
    const dealEndTime = startDelay + totalSteps * stepDelay;

    // === Phase 2: 配牌完了 (hand complete) ===
    timers.push(
      setTimeout(() => {
        setPhase("complete");
      }, dealEndTime + 200)
    );

    // === Phase 3: ドラオープン ===
    const doraStartTime = dealEndTime + 1200;
    timers.push(
      setTimeout(() => {
        setPhase("dora");
      }, doraStartTime)
    );

    // Flip dora tile
    timers.push(
      setTimeout(() => {
        setDoraRevealed(true);
        Animated.timing(doraFlipAnim, {
          toValue: 1,
          duration: 500,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      }, doraStartTime + 400)
    );

    // === Fade out ===
    timers.push(
      setTimeout(() => {
        setPhase("done");
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }).start(() => onFinish());
      }, doraStartTime + 1800)
    );

    return () => timers.forEach(clearTimeout);
  }, [visible]);

  if (!visible) return null;

  const myTileCount = dealStep >= 0 ? getMyTileCount(dealStep) : 0;
  const dealingDone = phase !== "dealing";
  // During dealing: show tiles progressively. After complete: show full hand.
  const visibleHand = dealingDone ? myHand : myHand.slice(0, myTileCount);

  return (
    <Animated.View style={[styles.overlay, { opacity: opacityAnim }]}>
      {/* Wall break info */}
      <View style={styles.wallBreakInfo}>
        <Text style={styles.wallBreakText}>
          開門: {diceTotal}の目 → {wallBreakPosition}枚目から
        </Text>
      </View>

      {/* Dealing table layout */}
      <View style={styles.tableLayout}>
        {/* Top player (対面) */}
        <View style={styles.otherPlayerSlot}>
          <Text style={styles.posLabel}>{getPlayerLabel(2, dealerSeat, mySeat)}</Text>
          <View style={styles.dealingTiles}>
            {Array.from({ length: dealingDone ? 13 : getPlayerTileCount(2) }).map((_, i) => (
              <BackTile key={i} size="xs" />
            ))}
          </View>
        </View>

        <View style={styles.middleRow}>
          {/* Left player */}
          <View style={styles.sidePlayerSlot}>
            <Text style={styles.posLabel}>{getPlayerLabel(3, dealerSeat, mySeat)}</Text>
            <View style={styles.dealingTilesVertical}>
              {Array.from({ length: dealingDone ? 13 : getPlayerTileCount(3) }).map((_, i) => (
                <BackTile key={i} size="xs" />
              ))}
            </View>
          </View>

          {/* Center: wall */}
          <View style={styles.wallCenter}>
            <View style={styles.wallRing}>
              {[0, 1, 2, 3].map((side) => (
                <View
                  key={side}
                  style={[
                    styles.wallSide,
                    side === 0 && styles.wallBottom,
                    side === 1 && styles.wallRight,
                    side === 2 && styles.wallTop,
                    side === 3 && styles.wallLeft,
                    Math.floor(wallBreakPosition / 34) === side && styles.wallBreakSide,
                  ]}
                />
              ))}
              <Text style={styles.wallCenterText}>山</Text>
            </View>
          </View>

          {/* Right player */}
          <View style={styles.sidePlayerSlot}>
            <Text style={styles.posLabel}>{getPlayerLabel(1, dealerSeat, mySeat)}</Text>
            <View style={styles.dealingTilesVertical}>
              {Array.from({ length: dealingDone ? 13 : getPlayerTileCount(1) }).map((_, i) => (
                <BackTile key={i} size="xs" />
              ))}
            </View>
          </View>
        </View>

        {/* My hand (bottom) */}
        <View style={styles.mySlot}>
          <Text style={styles.myPosLabel}>{getPlayerLabel(0, dealerSeat, mySeat)}</Text>
          <View style={styles.myDealingTiles}>
            {visibleHand.map((tileId, i) => (
              <TileView key={`${tileId}-${i}`} tileId={tileId} size="sm" />
            ))}
          </View>
        </View>
      </View>

      {/* ドラオープン */}
      {(phase === "dora" || phase === "done") && doraIndicators.length > 0 && (
        <View style={styles.doraContainer}>
          <Text style={styles.doraTitle}>ドラ表示牌</Text>
          <Animated.View
            style={[
              styles.doraCardWrap,
              {
                transform: [
                  {
                    rotateY: doraFlipAnim.interpolate({
                      inputRange: [0, 0.5, 1],
                      outputRange: ["0deg", "90deg", "0deg"],
                    }),
                  },
                ],
              },
            ]}
          >
            {doraRevealed ? (
              <TileView tileId={doraIndicators[0]} size="lg" highlighted />
            ) : (
              <BackTile size="lg" />
            )}
          </Animated.View>
          {doraRevealed && (
            <Text style={styles.doraLabel}>
              ドラ: {getTileDisplayName(doraIndicators[0])}
            </Text>
          )}
        </View>
      )}
    </Animated.View>
  );
}

function getPlayerLabel(relPos: number, dealerSeat: number, mySeat: number): string {
  const seat = (dealerSeat + relPos) % 4;
  const isDealer = relPos === 0;
  const label = PLAYER_LABELS[((seat - mySeat + 4) % 4)];
  return isDealer ? `${label} (親)` : label;
}

function getTileDisplayName(tileId: TileId): string {
  const kind = Math.floor(tileId / 4);
  if (kind < 9) return `${kind + 1}萬`;
  if (kind < 18) return `${kind - 8}筒`;
  if (kind < 27) return `${kind - 17}索`;
  const honors = ["東", "南", "西", "北", "白", "發", "中"];
  return honors[kind - 27] || "?";
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.85)",
    zIndex: 100,
  },
  wallBreakInfo: {
    marginBottom: 12,
  },
  wallBreakText: {
    color: "#ffd54f",
    fontSize: 13,
    fontWeight: "bold",
    letterSpacing: 1,
  },
  tableLayout: {
    alignItems: "center",
    gap: 8,
  },
  otherPlayerSlot: {
    alignItems: "center",
    gap: 4,
  },
  middleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  sidePlayerSlot: {
    alignItems: "center",
    gap: 4,
    width: 80,
  },
  mySlot: {
    alignItems: "center",
    gap: 4,
  },
  posLabel: {
    color: "#aaa",
    fontSize: 10,
  },
  myPosLabel: {
    color: "#81d4fa",
    fontSize: 11,
    fontWeight: "bold",
  },
  dealingTiles: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 1,
    maxWidth: 200,
    minHeight: 34,
  },
  dealingTilesVertical: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 1,
    maxWidth: 70,
    minHeight: 34,
  },
  myDealingTiles: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 1,
    minHeight: 46,
  },
  wallCenter: {
    width: 80,
    height: 80,
    justifyContent: "center",
    alignItems: "center",
  },
  wallRing: {
    width: 70,
    height: 70,
    justifyContent: "center",
    alignItems: "center",
  },
  wallSide: {
    position: "absolute",
    backgroundColor: "rgba(26, 120, 136, 0.5)",
    borderRadius: 2,
  },
  wallBottom: {
    bottom: 0,
    left: 5,
    right: 5,
    height: 8,
  },
  wallTop: {
    top: 0,
    left: 5,
    right: 5,
    height: 8,
  },
  wallLeft: {
    left: 0,
    top: 5,
    bottom: 5,
    width: 8,
  },
  wallRight: {
    right: 0,
    top: 5,
    bottom: 5,
    width: 8,
  },
  wallBreakSide: {
    backgroundColor: "rgba(255, 200, 50, 0.6)",
  },
  wallCenterText: {
    color: "rgba(255,255,255,0.3)",
    fontSize: 16,
    fontWeight: "bold",
  },
  doraContainer: {
    marginTop: 14,
    alignItems: "center",
    backgroundColor: "rgba(20, 35, 55, 0.95)",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderWidth: 2,
    borderColor: "#ff9800",
    shadowColor: "#ff9800",
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
  },
  doraTitle: {
    color: "#ff9800",
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 8,
    letterSpacing: 2,
  },
  doraCardWrap: {
    alignItems: "center",
  },
  doraLabel: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "bold",
    marginTop: 6,
    textShadowColor: "rgba(255, 152, 0, 0.5)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
});
