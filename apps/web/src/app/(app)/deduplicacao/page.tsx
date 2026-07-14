"use client";

import { useEffect, useState } from "react";
import { useUser } from "../../../components/app-context";

export default function DeduplicacaoPage() {
  const user = useUser();
  const isAdminOrManager = user.role === "Admin" || user.role === "Gerente";

  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    fetch("/api/admin/dedupe")
      .then((r) => r.json())
      .then((d) => {
        setCandidates(d.candidates || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleAction = async (candidateId: string, action: "merge" | "ignore") => {
    if (action === "merge" && !confirm("Tem certeza que deseja mesclar os dois leads? Esta ação irá unificar históricos de mensagens e timelines, e inativará o lead secundário.")) {
      return;
    }
    const res = await fetch("/api/admin/dedupe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidateId, action }),
    });
    if (res.ok) {
      load();
    } else {
      alert((await res.json()).error);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Central de Deduplicação</h1>
          <p className="page-sub">Identificação inteligente de cadastros duplicados (D3/D4) e ações de mesclagem</p>
        </div>
      </div>

      {!isAdminOrManager && (
        <div className="badge badge-danger" style={{ display: "block", padding: "1rem", marginBottom: 12 }}>
          Permissão negada. Apenas Administradores ou Gerentes podem acessar esta central.
        </div>
      )}

      {isAdminOrManager && (
        <div className="flex-col" style={{ gap: 16 }}>
          {loading && <p className="muted">Carregando candidatos...</p>}
          {!loading && candidates.length === 0 && (
            <div className="card" style={{ padding: "2rem", textAlign: "center" }}>
              <p className="muted">🎉 Excelente! Nenhum lead com suspeita de duplicidade encontrado no momento.</p>
            </div>
          )}

          {candidates.map((c) => (
            <div key={c.id} className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "0.75rem 1.25rem", background: "var(--surface-2)", borderBottom: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>
                  <strong>Suspeita de Duplicidade</strong> · Score de Similaridade: <strong style={{ color: "var(--primary)" }}>{(c.match_score * 100).toFixed(0)}%</strong>
                </span>
                <span className="muted" style={{ fontSize: "0.75rem" }}>Campos correspondentes: {c.match_fields}</span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "var(--border-color)" }}>
                {/* Registro Duplicado / Secundário */}
                <div style={{ padding: "1.25rem", background: "var(--surface)" }}>
                  <div style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--status-danger)", fontWeight: 600, marginBottom: 8 }}>
                    Registro Secundário (Será mesclado e desativado)
                  </div>
                  <h3>{c.entityName}</h3>
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4, fontSize: "0.85rem" }}>
                    <div><span className="muted">Código:</span> <code className="mono">{c.entityCode}</code></div>
                    <div><span className="muted">Telefone:</span> {c.entityPhone}</div>
                    <div><span className="muted">E-mail:</span> {c.entityEmail || "—"}</div>
                  </div>
                </div>

                {/* Registro Original / Principal */}
                <div style={{ padding: "1.25rem", background: "var(--surface)" }}>
                  <div style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--status-success)", fontWeight: 600, marginBottom: 8 }}>
                    Registro Principal (Fará o recebimento dos dados)
                  </div>
                  <h3>{c.matchName}</h3>
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4, fontSize: "0.85rem" }}>
                    <div><span className="muted">Código:</span> <code className="mono">{c.matchCode}</code></div>
                    <div><span className="muted">Telefone:</span> {c.matchPhone}</div>
                    <div><span className="muted">E-mail:</span> {c.matchEmail || "—"}</div>
                  </div>
                </div>
              </div>

              <div style={{ padding: "0.8rem 1.25rem", background: "var(--surface-2)", display: "flex", justifyContent: "flex-end", gap: 8, borderTop: "1px solid var(--border-color)" }}>
                <button className="btn" onClick={() => handleAction(c.id, "ignore")}>
                  Manter Separados (Ignorar)
                </button>
                <button className="btn btn-primary" onClick={() => handleAction(c.id, "merge")}>
                  Mesclar Registros (Unificar Histórico)
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
