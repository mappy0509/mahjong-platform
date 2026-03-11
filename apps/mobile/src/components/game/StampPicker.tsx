import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
} from "react-native";
import type { StampId } from "@mahjong/shared";
import { STAMP_LIST } from "@mahjong/shared";

const { width: SCREEN_W } = Dimensions.get("window");

interface StampPickerProps {
  onSend: (stampId: StampId) => void;
}

/**
 * Stamp picker button + expandable grid.
 * Tap the chat icon to open, tap a stamp to send.
 */
export const StampPicker: React.FC<StampPickerProps> = ({ onSend }) => {
  const [open, setOpen] = useState(false);
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: open ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [open]);

  const handleSend = (stampId: StampId) => {
    onSend(stampId);
    setOpen(false);
  };

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [80, 0],
  });

  return (
    <View style={styles.wrapper}>
      {/* Stamp grid */}
      {open && (
        <Animated.View
          style={[
            styles.grid,
            {
              opacity: slideAnim,
              transform: [{ translateY }],
            },
          ]}
        >
          {STAMP_LIST.map((stamp) => (
            <TouchableOpacity
              key={stamp.id}
              style={styles.stampBtn}
              onPress={() => handleSend(stamp.id)}
              activeOpacity={0.7}
            >
              <Text style={styles.stampEmoji}>{stamp.emoji}</Text>
              <Text style={styles.stampLabel}>{stamp.label}</Text>
            </TouchableOpacity>
          ))}
        </Animated.View>
      )}

      {/* Toggle button */}
      <TouchableOpacity
        style={[styles.toggleBtn, open && styles.toggleBtnActive]}
        onPress={() => setOpen(!open)}
        activeOpacity={0.7}
      >
        <Text style={styles.toggleText}>{open ? "\u2715" : "\ud83d\udcac"}</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    bottom: 70,
    right: 8,
    zIndex: 15,
    alignItems: "flex-end",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    width: Math.min(SCREEN_W * 0.45, 260),
    backgroundColor: "rgba(10, 22, 40, 0.95)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    padding: 6,
    marginBottom: 6,
    justifyContent: "center",
  },
  stampBtn: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    margin: 2,
  },
  stampEmoji: {
    fontSize: 22,
  },
  stampLabel: {
    fontSize: 8,
    color: "rgba(255,255,255,0.6)",
    marginTop: 1,
  },
  toggleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(26, 120, 136, 0.8)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(32, 160, 176, 0.6)",
  },
  toggleBtnActive: {
    backgroundColor: "rgba(198, 40, 40, 0.8)",
    borderColor: "rgba(244, 67, 54, 0.6)",
  },
  toggleText: {
    fontSize: 18,
    color: "#fff",
  },
});
