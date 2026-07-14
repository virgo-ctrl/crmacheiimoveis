"use client";

import { useEffect, useState } from "react";
import { useUser } from "../../../components/app-context";

export default function EquipesPage() {
  const user = useUser();
  const isAdmin = user.role === "Admin";
  const isManager = user.role === "Gerente";

  const [usersList, setUsersList] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);

  // Modals/Forms State
  const [userModal, setUserModal] = useState<any | null>(null); // {} = novo, { id } = edit, null = fechar
  const [teamModal, setTeamModal] = useState<any | null>(null);
  const [ruleModal, setRuleModal] = useState<any | null>(null);

  const [pushStatus, setPushStatus] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadData = () => {
    fetch("/api/admin/users").then((r) => r.json()).then((d) => setUsersList(d.users || []));
    fetch("/api/admin/teams").then((r) => r.json()).then((d) => setTeams(d.teams || []));
    fetch("/api/admin/rules").then((r) => r.json()).then((d) => setRules(d.rules || []));
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleTestPush = async (userId: string) => {
    setPushStatus("Testando envio de push...");
    const res = await fetch("/api/admin/users", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: userId, testPush: true }),
    });
    const data = await res.json();
    if (res.ok) {
      setPushStatus(data.pushStatusMessage);
      loadData();
    } else {
      setPushStatus("Erro ao testar push: " + data.error);
    }
    setTimeout(() => setPushStatus(null), 5000);
  };

  const handleSaveUser = async (e: React.FormEvent, fData: any) => {
    e.preventDefault();
    setFeedback(null);
    const isEdit = !!fData.id;
    const url = "/api/admin/users";
    const method = isEdit ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fData),
    });
    const data = await res.json();
    if (res.ok) {
      setUserModal(null);
      loadData();
    } else {
      setFeedback(data.error);
    }
  };

  const handleDeleteUser = async (uId: string) => {
    if (!confirm("Excluir este usuário permanentemente?")) return;
    const res = await fetch("/api/admin/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: uId }),
    });
    if (res.ok) loadData();
    else alert((await res.json()).error);
  };

  const handleSaveTeam = async (e: React.FormEvent, fData: any) => {
    e.preventDefault();
    const isEdit = !!fData.id;
    const url = "/api/admin/teams";
    const method = isEdit ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fData),
    });
    if (res.ok) {
      setTeamModal(null);
      loadData();
    } else {
      alert((await res.json()).error);
    }
  };

  const handleDeleteTeam = async (teamId: string) => {
    if (!confirm("Excluir esta equipe permanentemente?")) return;
    const res = await fetch("/api/admin/teams", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: teamId }),
    });
    if (res.ok) loadData();
    else alert((await res.json()).error);
  };

  const handleSaveRule = async (e: React.FormEvent, fData: any) => {
    e.preventDefault();
    const isEdit = !!fData.id;
    const url = "/api/admin/rules";
    const method = isEdit ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fData),
    });
    if (res.ok) {
      setRuleModal(null);
      loadData();
    } else {
      alert((await res.json()).error);
    }
  };

  const handleToggleRule = async (rule: any) => {
    await fetch("/api/admin/rules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: rule.id, active: rule.active ? 0 : 1 }),
    });
    loadData();
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!confirm("Deseja excluir esta regra de distribuição?")) return;
    const res = await fetch("/api/admin/rules", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: ruleId }),
    });
    if (res.ok) loadData();
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Gestão de Equipe e Regras</h1>
          <p className="page-sub">Cadastro de corretores, organização de times e regras comerciais de roteamento</p>
        </div>
        {isAdmin && (
          <div className="flex-gap">
            <button className="btn" onClick={() => setTeamModal({})}>+ Nova Equipe</button>
            <button className="btn btn-primary" onClick={() => setUserModal({})}>+ Novo Integrante</button>
          </div>
        )}
      </div>

      {pushStatus && (
        <div className="badge badge-info" style={{ display: "block", padding: "0.8rem", marginBottom: 12, textAlign: "center" }}>
          📱 {pushStatus}
        </div>
      )}

      <div className="grid-2" style={{ gridTemplateColumns: "2fr 1fr", alignItems: "start" }}>
        {/* Lista de Integrantes */}
        <div className="card table-card">
          <div className="card-head">
            <div className="card-title">Integrantes do Time</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Cargo / Equipe</th>
                <th>Status Push (D2)</th>
                <th style={{ textAlign: "right" }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {usersList.map((u) => {
                const teamObj = teams.find((t) => t.id === u.team_id);
                return (
                  <tr key={u.id}>
                    <td>
                      <div className="avatar-cell">
                        <span className="avatar-sm">{u.name.slice(0, 2).toUpperCase()}</span>
                        <div>
                          <strong>{u.name}</strong>
                          <div className="muted" style={{ fontSize: "0.75rem" }}>{u.email} · {u.phone || "Sem tel"}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-neutral">{u.roleName || "Corretor"}</span>
                      {teamObj && <div className="muted" style={{ fontSize: "0.72rem", marginTop: 2 }}>{teamObj.name}</div>}
                    </td>
                    <td>
                      {u.push_validated_at ? (
                        <span className="badge badge-success" title={`Validado em: ${new Date(u.push_validated_at).toLocaleString("pt-BR")}`}>
                          ✓ Token Push Ativo
                        </span>
                      ) : (
                        <span className="badge badge-danger">⚠ Push Não Validado</span>
                      )}
                    </td>
                    <td>
                      <div className="flex-gap" style={{ justifyContent: "flex-end" }}>
                        <button className="btn" style={{ padding: "0.3rem 0.6rem", fontSize: "0.78rem" }} onClick={() => handleTestPush(u.id)} title="Testar entrega de push">
                          Testar Push
                        </button>
                        {(isAdmin || (isManager && u.team_id === user.team_id)) && (
                          <button className="btn" style={{ padding: "0.3rem 0.6rem", fontSize: "0.78rem" }} onClick={() => setUserModal(u)}>
                            Editar
                          </button>
                        )}
                        {isAdmin && u.id !== user.id && (
                          <button className="btn btn-danger" style={{ padding: "0.3rem 0.6rem", fontSize: "0.78rem" }} onClick={() => handleDeleteUser(u.id)}>
                            Excluir
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Lado Direito: Equipes / Times */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card">
            <div className="card-head">
              <div className="card-title">Equipes / Times</div>
            </div>
            <div className="flex-col" style={{ gap: 8 }}>
              {teams.map((t) => (
                <div key={t.id} className="card" style={{ padding: "0.75rem 1rem", background: "var(--surface-2)", border: "1px solid var(--border-color)" }}>
                  <div className="flex-between">
                    <strong>{t.name}</strong>
                    {isAdmin && (
                      <div className="flex-gap">
                        <button className="btn btn-ghost" style={{ padding: "0.2rem 0.4rem", fontSize: "0.75rem" }} onClick={() => setTeamModal(t)}>✎</button>
                        <button className="btn btn-ghost" style={{ padding: "0.2rem 0.4rem", fontSize: "0.75rem", color: "var(--status-danger)" }} onClick={() => handleDeleteTeam(t.id)}>🗑</button>
                      </div>
                    )}
                  </div>
                  <div className="muted" style={{ fontSize: "0.78rem", marginTop: 4 }}>
                    Integrantes: {t.membersCount || 0}
                  </div>
                  <div className="flex-gap" style={{ flexWrap: "wrap", marginTop: 8 }}>
                    {t.members?.map((m: any) => (
                      <span key={m.id} className="badge badge-neutral" style={{ fontSize: "0.7rem" }} title={m.email}>
                        {m.name.split(" ")[0]} {m.role_in_team === "manager" && "👑"}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              {teams.length === 0 && <p className="muted" style={{ fontSize: "0.82rem" }}>Nenhuma equipe cadastrada.</p>}
            </div>
          </div>

          {/* Regras de Distribuição Comercial */}
          <div className="card">
            <div className="card-head">
              <div className="card-title">Regras de Roteamento</div>
              {isAdmin && <button className="btn btn-primary" style={{ padding: "0.25rem 0.6rem", fontSize: "0.75rem" }} onClick={() => setRuleModal({})}>+</button>}
            </div>
            <div className="flex-col" style={{ gap: 8 }}>
              {rules.map((r) => (
                <div key={r.id} className="card" style={{ padding: "0.75rem 1rem", background: "var(--surface-2)", border: "1px solid var(--border-color)" }}>
                  <div className="flex-between">
                    <strong>{r.name}</strong>
                    <span className={`badge ${r.active ? "badge-success" : "badge-neutral"}`} style={{ fontSize: "0.68rem" }}>
                      {r.active ? "Ativa" : "Pausada"}
                    </span>
                  </div>
                  <div style={{ fontSize: "0.8rem", marginTop: 4 }}>
                    Tipo: <code className="mono">{r.type}</code>
                  </div>
                  {isAdmin && (
                    <div className="flex-gap" style={{ marginTop: 8, justifyContent: "flex-end" }}>
                      <button className="btn btn-ghost" style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }} onClick={() => handleToggleRule(r)}>
                        {r.active ? "Pausar" : "Ativar"}
                      </button>
                      <button className="btn btn-ghost" style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }} onClick={() => setRuleModal(r)}>
                        Editar
                      </button>
                      <button className="btn btn-ghost" style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem", color: "var(--status-danger)" }} onClick={() => handleDeleteRule(r.id)}>
                        🗑
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* User Modal */}
      {userModal && (
        <UserFormModal userObj={userModal} teams={teams} feedback={feedback} onClose={() => setUserModal(null)} onSave={handleSaveUser} />
      )}

      {/* Team Modal */}
      {teamModal && (
        <TeamFormModal teamObj={teamModal} brokers={usersList} onClose={() => setTeamModal(null)} onSave={handleSaveTeam} />
      )}

      {/* Rule Modal */}
      {ruleModal && (
        <RuleFormModal ruleObj={ruleModal} onClose={() => setRuleModal(null)} onSave={handleSaveRule} />
      )}
    </div>
  );
}

function UserFormModal({ userObj, teams, feedback, onClose, onSave }: any) {
  const isEdit = !!userObj.id;
  const [f, setF] = useState({
    id: userObj.id || "",
    name: userObj.name || "",
    email: userObj.email || "",
    phone: userObj.phone || "",
    roleName: userObj.roleName || "Corretor",
    pushToken: userObj.push_token || "",
    teamId: userObj.team_id || "",
    password: "",
  });

  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{isEdit ? "Editar Integrante" : "Adicionar Integrante"}</h2>
        {feedback && <div className="badge badge-danger" style={{ display: "block", padding: "0.6rem", margin: "8px 0" }}>{feedback}</div>}
        <form onSubmit={(e) => onSave(e, f)}>
          <div className="form-group"><label className="form-label">Nome Completo *</label><input className="form-input" value={f.name} onChange={(e) => set("name", e.target.value)} required /></div>
          <div className="form-group"><label className="form-label">E-mail Corporativo *</label><input className="form-input" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} required disabled={isEdit} /></div>
          <div className="form-group"><label className="form-label">Telefone (WhatsApp)</label><input className="form-input" placeholder="+5511999999999" value={f.phone} onChange={(e) => set("phone", e.target.value)} /></div>
          <div className="form-group">
            <label className="form-label">Papel / Acesso *</label>
            <select className="form-select" value={f.roleName} onChange={(e) => set("roleName", e.target.value)}>
              <option value="Corretor">Corretor (Acesso local/self)</option>
              <option value="Gerente">Gerente/Supervisor (Acesso equipe/team)</option>
              <option value="Admin">Admin (Acesso total/all)</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Equipe</label>
            <select className="form-select" value={f.teamId} onChange={(e) => set("teamId", e.target.value)}>
              <option value="">Nenhuma equipe</option>
              {teams.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="form-group"><label className="form-label">Push Token (Dispositivo D2)</label><input className="form-input" placeholder="Token do aplicativo..." value={f.pushToken} onChange={(e) => set("pushToken", e.target.value)} /></div>
          {!isEdit && <div className="form-group"><label className="form-label">Senha Inicial *</label><input className="form-input" type="password" value={f.password} onChange={(e) => set("password", e.target.value)} required /></div>}

          <div className="flex-gap" style={{ marginTop: 16 }}>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Salvar</button>
            <button type="button" className="btn" style={{ flex: 1 }} onClick={onClose}>Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TeamFormModal({ teamObj, brokers, onClose, onSave }: any) {
  const isEdit = !!teamObj.id;
  const [f, setF] = useState({
    id: teamObj.id || "",
    name: teamObj.name || "",
    managerId: "",
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{isEdit ? "Editar Equipe" : "Nova Equipe"}</h2>
        <form onSubmit={(e) => onSave(e, f)}>
          <div className="form-group"><label className="form-label">Nome da Equipe *</label><input className="form-input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></div>
          <div className="form-group">
            <label className="form-label">Supervisor / Gerente</label>
            <select className="form-select" value={f.managerId} onChange={(e) => setF({ ...f, managerId: e.target.value })}>
              <option value="">Selecione...</option>
              {brokers.filter((b: any) => b.roleName === "Gerente" || b.roleName === "Admin").map((b: any) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div className="flex-gap" style={{ marginTop: 16 }}>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Salvar</button>
            <button type="button" className="btn" style={{ flex: 1 }} onClick={onClose}>Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RuleFormModal({ ruleObj, onClose, onSave }: any) {
  const isEdit = !!ruleObj.id;
  const [f, setF] = useState({
    id: ruleObj.id || "",
    name: ruleObj.name || "",
    type: ruleObj.type || "roleta",
    criteria: ruleObj.criteria || "{}",
    priority: ruleObj.priority || "1",
  });

  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{isEdit ? "Editar Regra de Distribuição" : "Nova Regra"}</h2>
        <form onSubmit={(e) => onSave(e, f)}>
          <div className="form-group"><label className="form-label">Nome da Regra *</label><input className="form-input" value={f.name} onChange={(e) => set("name", e.target.value)} required /></div>
          <div className="form-group">
            <label className="form-label">Modo de Distribuição *</label>
            <select className="form-select" value={f.type} onChange={(e) => set("type", e.target.value)}>
              <option value="roleta">Roleta (Vez/Rodízio entre plantonistas ativos)</option>
              <option value="grab">Caça-Leads (Fila livre onde corretores puxam o lead)</option>
              <option value="manual">Manual (Direcionamento exclusivo do Supervisor)</option>
            </select>
          </div>
          <div className="form-group"><label className="form-label">Prioridade *</label><input className="form-input" type="number" value={f.priority} onChange={(e) => set("priority", e.target.value)} required /></div>
          <div className="form-group"><label className="form-label">Critérios de Distribuição (JSON)</label><textarea className="form-input mono" rows={3} placeholder='e.g., {"bairro": "Vila Mariana", "faixaPreco": [300000, 800000]}' value={f.criteria} onChange={(e) => set("criteria", e.target.value)} /></div>

          <div className="flex-gap" style={{ marginTop: 16 }}>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Salvar Regra</button>
            <button type="button" className="btn" style={{ flex: 1 }} onClick={onClose}>Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  );
}
