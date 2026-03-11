import React, { useEffect, useRef } from "react";
import { View, Text, Animated, StyleSheet, Dimensions } from "react-native";

interface WinEffectProps {
  type: "tsumo" | "ron";
  visible: boolean;
  onFinish?: () => void;
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

/**
 * Dramatic win announcement overlay (tsumo/ron).
 * Shows large text with scale-in + flash + fade-out animation.
 */
export const WinEffect: React.FC<WinEffectProps> = ({
  type,
  visible,
  onFinish,
}) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(3)).current;
  const flashOpacity = useRef(new Animated.Value(0)).current;
  const lineWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      opacity.setValue(0);
      scale.setValue(3);
      return;
    }

    // Flash → scale in → hold → fade out
    Animated.sequence([
      // White flash
      Animated.timing(flashOpacity, {
        toValue: 0.7,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(flashOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      // Text scale in
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          friction: 6,
          tension: 80,
          useNativeDriver: true,
        }),
        Animated.timing(lineWidth, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
      // Hold
      Animated.delay(1200),
      // Fade out
      Animated.timing(opacity, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onFinish?.();
    });
  }, [visible]);

  if (!visible) return null;

  const isTsumo = type === "tsumo";
  const label = isTsumo ? "ツモ" : "ロン";
  const color = isTsumo ? "#FFD700" : "#FF1744";
  const shadowColor = isTsumo ? "#FF8F00" : "#B71C1C";

  return (
    <View style={styles.container} pointerEvents="none">
      {/* White flash overlay */}
      <Animated.View style={[styles.flash, { opacity: flashOpacity }]} />

      {/* Decorative line */}
      <Animated.View
        style={[
          styles.line,
          {
            opacity,
            transform: [{ scaleX: lineWidth }],
            backgroundColor: color,
          },
        ]}
      />

      {/* Win text */}
      <Animated.Text
        style={[
          styles.winText,
          {
            color,
            opacity,
            transform: [{ scale }],
            textShadowColor: shadowColor,
          },
        ]}
      >
        {label}
      </Animated.Text>

      {/* Bottom decorative line */}
      <Animated.View
        style={[
          styles.line,
          {
            opacity,
            transform: [{ scaleX: lineWidth }],
            backgroundColor: color,
            marginTop: 8,
          },
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
    zIndex: 100,
  },
  flash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#fff",
  },
  winText: {
    fontSize: 72,
    fontWeight: "900",
    letterSpacing: 16,
    textShadowOffset: { width: 3, height: 3 },
    textShadowRadius: 10,
  },
  line: {
    width: SCREEN_W * 0.6,
    height: 3,
    borderRadius: 2,
  },
});
