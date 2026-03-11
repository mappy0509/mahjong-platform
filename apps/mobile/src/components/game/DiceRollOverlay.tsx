import React, { useEffect, useRef, useState } from "react";
import { View, Text, Animated, StyleSheet } from "react-native";

interface DiceRollOverlayProps {
  visible: boolean;
  diceResult: [number, number];
  onFinish: () => void;
}

const DICE_FACES: Record<number, string> = {
  1: "\u2680",
  2: "\u2681",
  3: "\u2682",
  4: "\u2683",
  5: "\u2684",
  6: "\u2685",
};

/**
 * Dice roll animation overlay shown at the start of each round.
 * Shows two dice with a rolling animation then reveals the result.
 */
export function DiceRollOverlay({ visible, diceResult, onFinish }: DiceRollOverlayProps) {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const [rolling, setRolling] = useState(true);
  const [displayDice, setDisplayDice] = useState<[number, number]>([1, 1]);
  const rollInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!visible) {
      scaleAnim.setValue(0);
      opacityAnim.setValue(0);
      setRolling(true);
      return;
    }

    // Start rolling animation
    setRolling(true);
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 6,
        tension: 100,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();

    // Rapid dice face changes during roll
    rollInterval.current = setInterval(() => {
      setDisplayDice([
        Math.floor(Math.random() * 6) + 1,
        Math.floor(Math.random() * 6) + 1,
      ]);
    }, 80);

    // Stop rolling and show result after 1 second
    const stopTimer = setTimeout(() => {
      if (rollInterval.current) clearInterval(rollInterval.current);
      setRolling(false);
      setDisplayDice(diceResult);
    }, 1000);

    // Fade out after showing result
    const fadeTimer = setTimeout(() => {
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }).start(() => {
        onFinish();
      });
    }, 2000);

    return () => {
      if (rollInterval.current) clearInterval(rollInterval.current);
      clearTimeout(stopTimer);
      clearTimeout(fadeTimer);
    };
  }, [visible, diceResult]);

  if (!visible) return null;

  const total = displayDice[0] + displayDice[1];

  return (
    <Animated.View
      style={[
        styles.overlay,
        {
          opacity: opacityAnim,
        },
      ]}
    >
      <Animated.View
        style={[
          styles.container,
          {
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        <Text style={styles.title}>
          {rolling ? "\u30B5\u30A4\u30B3\u30ED..." : "\u30B5\u30A4\u30B3\u30ED\u7D50\u679C"}
        </Text>
        <View style={styles.diceRow}>
          <View style={[styles.die, rolling && styles.dieRolling]}>
            <Text style={styles.dieText}>{DICE_FACES[displayDice[0]]}</Text>
          </View>
          <View style={[styles.die, rolling && styles.dieRolling]}>
            <Text style={styles.dieText}>{DICE_FACES[displayDice[1]]}</Text>
          </View>
        </View>
        {!rolling && (
          <Text style={styles.totalText}>{total}</Text>
        )}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.7)",
    zIndex: 100,
  },
  container: {
    backgroundColor: "rgba(20, 35, 55, 0.95)",
    borderRadius: 16,
    paddingVertical: 24,
    paddingHorizontal: 40,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#ffd600",
    shadowColor: "#ffd600",
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 20,
  },
  title: {
    color: "#ffd600",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 16,
    letterSpacing: 2,
  },
  diceRow: {
    flexDirection: "row",
    gap: 20,
  },
  die: {
    width: 60,
    height: 60,
    backgroundColor: "#fff",
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  dieRolling: {
    backgroundColor: "#ffe082",
  },
  dieText: {
    fontSize: 40,
    color: "#333",
  },
  totalText: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "900",
    marginTop: 12,
    textShadowColor: "rgba(255, 214, 0, 0.6)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
});
