import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";

export function Layout() {
  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <Sidebar />
      <main
        style={{
          flex: 1,
          overflow: "auto",
          padding: "24px 32px",
          background: "var(--bg-primary)",
        }}
      >
        <Outlet />
      </main>
    </div>
  );
}
