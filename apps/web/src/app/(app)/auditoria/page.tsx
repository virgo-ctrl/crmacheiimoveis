"use client";

import { useEffect, useState } from "react";
import { useUser } from "../../../components/app-context";

export default function AuditoriaPage() {
  const user = useUser();
  const [logs, setLogs] = useState<any[]>([]);
  useEffect(() => { fetch("/api/audit").then((r) => r.json()).then((d) => setLogs(d.logs || [])); }, []);

  return (
    <div className="page">
      <div className="page-head">
        <div><h1 className="page-title">Auditoria</h1><p className="page-sub">Trilha imutável de ações relevantes (D5) · escopo {user.role}</p></div>
      </div>

      <div className="card table-card">
        <table>
          <thead><tr><th>Data/hora</th><th>Operador</th><th>Ação</th><th>Ref</th><th>Detalhes</th><th>IP</th></tr></thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td className="muted" style={{ fontSize: "0.8rem" }}>{new Date(log.occurredAt).toLocaleString("pt-BR")}</td>
                <td><strong>{log.actor}</strong></td>
                <td><span className="badge badge-neutral">{log.action}</span></td>
                <td className="mono">{log.entityCode}</td>
                <td style={{ fontSize: "0.83rem" }}>{log.details}</td>
                <td className="muted" style={{ fontSize: "0.8rem" }}>{log.ip}</td>
              </tr>
            ))}
            {logs.length === 0 && <tr><td colSpan={6} className="muted" style={{ textAlign: "center", padding: "2rem" }}>Nenhum evento registrado.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
