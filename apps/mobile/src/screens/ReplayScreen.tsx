import { useEffect, useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { supabase } from "../lib/supabase";

interface GameReplayData {
  roomId: string;
  rules: any;
  players: { userId: string; seat: number }[];
  events: { sequence: number; eventType: string; payload: any; createdAt: string }[];
}
import { useAuthStore } from "../stores/auth-store";
import { gameReducer, createInitialState } from "@mahjong/engine";
import type { GameState, GameEvent } from "@mahjong/engine";
import { tileKind } from "@mahjong/engine";

// Tile label mapping
const MAN_LABELS = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];
const PIN_LABELS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨"];
const SOU_LABELS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
const HONOR_LABELS = ["東", "南", "西", "北", "白", "發", "中"];

function tileLabel(tileId: number): string {
  const kind = tileKind(tileId);
  if (kind <= 8) return MAN_LABELS[kind] + "萬";
  if (kind <= 17) return PIN_LABELS[kind - 9] + "筒";
  if (kind <= 26) return SOU_LABELS[kind - 18] + "索";
  return HONOR_LABELS[kind - 27];
}

function tileLabelShort(tileId: number): string {
  const kind = tileKind(tileId);
  if (kind <= 8) return MAN_LABELS[kind];
  if (kind <= 17) return PIN_LABELS[kind - 9];
  if (kind <= 26) return SOU_LABELS[kind - 18];
  return HONOR_LABELS[kind - 27];
}

const WIND_LABELS = ["東", "南", "西", "北"];

function eventDescription(event: GameEvent): string {
  switch (event.type) {
    case "GAME_START":
      return "ゲーム開始";
    case "ROUND_START":
      return `局開始 (親: ${WIND_LABELS[event.dealerSeat]}家)`;
    case "DRAW_TILE":
      return `${WIND_LABELS[event.seat]}家 ツモ ${tileLabel(event.tileId)}`;
    case "DISCARD":
      return `${WIND_LABELS[event.seat]}家 打 ${tileLabel(event.tileId)}`;
    case "AUTO_DISCARD":
      return `${WIND_LABELS[event.seat]}家 自動打牌 ${tileLabel(event.tileId)}`;
    case "RIICHI":
      return `${WIND_LABELS[event.seat]}家 リーチ 打 ${tileLabel(event.tileId)}`;
    case "CHI":
      return `${WIND_LABELS[event.seat]}家 チー ${tileLabel(event.calledTile)}`;
    case "PON":
      return `${WIND_LABELS[event.seat]}家 ポン ${tileLabel(event.calledTile)}`;
    case "KAN_OPEN":
      return `${WIND_LABELS[event.seat]}家 大明槓 ${tileLabel(event.calledTile)}`;
    case "KAN_CLOSED":
      return `${WIND_LABELS[event.seat]}家 暗槓`;
    case "KAN_ADDED":
      return `${WIND_LABELS[event.seat]}家 加槓 ${tileLabel(event.tileId)}`;
    case "TSUMO":
      return `${WIND_LABELS[event.seat]}家 ツモ和了 ${event.han}翻${event.fu}符 ${event.score}点`;
    case "RON":
      return `ロン和了 ${event.winners.map((w) => `${WIND_LABELS[w.seat]}家 ${w.han}翻${w.fu}符 ${w.score}点`).join(", ")}`;
    case "DRAW_ROUND":
      return `流局 (${event.reason})`;
    case "SKIP_CLAIM":
      return `${WIND_LABELS[event.seat]}家 スキップ`;
    case "GAME_END":
      return `ゲーム終了`;
    default:
      return (event as any).type;
  }
}

interface ReplayScreenProps {
  roomId: string;
  onBack: () => void;
}

export function ReplayScreen({ roomId, onBack }: ReplayScreenProps) {
  const { user } = useAuthStore();
  const [replayData, setReplayData] = useState<GameReplayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Replay state
  const [currentStep, setCurrentStep] = useState(0);
  const [states, setStates] = useState<GameState[]>([]);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadReplay();
    return () => {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
    };
  }, [roomId]);

  const loadReplay = async () => {
    try {
      // Fetch replay data from Supabase
      const { data: events } = await supabase
        .from("game_event_logs")
        .select("sequence, event_type, payload, created_at")
        .eq("room_id", roomId)
        .order("sequence");
      const { data: participants } = await supabase
        .from("game_participants")
        .select("user_id, seat")
        .eq("room_id", roomId);
      const { data: room } = await supabase
        .from("game_rooms")
        .select("rules")
        .eq("id", roomId)
        .single();
      const data: GameReplayData = {
        roomId,
        rules: room?.rules ?? {},
        players: (participants ?? []).map((p: any) => ({ userId: p.user_id, seat: p.seat })),
        events: (events ?? []).map((e: any) => ({
          sequence: e.sequence,
          eventType: e.event_type,
          payload: e.payload,
          createdAt: e.created_at,
        })),
      };
      setReplayData(data);

      // Build state history by replaying events through the reducer
      const parsedEvents: GameEvent[] = data.events.map((e) => e.payload as GameEvent);
      const stateHistory: GameState[] = [createInitialState()];

      let state = createInitialState();
      for (const event of parsedEvents) {
        state = gameReducer(state, event);
        stateHistory.push(state);
      }

      setEvents(parsedEvents);
      setStates(stateHistory);
    } catch (err) {
      setError(err instanceof Error ? err.message : "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const goToStep = useCallback(
    (step: number) => {
      const clamped = Math.max(0, Math.min(step, events.length));
      setCurrentStep(clamped);
    },
    [events.length]
  );

  const toggleAutoPlay = useCallback(() => {
    if (isPlaying) {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
      playIntervalRef.current = null;
      setIsPlaying(false);
    } else {
      setIsPlaying(true);
      playIntervalRef.current = setInterval(() => {
        setCurrentStep((prev) => {
          if (prev >= events.length) {
            if (playIntervalRef.current) clearInterval(playIntervalRef.current);
            playIntervalRef.current = null;
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 800);
    }
  }, [isPlaying, events.length]);

  // Find my seat
  const mySeat = replayData?.players.find((p) => p.userId === user?.id)?.seat ?? 0;

  const currentState = states[currentStep] ?? createInitialState();
  const currentEvent = currentStep > 0 ? events[currentStep - 1] : null;

  // Filter events to show only significant ones (skip SKIP_CLAIM, DRAW_TILE for compactness)
  const isSignificantEvent = (e: GameEvent) =>
    e.type !== "SKIP_CLAIM" && e.type !== "DRAW_TILE";

  if (loading) {
    return (
      <LinearGradient
        colors={["#0a1628", "#122440", "#1a3358"] as const}
        style={styles.container}
      >
        <StatusBar style="light" />
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onBack} style={styles.backBtn}>
              <Text style={styles.backText}>‹ 戻る</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>牌譜リプレイ</Text>
            <View style={{ width: 60 }} />
          </View>
          <ActivityIndicator color="#1a7888" style={{ marginTop: 60 }} />
        </SafeAreaView>
      </LinearGradient>
    );
  }

  if (error) {
    return (
      <LinearGradient
        colors={["#0a1628", "#122440", "#1a3358"] as const}
        style={styles.container}
      >
        <StatusBar style="light" />
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onBack} style={styles.backBtn}>
              <Text style={styles.backText}>‹ 戻る</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>牌譜リプレイ</Text>
            <View style={{ width: 60 }} />
          </View>
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  const round = currentState.round;

  return (
    <LinearGradient
      colors={["#0a1628", "#122440", "#1a3358"] as const}
      style={styles.container}
    >
      <StatusBar style="light" />
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn}>
            <Text style={styles.backText}>‹ 戻る</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>牌譜リプレイ</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView style={styles.content}>
          {/* Round info */}
          <View style={styles.roundInfo}>
            <Text style={styles.roundLabel}>
              {WIND_LABELS[currentState.roundWind]}
              {currentState.roundNumber + 1}局{" "}
              {currentState.honba > 0 && `${currentState.honba}本場`}
            </Text>
            <Text style={styles.stepLabel}>
              {currentStep} / {events.length}
            </Text>
          </View>

          {/* Current event description */}
          {currentEvent && (
            <View style={styles.eventCard}>
              <Text style={styles.eventText}>
                {eventDescription(currentEvent)}
              </Text>
            </View>
          )}

          {/* Scores */}
          <View style={styles.scoresRow}>
            {currentState.scores.map((score, i) => (
              <View
                key={i}
                style={[styles.scoreBox, i === mySeat && styles.scoreBoxMe]}
              >
                <Text style={styles.scoreWind}>{WIND_LABELS[i]}</Text>
                <Text
                  style={[
                    styles.scoreValue,
                    i === mySeat && styles.scoreValueMe,
                  ]}
                >
                  {score.toLocaleString()}
                </Text>
              </View>
            ))}
          </View>

          {/* Hands (all visible in replay) */}
          {round &&
            [0, 1, 2, 3].map((seat) => (
              <View key={seat} style={styles.handSection}>
                <Text style={styles.handLabel}>
                  {WIND_LABELS[seat]}家{seat === mySeat ? " (自分)" : ""}{" "}
                  {round.riichi[seat] ? "🔴リーチ" : ""}
                </Text>
                <View style={styles.tilesRow}>
                  {round.hands[seat].map((tileId, i) => (
                    <View
                      key={`${seat}-${i}`}
                      style={[
                        styles.tileBox,
                        tileId === round.drawnTile &&
                          seat === round.currentTurn &&
                          styles.tileBoxDrawn,
                      ]}
                    >
                      <Text style={styles.tileText}>
                        {tileLabelShort(tileId)}
                      </Text>
                      <Text style={styles.tileSuit}>
                        {tileKind(tileId) <= 8
                          ? "萬"
                          : tileKind(tileId) <= 17
                            ? "筒"
                            : tileKind(tileId) <= 26
                              ? "索"
                              : ""}
                      </Text>
                    </View>
                  ))}
                </View>
                {/* Melds */}
                {round.melds[seat].length > 0 && (
                  <View style={styles.meldsRow}>
                    {round.melds[seat].map((meld, mi) => (
                      <View key={mi} style={styles.meldGroup}>
                        <Text style={styles.meldType}>{meld.type}</Text>
                        <View style={styles.tilesRow}>
                          {meld.tiles.map((t, ti) => (
                            <View key={ti} style={styles.tileBoxSmall}>
                              <Text style={styles.tileTextSmall}>
                                {tileLabelShort(t)}
                              </Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    ))}
                  </View>
                )}
                {/* Discards */}
                {round.discards[seat].length > 0 && (
                  <View style={styles.discardsContainer}>
                    <Text style={styles.discardLabel}>捨牌:</Text>
                    <View style={styles.tilesRowWrap}>
                      {round.discards[seat].map((t, di) => (
                        <View key={di} style={styles.tileBoxTiny}>
                          <Text style={styles.tileTextTiny}>
                            {tileLabelShort(t)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            ))}
        </ScrollView>

        {/* Controls */}
        <View style={styles.controls}>
          <TouchableOpacity
            style={styles.ctrlBtn}
            onPress={() => goToStep(0)}
            disabled={currentStep === 0}
          >
            <Text style={styles.ctrlText}>⏮</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.ctrlBtn}
            onPress={() => goToStep(currentStep - 1)}
            disabled={currentStep === 0}
          >
            <Text style={styles.ctrlText}>◀</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.ctrlBtn, styles.ctrlBtnPlay]}
            onPress={toggleAutoPlay}
          >
            <Text style={styles.ctrlTextPlay}>
              {isPlaying ? "⏸" : "▶"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.ctrlBtn}
            onPress={() => goToStep(currentStep + 1)}
            disabled={currentStep >= events.length}
          >
            <Text style={styles.ctrlText}>▶</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.ctrlBtn}
            onPress={() => goToStep(events.length)}
            disabled={currentStep >= events.length}
          >
            <Text style={styles.ctrlText}>⏭</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(26, 120, 136, 0.2)",
  },
  backBtn: { paddingRight: 12 },
  backText: { color: "#1a7888", fontSize: 16 },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: "bold",
    color: "#e0f0f5",
    textAlign: "center",
  },
  content: { flex: 1, padding: 12 },
  roundInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  roundLabel: {
    color: "#ffd600",
    fontSize: 16,
    fontWeight: "bold",
  },
  stepLabel: {
    color: "#6a8fa0",
    fontSize: 13,
  },
  eventCard: {
    backgroundColor: "rgba(26, 120, 136, 0.15)",
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(26, 120, 136, 0.3)",
  },
  eventText: {
    color: "#e0f0f5",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  scoresRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 12,
  },
  scoreBox: {
    flex: 1,
    alignItems: "center",
    backgroundColor: "rgba(14, 28, 50, 0.7)",
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  scoreBoxMe: {
    borderColor: "rgba(26, 120, 136, 0.4)",
    backgroundColor: "rgba(26, 120, 136, 0.08)",
  },
  scoreWind: { color: "#6a8fa0", fontSize: 11, fontWeight: "bold" },
  scoreValue: { color: "#e0f0f5", fontSize: 15, fontWeight: "800" },
  scoreValueMe: { color: "#1a7888" },
  handSection: {
    backgroundColor: "rgba(14, 28, 50, 0.5)",
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.04)",
  },
  handLabel: {
    color: "#6a8fa0",
    fontSize: 12,
    fontWeight: "bold",
    marginBottom: 6,
  },
  tilesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 2,
  },
  tilesRowWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 2,
    flex: 1,
  },
  tileBox: {
    width: 28,
    height: 36,
    borderRadius: 4,
    backgroundColor: "#faf8f0",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#d5cfc0",
  },
  tileBoxDrawn: {
    borderColor: "#ff9800",
    backgroundColor: "#fff8e0",
  },
  tileBoxSmall: {
    width: 22,
    height: 30,
    borderRadius: 3,
    backgroundColor: "#faf8f0",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#d5cfc0",
  },
  tileBoxTiny: {
    width: 18,
    height: 24,
    borderRadius: 2,
    backgroundColor: "#f0ece0",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#d5cfc0",
  },
  tileText: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#333",
  },
  tileSuit: {
    fontSize: 7,
    color: "#888",
    marginTop: -2,
  },
  tileTextSmall: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#333",
  },
  tileTextTiny: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#555",
  },
  meldsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  meldGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  meldType: {
    color: "#6a8fa0",
    fontSize: 9,
    fontWeight: "bold",
  },
  discardsContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginTop: 4,
  },
  discardLabel: {
    color: "#5a6a7a",
    fontSize: 10,
    marginTop: 4,
  },
  controls: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(26, 120, 136, 0.2)",
  },
  ctrlBtn: {
    width: 48,
    height: 44,
    borderRadius: 10,
    backgroundColor: "rgba(14, 28, 50, 0.7)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(26, 120, 136, 0.2)",
  },
  ctrlBtnPlay: {
    width: 56,
    backgroundColor: "rgba(26, 120, 136, 0.2)",
    borderColor: "#1a7888",
  },
  ctrlText: { color: "#6a8fa0", fontSize: 18 },
  ctrlTextPlay: { color: "#1a7888", fontSize: 22 },
  errorContainer: { alignItems: "center", paddingTop: 60 },
  errorText: { color: "#d63031", fontSize: 15 },
});
