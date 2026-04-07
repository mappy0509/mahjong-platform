import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  SafeAreaView,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../stores/auth-store";
import { useGameStore } from "../stores/game-store";

interface LobbyScreenProps {
  onBack: () => void;
  onJoinRoom: (roomId: string) => void;
}

type LobbyView =
  | { type: "clubs" }
  | { type: "rooms"; clubId: string; clubName: string }
  | { type: "waiting"; roomId: string; roomName: string };

export function LobbyScreen({ onBack, onJoinRoom }: LobbyScreenProps) {
  const { user, logout } = useAuthStore();
  const { joinRoom: gameJoinRoom, readyUp, subscribe } = useGameStore();
  const [lobbyView, setLobbyView] = useState<LobbyView>({ type: "clubs" });
  const [clubs, setClubs] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [inviteCode, setInviteCode] = useState("");
  const [roomName, setRoomName] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [roomInfo, setRoomInfo] = useState<any>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    loadClubs();
  }, []);

  // Subscribe to room updates when in waiting room
  useEffect(() => {
    if (lobbyView.type !== "waiting") return;

    // Subscribe to game_participants changes for this room
    const channel = supabase
      .channel(`waiting:${lobbyView.roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_participants",
          filter: `room_id=eq.${lobbyView.roomId}`,
        },
        () => {
          // Reload room info when participants change
          loadRoomInfo(lobbyView.roomId);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "game_rooms",
          filter: `id=eq.${lobbyView.roomId}`,
        },
        (payload) => {
          const row = payload.new as any;
          if (row.status === "playing") {
            // Game started! Navigate to game screen
            onJoinRoom(lobbyView.roomId);
          }
        }
      )
      .subscribe();

    // Load initial room info
    loadRoomInfo(lobbyView.roomId);

    return () => {
      supabase.removeChannel(channel);
    };
  }, [lobbyView]);

  const loadRoomInfo = async (roomId: string) => {
    const { data: participants } = await supabase
      .from("game_participants")
      .select(`
        seat,
        is_ready,
        user_id,
        profiles:user_id (display_name)
      `)
      .eq("room_id", roomId)
      .order("seat");

    setRoomInfo({
      participants: (participants ?? []).map((p: any) => ({
        seat: p.seat,
        isReady: p.is_ready,
        user: { displayName: p.profiles?.display_name ?? "???" },
      })),
    });
  };

  const loadClubs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("club_memberships")
        .select(`
          club_id,
          clubs:club_id (id, name, description, invite_code)
        `)
        .eq("user_id", user?.id ?? "");
      if (error) throw error;
      setClubs((data ?? []).map((m: any) => m.clubs).filter(Boolean));
    } catch {
      setClubs([]);
    }
    setLoading(false);
  };

  const loadRooms = async (clubId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("game_rooms")
        .select(`
          id,
          name,
          status,
          rules,
          game_participants (seat)
        `)
        .eq("club_id", clubId)
        .in("status", ["waiting", "playing"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      setRooms((data ?? []).map((r: any) => ({
        ...r,
        participants: r.game_participants,
      })));
    } catch {
      setRooms([]);
    }
    setLoading(false);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (lobbyView.type === "clubs") {
      await loadClubs();
    } else if (lobbyView.type === "rooms") {
      await loadRooms(lobbyView.clubId);
    }
    setRefreshing(false);
  }, [lobbyView]);

  const joinClub = async () => {
    if (!inviteCode.trim()) return;
    try {
      // Find club by invite code
      const { data: club, error } = await supabase
        .from("clubs")
        .select("id")
        .eq("invite_code", inviteCode.trim())
        .single();
      if (error || !club) {
        Alert.alert("エラー", "招待コードが無効です");
        return;
      }

      // Join the club
      const { error: joinError } = await supabase
        .from("club_memberships")
        .insert({ club_id: club.id, user_id: user?.id });
      if (joinError) throw joinError;

      setInviteCode("");
      loadClubs();
    } catch {
      Alert.alert("エラー", "クラブ参加に失敗しました");
    }
  };

  const openClub = (club: any) => {
    setLobbyView({ type: "rooms", clubId: club.id, clubName: club.name });
    loadRooms(club.id);
  };

  const createRoom = async () => {
    if (lobbyView.type !== "rooms" || !roomName.trim()) return;
    try {
      const { data, error } = await supabase.functions.invoke("create-room", {
        body: {
          clubId: lobbyView.clubId,
          name: roomName.trim(),
        },
      });
      if (error) throw error;
      setRoomName("");
      enterWaitingRoom(data.room.id, data.room.name);
    } catch {
      Alert.alert("エラー", "ルーム作成に失敗しました");
    }
  };

  const handleJoinRoom = async (room: any) => {
    try {
      await gameJoinRoom(room.id);
      enterWaitingRoom(room.id, room.name);
    } catch {
      Alert.alert("エラー", "ルーム参加に失敗しました");
    }
  };

  const enterWaitingRoom = (roomId: string, name: string) => {
    setIsReady(false);
    setRoomInfo(null);
    setLobbyView({ type: "waiting", roomId, roomName: name });
  };

  const handleReady = async () => {
    if (lobbyView.type !== "waiting") return;
    setIsReady(true);
    await readyUp(lobbyView.roomId);
    // Subscribe for realtime game updates
    await subscribe(lobbyView.roomId);
  };

  const handleLeaveRoom = () => {
    setLobbyView({ type: "clubs" });
    loadClubs();
  };

  const handleBack = () => {
    if (lobbyView.type === "waiting") {
      handleLeaveRoom();
    } else if (lobbyView.type === "rooms") {
      setLobbyView({ type: "clubs" });
    } else {
      onBack();
    }
  };

  const handleLogout = async () => {
    await logout();
    onBack();
  };

  return (
    <LinearGradient
      colors={["#0a1628", "#122440", "#1a3358"] as const}
      style={styles.container}
    >
      <StatusBar style="light" />
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
            <Text style={styles.backText}>
              {lobbyView.type === "clubs" ? "‹ メニュー" : "‹ 戻る"}
            </Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {lobbyView.type === "clubs"
              ? "ロビー"
              : lobbyView.type === "rooms"
                ? lobbyView.clubName
                : lobbyView.roomName}
          </Text>
          <View style={styles.headerRight}>
            <Text style={styles.username}>{user?.displayName}</Text>
            {lobbyView.type === "clubs" && (
              <TouchableOpacity onPress={handleLogout}>
                <Text style={styles.logoutText}>ログアウト</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {lobbyView.type === "clubs" && renderClubs()}
        {lobbyView.type === "rooms" && renderRooms()}
        {lobbyView.type === "waiting" && renderWaitingRoom()}
      </SafeAreaView>
    </LinearGradient>
  );

  function renderClubs() {
    return (
      <View style={styles.content}>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="招待コードを入力"
            placeholderTextColor="#4a6070"
            value={inviteCode}
            onChangeText={setInviteCode}
            autoCapitalize="none"
          />
          <TouchableOpacity style={styles.actionBtn} onPress={joinClub}>
            <Text style={styles.actionBtnText}>参加</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>参加中のクラブ</Text>

        {loading ? (
          <ActivityIndicator color="#1a7888" style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={clubs}
            keyExtractor={(item) => item.id}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1a7888" />
            }
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.listItem} onPress={() => openClub(item)}>
                <View style={styles.listItemIcon}>
                  <Text style={styles.listItemIconText}>
                    {item.name.charAt(0)}
                  </Text>
                </View>
                <View style={styles.listItemContent}>
                  <Text style={styles.listItemTitle}>{item.name}</Text>
                  <Text style={styles.listItemSub}>
                    {item.description || "クラブ"}
                  </Text>
                </View>
                <Text style={styles.listArrow}>›</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyIcon}>🏠</Text>
                <Text style={styles.emptyText}>
                  まだクラブに参加していません
                </Text>
                <Text style={styles.emptyHint}>
                  招待コードを入力して参加しましょう
                </Text>
              </View>
            }
          />
        )}
      </View>
    );
  }

  function renderRooms() {
    return (
      <View style={styles.content}>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="新しいルーム名"
            placeholderTextColor="#4a6070"
            value={roomName}
            onChangeText={setRoomName}
          />
          <TouchableOpacity style={styles.createBtn} onPress={createRoom}>
            <Text style={styles.actionBtnText}>作成</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>ルーム一覧</Text>

        {loading ? (
          <ActivityIndicator color="#1a7888" style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={rooms}
            keyExtractor={(item) => item.id}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1a7888" />
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.listItem, item.status !== "waiting" && styles.listItemDisabled]}
                onPress={() => handleJoinRoom(item)}
                disabled={item.status !== "waiting"}
              >
                <View
                  style={[
                    styles.listItemIcon,
                    item.status === "playing" && styles.listItemIconPlaying,
                  ]}
                >
                  <Text style={styles.listItemIconText}>🀄</Text>
                </View>
                <View style={styles.listItemContent}>
                  <Text style={styles.listItemTitle}>{item.name}</Text>
                  <Text style={styles.listItemSub}>
                    {item.participants?.length ?? 0}/4人
                    {item.status === "playing" ? " ・ 対局中" : " ・ 待機中"}
                  </Text>
                </View>
                {item.status === "waiting" && (
                  <Text style={styles.joinText}>参加</Text>
                )}
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyIcon}>🎲</Text>
                <Text style={styles.emptyText}>ルームがありません</Text>
                <Text style={styles.emptyHint}>
                  新しいルームを作成して対局を始めましょう
                </Text>
              </View>
            }
          />
        )}
      </View>
    );
  }

  function renderWaitingRoom() {
    const participants = roomInfo?.participants ?? [];
    const playerCount = participants.length;

    return (
      <View style={styles.waitingContainer}>
        <Text style={styles.waitingTitle}>対局待ち</Text>
        <Text style={styles.waitingCount}>{playerCount} / 4</Text>

        <View style={styles.seatGrid}>
          {[0, 1, 2, 3].map((seatIdx) => {
            const p = participants.find((pp: any) => pp.seat === seatIdx);
            return (
              <View
                key={seatIdx}
                style={[
                  styles.seatSlot,
                  p && styles.seatSlotFilled,
                  p?.isReady && styles.seatSlotReady,
                ]}
              >
                <Text style={styles.seatWind}>
                  {["東", "南", "西", "北"][seatIdx]}
                </Text>
                {p ? (
                  <>
                    <View style={styles.seatAvatar}>
                      <Text style={styles.seatAvatarText}>
                        {(p.user?.displayName ?? "?").charAt(0)}
                      </Text>
                    </View>
                    <Text style={styles.seatName} numberOfLines={1}>
                      {p.user?.displayName ?? "???"}
                    </Text>
                    {p.isReady && (
                      <Text style={styles.readyBadge}>READY</Text>
                    )}
                  </>
                ) : (
                  <>
                    <View style={[styles.seatAvatar, styles.seatAvatarEmpty]}>
                      <Text style={styles.seatAvatarEmptyText}>?</Text>
                    </View>
                    <Text style={styles.seatEmptyText}>空席</Text>
                  </>
                )}
              </View>
            );
          })}
        </View>

        {!isReady ? (
          <TouchableOpacity style={styles.readyBtn} onPress={handleReady}>
            <Text style={styles.readyBtnText}>準備完了</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.readyWaiting}>
            <ActivityIndicator color="#1a7888" size="small" />
            <Text style={styles.readyWaitingText}>
              他のプレイヤーを待っています...
            </Text>
          </View>
        )}

        <TouchableOpacity style={styles.leaveBtn} onPress={handleLeaveRoom}>
          <Text style={styles.leaveBtnText}>ルームを退出</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(26, 120, 136, 0.2)",
  },
  backBtn: { paddingRight: 12 },
  backText: { color: "#1a7888", fontSize: 16 },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: "bold",
    color: "#e0f0f5",
  },
  headerRight: { alignItems: "flex-end" },
  username: { color: "#6a8fa0", fontSize: 13 },
  logoutText: { color: "#ff6b6b", fontSize: 12, marginTop: 2 },
  content: { flex: 1, padding: 16 },
  inputRow: { flexDirection: "row", gap: 8, marginBottom: 20 },
  input: {
    flex: 1,
    backgroundColor: "rgba(10, 22, 40, 0.8)",
    borderRadius: 10,
    padding: 12,
    color: "#e0f0f5",
    fontSize: 15,
    borderWidth: 1,
    borderColor: "rgba(26, 120, 136, 0.25)",
  },
  actionBtn: {
    backgroundColor: "#1a7888",
    borderRadius: 10,
    paddingHorizontal: 20,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#20a0b0",
  },
  createBtn: {
    backgroundColor: "#0e5565",
    borderRadius: 10,
    paddingHorizontal: 20,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#1a7888",
  },
  actionBtnText: { color: "#fff", fontWeight: "bold", fontSize: 15 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#6a8fa0",
    marginBottom: 10,
    letterSpacing: 1,
  },
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(14, 28, 50, 0.7)",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "rgba(26, 120, 136, 0.15)",
    gap: 12,
  },
  listItemDisabled: { opacity: 0.5 },
  listItemIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "rgba(26, 120, 136, 0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  listItemIconPlaying: { backgroundColor: "rgba(255, 152, 0, 0.2)" },
  listItemIconText: { fontSize: 18 },
  listItemContent: { flex: 1 },
  listItemTitle: { color: "#e0f0f5", fontSize: 16, fontWeight: "bold" },
  listItemSub: { color: "#6a8fa0", fontSize: 13, marginTop: 2 },
  listArrow: { fontSize: 24, color: "#1a7888", fontWeight: "300" },
  joinText: { color: "#20a0b0", fontWeight: "bold", fontSize: 14 },
  emptyContainer: { alignItems: "center", paddingTop: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyText: { color: "#6a8fa0", fontSize: 16, marginBottom: 4 },
  emptyHint: { color: "#3a5060", fontSize: 13 },
  // Waiting room
  waitingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  waitingTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#e0f0f5",
    marginBottom: 4,
  },
  waitingCount: {
    fontSize: 36,
    fontWeight: "900",
    color: "#ffd600",
    marginBottom: 28,
  },
  seatGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 12,
    marginBottom: 32,
    maxWidth: 340,
  },
  seatSlot: {
    width: 150,
    alignItems: "center",
    padding: 16,
    borderRadius: 14,
    backgroundColor: "rgba(14, 28, 50, 0.7)",
    borderWidth: 1,
    borderColor: "rgba(26, 120, 136, 0.15)",
  },
  seatSlotFilled: { borderColor: "rgba(26, 120, 136, 0.4)" },
  seatSlotReady: {
    borderColor: "#4CAF50",
    backgroundColor: "rgba(76, 175, 80, 0.08)",
  },
  seatWind: {
    fontSize: 12,
    color: "#6a8fa0",
    fontWeight: "bold",
    marginBottom: 6,
  },
  seatAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(26, 120, 136, 0.3)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  seatAvatarText: { color: "#e0f0f5", fontSize: 20, fontWeight: "bold" },
  seatAvatarEmpty: { backgroundColor: "rgba(255,255,255,0.05)" },
  seatAvatarEmptyText: { color: "#3a5060", fontSize: 20 },
  seatName: { color: "#e0f0f5", fontSize: 14, fontWeight: "bold" },
  seatEmptyText: { color: "#3a5060", fontSize: 14 },
  readyBadge: {
    color: "#4CAF50",
    fontSize: 11,
    fontWeight: "bold",
    marginTop: 4,
    letterSpacing: 1,
  },
  readyBtn: {
    backgroundColor: "#1a7888",
    borderRadius: 12,
    paddingHorizontal: 48,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "#20a0b0",
    marginBottom: 16,
  },
  readyBtnText: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  readyWaiting: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  readyWaitingText: { color: "#6a8fa0", fontSize: 15 },
  leaveBtn: { padding: 12 },
  leaveBtnText: { color: "#ff6b6b", fontSize: 14 },
});
