import { useEffect, useCallback, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { TileId, SeatIndex, PlayerView, StampId } from "@mahjong/shared";
import { ActionType, RoundPhase, RoundEndReason, TURN_TIMEOUT_MS } from "@mahjong/shared";
import { useGameStore } from "../stores/game-store";
import { HandView } from "../components/game/HandView";
import { DiscardPile } from "../components/game/DiscardPile";
import { ActionButtons } from "../components/game/ActionButtons";
import { GameInfo, PlayerPanel } from "../components/game/GameInfo";
import { MeldView } from "../components/game/MeldView";
import { RoundResultModal } from "../components/game/RoundResultModal";
import { BackTile } from "../components/game/TileView";
import {
  WinEffect,
  RiichiEffect,
  CallEffect,
  AnimatedTimer,
} from "../components/game/effects";
import { playSound, initSounds } from "../utils/sound-manager";
import { StampPicker } from "../components/game/StampPicker";
import { StampDisplay, type StampDisplayRef } from "../components/game/StampDisplay";

const WIND_CHARS = ["東", "南", "西", "北"];

interface GameTableScreenProps {
  roomId: string;
  onBack: () => void;
}

export function GameTableScreen({ roomId, onBack }: GameTableScreenProps) {
  const {
    view,
    roundResult,
    finalResult,
    error,
    isConnected,
    sendAction,
    advanceRound,
    sendStamp,
    lastStamp,
    subscribe,
    disconnect,
  } = useGameStore();

  const [showResult, setShowResult] = useState(false);
  const stampDisplayRef = useRef<StampDisplayRef>(null);

  // Effect states
  const [winEffectState, setWinEffectState] = useState<{
    type: "tsumo" | "ron";
    visible: boolean;
  }>({ type: "tsumo", visible: false });
  const [riichiEffectState, setRiichiEffectState] = useState<{
    visible: boolean;
    playerName?: string;
  }>({ visible: false });
  const [callEffectState, setCallEffectState] = useState<{
    type: "pon" | "chi" | "kan";
    visible: boolean;
  }>({ type: "pon", visible: false });

  // Track previous view for state change detection
  const prevPlayersRef = useRef<PlayerView[] | null>(null);

  // Initialize sounds on mount
  useEffect(() => {
    initSounds();
  }, []);

  // Subscribe to realtime game updates
  useEffect(() => {
    subscribe(roomId);

    return () => {
      disconnect();
    };
  }, [roomId]);

  // Detect state changes for sound/visual effects
  useEffect(() => {
    if (!view) return;
    const prev = prevPlayersRef.current;
    if (prev) {
      for (let i = 0; i < view.players.length; i++) {
        const p = view.players[i];
        const pp = prev[i];
        if (!pp) continue;

        // Detect new discard
        if (p.discards.length > pp.discards.length) {
          playSound("discard");
        }

        // Detect riichi
        if (p.isRiichi && !pp.isRiichi) {
          playSound("riichi");
          setRiichiEffectState({ visible: true, playerName: p.name });
        }

        // Detect new meld (pon/chi/kan)
        if (p.melds.length > pp.melds.length) {
          const newMeld = p.melds[p.melds.length - 1];
          if (newMeld) {
            const mt = newMeld.type.toLowerCase();
            if (mt === "chi") {
              playSound("chi");
              setCallEffectState({ type: "chi", visible: true });
            } else if (mt === "pon") {
              playSound("pon");
              setCallEffectState({ type: "pon", visible: true });
            } else {
              // KAN_OPEN, KAN_CLOSED, KAN_ADDED
              playSound("kan");
              setCallEffectState({ type: "kan", visible: true });
            }
          }
        }
      }
    }
    prevPlayersRef.current = view.players.map((p) => ({ ...p }));
  }, [view]);

  // Show round result when received + trigger win effect
  useEffect(() => {
    if (roundResult) {
      // Detect win type from either raw event or typed result
      const raw = roundResult as any;
      const isTsumo = raw.type === "TSUMO" || roundResult.winners?.[0]?.isTsumo === true;
      const isRon = raw.type === "RON" || (roundResult.winners && roundResult.winners.length > 0 && !isTsumo);

      if (isTsumo || isRon) {
        playSound(isTsumo ? "tsumo" : "ron");
        setWinEffectState({
          type: isTsumo ? "tsumo" : "ron",
          visible: true,
        });
      } else {
        setShowResult(true);
      }
    }
  }, [roundResult]);

  // Show final result when received
  useEffect(() => {
    if (finalResult) {
      setShowResult(true);
    }
  }, [finalResult]);

  // Handle incoming stamps
  useEffect(() => {
    if (lastStamp) {
      stampDisplayRef.current?.showStamp(lastStamp.seat, lastStamp.stampId);
    }
  }, [lastStamp]);

  const handleSendStamp = useCallback(
    (stampId: StampId) => {
      sendStamp(roomId, stampId);
    },
    [roomId, sendStamp]
  );

  const handleDiscard = useCallback(
    (tileId: TileId) => {
      sendAction(roomId, ActionType.DISCARD, tileId);
    },
    [roomId, sendAction]
  );

  const handleActionButton = useCallback(
    (action: ActionType) => {
      sendAction(roomId, action);
    },
    [roomId, sendAction]
  );

  const handleWinEffectFinish = useCallback(() => {
    setWinEffectState((s) => ({ ...s, visible: false }));
    setShowResult(true);
  }, []);

  const handleRiichiEffectFinish = useCallback(() => {
    setRiichiEffectState({ visible: false });
  }, []);

  const handleCallEffectFinish = useCallback(() => {
    setCallEffectState((s) => ({ ...s, visible: false }));
  }, []);

  const handleCloseResult = useCallback(() => {
    setShowResult(false);
    // Tell the server to advance to the next round (or end the game)
    if (!finalResult) {
      advanceRound(roomId);
    }
  }, [advanceRound, roomId, finalResult]);

  const handleBack = useCallback(() => {
    disconnect();
    onBack();
  }, [disconnect, onBack]);

  // Loading state
  if (!view) {
    return (
      <LinearGradient
        colors={["#0a1628", "#122440", "#1a3358"] as const}
        style={styles.loadingContainer}
      >
        <Text style={styles.loadingIcon}>🀄</Text>
        {!isConnected ? (
          <>
            <ActivityIndicator color="#1a7888" size="large" />
            <Text style={styles.loadingText}>接続中...</Text>
          </>
        ) : (
          <Text style={styles.loadingText}>対局データを読み込み中...</Text>
        )}
        {error && <Text style={styles.errorText}>{error}</Text>}
        <TouchableOpacity style={styles.loadingBackBtn} onPress={handleBack}>
          <Text style={styles.loadingBackText}>戻る</Text>
        </TouchableOpacity>
      </LinearGradient>
    );
  }

  const mySeat = view.mySeat;
  const rightIdx = ((mySeat + 1) % 4) as SeatIndex;
  const topIdx = ((mySeat + 2) % 4) as SeatIndex;
  const leftIdx = ((mySeat + 3) % 4) as SeatIndex;

  const isMyTurn =
    view.currentTurn === mySeat && view.roundPhase === RoundPhase.DISCARD;
  const isClaimPhase = view.roundPhase === RoundPhase.CLAIM;
  const interactive =
    isMyTurn || (isClaimPhase && view.availableActions.length > 0);

  // Dealer seat from view (server provides it directly)
  const dealerSeat = (view.dealerSeat ?? ((view.roundNumber ?? 0) % 4)) as SeatIndex;

  // Build result data for modal from roundResult
  const resultWinners =
    roundResult && "seat" in roundResult
      ? [
          {
            seat: (roundResult as any).seat as SeatIndex,
            name: view.players[(roundResult as any).seat]?.name ?? "",
            hand: [] as TileId[], // Server doesn't send full hand in result
            winTile: 0 as TileId,
            isTsumo: (roundResult as any).type === "TSUMO",
            yaku: (roundResult as any).yaku ?? [],
            han: (roundResult as any).han ?? 0,
            fu: (roundResult as any).fu ?? 0,
            score: (roundResult as any).score ?? 0,
          },
        ]
      : roundResult && "winners" in roundResult
        ? ((roundResult as any).winners ?? []).map((w: any) => ({
            seat: w.seat as SeatIndex,
            name: view.players[w.seat]?.name ?? "",
            hand: [] as TileId[],
            winTile: 0 as TileId,
            isTsumo: false,
            yaku: w.yaku ?? [],
            han: w.han ?? 0,
            fu: w.fu ?? 0,
            score: w.score ?? 0,
          }))
        : [];

  const resultScoreChanges =
    roundResult && "scoreChanges" in roundResult
      ? ((roundResult as any).scoreChanges as Record<number, number>)
      : {};

  const isDraw = roundResult && "reason" in roundResult;
  const drawReason =
    isDraw && (roundResult as any).reason !== undefined
      ? getDrawReasonText((roundResult as any).reason)
      : undefined;

  const playerNames = view.players.map((p) => p.name);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["#0a1628", "#122440", "#1a3358"] as const}
        style={styles.tableGradient}
      >
        {/* Connection indicator */}
        {!isConnected && (
          <View style={styles.disconnectBanner}>
            <Text style={styles.disconnectText}>接続が切断されました - 再接続中...</Text>
          </View>
        )}

        {/* ====== TOP PLAYER AREA ====== */}
        <View style={styles.topArea}>
          <View style={styles.topPlayerRow}>
            <View style={styles.topTilesContainer}>
              <View style={styles.topHandRow}>
                {Array.from({ length: view.players[topIdx].handCount }).map(
                  (_, i) => (
                    <BackTile key={i} size="xs" />
                  )
                )}
              </View>
              <MeldView melds={view.players[topIdx].melds} size="xs" />
            </View>
            <PlayerPanel
              name={view.players[topIdx].name}
              score={view.players[topIdx].score}
              wind={WIND_CHARS[(topIdx - dealerSeat + 4) % 4]}
              isDealer={topIdx === dealerSeat}
              isCurrentTurn={view.currentTurn === topIdx}
              isRiichi={view.players[topIdx].isRiichi}
              isMe={false}
              handCount={view.players[topIdx].handCount}
              isConnected={view.players[topIdx].isConnected}
              position="top"
            />
          </View>
        </View>

        {/* ====== MIDDLE SECTION ====== */}
        <View style={styles.middleArea}>
          {/* LEFT PLAYER */}
          <View style={styles.leftPlayerArea}>
            <PlayerPanel
              name={view.players[leftIdx].name}
              score={view.players[leftIdx].score}
              wind={WIND_CHARS[(leftIdx - dealerSeat + 4) % 4]}
              isDealer={leftIdx === dealerSeat}
              isCurrentTurn={view.currentTurn === leftIdx}
              isRiichi={view.players[leftIdx].isRiichi}
              isMe={false}
              handCount={view.players[leftIdx].handCount}
              isConnected={view.players[leftIdx].isConnected}
              position="left"
            />
            <View style={styles.verticalHand}>
              {Array.from({ length: view.players[leftIdx].handCount }).map(
                (_, i) => (
                  <BackTile key={i} size="xs" />
                )
              )}
            </View>
          </View>

          {/* CENTER TABLE */}
          <View style={styles.centerTable}>
            <View style={styles.topDiscards}>
              <DiscardPile tiles={view.players[topIdx].discards} size="xs" />
            </View>

            <View style={styles.centerMiddleRow}>
              <View style={styles.sideDiscards}>
                <DiscardPile tiles={view.players[leftIdx].discards} size="xs" />
              </View>

              <GameInfo view={view} dealerSeat={dealerSeat} />

              <View style={styles.sideDiscards}>
                <DiscardPile tiles={view.players[rightIdx].discards} size="xs" />
              </View>
            </View>

            <View style={styles.bottomDiscards}>
              <DiscardPile
                tiles={view.players[mySeat].discards}
                size="xs"
                lastDiscard={view.lastDiscard?.tileId}
              />
            </View>
          </View>

          {/* RIGHT PLAYER */}
          <View style={styles.rightPlayerArea}>
            <PlayerPanel
              name={view.players[rightIdx].name}
              score={view.players[rightIdx].score}
              wind={WIND_CHARS[(rightIdx - dealerSeat + 4) % 4]}
              isDealer={rightIdx === dealerSeat}
              isCurrentTurn={view.currentTurn === rightIdx}
              isRiichi={view.players[rightIdx].isRiichi}
              isMe={false}
              handCount={view.players[rightIdx].handCount}
              isConnected={view.players[rightIdx].isConnected}
              position="right"
            />
            <View style={styles.verticalHand}>
              {Array.from({ length: view.players[rightIdx].handCount }).map(
                (_, i) => (
                  <BackTile key={i} size="xs" />
                )
              )}
            </View>
          </View>
        </View>

        {/* ====== BOTTOM PLAYER (ME) ====== */}
        <View style={styles.bottomArea}>
          <View style={styles.myMeldsRow}>
            <MeldView melds={view.players[mySeat].melds} size="sm" />
          </View>

          <View style={styles.myHandRow}>
            <PlayerPanel
              name={view.players[mySeat].name}
              score={view.myScore}
              wind={WIND_CHARS[(mySeat - dealerSeat + 4) % 4]}
              isDealer={mySeat === dealerSeat}
              isCurrentTurn={view.currentTurn === mySeat}
              isRiichi={view.players[mySeat].isRiichi}
              isMe={true}
              handCount={view.myHand.length}
              isConnected={true}
              position="bottom"
            />

            <View style={styles.myHandContainer}>
              <HandView
                tiles={view.myHand}
                onDiscard={handleDiscard}
                interactive={interactive}
                size="md"
              />
            </View>

            {/* Timer from server */}
            <AnimatedTimer
              remainingMs={view.turnTimeRemaining ?? 0}
              totalMs={TURN_TIMEOUT_MS}
              isMyTurn={view.currentTurn === mySeat}
            />
          </View>

          <View style={styles.actionButtonsRow}>
            <ActionButtons
              availableActions={view.availableActions}
              onAction={handleActionButton}
            />
          </View>
        </View>

        {/* Stamp display */}
        <StampDisplay ref={stampDisplayRef} mySeat={mySeat} />
        <StampPicker onSend={handleSendStamp} />

        {/* Effect overlays */}
        <WinEffect
          type={winEffectState.type}
          visible={winEffectState.visible}
          onFinish={handleWinEffectFinish}
        />
        <RiichiEffect
          visible={riichiEffectState.visible}
          playerName={riichiEffectState.playerName}
          onFinish={handleRiichiEffectFinish}
        />
        <CallEffect
          type={callEffectState.type}
          visible={callEffectState.visible}
          onFinish={handleCallEffectFinish}
        />

        {/* Back button */}
        <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
          <Text style={styles.backBtnText}>← 退出</Text>
        </TouchableOpacity>

        {/* Round result modal */}
        <RoundResultModal
          visible={showResult}
          winners={resultWinners.length > 0 ? resultWinners : undefined}
          isDraw={!!isDraw}
          drawReason={drawReason}
          scoreChanges={resultScoreChanges}
          playerNames={playerNames}
          onClose={handleCloseResult}
        />

        {/* Final result overlay */}
        {finalResult && showResult && (
          <View style={styles.finalOverlay}>
            <Text style={styles.finalTitle}>対局終了</Text>
            {finalResult.rankings.map((r, i) => (
              <View key={i} style={styles.finalRow}>
                <Text style={styles.finalRank}>{i + 1}位</Text>
                <Text style={styles.finalName}>
                  {r.name || view.players[r.seat]?.name || "---"}
                </Text>
                <Text style={styles.finalScore}>{r.finalScore}点</Text>
                <Text
                  style={[
                    styles.finalUma,
                    r.totalPoints >= 0 ? styles.finalPlus : styles.finalMinus,
                  ]}
                >
                  {r.totalPoints >= 0 ? "+" : ""}
                  {r.totalPoints}
                </Text>
              </View>
            ))}
            <TouchableOpacity style={styles.finalBtn} onPress={handleBack}>
              <Text style={styles.finalBtnText}>ロビーに戻る</Text>
            </TouchableOpacity>
          </View>
        )}
      </LinearGradient>
    </View>
  );
}

function getDrawReasonText(reason: RoundEndReason): string {
  const map: Record<string, string> = {
    [RoundEndReason.EXHAUSTIVE_DRAW]: "荒牌流局",
    [RoundEndReason.FOUR_WINDS]: "四風連打",
    [RoundEndReason.FOUR_RIICHI]: "四家立直",
    [RoundEndReason.FOUR_KANS]: "四槓散了",
    [RoundEndReason.NINE_TERMINALS]: "九種九牌",
    [RoundEndReason.TRIPLE_RON]: "三家和了",
  };
  return map[reason] || "流局";
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a1628" },
  tableGradient: { flex: 1 },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  loadingIcon: { fontSize: 48 },
  loadingText: { color: "#6a8fa0", fontSize: 16, textAlign: "center" },
  errorText: { color: "#ff6b6b", fontSize: 13, textAlign: "center" },
  loadingBackBtn: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  loadingBackText: { color: "#6a8fa0", fontSize: 14 },

  // Disconnect banner
  disconnectBanner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    backgroundColor: "rgba(198, 40, 40, 0.9)",
    paddingVertical: 4,
    alignItems: "center",
  },
  disconnectText: { color: "#fff", fontSize: 12 },

  // Back button
  backBtn: {
    position: "absolute",
    top: 8,
    left: 8,
    zIndex: 10,
    padding: 8,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  backBtnText: { color: "#ccc", fontSize: 12 },

  // TOP AREA
  topArea: {
    paddingTop: 6,
    paddingHorizontal: 60,
    alignItems: "center",
  },
  topPlayerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  topTilesContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  topHandRow: { flexDirection: "row", gap: 1 },

  // MIDDLE AREA
  middleArea: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  leftPlayerArea: {
    alignItems: "center",
    justifyContent: "center",
    width: 60,
    gap: 6,
  },
  verticalHand: {
    flexDirection: "column",
    gap: 1,
    alignItems: "center",
  },
  rightPlayerArea: {
    alignItems: "center",
    justifyContent: "center",
    width: 60,
    gap: 6,
  },
  centerTable: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
  },
  topDiscards: { marginBottom: 4 },
  centerMiddleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  sideDiscards: { maxWidth: 100, alignItems: "center" },
  bottomDiscards: { marginTop: 4 },

  // BOTTOM AREA
  bottomArea: { paddingBottom: 4, alignItems: "center" },
  myMeldsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    width: "100%",
    paddingHorizontal: 20,
    marginBottom: 2,
  },
  myHandRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 8,
  },
  myHandContainer: { flex: 1, alignItems: "center" },
  actionButtonsRow: {
    position: "absolute",
    bottom: 60,
    left: 0,
    right: 0,
    zIndex: 5,
  },

  // Final result overlay
  finalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(10, 22, 40, 0.95)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 30,
    padding: 32,
  },
  finalTitle: {
    fontSize: 28,
    fontWeight: "900",
    color: "#ffd600",
    marginBottom: 24,
    letterSpacing: 4,
  },
  finalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingVertical: 10,
    paddingHorizontal: 20,
    width: "100%",
    maxWidth: 400,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  finalRank: { color: "#ffd600", fontSize: 18, fontWeight: "bold", width: 40 },
  finalName: { color: "#e0f0f5", fontSize: 16, flex: 1 },
  finalScore: { color: "#b0bec5", fontSize: 14, width: 70, textAlign: "right" },
  finalUma: { fontSize: 16, fontWeight: "bold", width: 60, textAlign: "right" },
  finalPlus: { color: "#4CAF50" },
  finalMinus: { color: "#ff6b6b" },
  finalBtn: {
    marginTop: 28,
    backgroundColor: "#1a7888",
    borderRadius: 12,
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "#20a0b0",
  },
  finalBtnText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
});
