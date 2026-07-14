"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BRAND_NAME, useUser } from "./app-context";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "▦" },
  { href: "/leads", label: "Leads", icon: "◎" },
  { href: "/inbox", label: "Inbox Omnichannel", icon: "✉" },
  { href: "/imoveis", label: "Imóveis", icon: "▤" },
  { href: "/equipes", label: "Equipes e Regras", icon: "👥" },
  { href: "/plantoes", label: "Escalas de Plantão", icon: "📅" },
  { href: "/deduplicacao", label: "Deduplicação", icon: "🔍" },
  { href: "/relatorios", label: "Relatórios", icon: "▧" },
  { href: "/auditoria", label: "Auditoria", icon: "⚖" },
  { href: "/configuracoes", label: "Configurações", icon: "⚙" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const user = useUser();

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-logo">⌂</div>
        <span className="brand-name">{BRAND_NAME}</span>
      </div>

      <nav className="nav">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link key={item.href} href={item.href} className={`nav-link ${active ? "active" : ""}`}>
              <span className="nav-ico">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-card">
        <div style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.7, marginBottom: "0.35rem" }}>
          Escopo de dados (RLS)
        </div>
        <div style={{ color: "#fff", fontWeight: 600, fontSize: "0.9rem" }}>
          {user.role === "Admin" ? "Visão total" : user.role === "Gerente" ? "Visão da equipe" : "Meus leads"}
        </div>
        <div style={{ fontSize: "0.75rem", marginTop: "0.15rem", opacity: 0.75 }}>Perfil: {user.role}</div>
      </div>
    </aside>
  );
}
