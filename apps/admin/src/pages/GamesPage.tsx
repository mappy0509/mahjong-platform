import { useEffect, useState } from "react";
import { api } from "../api/client";

interface ClubInfo {
  id: string;
  name: string;
}

interface GameRoom {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  participants: {
    userId: string;
    seat: number;
    user: { id: string; displayName: string };
  }[];
}

export function GamesPage() {
  const [clubs, setClubs] = useState<ClubInfo[]>([]);
  const [selectedClub, setSelectedClub] = useState<string>("");
  const [rooms, setRooms] = useState<GameRoom[]>([]);
  const [finishedRooms, setFinishedRooms] = useState<GameRoom[]>([]);
  const [loading, setLoading] = useState(true);

  const MOCK_CLUBS: ClubInfo[] = [
    { id: "c001-aaaa", name: "東風荘" },
    { id: "c002-bbbb", name: "雀友会" },
    { id: "c003-cccc", name: "麻雀倶楽部 竜王" },
    { id: "c004-dddd", name: "てんほう卓" },
  ];

  const MOCK_ROOMS: GameRoom[] = [
    { id: "r001", name: "東風卓 #1", status: "PLAYING", createdAt: "2026-02-22T20:00:00Z", updatedAt: "2026-02-22T20:30:00Z", participants: [{ userId: "u004", seat: 0, user: { id: "u004", displayName: "山田一郎" } }, { userId: "u005", seat: 1, user: { id: "u005", displayName: "佐藤美咲" } }, { userId: "u006", seat: 2, user: { id: "u006", displayName: "伊藤健太" } }, { userId: "u007", seat: 3, user: { id: "u007", displayName: "渡辺優子" } }] },
    { id: "r002", name: "半荘卓 #3", status: "WAITING", createdAt: "2026-02-22T21:00:00Z", updatedAt: "2026-02-22T21:00:00Z", participants: [{ userId: "u009", seat: 0, user: { id: "u009", displayName: "小林あかり" } }] },
  ];

  const MOCK_FINISHED: GameRoom[] = [
    { id: "r010", name: "東風卓 #5", status: "FINISHED", createdAt: "2026-02-22T18:00:00Z", updatedAt: "2026-02-22T19:15:00Z", participants: [{ userId: "u004", seat: 0, user: { id: "u004", displayName: "山田一郎" } }, { userId: "u011", seat: 1, user: { id: "u011", displayName: "加藤雅人" } }, { userId: "u012", seat: 2, user: { id: "u012", displayName: "吉田千尋" } }, { userId: "u006", seat: 3, user: { id: "u006", displayName: "伊藤健太" } }] },
    { id: "r011", name: "半荘卓 #2", status: "FINISHED", createdAt: "2026-02-22T16:00:00Z", updatedAt: "2026-02-22T17:45:00Z", participants: [{ userId: "u005", seat: 0, user: { id: "u005", displayName: "佐藤美咲" } }, { userId: "u007", seat: 1, user: { id: "u007", displayName: "渡辺優子" } }, { userId: "u009", seat: 2, user: { id: "u009", displayName: "小林あかり" } }, { userId: "u004", seat: 3, user: { id: "u004", displayName: "山田一郎" } }] },
    { id: "r012", name: "サンマ卓 #1", status: "FINISHED", createdAt: "2026-02-22T14:00:00Z", updatedAt: "2026-02-22T15:20:00Z", participants: [{ userId: "u006", seat: 0, user: { id: "u006", displayName: "伊藤健太" } }, { userId: "u011", seat: 1, user: { id: "u011", displayName: "加藤雅人" } }, { userId: "u012", seat: 2, user: { id: "u012", displayName: "吉田千尋" } }] },
  ];

  useEffect(() => {
    async function load() {
      try {
        const data = await api<ClubInfo[]>("/clubs");
        setClubs(data);
        if (data.length > 0) {
          setSelectedClub(data[0].id);
        }
      } catch {
        setClubs(MOCK_CLUBS);
        setSelectedClub(MOCK_CLUBS[0].id);
      }
      setLoading(false);
    }
    load();
  }, []);

  useEffect(() => {
    if (!selectedClub) return;
    loadRooms();
  }, [selectedClub]);

  const loadRooms = async () => {
    if (!selectedClub) return;
    setLoading(true);
    try {
      const active = await api<GameRoom[]>(
        `/games/clubs/${selectedClub}/rooms`,
      );
      setRooms(active);

      const finished = await api<GameRoom[]>(
        `/games/clubs/${selectedClub}/rooms?includeFinished=true`,
      ).catch(() => []);
      setFinishedRooms(finished.filter((r) => r.status === "FINISHED"));
    } catch {
      setRooms(MOCK_ROOMS);
      setFinishedRooms(MOCK_FINISHED);
    }
    setLoading(false);
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "WAITING":
        return "badge-accent";
      case "PLAYING":
        return "badge-gold";
      case "FINISHED":
        return "badge-muted";
      default:
        return "badge-muted";
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case "WAITING":
        return "待機中";
      case "PLAYING":
        return "対局中";
      case "FINISHED":
        return "終了";
      default:
        return status;
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">対局管理</h1>
      </div>

      {/* Club selector */}
      {clubs.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <label className="label">クラブ選択</label>
          <select
            className="input"
            value={selectedClub}
            onChange={(e) => setSelectedClub(e.target.value)}
            style={{ maxWidth: 300 }}
          >
            {clubs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {loading ? (
        <div className="empty-state">読み込み中...</div>
      ) : (
        <>
          {/* Active rooms */}
          <div style={{ marginBottom: 24 }}>
            <h3
              style={{
                fontSize: 15,
                fontWeight: 700,
                marginBottom: 12,
                color: "var(--text-primary)",
              }}
            >
              アクティブなルーム ({rooms.length})
            </h3>

            {rooms.length === 0 ? (
              <div className="empty-state">アクティブなルームはありません</div>
            ) : (
              <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                <table>
                  <thead>
                    <tr>
                      <th>ルーム名</th>
                      <th>ステータス</th>
                      <th>プレイヤー</th>
                      <th>作成日時</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rooms.map((room) => (
                      <tr key={room.id}>
                        <td style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                          {room.name}
                        </td>
                        <td>
                          <span className={`badge ${statusBadge(room.status)}`}>
                            {statusLabel(room.status)}
                          </span>
                        </td>
                        <td>
                          {room.participants
                            ?.map((p) => p.user?.displayName)
                            .filter(Boolean)
                            .join(", ") || "—"}
                        </td>
                        <td style={{ fontSize: 12, color: "var(--text-muted)" }}>
                          {new Date(room.createdAt).toLocaleString("ja-JP")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Recent finished rooms */}
          {finishedRooms.length > 0 && (
            <div>
              <h3
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  marginBottom: 12,
                  color: "var(--text-primary)",
                }}
              >
                最近の対局 ({finishedRooms.length})
              </h3>
              <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                <table>
                  <thead>
                    <tr>
                      <th>ルーム名</th>
                      <th>プレイヤー</th>
                      <th>終了日時</th>
                    </tr>
                  </thead>
                  <tbody>
                    {finishedRooms.slice(0, 20).map((room) => (
                      <tr key={room.id}>
                        <td style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                          {room.name}
                        </td>
                        <td>
                          {room.participants
                            ?.map((p) => p.user?.displayName)
                            .filter(Boolean)
                            .join(", ") || "—"}
                        </td>
                        <td style={{ fontSize: 12, color: "var(--text-muted)" }}>
                          {new Date(room.updatedAt).toLocaleString("ja-JP")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
