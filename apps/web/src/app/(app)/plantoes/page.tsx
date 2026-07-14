"use client";

import { useEffect, useState } from "react";
import { useUser } from "../../../components/app-context";

export default function PlantoesPage() {
  const user = useUser();
  const isAdmin = user.role === "Admin";
  const isManager = user.role === "Gerente";
  const canEdit = isAdmin || isManager;

  const [shifts, setShifts] = useState<any[]>([]);
  const [brokers, setBrokers] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [editingShift, setEditingShift] = useState<any | null>(null); // {} = novo, { id } = edit, null = fechar

  const loadData = () => {
    fetch("/api/admin/shifts").then((r) => r.json()).then((d) => setShifts(d.shifts || []));
    fetch("/api/admin/users").then((r) => r.json()).then((d) => setBrokers(d.users || []));
    fetch("/api/admin/teams").then((r) => r.json()).then((d) => setTeams(d.teams || []));
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveShift = async (e: React.FormEvent, fData: any) => {
    e.preventDefault();
    const isEdit = !!fData.id;
    const url = "/api/admin/shifts";
    const method = isEdit ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fData),
    });
    if (res.ok) {
      setEditingShift(null);
      loadData();
    } else {
      alert((await res.json()).error);
    }
  };

  const handleDeleteShift = async (id: string) => {
    if (!confirm("Remover este plantão da escala?")) return;
    const res = await fetch("/api/admin/shifts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) loadData();
    else alert((await res.json()).error);
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Escalas de Plantão</h1>
          <p className="page-sub">Escalas de corretores alocados a stands físicos ou atendimento digital</p>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => setEditingShift({})}>
            + Agendar Plantão
          </button>
        )}
      </div>

      <div className="card table-card">
        <div className="card-head">
          <div className="card-title">Plantões Agendados</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Corretor / Equipe</th>
              <th>Local de Plantão</th>
              <th>Horário Inicial</th>
              <th>Horário Final</th>
              <th>Recorrência</th>
              {canEdit && <th style={{ textAlign: "right" }}>Ações</th>}
            </tr>
          </thead>
          <tbody>
            {shifts.map((s) => (
              <tr key={s.id}>
                <td>
                  <strong>{s.brokerName}</strong>
                  {s.teamName && <div className="muted" style={{ fontSize: "0.72rem" }}>{s.teamName}</div>}
                </td>
                <td>
                  <span className="badge badge-info">{s.location}</span>
                </td>
                <td>{new Date(s.starts_at).toLocaleString("pt-BR")}</td>
                <td>{new Date(s.ends_at).toLocaleString("pt-BR")}</td>
                <td className="muted" style={{ fontSize: "0.82rem" }}>{s.recurrence || "Único"}</td>
                {canEdit && (
                  <td>
                    <div className="flex-gap" style={{ justifyContent: "flex-end" }}>
                      <button className="btn" style={{ padding: "0.3rem 0.6rem", fontSize: "0.78rem" }} onClick={() => setEditingShift(s)}>
                        Editar
                      </button>
                      <button className="btn btn-danger" style={{ padding: "0.3rem 0.6rem", fontSize: "0.78rem" }} onClick={() => handleDeleteShift(s.id)}>
                        Excluir
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {shifts.length === 0 && (
              <tr>
                <td colSpan={canEdit ? 6 : 5} className="muted" style={{ textAlign: "center", padding: "2rem" }}>
                  Nenhum plantão agendado para o seu escopo de visualização.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editingShift && (
        <ShiftFormModal
          shiftObj={editingShift}
          brokers={brokers}
          teams={teams}
          onClose={() => setEditingShift(null)}
          onSave={handleSaveShift}
        />
      )}
    </div>
  );
}

function ShiftFormModal({ shiftObj, brokers, teams, onClose, onSave }: any) {
  const isEdit = !!shiftObj.id;
  const [f, setF] = useState({
    id: shiftObj.id || "",
    userId: shiftObj.user_id || "",
    teamId: shiftObj.team_id || "",
    location: shiftObj.location || "Online",
    startsAt: shiftObj.starts_at || "",
    endsAt: shiftObj.ends_at || "",
    recurrence: shiftObj.recurrence || "",
  });

  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{isEdit ? "Editar Plantão" : "Agendar Novo Plantão"}</h2>
        <form onSubmit={(e) => onSave(e, f)}>
          <div className="form-group">
            <label className="form-label">Corretor / Integrante *</label>
            <select className="form-select" value={f.userId} onChange={(e) => set("userId", e.target.value)} required>
              <option value="">Selecione...</option>
              {brokers.map((b: any) => (
                <option key={b.id} value={b.id}>{b.name} ({b.roleName})</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Equipe Relacionada</label>
            <select className="form-select" value={f.teamId} onChange={(e) => set("teamId", e.target.value)}>
              <option value="">Nenhuma</option>
              {teams.map((t: any) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Localização do Plantão *</label>
            <input className="form-input" placeholder="e.g. Stand Vila Mariana, Online, Sede" value={f.location} onChange={(e) => set("location", e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="form-label">Data e Hora Inicial *</label>
            <input className="form-input" type="datetime-local" value={f.startsAt} onChange={(e) => set("startsAt", e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="form-label">Data e Hora Final *</label>
            <input className="form-input" type="datetime-local" value={f.endsAt} onChange={(e) => set("endsAt", e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="form-label">Regra de Recorrência</label>
            <input className="form-input" placeholder="e.g., RRULE:FREQ=DAILY;COUNT=5 (Opcional)" value={f.recurrence} onChange={(e) => set("recurrence", e.target.value)} />
          </div>

          <div className="flex-gap" style={{ marginTop: 16 }}>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Salvar Plantão</button>
            <button type="button" className="btn" style={{ flex: 1 }} onClick={onClose}>Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  );
}
