import React, { useEffect, useRef, useState } from "react";
import { View, Text, Animated, StyleSheet } from "react-native";
import { Wind } from "@mahjong/shared";

interface SeatDrawOverlayProps {
  visible: boolean;
  playerNames: string[];
  seatWinds: Wind[];
  onFinish: () => void;
}

const WIND_CHARS = ["\u6771", "\u5357", "\u897F", "\u5317"];
const WIND_COLORS = ["#ff5252", "#4caf50", "#2196f3", "#9c27b0"];

/**
 * Seat determination ceremony overlay shown at the start of a game.
 * Reveals each player's assigned wind seat with animation.
 */
export function SeatDrawOverlay({
  visible,
  playerNames,
  seatWinds,
  onFinish,
}: SeatDrawOverlayProps) {
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const [revealedCount, setRevealedCount] = useState(0);
  const cardAnims = useRef(
    [0, 1, 2, 3].map(() => new Animated.Value(0))
  ).current;

  useEffect(() => {
    if (!visible) {
      opacityAnim.setValue(0);
      setRevealedCount(0);
      cardAnims.forEach((a) => a.setValue(0));
      return;
    }

    // Fade in overlay
    Animated.timing(opacityAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();

    // Reveal cards one by one
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < 4; i++) {
      timers.push(
        setTimeout(() => {
          setRevealedCount(i + 1);
          Animated.spring(cardAnims[i], {
            toValue: 1,
            friction: 6,
            tension: 120,
            useNativeDriver: true,
          }).start();
        }, 400 + i * 500)
      );
    }

    // Fade out after all revealed
    timers.push(
      setTimeout(() => {
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }).start(() => {
          onFinish();
        });
      }, 3000)
    );

    return () => {
      timers.forEach(clearTimeout);
    };
  }, [visible, seatWinds]);

  if (!visible) return null;

  return (
    <Animated.View style={[styles.overlay, { opacity: opacityAnim }]}>
      <Text style={styles.title}>{"\u5834\u6C7A\u3081"}</Text>
      <View style={styles.cardGrid}>
        {[0, 1, 2, 3].map((seatIdx) => {
          const wind = seatWinds[seatIdx] ?? 0;
          const name = playerNames[seatIdx] ?? `P${seatIdx + 1}`;
          const revealed = seatIdx < revealedCount;

          return (
            <Animated.View
              key={seatIdx}
              style={[
                styles.card,
                {
                  transform: [
                    { scale: cardAnims[seatIdx] },
                    {
                      rotateY: cardAnims[seatIdx].interpolate({
                        inputRange: [0, 1],
                        outputRange: ["90deg", "0deg"],
                      }),
                    },
                  ],
                  borderColor: revealed
                    ? WIND_COLORS[wind]
                    : "rgba(255,255,255,0.2)",
                },
              ]}
            >
              {revealed ? (
                <>
                  <Text
                    style={[styles.windChar, { color: WIND_COLORS[wind] }]}
                  >
                    {WIND_CHARS[wind]}
                  </Text>
                  <Text style={styles.playerName} numberOfLines={1}>
                    {name}
                  </Text>
                  {wind === Wind.EAST && (
                    <View style={styles.dealerBadge}>
                      <Text style={styles.dealerText}>{"\u89AA"}</Text>
                    </View>
                  )}
                </>
              ) : (
                <Text style={styles.hiddenText}>?</Text>
              )}
            </Animated.View>
          );
        })}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.8)",
    zIndex: 100,
  },
  title: {
    color: "#ffd600",
    fontSize: 22,
    fontWeight: "900",
    marginBottom: 24,
    letterSpacing: 4,
    textShadowColor: "rgba(255, 214, 0, 0.5)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  cardGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 16,
    maxWidth: 400,
  },
  card: {
    width: 80,
    height: 110,
    backgroundColor: "rgba(20, 35, 55, 0.95)",
    borderRadius: 12,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 10,
  },
  windChar: {
    fontSize: 32,
    fontWeight: "900",
  },
  playerName: {
    color: "#ccc",
    fontSize: 11,
    marginTop: 6,
    maxWidth: 70,
    textAlign: "center",
  },
  dealerBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "#ffab00",
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  dealerText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "bold",
  },
  hiddenText: {
    color: "rgba(255,255,255,0.3)",
    fontSize: 36,
    fontWeight: "bold",
  },
});
