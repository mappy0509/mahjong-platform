import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";

interface UserInfo {
  id: string;
  username: string;
  displayName: string;
  role: string;
}

interface ClubInfo {
  id: string;
  name: string;
  memberCount: number;
}

const MOCK_USERS: UserInfo[] = [
  { id: "a1b2c3d4-1111-4aaa-bbbb-111111111111", username: "admin", displayName: "管理者", role: "PLATFORMER" },
  { id: "a1b2c3d4-2222-4aaa-bbbb-222222222222", username: "tanaka_t", displayName: "田中太郎", role: "CLUB_OWNER" },
  { id: "a1b2c3d4-3333-4aaa-bbbb-333333333333", username: "suzuki_h", displayName: "鈴木花子", role: "AGENT" },
  { id: "a1b2c3d4-4444-4aaa-bbbb-444444444444", username: "yamada_i", displayName: "山田一郎", role: "PLAYER" },
  { id: "a1b2c3d4-5555-4aaa-bbbb-555555555555", username: "sato_m", displayName: "佐藤美咲", role: "PLAYER" },
  { id: "a1b2c3d4-6666-4aaa-bbbb-666666666666", username: "ito_k", displayName: "伊藤健太", role: "PLAYER" },
  { id: "a1b2c3d4-7777-4aaa-bbbb-777777777777", username: "watanabe_y", displayName: "渡辺優子", role: "PLAYER" },
  { id: "a1b2c3d4-8888-4aaa-bbbb-888888888888", username: "takahashi_d", displayName: "高橋大輔", role: "AGENT" },
  { id: "a1b2c3d4-9999-4aaa-bbbb-999999999999", username: "kobayashi_a", displayName: "小林あかり", role: "PLAYER" },
  { id: "a1b2c3d4-aaaa-4aaa-bbbb-aaaaaaaaaaaa", username: "nakamura_y", displayName: "中村勇気", role: "CLUB_OWNER" },
  { id: "a1b2c3d4-bbbb-4aaa-bbbb-bbbbbbbbbbbb", username: "kato_m", displayName: "加藤雅人", role: "PLAYER" },
  { id: "a1b2c3d4-cccc-4aaa-bbbb-cccccccccccc", username: "yoshida_c", displayName: "吉田千尋", role: "PLAYER" },
  { id: "a1b2c3d4-dddd-4aaa-bbbb-dddddddddddd", username: "matsumoto_r", displayName: "松本涼介", role: "PLAYER" },
  { id: "a1b2c3d4-eeee-4aaa-bbbb-eeeeeeeeeeee", username: "inoue_s", displayName: "井上咲良", role: "PLAYER" },
  { id: "a1b2c3d4-ffff-4aaa-bbbb-ffffffffffff", username: "kimura_k", displayName: "木村浩二", role: "CLUB_OWNER" },
  { id: "a1b2c3d4-0000-4aaa-bbbb-000000000000", username: "hayashi_m", displayName: "林真由美", role: "AGENT" },
  { id: "b2c3d4e5-1111-4aaa-bbbb-111111111111", username: "shimizu_t", displayName: "清水拓也", role: "PLAYER" },
  { id: "b2c3d4e5-2222-4aaa-bbbb-222222222222", username: "yamaguchi_a", displayName: "山口彩", role: "PLAYER" },
  { id: "b2c3d4e5-3333-4aaa-bbbb-333333333333", username: "morita_k", displayName: "森田圭一", role: "PLAYER" },
  { id: "b2c3d4e5-4444-4aaa-bbbb-444444444444", username: "aoki_n", displayName: "青木直樹", role: "PLAYER" },
  { id: "b2c3d4e5-5555-4aaa-bbbb-555555555555", username: "fujita_r", displayName: "藤田理恵", role: "PLAYER" },
  { id: "b2c3d4e5-6666-4aaa-bbbb-666666666666", username: "okada_s", displayName: "岡田翔太", role: "PLAYER" },
  { id: "b2c3d4e5-7777-4aaa-bbbb-777777777777", username: "ogawa_m", displayName: "小川麻衣", role: "PLAYER" },
  { id: "b2c3d4e5-8888-4aaa-bbbb-888888888888", username: "hasegawa_t", displayName: "長谷川隆", role: "PLAYER" },
];

const MOCK_CLUBS: ClubInfo[] = [
  { id: "c001-aaaa", name: "東風荘", memberCount: 42 },
  { id: "c002-bbbb", name: "雀友会", memberCount: 28 },
  { id: "c003-cccc", name: "麻雀倶楽部 竜王", memberCount: 15 },
  { id: "c004-dddd", name: "てんほう卓", memberCount: 8 },
  { id: "c005-eeee", name: "鳳凰クラブ", memberCount: 35 },
];

export function DashboardPage() {
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [clubs, setClubs] = useState<ClubInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [userList, clubList] = await Promise.all([
          api<UserInfo[]>("/users/list?limit=100&offset=0").catch(() => MOCK_USERS),
          api<ClubInfo[]>("/clubs").catch(() => MOCK_CLUBS),
        ]);
        setUsers(userList);
        setClubs(clubList);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return <div className="empty-state">読み込み中...</div>;
  }

  const platformers = users.filter((u) => u.role === "PLATFORMER").length;
  const owners = users.filter((u) => u.role === "CLUB_OWNER").length;
  const agents = users.filter((u) => u.role === "AGENT").length;
  const players = users.filter((u) => u.role === "PLAYER").length;
  const totalMembers = clubs.reduce((sum, c) => sum + c.memberCount, 0);

  return (
    <div>
      <h1 className="page-title" style={{ marginBottom: 24 }}>
        ダッシュボード
      </h1>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">総ユーザー数</div>
          <div className="stat-value">{users.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">クラブ数</div>
          <div className="stat-value">{clubs.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">総メンバー数</div>
          <div className="stat-value">{totalMembers}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">本日の対局数</div>
          <div className="stat-value">37</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">アクティブ卓</div>
          <div className="stat-value">4</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">ダイヤ流通量</div>
          <div className="stat-value">284,500</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
        {/* User breakdown */}
        <div className="card">
          <h3
            style={{
              fontSize: 15,
              fontWeight: 700,
              marginBottom: 14,
              color: "var(--text-primary)",
            }}
          >
            ユーザーロール内訳
          </h3>
          <table>
            <tbody>
              <tr>
                <td>
                  <span className="badge badge-gold">PLATFORMER</span>
                </td>
                <td style={{ textAlign: "right", fontWeight: 600 }}>{platformers}</td>
              </tr>
              <tr>
                <td>
                  <span className="badge badge-accent">CLUB_OWNER</span>
                </td>
                <td style={{ textAlign: "right", fontWeight: 600 }}>{owners}</td>
              </tr>
              <tr>
                <td>
                  <span className="badge badge-success">AGENT</span>
                </td>
                <td style={{ textAlign: "right", fontWeight: 600 }}>{agents}</td>
              </tr>
              <tr>
                <td>
                  <span className="badge badge-muted">PLAYER</span>
                </td>
                <td style={{ textAlign: "right", fontWeight: 600 }}>{players}</td>
              </tr>
            </tbody>
          </table>
          <div style={{ marginTop: 12 }}>
            <Link to="/users" style={{ fontSize: 13 }}>
              ユーザー一覧 →
            </Link>
          </div>
        </div>

        {/* Club list */}
        <div className="card">
          <h3
            style={{
              fontSize: 15,
              fontWeight: 700,
              marginBottom: 14,
              color: "var(--text-primary)",
            }}
          >
            クラブ一覧
          </h3>
          <table>
            <thead>
              <tr>
                <th>名前</th>
                <th style={{ textAlign: "right" }}>メンバー</th>
              </tr>
            </thead>
            <tbody>
              {clubs.slice(0, 5).map((club) => (
                <tr key={club.id}>
                  <td>
                    <Link to={`/clubs/${club.id}`}>{club.name}</Link>
                  </td>
                  <td style={{ textAlign: "right" }}>{club.memberCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 12 }}>
            <Link to="/clubs" style={{ fontSize: 13 }}>
              全クラブ表示 →
            </Link>
          </div>
        </div>
      </div>

      {/* Recent activity */}
      <div className="card">
        <h3
          style={{
            fontSize: 15,
            fontWeight: 700,
            marginBottom: 14,
            color: "var(--text-primary)",
          }}
        >
          最近のアクティビティ
        </h3>
        <table>
          <thead>
            <tr>
              <th>日時</th>
              <th>イベント</th>
              <th>詳細</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>2026/02/22 21:30</td>
              <td><span className="badge badge-accent">対局開始</span></td>
              <td>東風荘 - 東風卓 #8 (山田, 佐藤, 伊藤, 渡辺)</td>
            </tr>
            <tr>
              <td style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>2026/02/22 21:15</td>
              <td><span className="badge badge-success">ユーザー登録</span></td>
              <td>新規ユーザー: 長谷川隆 (@hasegawa_t)</td>
            </tr>
            <tr>
              <td style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>2026/02/22 20:45</td>
              <td><span className="badge badge-gold">ダイヤ購入</span></td>
              <td>佐藤美咲が 1,000 ダイヤ購入</td>
            </tr>
            <tr>
              <td style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>2026/02/22 20:30</td>
              <td><span className="badge badge-muted">対局終了</span></td>
              <td>雀友会 - 半荘卓 #2 完了 (1位: 小林あかり +48)</td>
            </tr>
            <tr>
              <td style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>2026/02/22 19:50</td>
              <td><span className="badge badge-accent">クラブ参加</span></td>
              <td>岡田翔太が鳳凰クラブに参加</td>
            </tr>
            <tr>
              <td style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>2026/02/22 19:15</td>
              <td><span className="badge badge-muted">対局終了</span></td>
              <td>東風荘 - 東風卓 #5 完了 (1位: 山田一郎 +32)</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
