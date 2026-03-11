import React, { useEffect, useRef } from "react";
import { View, Text, Animated, StyleSheet } from "react-native";

interface AnimatedTimerProps {
  remainingMs: number;
  totalMs: number;
  isMyTurn: boolean;
}

/**
 * Animated circular timer with color transitions.
 * Green → Yellow → Red as time decreases.
 * Pulses when urgent (< 5 seconds).
 */
export const AnimatedTimer: React.FC<AnimatedTimerProps> = ({
  remainingMs,
  totalMs,
  isMyTurn,
}) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseRef = useRef<Animated.CompositeAnimation | null>(null);

  const seconds = Math.ceil(remainingMs / 1000);
  const ratio = totalMs > 0 ? remainingMs / totalMs : 1;

  const isUrgent = seconds <= 5 && isMyTurn;

  useEffect(() => {
    if (isUrgent) {
      pulseRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
        ])
      );
      pulseRef.current.start();
    } else {
      pulseRef.current?.stop();
      pulseAnim.setValue(1);
    }

    return () => {
      pulseRef.current?.stop();
    };
  }, [isUrgent]);

  // Color based on time ratio
  let bgColor: string;
  let textColor: string;
  if (ratio > 0.5) {
    bgColor = "rgba(76, 175, 80, 0.3)";
    textColor = "#81C784";
  } else if (ratio > 0.25) {
    bgColor = "rgba(255, 193, 7, 0.3)";
    textColor = "#FFD54F";
  } else {
    bgColor = "rgba(244, 67, 54, 0.4)";
    textColor = "#EF5350";
  }

  if (!isMyTurn) {
    bgColor = "rgba(255,255,255,0.1)";
    textColor = "rgba(255,255,255,0.5)";
  }

  // Progress arc using border trick
  const borderWidth = 3;
  const size = 44;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bgColor,
          borderColor: textColor,
          borderWidth,
          transform: [{ scale: pulseAnim }],
        },
      ]}
    >
      <Text
        style={[
          styles.text,
          {
            color: textColor,
            fontSize: isUrgent ? 20 : 18,
            fontWeight: isUrgent ? "900" : "700",
          },
        ]}
      >
        {seconds}
      </Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: "center",
    alignItems: "center",
  },
  text: {
    textAlign: "center",
  },
});
