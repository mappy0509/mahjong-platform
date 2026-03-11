import React, { useEffect, useRef } from "react";
import { View, Text, Animated, StyleSheet, Dimensions } from "react-native";

interface RiichiEffectProps {
  visible: boolean;
  playerName?: string;
  onFinish?: () => void;
}

const { width: SCREEN_W } = Dimensions.get("window");

/**
 * Riichi declaration effect.
 * Shows "リーチ!" with a dramatic horizontal sweep + glow.
 */
export const RiichiEffect: React.FC<RiichiEffectProps> = ({
  visible,
  playerName,
  onFinish,
}) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(-SCREEN_W)).current;
  const barScale = useRef(new Animated.Value(0)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      opacity.setValue(0);
      translateX.setValue(-SCREEN_W);
      return;
    }

    Animated.sequence([
      // Horizontal bar sweep
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(barScale, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]),
      // Text slides in
      Animated.spring(translateX, {
        toValue: 0,
        friction: 7,
        tension: 60,
        useNativeDriver: true,
      }),
      // Glow pulse
      Animated.sequence([
        Animated.timing(glowOpacity, {
          toValue: 0.6,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(glowOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]),
      // Hold
      Animated.delay(600),
      // Fade out
      Animated.timing(opacity, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onFinish?.();
    });
  }, [visible]);

  if (!visible) return null;

  return (
    <View style={styles.container} pointerEvents="none">
      {/* Orange glow background */}
      <Animated.View style={[styles.glow, { opacity: glowOpacity }]} />

      {/* Horizontal bar */}
      <Animated.View
        style={[styles.bar, { opacity, transform: [{ scaleX: barScale }] }]}
      />

      {/* Riichi text */}
      <Animated.View style={{ opacity, transform: [{ translateX }] }}>
        <Text style={styles.riichiText}>リーチ!</Text>
        {playerName && (
          <Text style={styles.playerName}>{playerName}</Text>
        )}
      </Animated.View>

      {/* Bottom bar */}
      <Animated.View
        style={[
          styles.bar,
          { opacity, transform: [{ scaleX: barScale }], marginTop: 4 },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 90,
  },
  glow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#FF6F00",
  },
  bar: {
    width: SCREEN_W * 0.8,
    height: 2,
    backgroundColor: "#FF9800",
    borderRadius: 1,
  },
  riichiText: {
    fontSize: 48,
    fontWeight: "900",
    color: "#FF9800",
    textAlign: "center",
    letterSpacing: 8,
    textShadowColor: "#E65100",
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 8,
    marginVertical: 4,
  },
  playerName: {
    fontSize: 16,
    color: "#FFE0B2",
    textAlign: "center",
    letterSpacing: 2,
  },
});
