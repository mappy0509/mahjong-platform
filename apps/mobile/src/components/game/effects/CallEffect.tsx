import React, { useEffect, useRef } from "react";
import { View, Text, Animated, StyleSheet } from "react-native";

type CallType = "pon" | "chi" | "kan";

interface CallEffectProps {
  type: CallType;
  visible: boolean;
  onFinish?: () => void;
}

const CALL_CONFIG: Record<CallType, { label: string; color: string; shadow: string }> = {
  pon: { label: "ポン", color: "#2196F3", shadow: "#0D47A1" },
  chi: { label: "チー", color: "#4CAF50", shadow: "#1B5E20" },
  kan: { label: "カン", color: "#9C27B0", shadow: "#4A148C" },
};

/**
 * Call announcement effect (pon/chi/kan).
 * Brief scale-pop text with color-coded styling.
 */
export const CallEffect: React.FC<CallEffectProps> = ({
  type,
  visible,
  onFinish,
}) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    if (!visible) {
      opacity.setValue(0);
      scale.setValue(0.3);
      return;
    }

    const config = CALL_CONFIG[type];

    Animated.sequence([
      // Pop in
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          friction: 5,
          tension: 100,
          useNativeDriver: true,
        }),
      ]),
      // Hold
      Animated.delay(500),
      // Fade out
      Animated.timing(opacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onFinish?.();
    });
  }, [visible]);

  if (!visible) return null;

  const config = CALL_CONFIG[type];

  return (
    <View style={styles.container} pointerEvents="none">
      <Animated.Text
        style={[
          styles.callText,
          {
            color: config.color,
            textShadowColor: config.shadow,
            opacity,
            transform: [{ scale }],
          },
        ]}
      >
        {config.label}
      </Animated.Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 80,
  },
  callText: {
    fontSize: 56,
    fontWeight: "900",
    letterSpacing: 12,
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 8,
  },
});
