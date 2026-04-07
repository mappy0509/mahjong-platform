import { create } from "zustand";
import type {
  PlayerGameView,
  TileId,
  RoundResult,
  GameFinalResult,
  StampReceivedPayload,
  StampId,
} from "@mahjong/shared";
import { ActionType } from "@mahjong/shared";
import { supabase } from "../lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface GameState {
  view: PlayerGameView | null;
  roundResult: RoundResult | null;
  finalResult: GameFinalResult | null;
  error: string | null;
  isConnected: boolean;
  lastStamp: StampReceivedPayload | null;

  // Internal
  _channel: RealtimeChannel | null;
  _roomId: string | null;

  // Actions
  subscribe: (roomId: string) => Promise<void>;
  joinRoom: (roomId: string) => Promise<void>;
  readyUp: (roomId: string) => Promise<void>;
  sendAction: (
    roomId: string,
    action: ActionType,
    tileId?: TileId,
    tiles?: TileId[]
  ) => Promise<void>;
  sendStamp: (roomId: string, stampId: StampId) => Promise<void>;
  disconnect: () => void;
}

async function invokeEdge<T = any>(
  functionName: string,
  body: Record<string, unknown>
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
  });
  if (error) throw new Error(error.message ?? `Edge function ${functionName} failed`);
  return data as T;
}

export const useGameStore = create<GameState>((set, get) => ({
  view: null,
  roundResult: null,
  finalResult: null,
  error: null,
  isConnected: false,
  lastStamp: null,
  _channel: null,
  _roomId: null,

  subscribe: async (roomId: string) => {
    // Clean up existing subscription
    const existing = get()._channel;
    if (existing) {
      supabase.removeChannel(existing);
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      set({ error: "Not authenticated" });
      return;
    }

    // Subscribe to player_views changes for this user+room
    const channel = supabase
      .channel(`game:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "player_views",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const row = payload.new as any;
          // Only process our own view
          if (row.user_id !== user.id) return;

          const view = row.view as PlayerGameView;
          set({ view, error: null, isConnected: true });

          // Check for round result
          if (row.round_result) {
            set({ roundResult: row.round_result as RoundResult });
          }

          // Check for final result
          if (row.final_result) {
            set({ finalResult: row.final_result as GameFinalResult });
          }
        }
      )
      .on("broadcast", { event: "stamp" }, (payload) => {
        set({ lastStamp: payload.payload as StampReceivedPayload });
      })
      .subscribe((status) => {
        set({ isConnected: status === "SUBSCRIBED" });
      });

    set({ _channel: channel, _roomId: roomId });

    // Fetch initial state
    const { data: initialView } = await supabase
      .from("player_views")
      .select("view, round_result, final_result")
      .eq("room_id", roomId)
      .eq("user_id", user.id)
      .single();

    if (initialView?.view) {
      set({
        view: initialView.view as unknown as PlayerGameView,
        roundResult: initialView.round_result as RoundResult | null,
        finalResult: initialView.final_result as GameFinalResult | null,
      });
    }
  },

  joinRoom: async (roomId: string) => {
    try {
      await invokeEdge("join-room", { roomId });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to join room",
      });
    }
  },

  readyUp: async (roomId: string) => {
    try {
      const result = await invokeEdge<{ allReady: boolean; gameStarted?: boolean }>(
        "ready-up",
        { roomId }
      );
      if (result.gameStarted) {
        // Subscribe to realtime updates
        await get().subscribe(roomId);
      }
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to ready up",
      });
    }
  },

  sendAction: async (roomId, action, tileId, tiles) => {
    try {
      await invokeEdge("game-action", {
        roomId,
        action,
        tileId,
        tiles,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Action failed",
      });
    }
  },

  sendStamp: async (roomId, stampId) => {
    try {
      await invokeEdge("send-stamp", { roomId, stampId });
    } catch {
      // Stamps are fire-and-forget
    }
  },

  disconnect: () => {
    const channel = get()._channel;
    if (channel) {
      supabase.removeChannel(channel);
    }
    set({
      view: null,
      roundResult: null,
      finalResult: null,
      error: null,
      isConnected: false,
      lastStamp: null,
      _channel: null,
      _roomId: null,
    });
  },
}));
