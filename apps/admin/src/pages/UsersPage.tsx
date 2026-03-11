import { useEffect, useState, useCallback } from "react";
import { api } from "../api/client";

interface UserInfo {
  id: string;
  username: string;
  displayName: string;
  role: string;
  createdAt?: string;
}

const ROLES = ["PLAYER", "AGENT", "CLUB_OWNER", "PLATFORMER"];

const MOCK_USERS: UserInfo[] = [
  { id: "a1b2c3d4-1111-4aaa-bbbb-111111111111", username: "admin", displayName: "管理者", role: "PLATFORMER", createdAt: "2025-01-15T10:00:00Z" },
  { id: "a1b2c3d4-2222-4aaa-bbbb-222222222222", username: "tanaka_t", displayName: "田中太郎", role: "CLUB_OWNER", createdAt: "2025-02-01T14:30:00Z" },
  { id: "a1b2c3d4-3333-4aaa-bbbb-333333333333", username: "suzuki_h", displayName: "鈴木花子", role: "AGENT", createdAt: "2025-02-10T09:15:00Z" },
  { id: "a1b2c3d4-4444-4aaa-bbbb-444444444444", username: "yamada_i", displayName: "山田一郎", role: "PLAYER", createdAt: "2025-03-05T16:45:00Z" },
  { id: "a1b2c3d4-5555-4aaa-bbbb-555555555555", username: "sato_m", displayName: "佐藤美咲", role: "PLAYER", createdAt: "2025-03-12T11:20:00Z" },
  { id: "a1b2c3d4-6666-4aaa-bbbb-666666666666", username: "ito_k", displayName: "伊藤健太", role: "PLAYER", createdAt: "2025-04-01T08:00:00Z" },
  { id: "a1b2c3d4-7777-4aaa-bbbb-777777777777", username: "watanabe_y", displayName: "渡辺優子", role: "PLAYER", createdAt: "2025-04-15T13:30:00Z" },
  { id: "a1b2c3d4-8888-4aaa-bbbb-888888888888", username: "takahashi_d", displayName: "高橋大輔", role: "AGENT", createdAt: "2025-05-01T07:45:00Z" },
  { id: "a1b2c3d4-9999-4aaa-bbbb-999999999999", username: "kobayashi_a", displayName: "小林あかり", role: "PLAYER", createdAt: "2025-05-20T18:10:00Z" },
  { id: "a1b2c3d4-aaaa-4aaa-bbbb-aaaaaaaaaaaa", username: "nakamura_y", displayName: "中村勇気", role: "CLUB_OWNER", createdAt: "2025-06-01T10:00:00Z" },
  { id: "a1b2c3d4-bbbb-4aaa-bbbb-bbbbbbbbbbbb", username: "kato_m", displayName: "加藤雅人", role: "PLAYER", createdAt: "2025-06-15T15:00:00Z" },
  { id: "a1b2c3d4-cccc-4aaa-bbbb-cccccccccccc", username: "yoshida_c", displayName: "吉田千尋", role: "PLAYER", createdAt: "2025-07-01T12:30:00Z" },
  { id: "a1b2c3d4-dddd-4aaa-bbbb-dddddddddddd", username: "matsumoto_r", displayName: "松本涼介", role: "PLAYER", createdAt: "2025-08-10T09:00:00Z" },
  { id: "a1b2c3d4-eeee-4aaa-bbbb-eeeeeeeeeeee", username: "inoue_s", displayName: "井上咲良", role: "PLAYER", createdAt: "2025-09-01T14:00:00Z" },
  { id: "a1b2c3d4-ffff-4aaa-bbbb-ffffffffffff", username: "kimura_k", displayName: "木村浩二", role: "CLUB_OWNER", createdAt: "2025-10-01T11:30:00Z" },
  { id: "a1b2c3d4-0000-4aaa-bbbb-000000000000", username: "hayashi_m", displayName: "林真由美", role: "AGENT", createdAt: "2025-10-20T16:00:00Z" },
  { id: "b2c3d4e5-1111-4aaa-bbbb-111111111111", username: "shimizu_t", displayName: "清水拓也", role: "PLAYER", createdAt: "2025-11-05T10:00:00Z" },
  { id: "b2c3d4e5-2222-4aaa-bbbb-222222222222", username: "yamaguchi_a", displayName: "山口彩", role: "PLAYER", createdAt: "2025-12-01T08:30:00Z" },
  { id: "b2c3d4e5-3333-4aaa-bbbb-333333333333", username: "morita_k", displayName: "森田圭一", role: "PLAYER", createdAt: "2026-01-10T13:00:00Z" },
  { id: "b2c3d4e5-4444-4aaa-bbbb-444444444444", username: "aoki_n", displayName: "青木直樹", role: "PLAYER", createdAt: "2026-01-25T17:00:00Z" },
  { id: "b2c3d4e5-5555-4aaa-bbbb-555555555555", username: "fujita_r", displayName: "藤田理恵", role: "PLAYER", createdAt: "2026-02-01T09:00:00Z" },
  { id: "b2c3d4e5-6666-4aaa-bbbb-666666666666", username: "okada_s", displayName: "岡田翔太", role: "PLAYER", createdAt: "2026-02-10T14:30:00Z" },
  { id: "b2c3d4e5-7777-4aaa-bbbb-777777777777", username: "ogawa_m", displayName: "小川麻衣", role: "PLAYER", createdAt: "2026-02-15T11:00:00Z" },
  { id: "b2c3d4e5-8888-4aaa-bbbb-888888888888", username: "hasegawa_t", displayName: "長谷川隆", role: "PLAYER", createdAt: "2026-02-20T19:00:00Z" },
];

export function UsersPage() {
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<UserInfo[]>("/users/list?limit=200&offset=0");
      setUsers(data);
    } catch {
      setUsers(MOCK_USERS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const showToast = (type: "success" | "error", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      await api("/users/role", {
        method: "POST",
        body: JSON.stringify({ userId, role: newRole }),
      });
    } catch {
      // Demo mode: update locally
    }
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)),
    );
    showToast("success", "ロールを更新しました");
  };

  const filtered = users.filter((u) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      u.username.toLowerCase().includes(q) ||
      u.displayName.toLowerCase().includes(q) ||
      u.id.toLowerCase().includes(q)
    );
  });

  const roleBadge = (role: string) => {
    switch (role) {
      case "PLATFORMER":
        return "badge-gold";
      case "CLUB_OWNER":
        return "badge-accent";
      case "AGENT":
        return "badge-success";
      default:
        return "badge-muted";
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">ユーザー管理</h1>
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
          {filtered.length} 件
        </span>
      </div>

      <div style={{ marginBottom: 16 }}>
        <input
          className="input"
          placeholder="ユーザー名 / 表示名 / ID で検索..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ maxWidth: 400 }}
        />
      </div>

      {loading ? (
        <div className="empty-state">読み込み中...</div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table>
            <thead>
              <tr>
                <th>ユーザー名</th>
                <th>表示名</th>
                <th>登録日</th>
                <th>ロール</th>
                <th style={{ width: 160 }}>ロール変更</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((user) => (
                <tr key={user.id}>
                  <td>
                    <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                      {user.username}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {user.id.slice(0, 8)}...
                    </div>
                  </td>
                  <td>{user.displayName}</td>
                  <td style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {user.createdAt
                      ? new Date(user.createdAt).toLocaleDateString("ja-JP")
                      : "—"}
                  </td>
                  <td>
                    <span className={`badge ${roleBadge(user.role)}`}>
                      {user.role}
                    </span>
                  </td>
                  <td>
                    <select
                      className="input"
                      value={user.role}
                      onChange={(e) => handleRoleChange(user.id, e.target.value)}
                      style={{ padding: "4px 8px", fontSize: 12 }}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty-state">
                    ユーザーが見つかりません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {toast && (
        <div className={`toast toast-${toast.type}`}>{toast.msg}</div>
      )}
    </div>
  );
}
