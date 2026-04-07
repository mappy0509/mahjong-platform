import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  SafeAreaView,
  Animated,
  Easing,
  Pressable,
  useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useAuthStore } from "../stores/auth-store";
import { supabase } from "../lib/supabase";

interface HomeScreenProps {
  onStartDemo: () => void;
  onOnline: () => void;
  onProfile: () => void;
  onSettings: () => void;
  onPrivacy: () => void;
  onTerms: () => void;
  onJoinClubAndOpenLobby: () => void;
}

interface ClubPreview {
  id: string;
  name: string;
  invite_code: string;
  description: string | null;
}

export function HomeScreen({
  onStartDemo,
  onOnline,
  onProfile,
  onSettings,
  onPrivacy,
  onTerms,
  onJoinClubAndOpenLobby,
}: HomeScreenProps) {
  const { isLoggedIn, isLoading, user, login, register, logout, error } = useAuthStore();
  const { width } = useWindowDimensions();
  const compact = width < 720;

  // Auth form state
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Club state (logged in)
  const [clubs, setClubs] = useState<ClubPreview[]>([]);
  const [clubsLoading, setClubsLoading] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [newClubName, setNewClubName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  // Floating tile animation
  const float1 = useRef(new Animated.Value(0)).current;
  const float2 = useRef(new Animated.Value(0)).current;
  const float3 = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const startFloat = (anim: Animated.Value, duration: number, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, {
            toValue: 1,
            duration,
            delay,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      ).start();
    startFloat(float1, 4200, 0);
    startFloat(float2, 5400, 600);
    startFloat(float3, 4800, 1200);

    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 2400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 2400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ]),
    ).start();
  }, []);

  useEffect(() => {
    if (isLoggedIn && user) {
      void loadClubs();
    } else {
      setClubs([]);
    }
  }, [isLoggedIn, user?.id]);

  const loadClubs = async () => {
    if (!user?.id) return;
    setClubsLoading(true);
    try {
      const { data } = await supabase
        .from("club_memberships")
        .select(`club_id, clubs:club_id (id, name, description, invite_code)`)
        .eq("user_id", user.id);
      setClubs(((data ?? []).map((m: any) => m.clubs).filter(Boolean)) as ClubPreview[]);
    } catch {
      setClubs([]);
    }
    setClubsLoading(false);
  };

  const validate = () => {
    if (!username.trim()) return "ユーザー名を入力してください";
    if (username.trim().length < 3) return "ユーザー名は3文字以上";
    if (!password) return "パスワードを入力してください";
    if (password.length < 6) return "パスワードは6文字以上";
    if (authMode === "register" && !displayName.trim())
      return "表示名を入力してください";
    return null;
  };

  const handleAuthSubmit = async () => {
    const v = validate();
    if (v) {
      setValidationError(v);
      return;
    }
    setValidationError(null);
    setIsSubmitting(true);
    try {
      if (authMode === "register") {
        await register(username.trim(), password, displayName.trim());
      } else {
        await login(username.trim(), password);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateClub = async () => {
    if (!newClubName.trim()) return;
    try {
      const { error } = await supabase.rpc("create_club", {
        p_name: newClubName.trim(),
        p_description: null,
      });
      if (error) {
        Alert.alert("エラー", error.message ?? "クラブ作成に失敗しました");
        return;
      }
      setNewClubName("");
      setShowCreate(false);
      loadClubs();
    } catch {
      Alert.alert("エラー", "クラブ作成に失敗しました");
    }
  };

  const handleJoinClub = async () => {
    if (!inviteCode.trim()) return;
    try {
      const { error } = await supabase.rpc("join_club_by_code", {
        p_invite_code: inviteCode.trim(),
      });
      if (error) {
        Alert.alert("エラー", error.message ?? "招待コードが無効です");
        return;
      }
      setInviteCode("");
      setShowJoin(false);
      loadClubs();
    } catch {
      Alert.alert("エラー", "クラブ参加に失敗しました");
    }
  };

  const titleGlow = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["rgba(255,214,0,0.35)", "rgba(255,214,0,0.85)"],
  });

  const float1Y = float1.interpolate({ inputRange: [0, 1], outputRange: [0, -18] });
  const float2Y = float2.interpolate({ inputRange: [0, 1], outputRange: [0, -22] });
  const float3Y = float3.interpolate({ inputRange: [0, 1], outputRange: [0, -16] });

  const displayError = validationError || error;

  return (
    <LinearGradient
      colors={["#04101f", "#0a1f3a", "#0d2a48", "#1a3a60"] as const}
      style={styles.container}
    >
      <StatusBar style="light" />

      {/* ===== Floating background tiles ===== */}
      <View pointerEvents="none" style={styles.bgLayer}>
        <Animated.Text
          style={[
            styles.floatTile,
            { top: "12%", left: "8%", transform: [{ translateY: float1Y }, { rotate: "-12deg" }] },
          ]}
        >
          🀄
        </Animated.Text>
        <Animated.Text
          style={[
            styles.floatTile,
            { top: "65%", left: "12%", transform: [{ translateY: float2Y }, { rotate: "6deg" }] },
          ]}
        >
          🀅
        </Animated.Text>
        <Animated.Text
          style={[
            styles.floatTile,
            { top: "20%", right: "10%", transform: [{ translateY: float3Y }, { rotate: "8deg" }] },
          ]}
        >
          🀆
        </Animated.Text>
        <Animated.Text
          style={[
            styles.floatTile,
            { top: "70%", right: "15%", transform: [{ translateY: float1Y }, { rotate: "-4deg" }] },
          ]}
        >
          🀇
        </Animated.Text>
        <View style={styles.glowBlobA} />
        <View style={styles.glowBlobB} />
      </View>

      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ===== HERO ===== */}
          <View style={[styles.hero, compact && styles.heroCompact]}>
            <Animated.Text
              style={[
                styles.heroTitle,
                {
                  textShadowColor: titleGlow as unknown as string,
                },
              ]}
            >
              麻雀
            </Animated.Text>
            <Text style={styles.heroAccent}>MAHJONG PLATFORM</Text>
            <Text style={styles.heroTagline}>
              友達と、本格麻雀を。{"\n"}クラブをつくって、いつでも対局。
            </Text>

            {isLoggedIn && user && (
              <View style={styles.userBadge}>
                <View style={styles.userAvatar}>
                  <Text style={styles.userAvatarText}>
                    {(user.displayName || user.username || "?").charAt(0)}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.userHello}>ようこそ</Text>
                  <Text style={styles.userName}>{user.displayName} さん</Text>
                </View>
                <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
                  <Text style={styles.logoutText}>ログアウト</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* ===== PRIMARY CTA ===== */}
          {isLoggedIn ? (
            <View style={styles.ctaWrap}>
              <Pressable
                onPress={onOnline}
                style={({ pressed }) => [
                  styles.primaryCta,
                  pressed && styles.primaryCtaPressed,
                ]}
              >
                <LinearGradient
                  colors={["#ffd54a", "#ffb300", "#ff8a00"] as const}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.primaryCtaGradient}
                >
                  <Text style={styles.primaryCtaIcon}>🀄</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.primaryCtaTitle}>オンライン対局</Text>
                    <Text style={styles.primaryCtaSub}>
                      クラブのメンバーとリアルタイム対戦
                    </Text>
                  </View>
                  <Text style={styles.primaryCtaArrow}>→</Text>
                </LinearGradient>
              </Pressable>

              <View style={styles.subCtaRow}>
                <Pressable onPress={onStartDemo} style={({ pressed }) => [styles.subCta, pressed && styles.subCtaPressed]}>
                  <Text style={styles.subCtaIcon}>🎮</Text>
                  <Text style={styles.subCtaLabel}>デモプレイ</Text>
                  <Text style={styles.subCtaHint}>CPU 対戦</Text>
                </Pressable>
                <Pressable onPress={onProfile} style={({ pressed }) => [styles.subCta, pressed && styles.subCtaPressed]}>
                  <Text style={styles.subCtaIcon}>📊</Text>
                  <Text style={styles.subCtaLabel}>戦績</Text>
                  <Text style={styles.subCtaHint}>履歴・成績</Text>
                </Pressable>
                <Pressable onPress={onSettings} style={({ pressed }) => [styles.subCta, pressed && styles.subCtaPressed]}>
                  <Text style={styles.subCtaIcon}>⚙️</Text>
                  <Text style={styles.subCtaLabel}>設定</Text>
                  <Text style={styles.subCtaHint}>音・表示</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.ctaWrap}>
              <Pressable
                onPress={onStartDemo}
                style={({ pressed }) => [
                  styles.primaryCta,
                  pressed && styles.primaryCtaPressed,
                ]}
              >
                <LinearGradient
                  colors={["#1a7888", "#0e5565", "#0a3a4a"] as const}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.primaryCtaGradient}
                >
                  <Text style={styles.primaryCtaIcon}>🎮</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.primaryCtaTitle, { color: "#fff" }]}>
                      まずは無料デモプレイ
                    </Text>
                    <Text style={[styles.primaryCtaSub, { color: "#cfe6ec" }]}>
                      ログイン不要・CPU と本格対局
                    </Text>
                  </View>
                  <Text style={[styles.primaryCtaArrow, { color: "#fff" }]}>→</Text>
                </LinearGradient>
              </Pressable>

              {/* ===== Auth panel (logged-out only) ===== */}
              <View style={styles.authCard}>
                <View style={styles.authTabs}>
                  <Pressable
                    onPress={() => setAuthMode("login")}
                    style={[
                      styles.authTab,
                      authMode === "login" && styles.authTabActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.authTabText,
                        authMode === "login" && styles.authTabTextActive,
                      ]}
                    >
                      ログイン
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setAuthMode("register")}
                    style={[
                      styles.authTab,
                      authMode === "register" && styles.authTabActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.authTabText,
                        authMode === "register" && styles.authTabTextActive,
                      ]}
                    >
                      新規登録
                    </Text>
                  </Pressable>
                </View>

                <TextInput
                  style={styles.input}
                  placeholder="ユーザー名"
                  placeholderTextColor="#4a6070"
                  value={username}
                  onChangeText={(t) => {
                    setUsername(t);
                    setValidationError(null);
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TextInput
                  style={styles.input}
                  placeholder="パスワード"
                  placeholderTextColor="#4a6070"
                  value={password}
                  onChangeText={(t) => {
                    setPassword(t);
                    setValidationError(null);
                  }}
                  secureTextEntry
                />
                {authMode === "register" && (
                  <TextInput
                    style={styles.input}
                    placeholder="表示名 (対局画面で表示される名前)"
                    placeholderTextColor="#4a6070"
                    value={displayName}
                    onChangeText={(t) => {
                      setDisplayName(t);
                      setValidationError(null);
                    }}
                  />
                )}

                {displayError && <Text style={styles.error}>{displayError}</Text>}

                <Pressable
                  onPress={handleAuthSubmit}
                  disabled={isSubmitting || isLoading}
                  style={({ pressed }) => [
                    styles.authSubmit,
                    (isSubmitting || isLoading) && styles.authSubmitDisabled,
                    pressed && styles.authSubmitPressed,
                  ]}
                >
                  {isSubmitting || isLoading ? (
                    <ActivityIndicator color="#0a1628" />
                  ) : (
                    <Text style={styles.authSubmitText}>
                      {authMode === "register" ? "アカウントを作成" : "ログインして対局"}
                    </Text>
                  )}
                </Pressable>

                <Text style={styles.authHint}>
                  {authMode === "register"
                    ? "登録すると、クラブ作成・参加・オンライン対局が利用できます"
                    : "ログインしてクラブ・オンライン対局へ"}
                </Text>
              </View>
            </View>
          )}

          {/* ===== Clubs section (logged-in only) ===== */}
          {isLoggedIn && (
            <View style={styles.clubSection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>あなたのクラブ</Text>
                <Text style={styles.sectionCount}>{clubs.length}件</Text>
              </View>

              {clubsLoading ? (
                <ActivityIndicator color="#1a7888" style={{ marginTop: 16 }} />
              ) : clubs.length === 0 ? (
                <View style={styles.emptyClubBox}>
                  <Text style={styles.emptyClubIcon}>🏠</Text>
                  <Text style={styles.emptyClubText}>
                    まだクラブに参加していません
                  </Text>
                  <Text style={styles.emptyClubHint}>
                    クラブを作成するか、招待コードで参加しましょう
                  </Text>
                </View>
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.clubScroll}
                >
                  {clubs.map((club) => (
                    <Pressable
                      key={club.id}
                      onPress={onJoinClubAndOpenLobby}
                      style={({ pressed }) => [
                        styles.clubCard,
                        pressed && styles.clubCardPressed,
                      ]}
                    >
                      <LinearGradient
                        colors={["rgba(26,120,136,0.45)", "rgba(10,30,55,0.85)"] as const}
                        style={styles.clubCardGradient}
                      >
                        <View style={styles.clubAvatar}>
                          <Text style={styles.clubAvatarText}>
                            {club.name.charAt(0)}
                          </Text>
                        </View>
                        <Text style={styles.clubName} numberOfLines={1}>
                          {club.name}
                        </Text>
                        <Text style={styles.clubInvite}>
                          招待: {club.invite_code}
                        </Text>
                      </LinearGradient>
                    </Pressable>
                  ))}
                </ScrollView>
              )}

              {/* Quick actions */}
              <View style={styles.quickActions}>
                <Pressable
                  onPress={() => {
                    setShowCreate((v) => !v);
                    setShowJoin(false);
                  }}
                  style={({ pressed }) => [
                    styles.quickAction,
                    showCreate && styles.quickActionActive,
                    pressed && styles.quickActionPressed,
                  ]}
                >
                  <Text style={styles.quickActionIcon}>＋</Text>
                  <Text style={styles.quickActionLabel}>クラブを作成</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setShowJoin((v) => !v);
                    setShowCreate(false);
                  }}
                  style={({ pressed }) => [
                    styles.quickAction,
                    showJoin && styles.quickActionActive,
                    pressed && styles.quickActionPressed,
                  ]}
                >
                  <Text style={styles.quickActionIcon}>🔑</Text>
                  <Text style={styles.quickActionLabel}>招待コードで参加</Text>
                </Pressable>
              </View>

              {showCreate && (
                <View style={styles.inlineForm}>
                  <TextInput
                    style={styles.inlineInput}
                    placeholder="クラブ名"
                    placeholderTextColor="#4a6070"
                    value={newClubName}
                    onChangeText={setNewClubName}
                  />
                  <Pressable
                    onPress={handleCreateClub}
                    style={({ pressed }) => [
                      styles.inlineSubmit,
                      pressed && styles.inlineSubmitPressed,
                    ]}
                  >
                    <Text style={styles.inlineSubmitText}>作成</Text>
                  </Pressable>
                </View>
              )}

              {showJoin && (
                <View style={styles.inlineForm}>
                  <TextInput
                    style={styles.inlineInput}
                    placeholder="招待コードを入力"
                    placeholderTextColor="#4a6070"
                    value={inviteCode}
                    onChangeText={setInviteCode}
                    autoCapitalize="none"
                  />
                  <Pressable
                    onPress={handleJoinClub}
                    style={({ pressed }) => [
                      styles.inlineSubmit,
                      pressed && styles.inlineSubmitPressed,
                    ]}
                  >
                    <Text style={styles.inlineSubmitText}>参加</Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity onPress={onPrivacy}>
              <Text style={styles.footerLink}>プライバシーポリシー</Text>
            </TouchableOpacity>
            <Text style={styles.footerSep}>•</Text>
            <TouchableOpacity onPress={onTerms}>
              <Text style={styles.footerLink}>利用規約</Text>
            </TouchableOpacity>
            <Text style={styles.footerSep}>•</Text>
            <Text style={styles.footerVersion}>v1.0.0</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const GOLD = "#ffd54a";

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 32,
    alignItems: "center",
  },

  // Background
  bgLayer: { ...StyleSheet.absoluteFillObject },
  floatTile: {
    position: "absolute",
    fontSize: 56,
    color: "rgba(255,213,74,0.07)",
  },
  glowBlobA: {
    position: "absolute",
    top: -120,
    right: -100,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: "rgba(255,180,0,0.08)",
  },
  glowBlobB: {
    position: "absolute",
    bottom: -140,
    left: -120,
    width: 360,
    height: 360,
    borderRadius: 180,
    backgroundColor: "rgba(0,150,180,0.10)",
  },

  // Hero
  hero: {
    alignItems: "center",
    paddingTop: 4,
    paddingBottom: 18,
    width: "100%",
    maxWidth: 720,
  },
  heroCompact: { paddingTop: 0 },
  heroTitle: {
    fontSize: 64,
    fontWeight: "900",
    color: GOLD,
    letterSpacing: 12,
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 24,
  },
  heroAccent: {
    fontSize: 11,
    color: "#5a8090",
    letterSpacing: 6,
    marginTop: 2,
    fontWeight: "700",
  },
  heroTagline: {
    fontSize: 13,
    color: "#9ab7c4",
    textAlign: "center",
    marginTop: 12,
    lineHeight: 20,
  },
  userBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(14,30,52,0.85)",
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 18,
    borderWidth: 1,
    borderColor: "rgba(255,213,74,0.25)",
    width: "100%",
    maxWidth: 480,
  },
  userAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255,213,74,0.18)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,213,74,0.4)",
  },
  userAvatarText: { color: GOLD, fontSize: 18, fontWeight: "900" },
  userHello: { color: "#6a8fa0", fontSize: 11 },
  userName: { color: "#e0f0f5", fontSize: 16, fontWeight: "700" },
  logoutBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,107,107,0.4)",
  },
  logoutText: { color: "#ff8888", fontSize: 11, fontWeight: "700" },

  // CTA
  ctaWrap: { width: "100%", maxWidth: 720, gap: 12, marginTop: 6 },
  primaryCta: {
    width: "100%",
    borderRadius: 18,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  primaryCtaPressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
  primaryCtaGradient: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    paddingVertical: 22,
    paddingHorizontal: 26,
  },
  primaryCtaIcon: { fontSize: 42 },
  primaryCtaTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#1a0f00",
    letterSpacing: 1,
  },
  primaryCtaSub: {
    fontSize: 12,
    color: "rgba(20,15,0,0.7)",
    marginTop: 3,
    fontWeight: "600",
  },
  primaryCtaArrow: { fontSize: 28, color: "#1a0f00", fontWeight: "900" },

  subCtaRow: { flexDirection: "row", gap: 10 },
  subCta: {
    flex: 1,
    backgroundColor: "rgba(14,30,52,0.85)",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(26,120,136,0.35)",
  },
  subCtaPressed: {
    backgroundColor: "rgba(26,120,136,0.25)",
    borderColor: "rgba(26,120,136,0.6)",
  },
  subCtaIcon: { fontSize: 24, marginBottom: 4 },
  subCtaLabel: { color: "#e0f0f5", fontSize: 13, fontWeight: "700" },
  subCtaHint: { color: "#5e7e8e", fontSize: 10, marginTop: 2 },

  // Auth card
  authCard: {
    backgroundColor: "rgba(8,22,42,0.92)",
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(255,213,74,0.18)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  authTabs: {
    flexDirection: "row",
    backgroundColor: "rgba(0,0,0,0.35)",
    borderRadius: 10,
    padding: 4,
    marginBottom: 14,
  },
  authTab: {
    flex: 1,
    paddingVertical: 9,
    alignItems: "center",
    borderRadius: 7,
  },
  authTabActive: {
    backgroundColor: "rgba(255,213,74,0.2)",
  },
  authTabText: { color: "#6a8fa0", fontSize: 13, fontWeight: "700" },
  authTabTextActive: { color: GOLD },
  input: {
    backgroundColor: "rgba(4,16,32,0.75)",
    borderRadius: 10,
    padding: 13,
    color: "#e0f0f5",
    fontSize: 15,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(26,120,136,0.3)",
  },
  error: { color: "#ff8888", textAlign: "center", marginBottom: 8, fontSize: 12 },
  authSubmit: {
    backgroundColor: GOLD,
    borderRadius: 11,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  authSubmitDisabled: { opacity: 0.6 },
  authSubmitPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  authSubmitText: {
    color: "#1a0f00",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 1,
  },
  authHint: {
    color: "#5e7e8e",
    fontSize: 11,
    textAlign: "center",
    marginTop: 12,
  },

  // Clubs
  clubSection: {
    width: "100%",
    maxWidth: 720,
    marginTop: 22,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    color: "#e0f0f5",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 1,
  },
  sectionCount: { color: "#6a8fa0", fontSize: 12 },
  emptyClubBox: {
    alignItems: "center",
    paddingVertical: 28,
    backgroundColor: "rgba(8,22,42,0.6)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(26,120,136,0.2)",
    borderStyle: "dashed" as any,
  },
  emptyClubIcon: { fontSize: 36, marginBottom: 8 },
  emptyClubText: { color: "#9ab7c4", fontSize: 14, fontWeight: "700" },
  emptyClubHint: { color: "#5e7e8e", fontSize: 11, marginTop: 4 },
  clubScroll: { gap: 10, paddingVertical: 4, paddingHorizontal: 2 },
  clubCard: {
    width: 160,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,213,74,0.18)",
  },
  clubCardPressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  clubCardGradient: {
    padding: 14,
    minHeight: 110,
  },
  clubAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,213,74,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(255,213,74,0.4)",
  },
  clubAvatarText: { color: GOLD, fontSize: 16, fontWeight: "900" },
  clubName: { color: "#e0f0f5", fontSize: 14, fontWeight: "800" },
  clubInvite: { color: "#6a8fa0", fontSize: 10, marginTop: 4 },

  quickActions: { flexDirection: "row", gap: 10, marginTop: 14 },
  quickAction: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(14,30,52,0.85)",
    borderRadius: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "rgba(26,120,136,0.3)",
  },
  quickActionActive: {
    backgroundColor: "rgba(26,120,136,0.3)",
    borderColor: "rgba(26,120,136,0.7)",
  },
  quickActionPressed: { opacity: 0.85 },
  quickActionIcon: { fontSize: 18, color: GOLD },
  quickActionLabel: { color: "#e0f0f5", fontSize: 13, fontWeight: "700" },

  inlineForm: { flexDirection: "row", gap: 8, marginTop: 10 },
  inlineInput: {
    flex: 1,
    backgroundColor: "rgba(4,16,32,0.75)",
    borderRadius: 10,
    padding: 12,
    color: "#e0f0f5",
    fontSize: 14,
    borderWidth: 1,
    borderColor: "rgba(26,120,136,0.3)",
  },
  inlineSubmit: {
    backgroundColor: GOLD,
    borderRadius: 10,
    paddingHorizontal: 22,
    justifyContent: "center",
  },
  inlineSubmitPressed: { opacity: 0.85 },
  inlineSubmitText: { color: "#1a0f00", fontSize: 14, fontWeight: "900" },

  // Footer
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 24,
    paddingBottom: 8,
  },
  footerLink: {
    color: "#4a6a7a",
    fontSize: 11,
    textDecorationLine: "underline",
  },
  footerSep: { color: "#3a4a5a", fontSize: 10 },
  footerVersion: { color: "#3a4a5a", fontSize: 11 },
});
