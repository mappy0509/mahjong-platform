import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { TileId } from "@mahjong/shared";

export type TileSize = "xs" | "sm" | "md" | "lg";

interface TileViewProps {
  tileId: TileId;
  onPress?: () => void;
  selected?: boolean;
  size?: TileSize;
  faceDown?: boolean;
  rotated?: boolean;
  highlighted?: boolean;
  dimmed?: boolean;
}

// ===== Size Presets =====

interface SizePreset {
  w: number;
  h: number;
  r: number;
  depth: number; // 3D depth
  font: number;
  subFont: number;
  circle: number;
  cBorder: number;
  cGap: number;
  bigCircle: number;
  stickW: number;
  stickH: number;
  sGap: number;
}

const SIZES: Record<TileSize, SizePreset> = {
  xs: {
    w: 22, h: 30, r: 2, depth: 2,
    font: 11, subFont: 7,
    circle: 5, cBorder: 0.8, cGap: 1, bigCircle: 14,
    stickW: 3, stickH: 8, sGap: 1,
  },
  sm: {
    w: 30, h: 42, r: 3, depth: 2,
    font: 14, subFont: 9,
    circle: 7, cBorder: 1, cGap: 1, bigCircle: 20,
    stickW: 4, stickH: 11, sGap: 1,
  },
  md: {
    w: 38, h: 54, r: 3, depth: 3,
    font: 18, subFont: 12,
    circle: 9, cBorder: 1.5, cGap: 2, bigCircle: 24,
    stickW: 5, stickH: 14, sGap: 2,
  },
  lg: {
    w: 48, h: 68, r: 4, depth: 4,
    font: 22, subFont: 14,
    circle: 11, cBorder: 2, cGap: 2, bigCircle: 30,
    stickW: 6, stickH: 17, sGap: 2,
  },
};

// ===== Constants =====

const RED_TILES = new Set([16, 52, 88]);
const MAN_NUMS = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];

const PIN_ROWS: Record<number, number[]> = {
  1: [1],
  2: [1, 1],
  3: [1, 1, 1],
  4: [2, 2],
  5: [2, 1, 2],
  6: [2, 2, 2],
  7: [3, 1, 3],
  8: [3, 2, 3],
  9: [3, 3, 3],
};

const SOU_ROWS: Record<number, number[]> = {
  2: [2],
  3: [3],
  4: [2, 2],
  5: [3, 2],
  6: [3, 3],
  7: [4, 3],
  8: [4, 4],
  9: [3, 3, 3],
};

function tileKindFromId(id: number): number {
  return Math.floor(id / 4);
}

// ============================================================
//  3D TILE VIEW COMPONENT
// ============================================================

export function TileView({
  tileId,
  onPress,
  selected = false,
  size = "md",
  faceDown = false,
  rotated = false,
  highlighted = false,
  dimmed = false,
}: TileViewProps) {
  const kind = tileKindFromId(tileId);
  const isRed = RED_TILES.has(tileId);
  const sz = SIZES[size];

  const tileW = rotated ? sz.h : sz.w;
  const tileH = rotated ? sz.w : sz.h;

  let content: React.ReactNode;
  if (faceDown) {
    content = <BackFace sz={sz} />;
  } else if (kind < 9) {
    content = <ManFace number={kind + 1} isRed={isRed} sz={sz} />;
  } else if (kind < 18) {
    content = <PinFace number={kind - 9 + 1} isRed={isRed} sz={sz} />;
  } else if (kind < 27) {
    content = <SouFace number={kind - 18 + 1} isRed={isRed} sz={sz} />;
  } else {
    content = <HonorFace kind={kind} sz={sz} />;
  }

  const isActive = selected || highlighted;
  const depth = sz.depth;

  const tile = (
    <View
      style={{
        width: tileW + depth,
        height: tileH + depth,
        marginHorizontal: 1,
        transform: [{ translateY: selected ? -10 : 0 }],
        opacity: dimmed ? 0.5 : 1,
      }}
    >
      {/* 3D side — bottom edge (darkest) */}
      <View
        style={{
          position: "absolute",
          bottom: 0,
          left: depth,
          right: 0,
          height: tileH,
          borderRadius: sz.r,
          backgroundColor: faceDown ? "#082830" : "#9a9080",
        }}
      />

      {/* 3D side — right edge */}
      <View
        style={{
          position: "absolute",
          top: depth,
          right: 0,
          width: tileW,
          height: tileH,
          borderRadius: sz.r,
          backgroundColor: faceDown ? "#0c3840" : "#b8b0a0",
        }}
      />

      {/* Top face */}
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: tileW,
          height: tileH,
          borderRadius: sz.r,
          overflow: "hidden",
          borderWidth: faceDown ? 1 : 0.8,
          borderColor: faceDown
            ? "#0a3a4a"
            : isActive
              ? "#ff9800"
              : "#b0a590",
          ...Platform.select({
            web: {
              boxShadow: isActive
                ? "0 0 10px rgba(255,152,0,0.5)"
                : "1px 2px 4px rgba(0,0,0,0.35)",
            },
            default: {},
          }),
          ...(isActive
            ? {
                shadowColor: "#ff9800",
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.5,
                shadowRadius: 6,
              }
            : {
                shadowColor: "#000",
                shadowOffset: { width: 1, height: 2 },
                shadowOpacity: 0.25,
                shadowRadius: 2,
              }),
          elevation: isActive ? 8 : 4,
        }}
      >
        <LinearGradient
          colors={
            faceDown
              ? (["#1a7888", "#0e5565"] as const)
              : isActive
                ? (["#fffff0", "#f5f0e0"] as const)
                : (["#faf8f0", "#f0ece0", "#e8e2d2"] as const)
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 0.7, y: 1 }}
          style={faceStyles.gradient}
        >
          {content}

          {/* Specular highlight — top-left shine */}
          {!faceDown && (
            <LinearGradient
              colors={[
                "rgba(255,255,255,0.55)",
                "rgba(255,255,255,0.12)",
                "transparent",
              ] as const}
              start={{ x: 0, y: 0 }}
              end={{ x: 0.6, y: 0.5 }}
              style={faceStyles.specular}
              pointerEvents="none"
            />
          )}

          {/* Inner border frame for face-up tiles */}
          {!faceDown && (
            <View
              style={{
                position: "absolute",
                top: Math.max(1.5, sz.w * 0.07),
                left: Math.max(1.5, sz.w * 0.07),
                right: Math.max(1.5, sz.w * 0.07),
                bottom: Math.max(1.5, sz.w * 0.07),
                borderWidth: 0.5,
                borderColor: "rgba(170,160,140,0.35)",
                borderRadius: Math.max(1, sz.r - 1),
              }}
              pointerEvents="none"
            />
          )}

          {/* Red dora indicator */}
          {isRed && !faceDown && (
            <View
              style={{
                position: "absolute",
                width: Math.max(4, sz.w * 0.12),
                height: Math.max(4, sz.w * 0.12),
                borderRadius: Math.max(2, sz.w * 0.06),
                backgroundColor: "#ff1744",
                top: 2,
                right: 2,
                borderWidth: 0.5,
                borderColor: "#b71c1c",
              }}
            />
          )}
        </LinearGradient>
      </View>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
        {tile}
      </TouchableOpacity>
    );
  }
  return tile;
}

// ============================================================
//  BACK TILE (standalone face-down tile)
// ============================================================

export function BackTile({ size = "sm" }: { size?: TileSize }) {
  const sz = SIZES[size];
  const depth = sz.depth;

  return (
    <View
      style={{
        width: sz.w + depth,
        height: sz.h + depth,
        marginHorizontal: 1,
      }}
    >
      {/* 3D bottom */}
      <View
        style={{
          position: "absolute",
          bottom: 0,
          left: depth,
          right: 0,
          height: sz.h,
          borderRadius: sz.r,
          backgroundColor: "#082830",
        }}
      />
      {/* 3D right */}
      <View
        style={{
          position: "absolute",
          top: depth,
          right: 0,
          width: sz.w,
          height: sz.h,
          borderRadius: sz.r,
          backgroundColor: "#0c3840",
        }}
      />
      {/* Face */}
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: sz.w,
          height: sz.h,
          borderRadius: sz.r,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: "#0a3a4a",
          shadowColor: "#000",
          shadowOffset: { width: 1, height: 2 },
          shadowOpacity: 0.35,
          shadowRadius: 2,
          elevation: 4,
        }}
      >
        <LinearGradient
          colors={["#1a7888", "#0e5565"] as const}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={faceStyles.gradient}
        >
          <BackFace sz={sz} />
        </LinearGradient>
      </View>
    </View>
  );
}

// ============================================================
//  TILE FACE COMPONENTS
// ============================================================

// ----- 萬子 (Man / Characters) -----

function ManFace({
  number,
  isRed,
  sz,
}: {
  number: number;
  isRed: boolean;
  sz: SizePreset;
}) {
  const numColor = isRed ? "#ff1744" : "#c41e3a";
  const kanjiColor = isRed ? "#ff1744" : "#1a1a1a";

  return (
    <View style={faceStyles.center}>
      <Text
        style={{
          fontSize: sz.font * 1.15,
          fontWeight: "900",
          color: numColor,
          lineHeight: sz.font * 1.25,
          textAlign: "center",
          textShadowColor: "rgba(0,0,0,0.12)",
          textShadowOffset: { width: 0.5, height: 0.5 },
          textShadowRadius: 0.5,
        }}
      >
        {MAN_NUMS[number - 1]}
      </Text>
      <Text
        style={{
          fontSize: sz.subFont,
          fontWeight: "800",
          color: kanjiColor,
          lineHeight: sz.subFont * 1.15,
          textAlign: "center",
          marginTop: -1,
          textShadowColor: "rgba(0,0,0,0.08)",
          textShadowOffset: { width: 0.5, height: 0.5 },
          textShadowRadius: 0.5,
        }}
      >
        萬
      </Text>
    </View>
  );
}

// ----- 筒子 (Pin / Circles) — ornate flower-ring design -----

function PinCircle({
  d,
  bw,
  isRed,
}: {
  d: number;
  bw: number;
  isRed: boolean;
}) {
  const outerColor = isRed ? "#c62828" : "#00695c";
  const petalColor = isRed ? "#ff8a80" : "#80cbc4";
  const coreColor = isRed ? "#ff1744" : "#d32f2f";

  return (
    <View
      style={{
        width: d,
        height: d,
        borderRadius: d / 2,
        backgroundColor: outerColor,
        borderWidth: bw,
        borderColor: outerColor,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Inner petal ring */}
      <View
        style={{
          width: d * 0.62,
          height: d * 0.62,
          borderRadius: (d * 0.62) / 2,
          backgroundColor: petalColor,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Core dot */}
        <View
          style={{
            width: d * 0.28,
            height: d * 0.28,
            borderRadius: (d * 0.28) / 2,
            backgroundColor: coreColor,
          }}
        />
      </View>
    </View>
  );
}

function PinFace({
  number,
  isRed,
  sz,
}: {
  number: number;
  isRed: boolean;
  sz: SizePreset;
}) {
  // 1-pin: large concentric circle with ornate pattern
  if (number === 1) {
    const d = sz.bigCircle;
    const outerColor = isRed ? "#c62828" : "#00695c";
    const midColor = isRed ? "#ff8a80" : "#80cbc4";
    const innerColor = isRed ? "#ff1744" : "#d32f2f";
    const bw = Math.max(2, d * 0.1);

    return (
      <View style={faceStyles.center}>
        <View
          style={{
            width: d,
            height: d,
            borderRadius: d / 2,
            backgroundColor: outerColor,
            borderWidth: bw,
            borderColor: outerColor,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* Petal / mid ring */}
          <View
            style={{
              width: d * 0.68,
              height: d * 0.68,
              borderRadius: (d * 0.68) / 2,
              backgroundColor: midColor,
              borderWidth: Math.max(1, bw * 0.5),
              borderColor: outerColor,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {/* Inner core */}
            <View
              style={{
                width: d * 0.38,
                height: d * 0.38,
                borderRadius: (d * 0.38) / 2,
                backgroundColor: innerColor,
                borderWidth: Math.max(0.5, bw * 0.3),
                borderColor: outerColor,
              }}
            />
          </View>
        </View>
      </View>
    );
  }

  const rows = PIN_ROWS[number];
  const d = sz.circle;
  const bw = sz.cBorder;

  return (
    <View style={faceStyles.spread}>
      {rows.map((count, ri) => (
        <View
          key={ri}
          style={{
            flexDirection: "row",
            justifyContent: "center",
            gap: sz.cGap,
          }}
        >
          {Array.from({ length: count }).map((_, ci) => (
            <PinCircle key={ci} d={d} bw={bw} isRed={isRed} />
          ))}
        </View>
      ))}
    </View>
  );
}

// ----- 索子 (Sou / Bamboo) — detailed sticks with joints -----

function BambooStick({
  w,
  h,
  isRed,
}: {
  w: number;
  h: number;
  isRed: boolean;
}) {
  const baseColor = isRed ? "#ff1744" : "#2e7d32";
  const lightColor = isRed ? "#ff5252" : "#43a047";
  const darkColor = isRed ? "#c62828" : "#1b5e20";
  const jointH = Math.max(1, h * 0.06);

  return (
    <View
      style={{
        width: w,
        height: h,
        borderRadius: w * 0.3,
        backgroundColor: baseColor,
        overflow: "hidden",
      }}
    >
      {/* Highlight stripe */}
      <View
        style={{
          position: "absolute",
          left: w * 0.2,
          top: 0,
          bottom: 0,
          width: w * 0.25,
          backgroundColor: lightColor,
          opacity: 0.4,
        }}
      />
      {/* Top cap */}
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: Math.max(1, h * 0.1),
          backgroundColor: darkColor,
          borderTopLeftRadius: w * 0.3,
          borderTopRightRadius: w * 0.3,
        }}
      />
      {/* Bottom cap */}
      <View
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: Math.max(1, h * 0.1),
          backgroundColor: darkColor,
          borderBottomLeftRadius: w * 0.3,
          borderBottomRightRadius: w * 0.3,
        }}
      />
      {/* Joint node 1 */}
      <View
        style={{
          position: "absolute",
          top: Math.floor(h * 0.33),
          left: 0,
          right: 0,
          height: jointH,
          backgroundColor: darkColor,
        }}
      />
      {/* Joint node 2 */}
      <View
        style={{
          position: "absolute",
          top: Math.floor(h * 0.6),
          left: 0,
          right: 0,
          height: jointH,
          backgroundColor: darkColor,
        }}
      />
    </View>
  );
}

function SouFace({
  number,
  isRed,
  sz,
}: {
  number: number;
  isRed: boolean;
  sz: SizePreset;
}) {
  if (number === 1) {
    return <Sou1Face isRed={isRed} sz={sz} />;
  }

  const rows = SOU_ROWS[number];
  return (
    <View style={faceStyles.spread}>
      {rows.map((count, ri) => (
        <View
          key={ri}
          style={{
            flexDirection: "row",
            justifyContent: "center",
            gap: sz.sGap,
          }}
        >
          {Array.from({ length: count }).map((_, ci) => (
            <BambooStick key={ci} w={sz.stickW} h={sz.stickH} isRed={isRed} />
          ))}
        </View>
      ))}
    </View>
  );
}

// 1索 — Stylized bird (peacock/crane)
function Sou1Face({
  isRed,
  sz,
}: {
  isRed: boolean;
  sz: SizePreset;
}) {
  const mainColor = isRed ? "#ff1744" : "#2e7d32";
  const darkColor = isRed ? "#c62828" : "#1b5e20";
  const bodyW = Math.max(10, sz.w * 0.5);
  const bodyH = Math.max(16, sz.h * 0.65);

  return (
    <View style={faceStyles.center}>
      <View style={{ width: bodyW, height: bodyH, alignItems: "center" }}>
        {/* Head */}
        <View
          style={{
            width: bodyW * 0.4,
            height: bodyW * 0.4,
            borderRadius: bodyW * 0.2,
            backgroundColor: mainColor,
            borderWidth: Math.max(0.5, bodyW * 0.04),
            borderColor: darkColor,
            marginBottom: -bodyW * 0.06,
            zIndex: 2,
          }}
        />
        {/* Neck */}
        <View
          style={{
            width: bodyW * 0.18,
            height: bodyH * 0.1,
            backgroundColor: mainColor,
            borderLeftWidth: 0.5,
            borderRightWidth: 0.5,
            borderColor: darkColor,
            zIndex: 1,
          }}
        />
        {/* Body — oval */}
        <View
          style={{
            width: bodyW,
            height: bodyH * 0.55,
            borderRadius: bodyW / 2,
            backgroundColor: mainColor,
            borderWidth: Math.max(1, bodyW * 0.06),
            borderColor: darkColor,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* Eye spot */}
          <View
            style={{
              width: bodyW * 0.28,
              height: bodyW * 0.28,
              borderRadius: bodyW * 0.14,
              backgroundColor: "#fff",
              borderWidth: Math.max(0.5, bodyW * 0.04),
              borderColor: darkColor,
              marginTop: -bodyH * 0.02,
            }}
          />
          {/* Feather lines */}
          {[0.5, 0.4, 0.3].map((ratio, i) => (
            <View
              key={i}
              style={{
                marginTop: bodyH * 0.04,
                width: bodyW * ratio,
                height: Math.max(1, bodyH * 0.025),
                backgroundColor: darkColor,
                borderRadius: 1,
              }}
            />
          ))}
        </View>
        {/* Feet */}
        <View
          style={{
            flexDirection: "row",
            gap: bodyW * 0.15,
            marginTop: -1,
          }}
        >
          <View
            style={{
              width: Math.max(1, bodyW * 0.06),
              height: bodyH * 0.08,
              backgroundColor: darkColor,
            }}
          />
          <View
            style={{
              width: Math.max(1, bodyW * 0.06),
              height: bodyH * 0.08,
              backgroundColor: darkColor,
            }}
          />
        </View>
      </View>
    </View>
  );
}

// ----- 字牌 (Honor Tiles) -----

function HonorFace({ kind, sz }: { kind: number; sz: SizePreset }) {
  // 白 (Haku / White Dragon) — subtle blue bordered rectangle
  if (kind === 31) {
    const boxW = Math.max(10, sz.w * 0.55);
    const boxH = Math.max(14, sz.h * 0.5);
    const bw = Math.max(1.5, boxW * 0.08);
    return (
      <View style={faceStyles.center}>
        <View
          style={{
            width: boxW,
            height: boxH,
            borderWidth: bw,
            borderColor: "#5c6bc0",
            borderRadius: 2,
            backgroundColor: "transparent",
          }}
        />
      </View>
    );
  }

  // 發 (Hatsu / Green Dragon)
  if (kind === 32) {
    return (
      <View style={faceStyles.center}>
        <Text
          style={{
            fontSize: sz.font * 1.3,
            fontWeight: "900",
            color: "#1b5e20",
            textAlign: "center",
            textShadowColor: "rgba(0,0,0,0.12)",
            textShadowOffset: { width: 0.5, height: 0.5 },
            textShadowRadius: 1,
          }}
        >
          發
        </Text>
      </View>
    );
  }

  // 中 (Chun / Red Dragon) — with red border box
  if (kind === 33) {
    return (
      <View style={faceStyles.center}>
        <View
          style={{
            borderWidth: Math.max(1.5, sz.w * 0.04),
            borderColor: "#c62828",
            borderRadius: 2,
            paddingHorizontal: sz.w * 0.05,
            paddingVertical: sz.h * 0.005,
          }}
        >
          <Text
            style={{
              fontSize: sz.font * 1.2,
              fontWeight: "900",
              color: "#c62828",
              textAlign: "center",
              textShadowColor: "rgba(0,0,0,0.08)",
              textShadowOffset: { width: 0.5, height: 0.5 },
              textShadowRadius: 0.5,
            }}
          >
            中
          </Text>
        </View>
      </View>
    );
  }

  // 風牌 (Winds): 27=東, 28=南, 29=西, 30=北
  const windChars = ["東", "南", "西", "北"];
  const char = windChars[kind - 27] || "?";

  return (
    <View style={faceStyles.center}>
      <Text
        style={{
          fontSize: sz.font * 1.3,
          fontWeight: "900",
          color: "#1a1a2e",
          textAlign: "center",
          textShadowColor: "rgba(0,0,0,0.12)",
          textShadowOffset: { width: 0.5, height: 0.5 },
          textShadowRadius: 1,
        }}
      >
        {char}
      </Text>
    </View>
  );
}

// ----- Tile Back (face-down) -----

function BackFace({ sz }: { sz: SizePreset }) {
  return (
    <View style={faceStyles.center}>
      {/* Decorative diamond pattern */}
      <View
        style={{
          width: sz.w * 0.42,
          height: sz.h * 0.42,
          borderRadius: 2,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.25)",
          backgroundColor: "rgba(255,255,255,0.08)",
          transform: [{ rotate: "45deg" }],
        }}
      />
    </View>
  );
}

// ===== Shared face layout styles =====

const faceStyles = StyleSheet.create({
  gradient: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  specular: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "50%",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  spread: {
    flex: 1,
    alignItems: "center",
    justifyContent: "space-evenly",
    paddingVertical: 3,
  },
});
