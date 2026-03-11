import { create } from "zustand";
import type { PlayerGameView, TileId, RoundResult, GameFinalResult, StampReceivedPayload, StampId } from "@mahjong/shared";
import { ActionType, WS_EVENTS } from "@mahjong/shared";
import { getSocket, connectSocket } from "../api/socket";

interface GameState {
  view: PlayerGameView | null;
  roundResult: RoundResult | null;
  finalResult: GameFinalResult | null;
  error: string | null;
  isConnected: boolean;
  lastStamp: StampReceivedPayload | null;

  // Actions
  joinRoom: (roomId: string) => void;
  readyUp: (roomId: string) => void;
  sendAction: (roomId: string, action: ActionType, tileId?: TileId, tiles?: TileId[]) => void;
  sendStamp: (roomId: string, stampId: StampId) => void;
  disconnect: () => void;
  initListeners: () => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  view: null,
  roundResult: null,
  finalResult: null,
  error: null,
  isConnected: false,
  lastStamp: null,

  initListeners: () => {
    const socket = getSocket();

    socket.on("connect", () => {
      set({ isConnected: true });
    });

    socket.on("disconnect", () => {
      set({ isConnected: false });
    });

    socket.on(WS_EVENTS.GAME_STATE, (view: PlayerGameView) => {
      set({ view, error: null });
    });

    socket.on(WS_EVENTS.GAME_STARTED, (view: PlayerGameView) => {
      set({ view, roundResult: null, finalResult: null, error: null });
    });

    socket.on(WS_EVENTS.GAME_ROUND_RESULT, (result: RoundResult) => {
      set({ roundResult: result });
    });

    socket.on(WS_EVENTS.GAME_FINAL_RESULT, (result: GameFinalResult) => {
      set({ finalResult: result });
    });

    socket.on(WS_EVENTS.GAME_ERROR, (data: { message: string }) => {
      set({ error: data.message });
    });

    socket.on(WS_EVENTS.STAMP_RECEIVED, (data: StampReceivedPayload) => {
      set({ lastStamp: data });
    });

    connectSocket();
  },

  joinRoom: (roomId) => {
    const socket = getSocket();
    socket.emit(WS_EVENTS.ROOM_JOIN, { roomId });
  },

  readyUp: (roomId) => {
    const socket = getSocket();
    socket.emit(WS_EVENTS.ROOM_READY, { roomId });
  },

  sendAction: (roomId, action, tileId, tiles) => {
    const socket = getSocket();
    socket.emit(WS_EVENTS.GAME_ACTION, {
      roomId,
      action,
      tileId,
      tiles,
    });
  },

  sendStamp: (roomId, stampId) => {
    const socket = getSocket();
    socket.emit(WS_EVENTS.STAMP_SEND, { roomId, stampId });
  },

  disconnect: () => {
    const socket = getSocket();
    socket.removeAllListeners();
    socket.disconnect();
    set({ view: null, isConnected: false });
  },
}));
