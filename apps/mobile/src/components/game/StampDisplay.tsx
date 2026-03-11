import React, { useEffect, useRef, useState } from "react";
import { View, Text, Animated, StyleSheet } from "react-native";
import type { SeatIndex, StampId } from "@mahjong/shared";
import { STAMP_LIST } from "@mahjong/shared";

interface StampBubble {
  id: number;
  seat: SeatIndex;
  stampId: StampId;
}

interface StampDisplayProps {
  /** Current player's seat (bottom of screen) */
  mySeat: SeatIndex;
}

let nextBubbleId = 0;

/**
 * Overlay that shows stamp bubbles at the position of the player who sent it.
 * Usage: get ref and call ref.current.showStamp(seat, stampId)
 */
export interface StampDisplayRef {
  showStamp: (seat: SeatIndex, stampId: StampId) => void;
}

export const StampDisplay = React.forwardRef<StampDisplayRef, StampDisplayProps>(
  ({ mySeat }, ref) => {
    const [bubbles, setBubbles] = useState<StampBubble[]>([]);

    React.useImperativeHandle(ref, () => ({
      showStamp: (seat: SeatIndex, stampId: StampId) => {
        const bubble: StampBubble = {
          id: nextBubbleId++,
          seat,
          stampId,
        };
        setBubbles((prev) => [...prev, bubble]);
      },
    }));

    const removeBubble = (id: number) => {
      setBubbles((prev) => prev.filter((b) => b.id !== id));
    };

    return (
      <View style={styles.container} pointerEvents="none">
        {bubbles.map((bubble) => (
          <StampBubbleView
            key={bubble.id}
            bubble={bubble}
            mySeat={mySeat}
            onFinish={() => removeBubble(bubble.id)}
          />
        ))}
      </View>
    );
  }
);

interface BubbleViewProps {
  bubble: StampBubble;
  mySeat: SeatIndex;
  onFinish: () => void;
}

function StampBubbleView({ bubble, mySeat, onFinish }: BubbleViewProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.3)).current;
  const translateY = useRef(new Animated.Value(10)).current;

  const stamp = STAMP_LIST.find((s) => s.id === bubble.stampId);

  useEffect(() => {
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
        Animated.timing(translateY, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]),
      // Hold
      Animated.delay(1800),
      // Float up and fade out
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: -20,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      onFinish();
    });
  }, []);

  // Position based on relative seat
  const relSeat = ((bubble.seat - mySeat + 4) % 4) as SeatIndex;
  const posStyle = POSITION_STYLES[relSeat];

  if (!stamp) return null;

  return (
    <Animated.View
      style={[
        styles.bubble,
        posStyle,
        {
          opacity,
          transform: [{ scale }, { translateY }],
        },
      ]}
    >
      <Text style={styles.bubbleEmoji}>{stamp.emoji}</Text>
    </Animated.View>
  );
}

// Relative positions: 0=bottom(me), 1=right, 2=top, 3=left
const POSITION_STYLES: Record<SeatIndex, object> = {
  0: { bottom: 80, alignSelf: "center" },
  1: { right: 70, top: "45%" },
  2: { top: 30, alignSelf: "center" },
  3: { left: 70, top: "45%" },
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
  },
  bubble: {
    position: "absolute",
    backgroundColor: "rgba(10, 22, 40, 0.9)",
    borderRadius: 20,
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  bubbleEmoji: {
    fontSize: 26,
  },
});
