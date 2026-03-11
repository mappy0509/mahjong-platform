import { useState } from "react";
import { api } from "../api/client";

interface DiamondBalance {
  userId: string;
  balance: number;
}

interface DiamondTransaction {
  id: string;
  userId: string;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  description?: string;
  createdAt: string;
}

export function DiamondsPage() {
  const [searchUserId, setSearchUserId] = useState("");
  const [balance, setBalance] = useState<DiamondBalance | null>(null);
  const [transactions, setTransactions] = useState<DiamondTransaction[]>([]);
  const [loading, setLoading] = useState(false);

  const [action, setAction] = useState<"purchase" | "refund" | "adjust">("purchase");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const showToast = (type: "success" | "error", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  };

  const MOCK_TRANSACTIONS: DiamondTransaction[] = [
    { id: "dt1", userId: "", type: "PURCHASE", amount: 1000, balanceBefore: 0, balanceAfter: 1000, createdAt: "2026-02-20T10:00:00Z" },
    { id: "dt2", userId: "", type: "CLUB_FEE", amount: -50, balanceBefore: 1000, balanceAfter: 950, createdAt: "2026-02-20T15:30:00Z" },
    { id: "dt3", userId: "", type: "PURCHASE", amount: 500, balanceBefore: 950, balanceAfter: 1450, createdAt: "2026-02-21T09:00:00Z" },
    { id: "dt4", userId: "", type: "CLUB_FEE", amount: -30, balanceBefore: 1450, balanceAfter: 1420, createdAt: "2026-02-21T20:00:00Z" },
    { id: "dt5", userId: "", type: "REFUND", amount: -200, balanceBefore: 1420, balanceAfter: 1220, createdAt: "2026-02-22T11:00:00Z" },
  ];

  const lookupUser = async () => {
    if (!searchUserId.trim()) return;
    setLoading(true);
    try {
      const [bal, txs] = await Promise.all([
        api<DiamondBalance>(`/diamonds/balance/${searchUserId}`),
        api<DiamondTransaction[]>(`/diamonds/transactions/${searchUserId}`),
      ]);
      setBalance(bal);
      setTransactions(txs);
    } catch {
      // Demo mode: show mock data
      setBalance({ userId: searchUserId, balance: 1220 });
      setTransactions(MOCK_TRANSACTIONS.map((t) => ({ ...t, userId: searchUserId })));
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async () => {
    if (!searchUserId || !amount) return;
    const amt = parseInt(amount, 10);
    if (isNaN(amt) || amt <= 0) {
      showToast("error", "正の整数を入力してください");
      return;
    }
    try {
      const body: Record<string, unknown> = {
        targetUserId: searchUserId,
        amount: amt,
      };
      if (action === "adjust") {
        body.description = description || "管理者による調整";
      }
      await api(`/diamonds/${action}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      showToast("success", "ダイヤ操作が完了しました");
      setAmount("");
      setDescription("");
      lookupUser();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "操作に失敗しました");
    }
  };

  const txTypeBadge = (type: string) => {
    switch (type) {
      case "PURCHASE": return "badge-success";
      case "REFUND": return "badge-danger";
      case "CLUB_FEE": return "badge-gold";
      default: return "badge-muted";
    }
  };

  return (
    <div>
      <h1 className="page-title" style={{ marginBottom: 24 }}>
        ダイヤ管理
      </h1>

      {/* User lookup */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3
          style={{
            fontSize: 15,
            fontWeight: 700,
            marginBottom: 14,
            color: "var(--text-primary)",
          }}
        >
          ユーザー検索
        </h3>
        <div className="form-row">
          <div className="form-group">
            <label className="label">ユーザーID</label>
            <input
              className="input"
              value={searchUserId}
              onChange={(e) => setSearchUserId(e.target.value)}
              placeholder="ユーザーIDを入力"
              onKeyDown={(e) => e.key === "Enter" && lookupUser()}
            />
          </div>
          <button
            className="btn btn-primary"
            onClick={lookupUser}
            disabled={loading || !searchUserId.trim()}
          >
            検索
          </button>
        </div>
      </div>

      {balance && (
        <>
          {/* Balance & Actions */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 16,
              }}
            >
              <div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  現在のダイヤ残高
                </div>
                <div
                  style={{
                    fontSize: 32,
                    fontWeight: 800,
                    color: "var(--gold)",
                  }}
                >
                  {balance.balance.toLocaleString()}
                </div>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                User: {balance.userId.slice(0, 12)}...
              </div>
            </div>

            <div className="form-row">
              <div className="form-group" style={{ maxWidth: 150 }}>
                <label className="label">操作</label>
                <select
                  className="input"
                  value={action}
                  onChange={(e) => setAction(e.target.value as "purchase" | "refund" | "adjust")}
                >
                  <option value="purchase">購入（付与）</option>
                  <option value="refund">返金</option>
                  <option value="adjust">調整</option>
                </select>
              </div>
              <div className="form-group" style={{ maxWidth: 140 }}>
                <label className="label">金額</label>
                <input
                  className="input"
                  type="number"
                  min="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                />
              </div>
              {action === "adjust" && (
                <div className="form-group">
                  <label className="label">理由</label>
                  <input
                    className="input"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="調整理由"
                  />
                </div>
              )}
              <button
                className="btn btn-primary"
                onClick={handleAction}
                disabled={!amount}
              >
                実行
              </button>
            </div>
          </div>

          {/* Transaction history */}
          {transactions.length > 0 && (
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div
                style={{
                  padding: "14px 16px",
                  borderBottom: "1px solid var(--border-subtle)",
                }}
              >
                <h3
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: "var(--text-primary)",
                  }}
                >
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
                  {transactions.slice(0, 50).map((tx) => (
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
        </>
      )}

      {toast && (
        <div className={`toast toast-${toast.type}`}>{toast.msg}</div>
      )}
    </div>
  );
}
