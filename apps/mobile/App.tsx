import { useEffect, useState } from "react";
import { LinearGradient } from "expo-linear-gradient";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { ErrorBoundary } from "./src/components/ErrorBoundary";
import { DemoGameScreen } from "./src/screens/DemoGameScreen";
import { LoginScreen } from "./src/screens/LoginScreen";
import { LobbyScreen } from "./src/screens/LobbyScreen";
import { GameTableScreen } from "./src/screens/GameTableScreen";
import { LegalScreen } from "./src/screens/LegalScreen";
import { ProfileScreen } from "./src/screens/ProfileScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { ReplayScreen } from "./src/screens/ReplayScreen";
import { useAuthStore } from "./src/stores/auth-store";
import { config } from "./src/config";
import { registerForPushNotifications } from "./src/utils/notifications";

type Screen =
  | { type: "menu" }
  | { type: "demo" }
  | { type: "login" }
  | { type: "lobby" }
  | { type: "game"; roomId: string }
  | { type: "privacy" }
  | { type: "terms" }
  | { type: "profile" }
  | { type: "settings" }
  | { type: "replay"; roomId: string };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ type: "menu" });
  const { isLoggedIn, isLoading, init, logout } = useAuthStore();

  useEffect(() => {
    init();
  }, []);

  // Register push notifications after login
  useEffect(() => {
    if (isLoggedIn) {
      registerForPushNotifications();
    }
  }, [isLoggedIn]);

  const handleOnlinePress = () => {
    if (isLoggedIn) {
      setScreen({ type: "lobby" });
    } else {
      setScreen({ type: "login" });
    }
  };

  const handleProfilePress = () => {
    if (isLoggedIn) {
      setScreen({ type: "profile" });
    } else {
      setScreen({ type: "login" });
    }
  };

  const handleLogout = async () => {
    await logout();
    setScreen({ type: "menu" });
  };

  // After login, go to lobby
  useEffect(() => {
    if (screen.type === "login" && isLoggedIn) {
      setScreen({ type: "lobby" });
    }
  }, [isLoggedIn, screen.type]);

  return (
    <ErrorBoundary>
      {(() => {
        switch (screen.type) {
          case "demo":
            return (
              <View style={styles.container}>
                <DemoGameScreen onBack={() => setScreen({ type: "menu" })} />
                <StatusBar style="light" hidden />
              </View>
            );
          case "login":
            return (
              <LoginScreen onBack={() => setScreen({ type: "menu" })} />
            );
          case "lobby":
            return (
              <LobbyScreen
                onBack={() => setScreen({ type: "menu" })}
                onJoinRoom={(roomId) => setScreen({ type: "game", roomId })}
              />
            );
          case "game":
            return (
              <GameTableScreen
                roomId={screen.roomId}
                onBack={() => setScreen({ type: "lobby" })}
              />
            );
          case "privacy":
            return (
              <LegalScreen
                type="privacy"
                onBack={() => setScreen({ type: "menu" })}
              />
            );
          case "terms":
            return (
              <LegalScreen
                type="terms"
                onBack={() => setScreen({ type: "menu" })}
              />
            );
          case "profile":
            return (
              <ProfileScreen
                onBack={() => setScreen({ type: "menu" })}
                onReplay={(roomId) => setScreen({ type: "replay", roomId })}
              />
            );
          case "replay":
            return (
              <ReplayScreen
                roomId={screen.roomId}
                onBack={() => setScreen({ type: "profile" })}
              />
            );
          case "settings":
            return (
              <SettingsScreen
                onBack={() => setScreen({ type: "menu" })}
                onLogout={handleLogout}
                onPrivacy={() => setScreen({ type: "privacy" })}
                onTerms={() => setScreen({ type: "terms" })}
              />
            );
          default:
            return (
              <MainMenu
                onStartDemo={() => setScreen({ type: "demo" })}
                onOnline={handleOnlinePress}
                onProfile={handleProfilePress}
                onSettings={() => setScreen({ type: "settings" })}
                onPrivacy={() => setScreen({ type: "privacy" })}
                onTerms={() => setScreen({ type: "terms" })}
                isAuthLoading={isLoading}
                isLoggedIn={isLoggedIn}
                isStoreReviewMode={config.isStoreReviewMode}
              />
            );
        }
      })()}
    </ErrorBoundary>
  );
}

function MainMenu({
  onStartDemo,
  onOnline,
  onProfile,
  onSettings,
  onPrivacy,
  onTerms,
  isAuthLoading,
  isLoggedIn,
  isStoreReviewMode,
}: {
  onStartDemo: () => void;
  onOnline: () => void;
  onProfile: () => void;
  onSettings: () => void;
  onPrivacy: () => void;
  onTerms: () => void;
  isAuthLoading: boolean;
  isLoggedIn: boolean;
  isStoreReviewMode: boolean;
}) {
  return (
    <LinearGradient
      colors={["#0a1628", "#122440", "#1a3358"] as const}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />

        {/* Title */}
        <View style={styles.titleArea}>
          <Text style={styles.titleMain}>麻雀</Text>
          <Text style={styles.titleSub}>
            {isStoreReviewMode ? "アミューズメント麻雀" : "クローズド プラットフォーム"}
          </Text>
        </View>

        {/* Menu buttons */}
        <View style={styles.menuArea}>
          <TouchableOpacity style={styles.menuBtn} onPress={onStartDemo}>
            <View style={styles.menuIconContainer}>
              <Text style={styles.menuBtnIconText}>🀄</Text>
            </View>
            <View style={styles.menuBtnContent}>
              <Text style={styles.menuBtnTitle}>デモプレイ</Text>
              <Text style={styles.menuBtnDesc}>CPU対戦 (オフライン)</Text>
            </View>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>

          {!isStoreReviewMode && (
            <TouchableOpacity
              style={styles.menuBtn}
              onPress={onOnline}
              disabled={isAuthLoading}
            >
              <View style={styles.menuIconContainer}>
                {isAuthLoading ? (
                  <ActivityIndicator size="small" color="#1a7888" />
                ) : (
                  <Text style={styles.menuBtnIconText}>🌐</Text>
                )}
              </View>
              <View style={styles.menuBtnContent}>
                <Text style={styles.menuBtnTitle}>オンライン対局</Text>
                <Text style={styles.menuBtnDesc}>
                  クラブ内でリアルタイム対戦
                </Text>
              </View>
              <Text style={styles.menuArrow}>›</Text>
            </TouchableOpacity>
          )}

          {!isStoreReviewMode && (
            <TouchableOpacity
              style={styles.menuBtn}
              onPress={onProfile}
              disabled={isAuthLoading}
            >
              <View style={styles.menuIconContainer}>
                <Text style={styles.menuBtnIconText}>📊</Text>
              </View>
              <View style={styles.menuBtnContent}>
                <Text style={styles.menuBtnTitle}>戦績・プロフィール</Text>
                <Text style={styles.menuBtnDesc}>
                  {isLoggedIn ? "成績・ランキング確認" : "ログインして確認"}
                </Text>
              </View>
              <Text style={styles.menuArrow}>›</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.menuBtn} onPress={onSettings}>
            <View style={styles.menuIconContainer}>
              <Text style={styles.menuBtnIconText}>⚙️</Text>
            </View>
            <View style={styles.menuBtnContent}>
              <Text style={styles.menuBtnTitle}>設定</Text>
              <Text style={styles.menuBtnDesc}>ルール・表示設定</Text>
            </View>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Legal links */}
        <View style={styles.legalArea}>
          <TouchableOpacity onPress={onPrivacy}>
            <Text style={styles.legalLink}>プライバシーポリシー</Text>
          </TouchableOpacity>
          <Text style={styles.legalSeparator}>|</Text>
          <TouchableOpacity onPress={onTerms}>
            <Text style={styles.legalLink}>利用規約</Text>
          </TouchableOpacity>
        </View>

        {/* Version */}
        <Text style={styles.version}>v1.0.0</Text>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a1628",
  },
  safeArea: {
    flex: 1,
  },
  titleArea: {
    alignItems: "center",
    paddingTop: 60,
    paddingBottom: 40,
  },
  titleMain: {
    fontSize: 56,
    fontWeight: "900",
    color: "#ffd600",
    letterSpacing: 8,
    textShadowColor: "rgba(255,214,0,0.4)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 15,
  },
  titleSub: {
    fontSize: 15,
    color: "#6a8fa0",
    letterSpacing: 4,
    marginTop: 8,
  },
  menuArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 14,
  },
  menuBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(20, 40, 65, 0.9)",
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
    width: "100%",
    maxWidth: 380,
    gap: 14,
    borderWidth: 1,
    borderColor: "rgba(26, 120, 136, 0.4)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 5,
  },
  menuBtnDisabled: {
    opacity: 0.5,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  menuIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(26, 120, 136, 0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  menuIconDisabled: {
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  menuBtnIconText: {
    fontSize: 24,
  },
  menuBtnContent: {
    flex: 1,
  },
  menuBtnTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#e0f0f5",
  },
  menuBtnDesc: {
    fontSize: 12,
    color: "#6a8fa0",
    marginTop: 2,
  },
  menuArrow: {
    fontSize: 28,
    color: "#1a7888",
    fontWeight: "300",
  },
  textDisabled: {
    color: "#5a6a7a",
  },
  textMuted: {
    color: "#3a4a5a",
  },
  legalArea: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    paddingBottom: 4,
  },
  legalLink: {
    color: "#4a6a7a",
    fontSize: 11,
    textDecorationLine: "underline",
  },
  legalSeparator: {
    color: "#3a4a5a",
    fontSize: 11,
  },
  version: {
    color: "#2a3a4a",
    fontSize: 12,
    textAlign: "center",
    paddingBottom: 20,
  },
});
