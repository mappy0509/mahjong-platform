import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
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

export function ClubsPage() {
  const [clubs, setClubs] = useState<ClubInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await api<ClubInfo[]>("/clubs");
        setClubs(data);
      } catch {
        setClubs([
          { id: "c001-aaaa", name: "東風荘", description: "初心者から上級者まで歓迎。東風戦メインのクラブです。毎日21時に定期卓あり。", inviteCode: "TFZ-2025", ownerId: "u002", isApprovalRequired: false, feePercent: 5, memberCount: 42 },
          { id: "c002-bbbb", name: "雀友会", description: "週末の定期卓を中心に活動中。半荘戦がメイン。", inviteCode: "JYK-8823", ownerId: "u010", isApprovalRequired: true, feePercent: 3, memberCount: 28 },
          { id: "c003-cccc", name: "麻雀倶楽部 竜王", description: "段位戦・トーナメント開催。上級者向けクラブ。", inviteCode: "RYU-5501", ownerId: "u002", isApprovalRequired: true, feePercent: 8, memberCount: 15 },
          { id: "c004-dddd", name: "てんほう卓", description: "三人麻雀（サンマ）専門クラブ。北抜きドラあり。", inviteCode: "TNH-3347", ownerId: "u010", isApprovalRequired: false, feePercent: 2, memberCount: 8 },
          { id: "c005-eeee", name: "鳳凰クラブ", description: "プロ志望者向け。高レートの本格半荘戦。", inviteCode: "PHX-7712", ownerId: "u015", isApprovalRequired: true, feePercent: 10, memberCount: 35 },
        ]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">クラブ管理</h1>
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
          {clubs.length} クラブ
        </span>
      </div>

      {loading ? (
        <div className="empty-state">読み込み中...</div>
      ) : clubs.length === 0 ? (
        <div className="empty-state">クラブがありません</div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: 16,
          }}
        >
          {clubs.map((club) => (
            <Link
              key={club.id}
              to={`/clubs/${club.id}`}
              style={{ textDecoration: "none" }}
            >
              <div
                className="card"
                style={{
                  cursor: "pointer",
                  transition: "border-color 0.2s",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 10,
                  }}
                >
                  <h3
                    style={{
                      fontSize: 17,
                      fontWeight: 700,
                      color: "var(--text-primary)",
                    }}
                  >
                    {club.name}
                  </h3>
                  <span
                    style={{ fontSize: 22, color: "var(--accent)", fontWeight: 300 }}
                  >
                    ›
                  </span>
                </div>

                {club.description && (
                  <div
                    style={{
                      fontSize: 13,
                      color: "var(--text-muted)",
                      marginBottom: 10,
                    }}
                  >
                    {club.description}
                  </div>
                )}

                <div
                  style={{
                    display: "flex",
                    gap: 16,
                    fontSize: 12,
                    color: "var(--text-secondary)",
                  }}
                >
                  <span>メンバー: {club.memberCount}</span>
                  <span>手数料: {club.feePercent}%</span>
                  <span>
                    承認制:{" "}
                    {club.isApprovalRequired ? (
                      <span style={{ color: "var(--success)" }}>ON</span>
                    ) : (
                      <span style={{ color: "var(--text-muted)" }}>OFF</span>
                    )}
                  </span>
                </div>

                <div
                  style={{
                    marginTop: 8,
                    fontSize: 11,
                    color: "var(--text-muted)",
                  }}
                >
                  招待コード:{" "}
                  <code
                    style={{
                      background: "rgba(255,255,255,0.06)",
                      padding: "2px 6px",
                      borderRadius: 4,
                    }}
                  >
                    {club.inviteCode}
                  </code>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
