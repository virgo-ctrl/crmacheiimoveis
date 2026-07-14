"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const BRAND = "ImobiCRM";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao fazer login.");
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg)" }}>
      {/* Painel visual */}
      <div style={{ flex: 1, background: "var(--sidebar-bg)", color: "#fff", display: "flex", flexDirection: "column", justifyContent: "center", padding: "3rem", gap: "1rem" }} className="login-aside">
        <div className="brand"><div className="brand-logo">⌂</div><span className="brand-name" style={{ fontSize: "1.5rem" }}>{BRAND}</span></div>
        <h1 style={{ color: "#fff", fontSize: "2rem", maxWidth: 420, lineHeight: 1.25 }}>CRM Omnichannel para o mercado imobiliário</h1>
        <p style={{ color: "#aab6d6", maxWidth: 420 }}>Leads, WhatsApp, Instagram, e-mail e chat do site — tudo numa tela, com cada conversa vinculada ao lead.</p>
      </div>

      {/* Formulário */}
      <div style={{ width: 460, maxWidth: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem" }}>
        <div style={{ width: "100%", maxWidth: 360 }}>
          <h2 style={{ marginBottom: 4 }}>Entrar</h2>
          <p style={{ marginBottom: "1.5rem", fontSize: "0.88rem" }}>Acesse o painel da sua imobiliária.</p>

          {error && <div className="badge badge-danger" style={{ display: "block", padding: "0.7rem", marginBottom: "1rem" }}>{error}</div>}

          <form onSubmit={handleLogin}>
            <div className="form-group"><label className="form-label">E-mail</label><input type="email" className="form-input" placeholder="voce@imobiliaria.com" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
            <div className="form-group"><label className="form-label">Senha</label><input type="password" className="form-input" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
            <button type="submit" className="btn btn-primary" style={{ width: "100%", padding: "0.7rem", marginTop: 8 }} disabled={loading}>{loading ? "Autenticando..." : "Entrar"}</button>
          </form>

          <div style={{ marginTop: "1.75rem", borderTop: "1px solid var(--border-color)", paddingTop: "1rem" }}>
            <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>Credenciais de demonstração</p>
            <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: 3 }}>
              <div>Admin: <code>admin@crm.com</code> / <code>admin123</code></div>
              <div>Gerente: <code>gerente@crm.com</code> / <code>gerente123</code></div>
              <div>Corretor: <code>corretor1@crm.com</code> / <code>corretor123</code></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
