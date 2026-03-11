import { Audio } from "expo-av";

/**
 * Lightweight sound manager for mahjong game effects.
 * Plays sounds when available, silently skips if asset missing.
 */

type SoundName =
  | "discard"
  | "draw"
  | "pon"
  | "chi"
  | "kan"
  | "riichi"
  | "tsumo"
  | "ron"
  | "turn_warning"
  | "game_start";

// Map of loaded Sound objects
const soundCache = new Map<string, Audio.Sound>();
let initialized = false;
let muted = false;

export async function initSounds(): Promise<void> {
  if (initialized) return;
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    });
    initialized = true;
  } catch {
    // Audio not available (e.g. on web or simulator without audio)
  }
}

export function setMuted(value: boolean): void {
  muted = value;
}

export function isMuted(): boolean {
  return muted;
}

export async function playSound(name: SoundName): Promise<void> {
  if (muted || !initialized) return;

  try {
    // Use cached sound if available
    const cached = soundCache.get(name);
    if (cached) {
      await cached.setPositionAsync(0);
      await cached.playAsync();
      return;
    }

    // Try to load sound asset
    const asset = getSoundAsset(name);
    if (!asset) return;

    const { sound } = await Audio.Sound.createAsync(asset, {
      shouldPlay: true,
      volume: getVolume(name),
    });
    soundCache.set(name, sound);
  } catch {
    // Silently skip if sound can't be loaded
  }
}

export async function cleanup(): Promise<void> {
  for (const sound of soundCache.values()) {
    try {
      await sound.unloadAsync();
    } catch {
      // ignore
    }
  }
  soundCache.clear();
}

function getSoundAsset(name: SoundName): any {
  // Sound assets will be loaded when available
  // For now, return null - sounds are optional
  const assets: Record<string, any> = {
    // Uncomment as sound files are added to assets/sounds/:
    // discard: require("../../../assets/sounds/discard.mp3"),
    // draw: require("../../../assets/sounds/draw.mp3"),
    // pon: require("../../../assets/sounds/pon.mp3"),
    // chi: require("../../../assets/sounds/chi.mp3"),
    // kan: require("../../../assets/sounds/kan.mp3"),
    // riichi: require("../../../assets/sounds/riichi.mp3"),
    // tsumo: require("../../../assets/sounds/tsumo.mp3"),
    // ron: require("../../../assets/sounds/ron.mp3"),
    // turn_warning: require("../../../assets/sounds/turn_warning.mp3"),
    // game_start: require("../../../assets/sounds/game_start.mp3"),
  };
  return assets[name] ?? null;
}

function getVolume(name: SoundName): number {
  switch (name) {
    case "tsumo":
    case "ron":
      return 1.0;
    case "riichi":
      return 0.9;
    case "pon":
    case "chi":
    case "kan":
      return 0.8;
    case "discard":
    case "draw":
      return 0.5;
    case "turn_warning":
      return 0.6;
    case "game_start":
      return 0.7;
    default:
      return 0.5;
  }
}
