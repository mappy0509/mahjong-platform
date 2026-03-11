import { NavLink, useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/auth-store";

const NAV_ITEMS = [
  { to: "/", label: "ダッシュボード" },
  { to: "/users", label: "ユーザー管理" },
  { to: "/clubs", label: "クラブ管理" },
  { to: "/games", label: "対局管理" },
  { to: "/diamonds", label: "ダイヤ管理" },
];

export function Sidebar() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <aside
      style={{
        width: 220,
        background: "var(--bg-secondary)",
        borderRight: "1px solid var(--border-subtle)",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
      }}
    >
      {/* Logo */}
      <div
        style={{
          padding: "24px 20px 20px",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <div
          style={{
            fontSize: 18,
            fontWeight: 900,
            color: "var(--gold)",
            letterSpacing: 3,
          }}
        >
          MAHJONG
        </div>
        <div
          style={{
            fontSize: 10,
            color: "var(--text-muted)",
            letterSpacing: 1.5,
            marginTop: 2,
            textTransform: "uppercase",
          }}
        >
          Admin Console
        </div>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: "16px 10px" }}>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            style={({ isActive }) => ({
              display: "block",
              padding: "10px 14px",
              borderRadius: "var(--radius)",
              fontSize: 13,
              fontWeight: isActive ? 700 : 500,
              color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
              background: isActive ? "rgba(26, 120, 136, 0.15)" : "transparent",
              borderLeft: isActive ? "3px solid var(--accent)" : "3px solid transparent",
              marginBottom: 2,
              textDecoration: "none",
              transition: "all 0.15s",
            })}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* User info */}
      <div
        style={{
          padding: "16px 14px",
          borderTop: "1px solid var(--border-subtle)",
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--text-primary)",
            marginBottom: 2,
          }}
        >
          {user?.displayName ?? user?.username}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--text-muted)",
            marginBottom: 10,
          }}
        >
          {user?.role ?? "ADMIN"}
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={handleLogout}
          style={{ width: "100%" }}
        >
          ログアウト
        </button>
      </div>
    </aside>
  );
}
