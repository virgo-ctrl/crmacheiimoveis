"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const BRAND = "ImobiCRM";

const DEMO_CREDENTIALS = [
  { label: "Admin", email: "admin@crm.com", password: "admin123" },
  { label: "Gerente", email: "gerente@crm.com", password: "gerente123" },
  { label: "Corretor", email: "corretor1@crm.com", password: "corretor123" },
];

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeDemo, setActiveDemo] = useState<string | null>(null);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao fazer login.");
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fillCredential = (cred: (typeof DEMO_CREDENTIALS)[0]) => {
    setEmail(cred.email);
    setPassword(cred.password);
    setActiveDemo(cred.label);
    setError("");
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg)" }}>
      {/* Painel visual */}
      <div
        style={{
          flex: 1,
          background: "var(--sidebar-bg)",
          color: "#fff",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "3rem",
          gap: "1rem",
        }}
        className="login-aside"
      >
        <div className="brand">
          <div className="brand-logo">⌂</div>
          <span className="brand-name" style={{ fontSize: "1.5rem" }}>{BRAND}</span>
        </div>
        <h1 style={{ color: "#fff", fontSize: "2rem", maxWidth: 420, lineHeight: 1.25 }}>
          CRM Omnichannel para o mercado imobiliário
        </h1>
        <p style={{ color: "#aab6d6", maxWidth: 420 }}>
          Leads, WhatsApp, Instagram, e-mail e chat do site — tudo numa tela, com cada conversa vinculada ao lead.
        </p>
      </div>

      {/* Formulário */}
      <div
        style={{
          width: 460,
          maxWidth: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
        }}
      >
        <div style={{ width: "100%", maxWidth: 360 }}>
          <h2 style={{ marginBottom: 4 }}>Entrar</h2>
          <p style={{ marginBottom: "1.5rem", fontSize: "0.88rem" }}>
            Acesse o painel da sua imobiliária.
          </p>

          {error && (
            <div
              className="badge badge-danger"
              style={{ display: "block", padding: "0.7rem", marginBottom: "1rem" }}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label className="form-label">E-mail</label>
              <input
                type="email"
                className="form-input"
                placeholder="voce@imobiliaria.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setActiveDemo(null); }}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Senha</label>
              <input
                type="password"
                className="form-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setActiveDemo(null); }}
                required
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: "100%", padding: "0.7rem", marginTop: 8 }}
              disabled={loading}
            >
              {loading ? "Autenticando..." : "Entrar"}
            </button>
          </form>

          {/* Credenciais de demonstração */}
          <div style={{ marginTop: "1.75rem", borderTop: "1px solid var(--border-color)", paddingTop: "1rem" }}>
            <p
              style={{
                fontSize: "0.72rem",
                color: "var(--text-muted)",
                marginBottom: "0.6rem",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              Credenciais de demonstração
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {DEMO_CREDENTIALS.map((cred) => (
                <button
                  key={cred.label}
                  type="button"
                  onClick={() => fillCredential(cred)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0.5rem 0.75rem",
                    borderRadius: 6,
                    border: `1px solid ${activeDemo === cred.label ? "var(--primary)" : "var(--border-color)"}`,
                    background: activeDemo === cred.label ? "color-mix(in srgb, var(--primary) 10%, transparent)" : "var(--card-bg)",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "border-color 0.15s, background 0.15s",
                  }}
                >
                  <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-primary)" }}>
                    {cred.label}
                  </span>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontFamily: "monospace" }}>
                    {cred.email}
                  </span>
                </button>
              ))}
            </div>
            <p style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.5rem" }}>
              Clique em uma credencial para preencher automaticamente.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
