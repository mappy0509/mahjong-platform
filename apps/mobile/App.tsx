import { useEffect, useState } from "react";
import { View, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as ScreenOrientation from "expo-screen-orientation";
import { ErrorBoundary } from "./src/components/ErrorBoundary";
import { DemoGameScreen } from "./src/screens/DemoGameScreen";
import { LobbyScreen } from "./src/screens/LobbyScreen";
import { GameTableScreen } from "./src/screens/GameTableScreen";
import { LegalScreen } from "./src/screens/LegalScreen";
import { ProfileScreen } from "./src/screens/ProfileScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { ReplayScreen } from "./src/screens/ReplayScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { useAuthStore } from "./src/stores/auth-store";
import { registerForPushNotifications } from "./src/utils/notifications";

type Screen =
  | { type: "menu" }
  | { type: "demo" }
  | { type: "lobby" }
  | { type: "game"; roomId: string }
  | { type: "privacy" }
  | { type: "terms" }
  | { type: "profile" }
  | { type: "settings" }
  | { type: "replay"; roomId: string };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ type: "menu" });
  const { isLoggedIn, init, logout } = useAuthStore();

  useEffect(() => {
    init();
  }, []);

  // Lock orientation to landscape
  useEffect(() => {
    const lockOrientation = async () => {
      try {
        await ScreenOrientation.lockAsync(
          ScreenOrientation.OrientationLock.LANDSCAPE
        );
      } catch (e) {
        // Orientation lock not available (some web browsers)
        console.log("Orientation lock not available:", e);
      }
    };
    lockOrientation();
  }, []);

  // Register push notifications after login
  useEffect(() => {
    if (isLoggedIn) {
      registerForPushNotifications();
    }
  }, [isLoggedIn]);

  const handleLogout = async () => {
    await logout();
    setScreen({ type: "menu" });
  };

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
              <HomeScreen
                onStartDemo={() => setScreen({ type: "demo" })}
                onOnline={() => setScreen({ type: "lobby" })}
                onProfile={() => setScreen({ type: "profile" })}
                onSettings={() => setScreen({ type: "settings" })}
                onPrivacy={() => setScreen({ type: "privacy" })}
                onTerms={() => setScreen({ type: "terms" })}
                onJoinClubAndOpenLobby={() => setScreen({ type: "lobby" })}
              />
            );
        }
      })()}
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a1628",
  },
});
