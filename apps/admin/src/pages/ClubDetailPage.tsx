import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../api/client";

interface ClubInfo {
  id: string;
  name: string;
  description?: string;
  inviteCode: string;
  ownerId: string;
  isApprovalRequired: boolean;
  feePercent: number;
  memberCount: number;
}

interface MemberInfo {
  userId: string;
  username: string;
  displayName: string;
  role: string;
  alias: string | null;
}

interface PointBalance {
  userId: string;
  clubId: string;
  balance: number;
}

interface PointTransaction {
  id: string;
  userId: string;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  createdAt: string;
}

type Tab = "members" | "points" | "settings";

export function ClubDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [club, setClub] = useState<ClubInfo | null>(null);
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [tab, setTab] = useState<Tab>("members");
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // Points tab state
  const [selectedMember, setSelectedMember] = useState<string>("");
  const [memberBalance, setMemberBalance] = useState<PointBalance | null>(null);
  const [memberTx, setMemberTx] = useState<PointTransaction[]>([]);
  const [pointAction, setPointAction] = useState<"deposit" | "withdraw" | "adjust">("deposit");
  const [pointAmount, setPointAmount] = useState("");
  const [pointDesc, setPointDesc] = useState("");

  // Settings tab state
  const [settingsFee, setSettingsFee] = useState("");
  const [settingsApproval, setSettingsApproval] = useState(false);
  const [settingsGps, setSettingsGps] = useState("");
  const [settingsName, setSettingsName] = useState("");

  const showToast = (type: "success" | "error", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  };

  const MOCK_CLUBS: Record<string, ClubInfo> = {
    "c001-aaaa": { id: "c001-aaaa", name: "東風荘", description: "初心者から上級者まで歓迎。東風戦メイン。", inviteCode: "TFZ-2025", ownerId: "u002", isApprovalRequired: false, feePercent: 5, memberCount: 42 },
    "c002-bbbb": { id: "c002-bbbb", name: "雀友会", description: "週末の定期卓を中心に活動中。", inviteCode: "JYK-8823", ownerId: "u010", isApprovalRequired: true, feePercent: 3, memberCount: 28 },
    "c003-cccc": { id: "c003-cccc", name: "麻雀倶楽部 竜王", description: "段位戦・トーナメント開催。上級者向け。", inviteCode: "RYU-5501", ownerId: "u002", isApprovalRequired: true, feePercent: 8, memberCount: 15 },
    "c004-dddd": { id: "c004-dddd", name: "てんほう卓", description: "三人麻雀（サンマ）専門クラブ。", inviteCode: "TNH-3347", ownerId: "u010", isApprovalRequired: false, feePercent: 2, memberCount: 8 },
    "c005-eeee": { id: "c005-eeee", name: "鳳凰クラブ", description: "プロ志望者向け。高レート半荘戦。", inviteCode: "PHX-7712", ownerId: "u015", isApprovalRequired: true, feePercent: 10, memberCount: 35 },
  };

  const MOCK_MEMBERS: MemberInfo[] = [
    { userId: "u002", username: "tanaka_t", displayName: "田中太郎", role: "OWNER", alias: null },
    { userId: "u003", username: "suzuki_h", displayName: "鈴木花子", role: "AGENT", alias: null },
    { userId: "u004", username: "yamada_i", displayName: "山田一郎", role: "MEMBER", alias: "ヤマ" },
    { userId: "u005", username: "sato_m", displayName: "佐藤美咲", role: "MEMBER", alias: null },
    { userId: "u006", username: "ito_k", displayName: "伊藤健太", role: "MEMBER", alias: null },
    { userId: "u007", username: "watanabe_y", displayName: "渡辺優子", role: "MEMBER", alias: null },
    { userId: "u013", username: "matsumoto_r", displayName: "松本涼介", role: "MEMBER", alias: null },
    { userId: "u014", username: "inoue_s", displayName: "井上咲良", role: "MEMBER", alias: null },
  ];

  const loadClub = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [clubData, membersData] = await Promise.all([
        api<ClubInfo>(`/clubs/${id}`),
        api<MemberInfo[]>(`/clubs/${id}/members`),
      ]);
      setClub(clubData);
      setMembers(membersData);
      setSettingsFee(String(clubData.feePercent));
      setSettingsApproval(clubData.isApprovalRequired);
      setSettingsName(clubData.name);
    } catch {
      // Demo mode: use mock data
      const mockClub = MOCK_CLUBS[id] ?? MOCK_CLUBS["c001-aaaa"];
      setClub(mockClub);
      setMembers(MOCK_MEMBERS);
      setSettingsFee(String(mockClub.feePercent));
      setSettingsApproval(mockClub.isApprovalRequired);
      setSettingsName(mockClub.name);
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    loadClub();
  }, [loadClub]);

  // Load member balance/transactions
  const loadMemberPoints = async (userId: string) => {
    if (!id) return;
    try {
      const [balance, txs] = await Promise.all([
        api<PointBalance>(`/points/${id}/balance`).catch(() => null),
        api<PointTransaction[]>(`/points/${id}/transactions`).catch(() => []),
      ]);
      setMemberBalance(balance ?? { userId, clubId: id, balance: 12500 });
      setMemberTx(txs.length > 0 ? txs : [
        { id: "pt1", userId, type: "DEPOSIT", amount: 10000, balanceBefore: 0, balanceAfter: 10000, createdAt: "2026-02-18T10:00:00Z" },
        { id: "pt2", userId, type: "GAME_RESULT", amount: 3200, balanceBefore: 10000, balanceAfter: 13200, createdAt: "2026-02-19T20:30:00Z" },
        { id: "pt3", userId, type: "GAME_FEE", amount: -660, balanceBefore: 13200, balanceAfter: 12540, createdAt: "2026-02-19T20:30:00Z" },
        { id: "pt4", userId, type: "GAME_RESULT", amount: -40, balanceBefore: 12540, balanceAfter: 12500, createdAt: "2026-02-21T21:00:00Z" },
      ]);
    } catch {
      setMemberBalance({ userId, clubId: id, balance: 12500 });
      setMemberTx([
        { id: "pt1", userId, type: "DEPOSIT", amount: 10000, balanceBefore: 0, balanceAfter: 10000, createdAt: "2026-02-18T10:00:00Z" },
        { id: "pt2", userId, type: "GAME_RESULT", amount: 3200, balanceBefore: 10000, balanceAfter: 13200, createdAt: "2026-02-19T20:30:00Z" },
        { id: "pt3", userId, type: "GAME_FEE", amount: -660, balanceBefore: 13200, balanceAfter: 12540, createdAt: "2026-02-19T20:30:00Z" },
        { id: "pt4", userId, type: "GAME_RESULT", amount: -40, balanceBefore: 12540, balanceAfter: 12500, createdAt: "2026-02-21T21:00:00Z" },
      ]);
    }
    setSelectedMember(userId);
  };

  const handleRoleChange = async (targetUserId: string, newRole: string) => {
    if (!id) return;
    try {
      await api(`/clubs/${id}/members/role`, {
        method: "POST",
        body: JSON.stringify({ targetUserId, newRole }),
      });
      setMembers((prev) =>
        prev.map((m) =>
          m.userId === targetUserId ? { ...m, role: newRole } : m,
        ),
      );
      showToast("success", "ロールを更新しました");
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "更新に失敗しました");
    }
  };

  const handleRemoveMember = async (targetUserId: string) => {
    if (!id || !confirm("このメンバーを削除しますか？")) return;
    try {
      await api(`/clubs/${id}/members/remove`, {
        method: "POST",
        body: JSON.stringify({ targetUserId }),
      });
      setMembers((prev) => prev.filter((m) => m.userId !== targetUserId));
      showToast("success", "メンバーを削除しました");
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "削除に失敗しました");
    }
  };

  const handlePointAction = async () => {
    if (!id || !selectedMember || !pointAmount) return;
    const amount = parseInt(pointAmount, 10);
    if (isNaN(amount) || amount <= 0) {
      showToast("error", "正の整数を入力してください");
      return;
    }
    try {
      const body: Record<string, unknown> = { userId: selectedMember, amount };
      if (pointAction === "adjust") {
        body.description = pointDesc || "管理者による調整";
      }
      await api(`/points/${id}/${pointAction}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      showToast("success", "ポイント操作が完了しました");
      setPointAmount("");
      setPointDesc("");
      loadMemberPoints(selectedMember);
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "操作に失敗しました");
    }
  };

  const handleSaveSettings = async () => {
    if (!id) return;
    try {
      await api(`/clubs/${id}/settings`, {
        method: "PATCH",
        body: JSON.stringify({
          name: settingsName,
          feePercent: parseFloat(settingsFee) || 0,
          isApprovalRequired: settingsApproval,
          gpsRestrictionKm: parseFloat(settingsGps) || 0,
        }),
      });
      showToast("success", "設定を保存しました");
      loadClub();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "保存に失敗しました");
    }
  };

  if (loading) return <div className="empty-state">読み込み中...</div>;
  if (!club) return null;

  const memberRoleBadge = (role: string) => {
    switch (role) {
      case "OWNER": return "badge-gold";
      case "AGENT": return "badge-accent";
      default: return "badge-muted";
    }
  };

  const txTypeBadge = (type: string) => {
    switch (type) {
      case "DEPOSIT": return "badge-success";
      case "WITHDRAWAL": return "badge-danger";
      case "GAME_RESULT": return "badge-accent";
      case "GAME_FEE": return "badge-gold";
      default: return "badge-muted";
    }
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => navigate("/clubs")}
          style={{ marginBottom: 12 }}
        >
          ← クラブ一覧
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <h1 className="page-title">{club.name}</h1>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            招待: <code>{club.inviteCode}</code>
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 0,
          borderBottom: "1px solid var(--border-subtle)",
          marginBottom: 20,
        }}
      >
        {(["members", "points", "settings"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "10px 20px",
              background: "transparent",
              border: "none",
              borderBottom: tab === t ? "2px solid var(--accent)" : "2px solid transparent",
              color: tab === t ? "var(--text-primary)" : "var(--text-muted)",
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            {t === "members" && `メンバー (${members.length})`}
            {t === "points" && "ポイント管理"}
            {t === "settings" && "設定"}
          </button>
        ))}
      </div>

      {/* Members Tab */}
      {tab === "members" && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table>
            <thead>
              <tr>
                <th>ユーザー</th>
                <th>エイリアス</th>
                <th>ロール</th>
                <th>ロール変更</th>
                <th style={{ width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.userId}>
                  <td>
                    <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                      {m.displayName}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      @{m.username}
                    </div>
                  </td>
                  <td>{m.alias ?? "—"}</td>
                  <td>
                    <span className={`badge ${memberRoleBadge(m.role)}`}>
                      {m.role}
                    </span>
                  </td>
                  <td>
                    <select
                      className="input"
                      value={m.role}
                      onChange={(e) => handleRoleChange(m.userId, e.target.value)}
                      style={{ padding: "4px 8px", fontSize: 12 }}
                      disabled={m.role === "OWNER"}
                    >
                      <option value="MEMBER">MEMBER</option>
                      <option value="AGENT">AGENT</option>
                      <option value="OWNER">OWNER</option>
                    </select>
                  </td>
                  <td>
                    {m.role !== "OWNER" && (
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleRemoveMember(m.userId)}
                      >
                        削除
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Points Tab */}
      {tab === "points" && (
        <div>
          <div className="card" style={{ marginBottom: 20 }}>
            <h3
              style={{
                fontSize: 15,
                fontWeight: 700,
                marginBottom: 14,
                color: "var(--text-primary)",
              }}
            >
              ポイント操作
            </h3>

            <div className="form-row">
              <div className="form-group">
                <label className="label">メンバー選択</label>
                <select
                  className="input"
                  value={selectedMember}
                  onChange={(e) => {
                    setSelectedMember(e.target.value);
                    if (e.target.value) loadMemberPoints(e.target.value);
                  }}
                >
                  <option value="">選択してください</option>
                  {members.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.displayName} (@{m.username})
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ maxWidth: 150 }}>
                <label className="label">操作</label>
                <select
                  className="input"
                  value={pointAction}
                  onChange={(e) => setPointAction(e.target.value as "deposit" | "withdraw" | "adjust")}
                >
                  <option value="deposit">配布</option>
                  <option value="withdraw">回収</option>
                  <option value="adjust">調整</option>
                </select>
              </div>
              <div className="form-group" style={{ maxWidth: 140 }}>
                <label className="label">金額</label>
                <input
                  className="input"
                  type="number"
                  min="1"
                  value={pointAmount}
                  onChange={(e) => setPointAmount(e.target.value)}
                  placeholder="0"
                />
              </div>
              {pointAction === "adjust" && (
                <div className="form-group">
                  <label className="label">理由</label>
                  <input
                    className="input"
                    value={pointDesc}
                    onChange={(e) => setPointDesc(e.target.value)}
                    placeholder="調整理由"
                  />
                </div>
              )}
              <button
                className="btn btn-primary"
                onClick={handlePointAction}
                disabled={!selectedMember || !pointAmount}
              >
                実行
              </button>
            </div>

            {selectedMember && memberBalance && (
              <div
                style={{
                  fontSize: 14,
                  color: "var(--text-secondary)",
                  marginTop: 8,
                }}
              >
                現在の残高:{" "}
                <strong style={{ color: "var(--gold)", fontSize: 18 }}>
                  {memberBalance.balance.toLocaleString()}
                </strong>{" "}
                pt
              </div>
            )}
          </div>

          {/* Transaction history */}
          {selectedMember && memberTx.length > 0 && (
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border-subtle)" }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                  取引履歴
                </h3>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>日時</th>
                    <th>種別</th>
                    <th style={{ textAlign: "right" }}>金額</th>
                    <th style={{ textAlign: "right" }}>残高</th>
                  </tr>
                </thead>
                <tbody>
                  {memberTx.slice(0, 50).map((tx) => (
                    <tr key={tx.id}>
                      <td style={{ fontSize: 12, color: "var(--text-muted)" }}>
                        {new Date(tx.createdAt).toLocaleString("ja-JP")}
                      </td>
                      <td>
                        <span className={`badge ${txTypeBadge(tx.type)}`}>
                          {tx.type}
                        </span>
                      </td>
                      <td
                        style={{
                          textAlign: "right",
                          fontWeight: 600,
                          color: tx.amount >= 0 ? "var(--success)" : "var(--danger)",
                        }}
                      >
                        {tx.amount >= 0 ? "+" : ""}
                        {tx.amount.toLocaleString()}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {tx.balanceAfter.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Settings Tab */}
      {tab === "settings" && (
        <div className="card" style={{ maxWidth: 500 }}>
          <h3
            style={{
              fontSize: 15,
              fontWeight: 700,
              marginBottom: 18,
              color: "var(--text-primary)",
            }}
          >
            クラブ設定
          </h3>

          <div className="form-group" style={{ marginBottom: 16 }}>
            <label className="label">クラブ名</label>
            <input
              className="input"
              value={settingsName}
              onChange={(e) => setSettingsName(e.target.value)}
            />
          </div>

          <div className="form-group" style={{ marginBottom: 16 }}>
            <label className="label">手数料 (%)</label>
            <input
              className="input"
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={settingsFee}
              onChange={(e) => setSettingsFee(e.target.value)}
            />
          </div>

          <div className="form-group" style={{ marginBottom: 16 }}>
            <label className="label">GPS距離制限 (km, 0=無制限)</label>
            <input
              className="input"
              type="number"
              min="0"
              step="0.1"
              value={settingsGps}
              onChange={(e) => setSettingsGps(e.target.value)}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                cursor: "pointer",
                fontSize: 14,
                color: "var(--text-secondary)",
              }}
            >
              <input
                type="checkbox"
                checked={settingsApproval}
                onChange={(e) => setSettingsApproval(e.target.checked)}
              />
              承認制を有効にする
            </label>
          </div>

          <button className="btn btn-primary" onClick={handleSaveSettings}>
            設定を保存
          </button>
        </div>
      )}

      {toast && (
        <div className={`toast toast-${toast.type}`}>{toast.msg}</div>
      )}
    </div>
  );
}
