"use client";

import { useRouter } from "next/navigation";
import { useUser } from "./app-context";

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((n) => n[0]).join("").toUpperCase() || "U";
}

export default function Topbar() {
  const router = useRouter();
  const user = useUser();

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  return (
    <header className="topbar">
      <div className="search-box">
        <span>⌕</span>
        <input placeholder="Buscar por imóveis, clientes, leads..." />
      </div>

      <div className="topbar-spacer" />

      <button className="icon-btn" title="Notificações">
        <span>🔔</span>
        <span className="dot" />
      </button>

      <div className="topbar-user">
        <div className="avatar">{initials(user.name)}</div>
        <div style={{ lineHeight: 1.2 }}>
          <div style={{ fontSize: "0.85rem", fontWeight: 600 }}>{user.name || "Usuário"}</div>
          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{user.role}</div>
        </div>
        <button className="btn btn-ghost" style={{ fontSize: "0.8rem" }} onClick={handleLogout} title="Sair">
          Sair
        </button>
      </div>
    </header>
  );
}
