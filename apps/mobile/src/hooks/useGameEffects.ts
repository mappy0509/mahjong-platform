import { useState, useCallback, useRef, useEffect } from "react";
import type { GameEvent } from "@mahjong/engine";
import { playSound } from "../utils/sound-manager";

interface ActiveEffect {
  type: "win" | "riichi" | "call";
  subType?: string;
  playerName?: string;
}

/**
 * Hook to manage game visual/audio effects.
 * Detects events and triggers appropriate effects.
 */
export function useGameEffects() {
  const [activeEffect, setActiveEffect] = useState<ActiveEffect | null>(null);
  const effectQueue = useRef<ActiveEffect[]>([]);
  const processing = useRef(false);

  const processNext = useCallback(() => {
    if (effectQueue.current.length === 0) {
      processing.current = false;
      setActiveEffect(null);
      return;
    }
    processing.current = true;
    const next = effectQueue.current.shift()!;
    setActiveEffect(next);
  }, []);

  const onEffectFinish = useCallback(() => {
    processNext();
  }, [processNext]);

  const enqueueEffect = useCallback(
    (effect: ActiveEffect) => {
      effectQueue.current.push(effect);
      if (!processing.current) {
        processNext();
      }
    },
    [processNext]
  );

  /**
   * Process game events and trigger effects.
   */
  const processEvents = useCallback(
    (events: GameEvent[], playerNames?: string[]) => {
      for (const event of events) {
        switch (event.type) {
          case "DISCARD":
          case "AUTO_DISCARD":
            playSound("discard");
            break;

          case "DRAW_TILE":
            playSound("draw");
            break;

          case "CHI":
            playSound("chi");
            enqueueEffect({ type: "call", subType: "chi" });
            break;

          case "PON":
            playSound("pon");
            enqueueEffect({ type: "call", subType: "pon" });
            break;

          case "KAN_OPEN":
          case "KAN_CLOSED":
          case "KAN_ADDED":
            playSound("kan");
            enqueueEffect({ type: "call", subType: "kan" });
            break;

          case "RIICHI":
            playSound("riichi");
            enqueueEffect({
              type: "riichi",
              playerName: playerNames?.[event.seat] ?? "",
            });
            break;

          case "TSUMO":
            playSound("tsumo");
            enqueueEffect({ type: "win", subType: "tsumo" });
            break;

          case "RON":
            playSound("ron");
            enqueueEffect({ type: "win", subType: "ron" });
            break;
        }
      }
    },
    [enqueueEffect]
  );

  // Derived state for components
  const winEffect =
    activeEffect?.type === "win"
      ? { type: activeEffect.subType as "tsumo" | "ron", visible: true }
      : { type: "tsumo" as const, visible: false };

  const riichiEffect =
    activeEffect?.type === "riichi"
      ? { visible: true, playerName: activeEffect.playerName }
      : { visible: false, playerName: undefined };

  const callEffect =
    activeEffect?.type === "call"
      ? {
          type: activeEffect.subType as "pon" | "chi" | "kan",
          visible: true,
        }
      : { type: "pon" as const, visible: false };

  return {
    processEvents,
    onEffectFinish,
    winEffect,
    riichiEffect,
    callEffect,
  };
}
