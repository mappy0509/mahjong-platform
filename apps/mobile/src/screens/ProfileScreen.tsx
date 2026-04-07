import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useAuthStore } from "../stores/auth-store";
import { supabase } from "../lib/supabase";

interface PlayerStats {
  totalGames: number;
  wins: number;
  placements: number[];
  avgScore: number;
  winRate: number;
  currentBalance: number;
}

interface GameHistoryItem {
  roomId: string;
  roomName: string;
  finishedAt: string;
  players: { userId: string; displayName: string; seat: number }[];
  finalScores: Record<string, number> | null;
}

interface LeaderboardEntry {
  userId: string;
  displayName: string;
  totalScore: number;
  games: number;
  wins: number;
}

interface ProfileScreenProps {
  onBack: () => void;
  onReplay?: (roomId: string) => void;
}

type Tab = "stats" | "history" | "ranking";

interface ClubInfo {
  id: string;
  name: string;
}

export function ProfileScreen({ onBack, onReplay }: ProfileScreenProps) {
  const { user } = useAuthStore();
  const [clubs, setClubs] = useState<ClubInfo[]>([]);
  const [selectedClub, setSelectedClub] = useState<ClubInfo | null>(null);
  const [tab, setTab] = useState<Tab>("stats");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Stats
  const [stats, setStats] = useState<PlayerStats | null>(null);
  // History
  const [history, setHistory] = useState<GameHistoryItem[]>([]);
  // Leaderboard
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    loadClubs();
  }, []);

  const loadClubs = async () => {
    try {
      const { data, error } = await supabase
        .from("club_memberships")
        .select("club_id, clubs:club_id (id, name)")
        .eq("user_id", user?.id ?? "");
      if (error) throw error;
      const clubList = (data ?? []).map((m: any) => m.clubs).filter(Boolean);
      setClubs(clubList);
      if (clubList.length > 0) {
        setSelectedClub(clubList[0]);
      }
    } catch {
      // No clubs
    }
    setLoading(false);
  };

  useEffect(() => {
    if (selectedClub) {
      loadTabData();
    }
  }, [selectedClub, tab]);

  const loadTabData = useCallback(async () => {
    if (!selectedClub) return;
    setLoading(true);
    try {
      if (tab === "stats") {
        // Calculate stats from game results
        const { data: results } = await supabase
          .from("game_results")
          .select("result_data, score_changes, game_rooms!inner(club_id)")
          .eq("game_rooms.club_id", selectedClub.id);

        const { data: participants } = await supabase
          .from("game_participants")
          .select("room_id, seat, game_rooms!inner(club_id, status)")
          .eq("user_id", user?.id ?? "")
          .eq("game_rooms.club_id", selectedClub.id)
          .eq("game_rooms.status", "finished");

        const totalGames = participants?.length ?? 0;
        const placements = [0, 0, 0, 0];
        let totalScore = 0;
        let wins = 0;

        // Simple stats calculation
        if (results && participants) {
          for (const p of participants) {
            const roomResults = results.filter((r: any) => r.game_rooms?.club_id === selectedClub.id);
            // Simplified — real implementation would correlate scores
            if (roomResults.length > 0) {
              // Placeholder stats
            }
          }
        }

        // Get point balance
        const balance = await supabase.rpc("get_point_balance", {
          p_user_id: user?.id,
          p_club_id: selectedClub.id,
        });

        setStats({
          totalGames,
          wins,
          placements,
          avgScore: totalGames > 0 ? Math.round(totalScore / totalGames) : 0,
          winRate: totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0,
          currentBalance: balance.data ?? 0,
        });
      } else if (tab === "history") {
        const { data: rooms } = await supabase
          .from("game_rooms")
          .select(`
            id,
            name,
            created_at,
            game_participants (user_id, seat, profiles:user_id (display_name)),
            game_results (result_data, score_changes)
          `)
          .eq("club_id", selectedClub.id)
          .eq("status", "finished")
          .order("created_at", { ascending: false })
          .limit(20);

        const historyItems: GameHistoryItem[] = (rooms ?? []).map((r: any) => ({
          roomId: r.id,
          roomName: r.name,
          finishedAt: r.created_at,
          players: (r.game_participants ?? []).map((p: any) => ({
            userId: p.user_id,
            displayName: p.profiles?.display_name ?? "???",
            seat: p.seat,
          })),
          finalScores: null, // Would need to aggregate from results
        }));
        setHistory(historyItems);
      } else {
        // Leaderboard — aggregate point transactions
        const { data: txData } = await supabase
          .from("point_transactions")
          .select("user_id, amount, profiles:user_id (display_name)")
          .eq("club_id", selectedClub.id)
          .eq("type", "game_result");

        const userScores = new Map<string, { name: string; total: number; games: number; wins: number }>();
        for (const tx of (txData ?? [])) {
          const entry = userScores.get(tx.user_id) ?? {
            name: (tx as any).profiles?.display_name ?? "???",
            total: 0,
            games: 0,
            wins: 0,
          };
          entry.total += tx.amount;
          entry.games++;
          if (tx.amount > 0) entry.wins++;
          userScores.set(tx.user_id, entry);
        }

        const leaderboardData: LeaderboardEntry[] = Array.from(userScores.entries())
          .map(([userId, data]) => ({
            userId,
            displayName: data.name,
            totalScore: data.total,
            games: data.games,
            wins: data.wins,
          }))
          .sort((a, b) => b.totalScore - a.totalScore);

        setLeaderboard(leaderboardData);
      }
    } catch {
      // ignore
    }
    setLoading(false);
  }, [selectedClub, tab]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadTabData();
    setRefreshing(false);
  };

  const PLACEMENT_LABELS = ["1位", "2位", "3位", "4位"];
  const PLACEMENT_COLORS = ["#ffd600", "#c0c0c0", "#cd7f32", "#5a6a7a"];

  return (
    <LinearGradient
      colors={["#0a1628", "#122440", "#1a3358"] as const}
      style={styles.container}
    >
      <StatusBar style="light" />
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn}>
            <Text style={styles.backText}>‹ 戻る</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>プロフィール</Text>
          <View style={{ width: 60 }} />
        </View>

        {/* User info */}
        <View style={styles.userCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(user?.displayName ?? "?").charAt(0)}
            </Text>
          </View>
          <View>
            <Text style={styles.displayName}>{user?.displayName}</Text>
            <Text style={styles.username}>@{user?.username}</Text>
          </View>
        </View>

        {/* Club selector */}
        {clubs.length > 1 && (
          <View style={styles.clubSelector}>
            {clubs.map((c) => (
              <TouchableOpacity
                key={c.id}
                style={[
                  styles.clubChip,
                  selectedClub?.id === c.id && styles.clubChipActive,
                ]}
                onPress={() => setSelectedClub(c)}
              >
                <Text
                  style={[
                    styles.clubChipText,
                    selectedClub?.id === c.id && styles.clubChipTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {c.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Tabs */}
        <View style={styles.tabBar}>
          {([
            { key: "stats" as Tab, label: "戦績" },
            { key: "history" as Tab, label: "対局履歴" },
            { key: "ranking" as Tab, label: "ランキング" },
          ]).map((t) => (
            <TouchableOpacity
              key={t.key}
              style={[styles.tabItem, tab === t.key && styles.tabItemActive]}
              onPress={() => setTab(t.key)}
            >
              <Text
                style={[
                  styles.tabText,
                  tab === t.key && styles.tabTextActive,
                ]}
              >
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Content */}
        {!selectedClub ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>🏠</Text>
            <Text style={styles.emptyText}>クラブに参加すると戦績が表示されます</Text>
          </View>
        ) : loading && !refreshing ? (
          <ActivityIndicator color="#1a7888" style={{ marginTop: 40 }} />
        ) : (
          <>
            {tab === "stats" && stats && (
              <FlatList
                data={[null]}
                keyExtractor={() => "stats"}
                refreshControl={
                  <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1a7888" />
                }
                renderItem={() => (
                  <View style={styles.statsContainer}>
                    {/* Main stats */}
                    <View style={styles.statRow}>
                      <View style={styles.statBox}>
                        <Text style={styles.statValue}>{stats.totalGames}</Text>
                        <Text style={styles.statLabel}>対局数</Text>
                      </View>
                      <View style={styles.statBox}>
                        <Text style={[styles.statValue, { color: "#ffd600" }]}>
                          {stats.winRate}%
                        </Text>
                        <Text style={styles.statLabel}>1位率</Text>
                      </View>
                      <View style={styles.statBox}>
                        <Text style={styles.statValue}>{stats.avgScore}</Text>
                        <Text style={styles.statLabel}>平均スコア</Text>
                      </View>
                    </View>

                    {/* Balance */}
                    <View style={styles.balanceCard}>
                      <Text style={styles.balanceLabel}>ポイント残高</Text>
                      <Text style={styles.balanceValue}>
                        {stats.currentBalance.toLocaleString()} pt
                      </Text>
                    </View>

                    {/* Placements */}
                    <Text style={styles.sectionTitle}>順位分布</Text>
                    <View style={styles.placementRow}>
                      {stats.placements.map((count, i) => {
                        const rate =
                          stats.totalGames > 0
                            ? Math.round((count / stats.totalGames) * 100)
                            : 0;
                        return (
                          <View key={i} style={styles.placementItem}>
                            <Text
                              style={[
                                styles.placementLabel,
                                { color: PLACEMENT_COLORS[i] },
                              ]}
                            >
                              {PLACEMENT_LABELS[i]}
                            </Text>
                            <View style={styles.barContainer}>
                              <View
                                style={[
                                  styles.bar,
                                  {
                                    height: Math.max(rate * 1.2, 4),
                                    backgroundColor: PLACEMENT_COLORS[i],
                                  },
                                ]}
                              />
                            </View>
                            <Text style={styles.placementCount}>
                              {count}回
                            </Text>
                            <Text style={styles.placementRate}>{rate}%</Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                )}
              />
            )}

            {tab === "history" && (
              <FlatList
                data={history}
                keyExtractor={(item) => item.roomId}
                refreshControl={
                  <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1a7888" />
                }
                contentContainerStyle={{ padding: 16 }}
                renderItem={({ item }) => {
                  const myPlayer = item.players.find(
                    (p) => p.userId === user?.id,
                  );
                  const myScore =
                    myPlayer && item.finalScores
                      ? item.finalScores[String(myPlayer.seat)] ?? 0
                      : 0;

                  // Determine placement
                  let placement = -1;
                  if (item.finalScores) {
                    const sorted = Object.entries(item.finalScores)
                      .map(([s, sc]) => ({ seat: Number(s), score: sc }))
                      .sort((a, b) => b.score - a.score);
                    placement = sorted.findIndex(
                      (s) => s.seat === myPlayer?.seat,
                    );
                  }

                  return (
                    <View style={styles.historyItem}>
                      <View style={styles.historyHeader}>
                        <Text style={styles.historyName}>{item.roomName}</Text>
                        <Text style={styles.historyDate}>
                          {new Date(item.finishedAt).toLocaleDateString("ja-JP")}
                        </Text>
                      </View>
                      <View style={styles.historyBody}>
                        {placement >= 0 && (
                          <Text
                            style={[
                              styles.historyPlacement,
                              { color: PLACEMENT_COLORS[placement] },
                            ]}
                          >
                            {PLACEMENT_LABELS[placement]}
                          </Text>
                        )}
                        <Text
                          style={[
                            styles.historyScore,
                            {
                              color:
                                myScore >= 0 ? "#00b894" : "#d63031",
                            },
                          ]}
                        >
                          {myScore >= 0 ? "+" : ""}
                          {myScore.toLocaleString()}
                        </Text>
                      </View>
                      <View style={styles.historyFooter}>
                        <View style={styles.historyPlayers}>
                          {item.players.map((p) => {
                            const score = item.finalScores
                              ? item.finalScores[String(p.seat)] ?? 0
                              : 0;
                            return (
                              <Text
                                key={p.userId}
                                style={[
                                  styles.historyPlayerText,
                                  p.userId === user?.id && styles.historyPlayerMe,
                                ]}
                              >
                                {p.displayName}: {score.toLocaleString()}
                              </Text>
                            );
                          })}
                        </View>
                        {onReplay && (
                          <TouchableOpacity
                            style={styles.replayBtn}
                            onPress={() => onReplay(item.roomId)}
                          >
                            <Text style={styles.replayBtnText}>牌譜</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                }}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyIcon}>📋</Text>
                    <Text style={styles.emptyText}>対局履歴がありません</Text>
                  </View>
                }
              />
            )}

            {tab === "ranking" && (
              <FlatList
                data={leaderboard}
                keyExtractor={(item) => item.userId}
                refreshControl={
                  <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1a7888" />
                }
                contentContainerStyle={{ padding: 16 }}
                renderItem={({ item, index }) => {
                  const isMe = item.userId === user?.id;
                  return (
                    <View
                      style={[
                        styles.rankItem,
                        isMe && styles.rankItemMe,
                      ]}
                    >
                      <Text
                        style={[
                          styles.rankNumber,
                          index < 3 && {
                            color: PLACEMENT_COLORS[index],
                          },
                        ]}
                      >
                        {index + 1}
                      </Text>
                      <View style={styles.rankInfo}>
                        <Text
                          style={[
                            styles.rankName,
                            isMe && styles.rankNameMe,
                          ]}
                        >
                          {item.displayName}
                        </Text>
                        <Text style={styles.rankSub}>
                          {item.games}局 / {item.wins}勝
                        </Text>
                      </View>
                      <Text style={styles.rankScore}>
                        {item.totalScore.toLocaleString()}
                      </Text>
                    </View>
                  );
                }}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyIcon}>🏆</Text>
                    <Text style={styles.emptyText}>ランキングデータがありません</Text>
                  </View>
                }
              />
            )}
          </>
        )}
      </SafeAreaView>
    </LinearGradient>
  );
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
    textAlign: "center",
  },
  // User card
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.04)",
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(26, 120, 136, 0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#e0f0f5", fontSize: 22, fontWeight: "bold" },
  displayName: { color: "#e0f0f5", fontSize: 18, fontWeight: "bold" },
  username: { color: "#6a8fa0", fontSize: 13, marginTop: 2 },
  // Club selector
  clubSelector: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  clubChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "rgba(14, 28, 50, 0.7)",
    borderWidth: 1,
    borderColor: "rgba(26, 120, 136, 0.15)",
  },
  clubChipActive: {
    backgroundColor: "rgba(26, 120, 136, 0.2)",
    borderColor: "#1a7888",
  },
  clubChipText: { color: "#6a8fa0", fontSize: 13, fontWeight: "600" },
  clubChipTextActive: { color: "#e0f0f5" },
  // Tabs
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabItemActive: { borderBottomColor: "#1a7888" },
  tabText: { color: "#5a6a7a", fontSize: 14, fontWeight: "600" },
  tabTextActive: { color: "#e0f0f5" },
  // Stats
  statsContainer: { padding: 16 },
  statRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  statBox: {
    flex: 1,
    alignItems: "center",
    backgroundColor: "rgba(14, 28, 50, 0.7)",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(26, 120, 136, 0.15)",
  },
  statValue: {
    color: "#e0f0f5",
    fontSize: 24,
    fontWeight: "900",
  },
  statLabel: {
    color: "#6a8fa0",
    fontSize: 11,
    marginTop: 4,
    letterSpacing: 0.5,
  },
  balanceCard: {
    alignItems: "center",
    backgroundColor: "rgba(255, 214, 0, 0.06)",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 214, 0, 0.15)",
  },
  balanceLabel: {
    color: "#6a8fa0",
    fontSize: 12,
    letterSpacing: 0.5,
  },
  balanceValue: {
    color: "#ffd600",
    fontSize: 28,
    fontWeight: "900",
    marginTop: 4,
  },
  sectionTitle: {
    color: "#6a8fa0",
    fontSize: 13,
    fontWeight: "bold",
    letterSpacing: 1,
    marginBottom: 12,
  },
  placementRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    gap: 8,
  },
  placementItem: {
    alignItems: "center",
    flex: 1,
  },
  placementLabel: {
    fontSize: 13,
    fontWeight: "bold",
    marginBottom: 6,
  },
  barContainer: {
    width: 32,
    height: 100,
    justifyContent: "flex-end",
    alignItems: "center",
    marginBottom: 6,
  },
  bar: {
    width: 24,
    borderRadius: 4,
  },
  placementCount: {
    color: "#e0f0f5",
    fontSize: 14,
    fontWeight: "bold",
  },
  placementRate: {
    color: "#5a6a7a",
    fontSize: 11,
    marginTop: 2,
  },
  // History
  historyItem: {
    backgroundColor: "rgba(14, 28, 50, 0.7)",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "rgba(26, 120, 136, 0.15)",
  },
  historyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  historyName: { color: "#e0f0f5", fontSize: 15, fontWeight: "bold" },
  historyDate: { color: "#5a6a7a", fontSize: 12 },
  historyBody: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
  },
  historyPlacement: { fontSize: 16, fontWeight: "900" },
  historyScore: { fontSize: 18, fontWeight: "800" },
  historyPlayers: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  historyPlayerText: { color: "#5a6a7a", fontSize: 12 },
  historyPlayerMe: { color: "#1a7888", fontWeight: "bold" },
  // Ranking
  rankItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(14, 28, 50, 0.7)",
    borderRadius: 12,
    padding: 14,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "rgba(26, 120, 136, 0.1)",
    gap: 12,
  },
  rankItemMe: {
    borderColor: "rgba(26, 120, 136, 0.4)",
    backgroundColor: "rgba(26, 120, 136, 0.08)",
  },
  rankNumber: {
    width: 28,
    fontSize: 18,
    fontWeight: "900",
    color: "#5a6a7a",
    textAlign: "center",
  },
  rankInfo: { flex: 1 },
  rankName: { color: "#e0f0f5", fontSize: 15, fontWeight: "bold" },
  rankNameMe: { color: "#1a7888" },
  rankSub: { color: "#5a6a7a", fontSize: 12, marginTop: 2 },
  rankScore: {
    color: "#ffd600",
    fontSize: 16,
    fontWeight: "800",
  },
  historyFooter: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  replayBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "rgba(26, 120, 136, 0.2)",
    borderWidth: 1,
    borderColor: "rgba(26, 120, 136, 0.4)",
  },
  replayBtnText: {
    color: "#1a7888",
    fontSize: 12,
    fontWeight: "bold",
  },
  // Empty
  emptyContainer: { alignItems: "center", paddingTop: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyText: { color: "#6a8fa0", fontSize: 15 },
});
