import { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as ScreenOrientation from "expo-screen-orientation";
import type { TileId, SeatIndex, PlayerGameView } from "@mahjong/shared";
import {
  ActionType,
  GamePhase,
  RoundPhase,
  RoundEndReason,
  Wind,
  TURN_TIMEOUT_MS,
} from "@mahjong/shared";
import {
  GameMachine,
  botDecideAction,
  type GameState,
  type GameEvent,
} from "@mahjong/engine";
import { HandView } from "../components/game/HandView";
import { DiscardPile } from "../components/game/DiscardPile";
import { ActionButtons } from "../components/game/ActionButtons";
import { GameInfo, PlayerPanel } from "../components/game/GameInfo";
import { MeldView } from "../components/game/MeldView";
import { DiscardAssist } from "../components/game/DiscardAssist";
import { RoundResultModal } from "../components/game/RoundResultModal";
import { BackTile } from "../components/game/TileView";
import {
  WinEffect,
  RiichiEffect,
  CallEffect,
  AnimatedTimer,
} from "../components/game/effects";
import { useGameEffects } from "../hooks/useGameEffects";
import { initSounds } from "../utils/sound-manager";
import { StampPicker } from "../components/game/StampPicker";
import { StampDisplay, type StampDisplayRef } from "../components/game/StampDisplay";
import type { StampId } from "@mahjong/shared";
import { DiceRollOverlay } from "../components/game/DiceRollOverlay";
import { DealingOverlay } from "../components/game/DealingOverlay";
import { SeatDrawOverlay } from "../components/game/SeatDrawOverlay";

const HUMAN_SEAT = 0 as SeatIndex;
const BOT_NAMES = ["あなた", "CPU東", "CPU南", "CPU西"];
const WIND_CHARS = ["東", "南", "西", "北"];
const BOT_DELAY = 800;
const TURN_TIMEOUT_SEC = TURN_TIMEOUT_MS / 1000; // 20 seconds

interface DemoGameScreenProps {
  onBack: () => void;
}

export function DemoGameScreen({ onBack }: DemoGameScreenProps) {
  const machineRef = useRef<GameMachine>(new GameMachine());
  const [view, setView] = useState<PlayerGameView | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [lastEvents, setLastEvents] = useState<GameEvent[]>([]);
  const botTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stampDisplayRef = useRef<StampDisplayRef>(null);

  // Auto-close references
  const handleCloseResultRef = useRef<(() => void) | null>(null);

  // Turn timer (20 seconds)
  const [turnTimerMs, setTurnTimerMs] = useState(TURN_TIMEOUT_MS);
  const turnTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const turnStartRef = useRef<number>(Date.now());

  // Ceremony state
  const [showSeatDraw, setShowSeatDraw] = useState(false);
  const [showDiceRoll, setShowDiceRoll] = useState(false);
  const [showDealing, setShowDealing] = useState(false);
  const [seatWinds, setSeatWinds] = useState<Wind[]>([Wind.EAST, Wind.SOUTH, Wind.WEST, Wind.NORTH]);
  const [diceResult, setDiceResult] = useState<[number, number]>([1, 1]);
  const [isFirstGame, setIsFirstGame] = useState(true);

  // Effects system
  const {
    processEvents,
    onEffectFinish,
    winEffect,
    riichiEffect,
    callEffect,
  } = useGameEffects();

  // Lock to landscape on mount, initialize sounds, restore on unmount
  useEffect(() => {
    ScreenOrientation.lockAsync(
      ScreenOrientation.OrientationLock.LANDSCAPE
    ).catch(() => { });
    initSounds();
    return () => {
      ScreenOrientation.unlockAsync().catch(() => { });
    };
  }, []);

  // Turn timer: count down from 20s, reset on turn change
  useEffect(() => {
    turnTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - turnStartRef.current;
      const remaining = Math.max(0, TURN_TIMEOUT_MS - elapsed);
      setTurnTimerMs(remaining);

      // Auto-discard on timeout for human player
      if (remaining <= 0 && view?.currentTurn === HUMAN_SEAT && view?.roundPhase === RoundPhase.DISCARD) {
        const machine = machineRef.current;
        const events = machine.autoDiscard(HUMAN_SEAT);
        if (events.length > 0) {
          setLastEvents(events);
          processEvents(events, BOT_NAMES);
          updateView(machine);
          const state = machine.getState();
          if (state.gamePhase === GamePhase.ROUND_RESULT || state.gamePhase === GamePhase.GAME_RESULT || state.gamePhase === GamePhase.FINISHED) {
            setShowResult(true);
          } else {
            scheduleBot(machine);
          }
        }
      }

      // Auto-skip on timeout during CLAIM phase
      if (remaining <= 0) {
        const machine = machineRef.current;
        const currentState = machine.getState();
        const available = machine.getAvailableActions(HUMAN_SEAT);
        if (currentState.round?.phase === RoundPhase.CLAIM && available.includes(ActionType.SKIP)) {
          const events = machine.processAction({
            seat: HUMAN_SEAT,
            action: ActionType.SKIP,
          });
          if (events.length > 0) {
            setLastEvents(events);
            processEvents(events, BOT_NAMES);
            updateView(machine);
            const state = machine.getState();
            if (state.gamePhase === GamePhase.ROUND_RESULT || state.gamePhase === GamePhase.GAME_RESULT || state.gamePhase === GamePhase.FINISHED) {
              setShowResult(true);
            } else {
              scheduleBot(machine);
            }
          }
        }
      }
    }, 200);
    return () => {
      if (turnTimerRef.current) clearInterval(turnTimerRef.current);
    };
  }, [view?.currentTurn, view?.roundPhase]);

  // Reset turn timer when turn changes
  useEffect(() => {
    turnStartRef.current = Date.now();
    setTurnTimerMs(TURN_TIMEOUT_MS);
  }, [view?.currentTurn, view?.roundPhase]);



  // Initialize game
  useEffect(() => {
    startNewGame();
    return () => {
      if (botTimerRef.current) clearTimeout(botTimerRef.current);
    };
  }, []);

  const startNewGame = useCallback(() => {
    const machine = new GameMachine();
    machineRef.current = machine;
    const seed = Date.now();
    const events = machine.startGame(seed);

    const state = machine.getState();

    // Show seat draw ceremony for first game
    if (isFirstGame) {
      setSeatWinds([...state.seatWinds]);
      setShowSeatDraw(true);
      setIsFirstGame(false);
    } else {
      // Subsequent games: show dice directly
      setDiceResult(state.diceResult);
      setShowDiceRoll(true);
    }

    setLastEvents(events);
    updateView(machine);
  }, [isFirstGame]);

  const updateView = useCallback((machine: GameMachine) => {
    const state = machine.getState();
    const pv = machine.getPlayerView(HUMAN_SEAT, BOT_NAMES);
    setGameState(state);
    setView(pv);
  }, []);

  const scheduleBot = useCallback((machine: GameMachine) => {
    if (botTimerRef.current) clearTimeout(botTimerRef.current);
    botTimerRef.current = setTimeout(() => {
      runBots(machine);
    }, BOT_DELAY);
  }, []);

  const runBots = useCallback((machine: GameMachine) => {
    const state = machine.getState();
    if (state.gamePhase !== GamePhase.PLAYING || !state.round) return;

    let botActed = false;
    for (let i = 0; i < 4; i++) {
      const seat = i as SeatIndex;
      if (seat === HUMAN_SEAT) continue;

      const available = machine.getAvailableActions(seat);
      if (available.length === 0) continue;

      const action = botDecideAction(state, seat, available);
      if (action) {
        const events = machine.processAction(action);
        setLastEvents(events);
        processEvents(events, BOT_NAMES);
        botActed = true;
        break;
      }
    }

    updateView(machine);

    const newState = machine.getState();
    if (newState.gamePhase === GamePhase.ROUND_RESULT) {
      setShowResult(true);
      return;
    }
    if (
      newState.gamePhase === GamePhase.GAME_RESULT ||
      newState.gamePhase === GamePhase.FINISHED
    ) {
      setShowResult(true);
      return;
    }
    if (botActed) {
      scheduleBot(machine);
    }
  }, [updateView, scheduleBot]);

  const handleAction = useCallback(
    (action: ActionType, tileId?: TileId, tiles?: TileId[]) => {
      const machine = machineRef.current;
      const events = machine.processAction({
        seat: HUMAN_SEAT,
        action,
        tileId,
        tiles,
      });
      setLastEvents(events);
      processEvents(events, BOT_NAMES);
      updateView(machine);

      const state = machine.getState();
      if (
        state.gamePhase === GamePhase.ROUND_RESULT ||
        state.gamePhase === GamePhase.GAME_RESULT ||
        state.gamePhase === GamePhase.FINISHED
      ) {
        setShowResult(true);
        return;
      }
      scheduleBot(machine);
    },
    [updateView, scheduleBot]
  );

  const handleDiscard = useCallback(
    (tileId: TileId) => {
      handleAction(ActionType.DISCARD, tileId);
    },
    [handleAction]
  );

  const handleSendStamp = useCallback(
    (stampId: StampId) => {
      stampDisplayRef.current?.showStamp(HUMAN_SEAT, stampId);
    },
    []
  );

  const handleActionButton = useCallback(
    (action: ActionType) => {
      const machine = machineRef.current;
      const state = machine.getState();
      const round = state.round;

      // For PON/CHI/KAN_OPEN, we need to construct the tiles array
      if (round && round.lastDiscard) {
        const discardTileId = round.lastDiscard.tileId;
        const discardKind = Math.floor(discardTileId / 4);
        const hand = round.hands[HUMAN_SEAT];

        if (action === ActionType.PON) {
          const matchingTiles = hand.filter((t) => Math.floor(t / 4) === discardKind).slice(0, 2);
          handleAction(action, undefined, [...matchingTiles, discardTileId]);
          return;
        }

        if (action === ActionType.KAN_OPEN) {
          const matchingTiles = hand.filter((t) => Math.floor(t / 4) === discardKind).slice(0, 3);
          handleAction(action, undefined, [...matchingTiles, discardTileId]);
          return;
        }

        if (action === ActionType.CHI) {
          // Find best chi combination
          const chiTiles = findChiTiles(hand, discardKind);
          if (chiTiles) {
            handleAction(action, undefined, [...chiTiles, discardTileId]);
            return;
          }
        }
      }

      handleAction(action);
    },
    [handleAction]
  );

  const handleSeatDrawFinish = useCallback(() => {
    setShowSeatDraw(false);
    // Now show dice roll
    const state = machineRef.current.getState();
    setDiceResult(state.diceResult);
    setShowDiceRoll(true);
  }, []);

  const handleDiceRollFinish = useCallback(() => {
    setShowDiceRoll(false);
    // Show dealing animation
    setShowDealing(true);
  }, []);

  const handleDealingFinish = useCallback(() => {
    setShowDealing(false);
    // Now start bot scheduling
    turnStartRef.current = Date.now();
    scheduleBot(machineRef.current);
  }, [scheduleBot]);

  const handleCloseResult = useCallback(() => {
    setShowResult(false);
    const machine = machineRef.current;
    const state = machine.getState();

    if (
      state.gamePhase === GamePhase.GAME_RESULT ||
      state.gamePhase === GamePhase.FINISHED
    ) {
      startNewGame();
      return;
    }

    const dealerSeat = state.dealerSeat;
    let dealerWon = false;
    let isDraw = false;
    for (const e of lastEvents) {
      if (e.type === "TSUMO" && e.seat === dealerSeat) {
        dealerWon = true;
      } else if (e.type === "RON" && e.winners.some((w: any) => w.seat === dealerSeat)) {
        dealerWon = true;
      } else if (e.type === "DRAW_ROUND") {
        isDraw = true;
        if (e.tenpaiPlayers.includes(dealerSeat)) {
          dealerWon = true;
        }
      }
    }

    const events = machine.advanceToNextRound(dealerWon, isDraw);
    setLastEvents(events);
    processEvents(events, BOT_NAMES);
    updateView(machine);

    const newState = machine.getState();
    if (newState.gamePhase !== GamePhase.GAME_RESULT && newState.gamePhase !== GamePhase.FINISHED) {
      // Show dice roll for new round
      setDiceResult(newState.diceResult);
      setShowDiceRoll(true);
    } else {
      setShowResult(true);
    }
  }, [startNewGame, updateView, scheduleBot, processEvents, lastEvents]);

  // Result modal is closed manually by the player tapping "次へ"

  if (!view || !gameState) {
    return (
      <LinearGradient
        colors={["#0a1628", "#122440", "#1a3358"]}
        style={styles.loadingContainer}
      >
        <Text style={styles.loadingIcon}>{"\uD83C\uDC04"}</Text>
        <Text style={styles.loadingText}>{"\u914D\u724C\u4E2D..."}</Text>
        <TouchableOpacity style={styles.loadingBackBtn} onPress={onBack}>
          <Text style={styles.loadingBackText}>{"\u623B\u308B"}</Text>
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
  const interactive = isMyTurn || (isClaimPhase && view.availableActions.length > 0);
  const isCeremony = showSeatDraw || showDiceRoll || showDealing;

  // Build result data for modal
  const resultWinners = lastEvents
    .filter((e) => e.type === "TSUMO" || e.type === "RON")
    .flatMap((e) => {
      if (e.type === "TSUMO") {
        return [
          {
            seat: e.seat,
            name: BOT_NAMES[e.seat],
            hand: gameState.round?.hands[e.seat] || [],
            winTile: gameState.round?.drawnTile || 0,
            isTsumo: true,
            yaku: e.yaku,
            han: e.han,
            fu: e.fu,
            score: e.score,
          },
        ];
      }
      if (e.type === "RON") {
        return e.winners.map((w: any) => ({
          seat: w.seat,
          name: BOT_NAMES[w.seat],
          hand: gameState.round?.hands[w.seat] || [],
          winTile: gameState.round?.lastDiscard?.tileId || 0,
          isTsumo: false,
          yaku: w.yaku,
          han: w.han,
          fu: w.fu,
          score: w.score,
        }));
      }
      return [];
    });

  const resultScoreChanges = lastEvents.reduce(
    (acc, e) => {
      if ("scoreChanges" in e && e.scoreChanges) {
        for (const [k, v] of Object.entries(e.scoreChanges)) {
          acc[Number(k)] = (acc[Number(k)] || 0) + (v as number);
        }
      }
      return acc;
    },
    {} as Record<number, number>
  );

  const isDraw = lastEvents.some((e) => e.type === "DRAW_ROUND");
  const drawEvent = lastEvents.find((e) => e.type === "DRAW_ROUND");

  const dealerSeat = view.dealerSeat ?? gameState.dealerSeat;

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["#0a1628", "#122440", "#1a3358"]}
        style={styles.tableGradient}
      >
        {/* ====== TOP PLAYER AREA ====== */}
        <View style={styles.topArea}>
          <View style={styles.topPlayerRow}>
            <View style={styles.topTilesContainer}>
              {!isCeremony && (
                <>
                  <View style={styles.topHandRow}>
                    {Array.from({ length: view.players[topIdx].handCount }).map(
                      (_, i) => (
                        <BackTile key={i} size="xs" />
                      )
                    )}
                  </View>
                  <MeldView melds={view.players[topIdx].melds} size="xs" />
                </>
              )}
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
              isConnected={true}
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
              isConnected={true}
              position="left"
            />
            {!isCeremony && (
              <View style={styles.verticalHand}>
                {Array.from({ length: view.players[leftIdx].handCount }).map(
                  (_, i) => (
                    <BackTile key={i} size="xs" />
                  )
                )}
              </View>
            )}
          </View>

          {/* CENTER TABLE AREA */}
          <View style={styles.centerTable}>
            <View style={styles.topDiscards}>
              <DiscardPile tiles={view.players[topIdx].discards} size="xs" position="top" />
            </View>

            <View style={styles.centerMiddleRow}>
              <View style={styles.sideDiscards}>
                <DiscardPile tiles={view.players[leftIdx].discards} size="xs" position="left" />
              </View>

              <GameInfo view={view} dealerSeat={dealerSeat} />

              <View style={styles.sideDiscards}>
                <DiscardPile tiles={view.players[rightIdx].discards} size="xs" position="right" />
              </View>
            </View>

            <View style={styles.bottomDiscards}>
              <DiscardPile
                tiles={view.players[mySeat].discards}
                size="xs"
                lastDiscard={view.lastDiscard?.tileId}
                position="bottom"
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
              isConnected={true}
              position="right"
            />
            {!isCeremony && (
              <View style={styles.verticalHand}>
                {Array.from({ length: view.players[rightIdx].handCount }).map(
                  (_, i) => (
                    <BackTile key={i} size="xs" />
                  )
                )}
              </View>
            )}
          </View>
        </View>

        {/* ====== BOTTOM PLAYER (ME) AREA ====== */}
        <View style={styles.bottomArea}>
          <View style={styles.myMeldsRow}>
            <MeldView melds={view.players[mySeat].melds} size="sm" />
          </View>

          <View style={styles.myHandRow}>
            <PlayerPanel
              name={"\u3042\u306A\u305F"}
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
              {!isCeremony && (
                <HandView
                  tiles={view.myHand}
                  onDiscard={handleDiscard}
                  interactive={interactive}
                  size="md"
                  drawnTile={
                    gameState.round?.drawnTile !== null && isMyTurn
                      ? gameState.round?.drawnTile
                      : undefined
                  }
                />
              )}
            </View>

            {/* Timer - 20 seconds */}
            <AnimatedTimer
              remainingMs={turnTimerMs}
              totalMs={TURN_TIMEOUT_MS}
              isMyTurn={view.currentTurn === mySeat}
            />
          </View>

          <View style={styles.actionButtonsRow}>
            <ActionButtons
              availableActions={view.availableActions}
              onAction={handleActionButton}
              lastDiscardTileId={view.lastDiscard?.tileId}
            />
          </View>

          {/* Discard assist overlay */}
          <DiscardAssist
            hand={view.myHand}
            melds={view.players[mySeat].melds}
            roundWind={view.roundWind}
            seatWind={((mySeat - dealerSeat + 4) % 4) as Wind}
            isRiichi={view.players[mySeat].isRiichi}
            visible={isMyTurn}
          />
        </View>

        {/* Stamp display */}
        <StampDisplay ref={stampDisplayRef} mySeat={mySeat} />
        <StampPicker onSend={handleSendStamp} />

        {/* Ceremony overlays */}
        <SeatDrawOverlay
          visible={showSeatDraw}
          playerNames={BOT_NAMES}
          seatWinds={seatWinds}
          onFinish={handleSeatDrawFinish}
        />
        <DiceRollOverlay
          visible={showDiceRoll}
          diceResult={diceResult}
          onFinish={handleDiceRollFinish}
        />
        <DealingOverlay
          visible={showDealing}
          diceTotal={diceResult[0] + diceResult[1]}
          wallBreakPosition={view.wallBreakPosition ?? 0}
          myHand={view.myHand}
          doraIndicators={view.doraIndicators}
          dealerSeat={dealerSeat}
          mySeat={mySeat}
          onFinish={handleDealingFinish}
        />

        {/* Effect overlays */}
        <WinEffect
          type={winEffect.type}
          visible={winEffect.visible}
          onFinish={onEffectFinish}
        />
        <RiichiEffect
          visible={riichiEffect.visible}
          playerName={riichiEffect.playerName}
          onFinish={onEffectFinish}
        />
        <CallEffect
          type={callEffect.type}
          visible={callEffect.visible}
          onFinish={onEffectFinish}
        />

        {/* Back button */}
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Text style={styles.backBtnText}>{"\u2190 \u623B\u308B"}</Text>
        </TouchableOpacity>

        {/* Round result modal */}
        <RoundResultModal
          visible={showResult}
          winners={resultWinners.length > 0 ? resultWinners : undefined}
          isDraw={isDraw}
          drawReason={
            isDraw && drawEvent?.type === "DRAW_ROUND"
              ? getDrawReasonText(drawEvent.reason)
              : undefined
          }
          scoreChanges={resultScoreChanges}
          playerNames={BOT_NAMES}
          onClose={handleCloseResult}
        />
      </LinearGradient>
    </View>
  );
}

/**
 * Find two tiles in hand that form a chi sequence with the given discard kind.
 */
function findChiTiles(hand: TileId[], discardKind: number): [TileId, TileId] | null {
  if (discardKind >= 27) return null;
  const suit = Math.floor(discardKind / 9);
  const num = discardKind % 9;

  const findTile = (kind: number): TileId | undefined =>
    hand.find((t) => Math.floor(t / 4) === kind);

  // Try n-2, n-1, n
  if (num >= 2) {
    const t1 = findTile(suit * 9 + num - 2);
    const t2 = findTile(suit * 9 + num - 1);
    if (t1 !== undefined && t2 !== undefined) return [t1, t2];
  }
  // Try n-1, n, n+1
  if (num >= 1 && num <= 7) {
    const t1 = findTile(suit * 9 + num - 1);
    const t2 = findTile(suit * 9 + num + 1);
    if (t1 !== undefined && t2 !== undefined) return [t1, t2];
  }
  // Try n, n+1, n+2
  if (num <= 6) {
    const t1 = findTile(suit * 9 + num + 1);
    const t2 = findTile(suit * 9 + num + 2);
    if (t1 !== undefined && t2 !== undefined) return [t1, t2];
  }
  return null;
}

function getDrawReasonText(reason: RoundEndReason): string {
  const map: Record<string, string> = {
    [RoundEndReason.EXHAUSTIVE_DRAW]: "\u8352\u724C\u6D41\u5C40",
    [RoundEndReason.FOUR_WINDS]: "\u56DB\u98A8\u9023\u6253",
    [RoundEndReason.FOUR_RIICHI]: "\u56DB\u5BB6\u7ACB\u76F4",
    [RoundEndReason.FOUR_KANS]: "\u56DB\u69D3\u6563\u4E86",
    [RoundEndReason.NINE_TERMINALS]: "\u4E5D\u7A2E\u4E5D\u724C",
    [RoundEndReason.TRIPLE_RON]: "\u4E09\u5BB6\u548C\u4E86",
  };
  return map[reason] || "\u6D41\u5C40";
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a1628",
  },
  tableGradient: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  loadingIcon: {
    fontSize: 48,
  },
  loadingText: {
    color: "#6a8fa0",
    fontSize: 16,
    textAlign: "center",
  },
  loadingBackBtn: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  loadingBackText: {
    color: "#6a8fa0",
    fontSize: 14,
  },

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
  backBtnText: {
    color: "#ccc",
    fontSize: 12,
  },

  // ====== TOP AREA ======
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
  topHandRow: {
    flexDirection: "row",
    gap: 1,
  },

  // ====== MIDDLE AREA ======
  middleArea: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },

  // Left player
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

  // Right player
  rightPlayerArea: {
    alignItems: "center",
    justifyContent: "center",
    width: 60,
    gap: 6,
  },

  // Center table
  centerTable: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
  },
  topDiscards: {
    marginBottom: 4,
  },
  centerMiddleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  sideDiscards: {
    maxWidth: 100,
    alignItems: "center",
  },
  bottomDiscards: {
    marginTop: 4,
  },

  // ====== BOTTOM AREA ======
  bottomArea: {
    paddingBottom: 4,
    alignItems: "center",
  },
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
  myHandContainer: {
    flex: 1,
    alignItems: "center",
  },
  actionButtonsRow: {
    position: "absolute",
    bottom: 60,
    left: 0,
    right: 0,
    zIndex: 5,
  },
});
