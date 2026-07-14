"use client";

import { useEffect, useMemo, useState } from "react";
import { useUser } from "../../../components/app-context";

interface Lead {
  id: string; code: string; name: string; email: string; phone: string;
  estimatedValue: number; temperature: string; stageId: string; stageName: string;
  brokerId: string; brokerName: string; source: string; interest: string; nextTask: string | null;
  dedupeStatus: string; created_at: string;
}

const brl = (n: number) => "R$ " + (n || 0).toLocaleString("pt-BR");
function tempBadge(t: string) {
  if (t === "quente") return <span className="badge badge-hot">🔥 Quente</span>;
  if (t === "morno") return <span className="badge badge-warm">Morno</span>;
  return <span className="badge badge-cold">Frio</span>;
}
function safeParse(s: any) { try { return typeof s === "string" ? JSON.parse(s) : (s || {}); } catch { return {}; } }

const EVENT_META: Record<string, { icon: string; label: (p: any, ev: any) => string }> = {
  stage_change: { icon: "↗", label: (p) => `Etapa alterada: ${p.from ?? "?"} → ${p.to ?? "?"}` },
  task: { icon: "✓", label: (p) => `Tarefa agendada: ${p.title ?? ""}` },
  transfer: { icon: "⇄", label: (p) => `Transferido: ${p.from ?? "Fila"} → ${p.to ?? "?"}${p.reason ? ` (${p.reason})` : ""}` },
  note: { icon: "✎", label: (p) => `Observação: ${p.text ?? ""}` },
  message: { icon: "✉", label: (_p, ev) => `Mensagem via ${ev.channel ?? "canal"}` },
  system: { icon: "•", label: () => "Evento do sistema" },
};
function renderEvent(ev: any) {
  const p = safeParse(ev.payload);
  const meta = EVENT_META[ev.type] || { icon: "•", label: () => ev.type };
  return { icon: meta.icon, text: meta.label(p, ev), when: ev.occurred_at };
}

export default function LeadsPage() {
  const user = useUser();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stages, setStages] = useState<any[]>([]);
  const [sources, setSources] = useState<any[]>([]);
  const [lossReasons, setLossReasons] = useState<any[]>([]);
  const [scripts, setScripts] = useState<any[]>([]);
  const [developments, setDevelopments] = useState<any[]>([]);
  const [brokers, setBrokers] = useState<any[]>([]);

  const [view, setView] = useState<"lista" | "kanban">("kanban");
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  // Advanced Filters matching Dashboard
  const [busca, setBusca] = useState("");
  const [origem, setOrigem] = useState("todas");
  const [temp, setTemp] = useState("todas");
  const [periodo, setPeriodo] = useState("todos");
  const [corretorFiltro, setCorretorFiltro] = useState("todos");
  const [empreendimentoFiltro, setEmpreendimentoFiltro] = useState("todos");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [creating, setCreating] = useState(false);

  const load = () => {
    fetch("/api/leads").then((r) => r.json()).then((d) => setLeads(d.leads || []));
    fetch("/api/configs").then((r) => r.json()).then((d) => {
      setStages(d.stages || []);
      setSources(d.sources || []);
      setLossReasons(d.lossReasons || []);
      setScripts(d.scripts || []);
    });
    fetch("/api/products").then((r) => r.json()).then((d) => setDevelopments(d.developments || []));
    fetch("/api/admin/users").then((r) => r.json()).then((d) => setBrokers(d.users || []));
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    fetch(`/api/leads/${selectedId}`).then((r) => r.json()).then(setDetail);
  }, [selectedId]);

  const range = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    switch (periodo) {
      case "hoje": start.setHours(0, 0, 0, 0); break;
      case "7d": start.setDate(now.getDate() - 7); break;
      case "30d": start.setDate(now.getDate() - 30); break;
      default: return null;
    }
    return { start, end: now };
  }, [periodo]);

  const filtered = useMemo(() => leads.filter((l) => {
    const dateCheck = !range ? true : (new Date(l.created_at) >= range.start && new Date(l.created_at) <= range.end);
    const searchCheck = busca === "" || l.name.toLowerCase().includes(busca.toLowerCase()) || l.code.toLowerCase().includes(busca.toLowerCase()) || l.phone.includes(busca);
    const sourceCheck = origem === "todas" || l.source === origem;
    const tempCheck = temp === "todas" || l.temperature === temp;
    const brokerCheck = corretorFiltro === "todos" || l.brokerId === corretorFiltro;
    const devCheck = empreendimentoFiltro === "todos" || l.interest === empreendimentoFiltro;

    return dateCheck && searchCheck && sourceCheck && tempCheck && brokerCheck && devCheck;
  }), [leads, origem, temp, busca, range, corretorFiltro, empreendimentoFiltro]);

  const refreshDetail = () => { if (selectedId) fetch(`/api/leads/${selectedId}`).then((r) => r.json()).then(setDetail); load(); };

  const moveStageById = async (leadId: string, stageId: string, lossReasonId?: string) => {
    setLeads((prev) => prev.map((l) => l.id === leadId ? { ...l, stageId } : l));
    await fetch(`/api/leads/${leadId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stageId, lossReasonId }),
    });
    load();
  };

  const scheduleTask = async (title: string) => {
    if (!title.trim() || !selectedId) return;
    await fetch(`/api/leads/${selectedId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nextTask: title }) });
    refreshDetail();
  };

  const transfer = async (brokerId: string, reason: string) => {
    if (!brokerId || !selectedId) return;
    await fetch(`/api/leads/${selectedId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brokerId, reason }) });
    setSelectedId(null); load();
  };

  const handleUpdateTags = async (newTags: string[]) => {
    if (!selectedId) return;
    await fetch(`/api/leads/${selectedId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags: newTags }),
    });
    refreshDetail();
  };

  const handleUpdateInterests = async (devIds: string[]) => {
    if (!selectedId) return;
    await fetch(`/api/leads/${selectedId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interestIds: devIds }),
    });
    refreshDetail();
  };

  const handleExportCSV = () => {
    window.open("/api/leads/export", "_blank");
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Leads</h1>
          <p className="page-sub">Escopo {user.role} · {filtered.length} de {leads.length} leads</p>
        </div>
        <div className="flex-gap">
          <button className="btn btn-ghost" onClick={handleExportCSV}>📥 Exportar CSV (Audita D5)</button>
          <div className="flex-gap" style={{ background: "var(--surface-2)", border: "1px solid var(--border-color)", borderRadius: 9, padding: 3 }}>
            <button className={`btn ${view === "kanban" ? "btn-primary" : "btn-ghost"}`} style={{ padding: "0.35rem 0.8rem" }} onClick={() => setView("kanban")}>Kanban</button>
            <button className={`btn ${view === "lista" ? "btn-primary" : "btn-ghost"}`} style={{ padding: "0.35rem 0.8rem" }} onClick={() => setView("lista")}>Lista</button>
          </div>
          <button className="btn btn-primary" onClick={() => setCreating(true)}>+ Novo Lead</button>
        </div>
      </div>

      {/* Advanced Filter Bar */}
      <div className="filter-bar" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <input className="form-input" placeholder="Nome, código ou telefone..." value={busca} onChange={(e) => setBusca(e.target.value)} style={{ minWidth: 200, flex: 1 }} />
        
        <select className="form-select" value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
          <option value="todos">Todos os períodos</option>
          <option value="hoje">Hoje</option>
          <option value="7d">Últimos 7 dias</option>
          <option value="30d">Últimos 30 dias</option>
        </select>

        <select className="form-select" value={origem} onChange={(e) => setOrigem(e.target.value)}>
          <option value="todas">Origem: Todas</option>
          {sources.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
        </select>

        <select className="form-select" value={temp} onChange={(e) => setTemp(e.target.value)}>
          <option value="todas">Temperatura: Todas</option>
          <option value="quente">🔥 Quente</option>
          <option value="morno">Morno</option>
          <option value="frio">Frio</option>
        </select>

        {(user.role === "Admin" || user.role === "Gerente") && (
          <select className="form-select" value={corretorFiltro} onChange={(e) => setCorretorFiltro(e.target.value)}>
            <option value="todos">Corretor: Todos</option>
            {brokers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}

        <select className="form-select" value={empreendimentoFiltro} onChange={(e) => setEmpreendimentoFiltro(e.target.value)}>
          <option value="todos">Interesse: Todos</option>
          {developments.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
        </select>
      </div>

      {view === "kanban" ? (
        <div className="kanban-board">
          {stages.map((stage) => {
            const cards = filtered.filter((l) => l.stageId === stage.id);
            const total = cards.reduce((s, l) => s + l.estimatedValue, 0);
            return (
              <div
                className="kanban-column"
                key={stage.id}
                onDragOver={(e) => { e.preventDefault(); setDragOverStage(stage.id); }}
                onDragLeave={() => setDragOverStage((s) => (s === stage.id ? null : s))}
                onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData("text/plain"); setDragOverStage(null); if (id) moveStageById(id, stage.id); }}
                style={dragOverStage === stage.id ? { outline: "2px dashed var(--primary)", outlineOffset: -2 } : undefined}
              >
                <div className="kanban-header">
                  <span>{stage.name}</span>
                  <span className="muted" style={{ fontWeight: 500, fontSize: "0.75rem" }}>{cards.length} · {brl(total)}</span>
                </div>
                <div className="kanban-cards">
                  {cards.map((l) => (
                    <div
                      className="kanban-card"
                      key={l.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("text/plain", l.id)}
                      onClick={() => setSelectedId(l.id)}
                    >
                      <div className="flex-between"><span className="mono" style={{ fontSize: "0.7rem" }}>{l.code}</span>{tempBadge(l.temperature)}</div>
                      <div style={{ fontWeight: 600, margin: "0.35rem 0 0.15rem" }}>{l.name}</div>
                      <div className="muted" style={{ fontSize: "0.78rem" }}>{l.interest}</div>
                      <div style={{ color: "var(--primary)", fontWeight: 600, marginTop: "0.4rem" }}>{brl(l.estimatedValue)}</div>
                      {!l.nextTask && <div style={{ marginTop: "0.4rem", fontSize: "0.72rem", color: "var(--status-danger)" }}>⚠ Sem tarefa (D1)</div>}
                    </div>
                  ))}
                  {cards.length === 0 && <div className="muted" style={{ fontSize: "0.75rem", textAlign: "center", padding: "1rem 0" }}>Solte um card aqui</div>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card table-card">
          <table>
            <thead><tr><th>Código</th><th>Nome</th><th>Origem</th><th>Valor estimado</th><th>Temperatura</th><th>Etapa</th><th>Responsável</th><th>Follow-up</th><th></th></tr></thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.id}>
                  <td className="mono">{l.code}</td>
                  <td>
                    <div className="avatar-cell">
                      <span className="avatar-sm">{l.name.slice(0, 2).toUpperCase()}</span>
                      <div><strong>{l.name}</strong>{l.dedupeStatus === "suspect" && <span className="badge badge-danger" style={{ marginLeft: 6 }}>Duplicado?</span>}<div className="muted" style={{ fontSize: "0.72rem" }}>{l.phone}</div></div>
                    </div>
                  </td>
                  <td>{l.source}</td>
                  <td style={{ fontWeight: 600, color: "var(--primary)" }}>{brl(l.estimatedValue)}</td>
                  <td>{tempBadge(l.temperature)}</td>
                  <td><span className="badge badge-info">{l.stageName}</span></td>
                  <td>{l.brokerName}</td>
                  <td>{l.nextTask ? <span className="badge badge-success">✓ Agendada</span> : <span className="badge badge-danger">⚠ Sem tarefa</span>}</td>
                  <td><button className="btn" style={{ padding: "0.3rem 0.7rem", fontSize: "0.8rem" }} onClick={() => setSelectedId(l.id)}>Abrir</button></td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={9} className="muted" style={{ textAlign: "center", padding: "2rem" }}>Nenhum lead no filtro.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {selectedId && detail?.lead && (
        <LeadDrawer
          detail={detail}
          stages={stages}
          lossReasons={lossReasons}
          scripts={scripts}
          developments={developments}
          brokers={brokers}
          onClose={() => setSelectedId(null)}
          onSchedule={scheduleTask}
          onMove={moveStageById}
          onTransfer={transfer}
          onUpdateTags={handleUpdateTags}
          onUpdateInterests={handleUpdateInterests}
        />
      )}

      {creating && <NewLeadModal sources={sources} developments={developments} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />}
    </div>
  );
}

function LeadDrawer({ detail, stages, lossReasons, scripts, developments, brokers, onClose, onSchedule, onMove, onTransfer, onUpdateTags, onUpdateInterests }: any) {
  const l = detail.lead;
  const [task, setTask] = useState(l.next_task_id ? "Tarefa agendada" : "");
  const [broker, setBroker] = useState("");
  const [reason, setReason] = useState("");
  
  // Tags local state
  const [newTag, setNewTag] = useState("");
  const currentTags = detail.tags || [];

  // Interests local state
  const currentInterestIds = (detail.interests || []).map((i: any) => i.development_id);

  // Script qualified local state
  const [selectedScriptId, setSelectedScriptId] = useState("");
  const activeScript = scripts.find((s: any) => s.id === selectedScriptId);

  // Loss stage validation
  const [lossReason, setLossReason] = useState(l.loss_reason_id || "");

  const handleStageSelect = (sid: string) => {
    const sObj = stages.find((s: any) => s.id === sid);
    if (sObj?.is_lost) {
      // Must prompt loss reason
      const reasonId = prompt(`Por favor, digite o ID ou escolha o motivo da perda:\n\n` + lossReasons.map((r: any) => `${r.name} (Digite: ${r.id})`).join("\n"));
      if (!reasonId) return;
      onMove(l.id, sid, reasonId);
    } else {
      onMove(l.id, sid);
    }
  };

  const handleAddTag = () => {
    if (!newTag.trim()) return;
    if (currentTags.includes(newTag.trim())) return;
    onUpdateTags([...currentTags, newTag.trim()]);
    setNewTag("");
  };

  const handleRemoveTag = (tag: string) => {
    onUpdateTags(currentTags.filter((t: string) => t !== tag));
  };

  const toggleInterest = (devId: string) => {
    if (currentInterestIds.includes(devId)) {
      onUpdateInterests(currentInterestIds.filter((id: string) => id !== devId));
    } else {
      onUpdateInterests([...currentInterestIds, devId]);
    }
  };

  return (
    <div className="drawer" style={{ display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
      <div className="flex-between">
        <div>
          <span className="badge badge-info">{l.code}</span>
          <h2 style={{ marginTop: 6 }}>{l.name}</h2>
        </div>
        <button className="btn" onClick={onClose}>Fechar ✕</button>
      </div>

      {l.dedupe_status === "suspect" && (
        <div className="badge badge-danger" style={{ padding: "0.6rem 0.8rem" }}>
          ⚠ Possível duplicidade detectada (D4). Acesse a aba de Deduplicação.
        </div>
      )}

      {l.dedupe_status === "merged" && (
        <div className="badge badge-neutral" style={{ padding: "0.6rem 0.8rem" }}>
          Merged — Lead inativo mesclado.
        </div>
      )}

      {/* Cadastro */}
      <div>
        <div className="data-row"><span className="lbl">Telefone</span><strong>{l.phone}</strong></div>
        <div className="data-row"><span className="lbl">E-mail</span><strong>{l.email || "—"}</strong></div>
        <div className="data-row"><span className="lbl">Entrada</span><span>{new Date(l.entered_at).toLocaleString("pt-BR")}</span></div>
        <div className="data-row"><span className="lbl">Valor estimado</span><strong style={{ color: "var(--primary)" }}>{brl(l.estimated_value)}</strong></div>
        <div className="data-row"><span className="lbl">Origem</span><span>{l.tracking_source}</span></div>
        <div className="data-row"><span className="lbl">Temperatura</span>{tempBadge(l.temperature)}</div>
        <div className="data-row"><span className="lbl">Responsável</span><span>{l.brokerName || "Fila Livre"}</span></div>
        {l.lossReasonName && <div className="data-row"><span className="lbl" style={{ color: "var(--status-danger)" }}>Motivo de Perda</span><strong style={{ color: "var(--status-danger)" }}>{l.lossReasonName}</strong></div>}
      </div>

      {/* Gestão de Tags */}
      <div className="card" style={{ background: "var(--surface-2)" }}>
        <div className="card-title" style={{ marginBottom: 6 }}>Tags do Lead</div>
        <div className="flex-gap" style={{ flexWrap: "wrap", marginBottom: 8 }}>
          {currentTags.map((tag: string) => (
            <span key={tag} className="badge badge-neutral" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              {tag} <button style={{ border: "none", background: "none", cursor: "pointer", color: "var(--status-danger)", fontWeight: "bold" }} onClick={() => handleRemoveTag(tag)}>×</button>
            </span>
          ))}
          {currentTags.length === 0 && <span className="muted" style={{ fontSize: "0.8rem" }}>Sem tags vinculadas.</span>}
        </div>
        <div className="flex-gap">
          <input className="form-input" style={{ flex: 1, padding: "0.3rem 0.5rem" }} placeholder="Nova tag..." value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleAddTag()} />
          <button className="btn btn-primary" style={{ padding: "0.3rem 0.7rem" }} onClick={handleAddTag}>+</button>
        </div>
      </div>

      {/* Múltiplos Interesses */}
      <div className="card" style={{ background: "var(--surface-2)" }}>
        <div className="card-title" style={{ marginBottom: 8 }}>Empreendimentos de Interesse</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 120, overflowY: "auto", padding: 4 }}>
          {developments.map((d: any) => {
            const isChecked = currentInterestIds.includes(d.id);
            return (
              <label key={d.id} className="flex-gap" style={{ fontSize: "0.85rem", cursor: "pointer", alignItems: "center" }}>
                <input type="checkbox" checked={isChecked} onChange={() => toggleInterest(d.id)} />
                <span>{d.name} <span className="muted" style={{ fontSize: "0.75rem" }}>({d.city})</span></span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Script de Qualificação */}
      <div className="card" style={{ background: "var(--surface-2)" }}>
        <div className="card-title" style={{ marginBottom: 8 }}>Qualificação (Perguntas Roteiro)</div>
        <select className="form-select" style={{ width: "100%", marginBottom: 8 }} value={selectedScriptId} onChange={(e) => setSelectedScriptId(e.target.value)}>
          <option value="">Selecione um roteiro de perguntas...</option>
          {scripts.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {activeScript && (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border-color)", borderRadius: 6, padding: "0.6rem 0.8rem", fontSize: "0.8rem", whiteSpace: "pre-wrap", color: "var(--text-secondary)" }}>
            {activeScript.body}
          </div>
        )}
      </div>

      {/* Próxima Tarefa */}
      <div className="card" style={{ background: "var(--surface-2)" }}>
        <div className="card-title" style={{ marginBottom: 6 }}>Próxima tarefa / follow-up (D1)</div>
        <div className="flex-gap">
          <input className="form-input" style={{ flex: 1 }} placeholder="Descreva a ação..." value={task} onChange={(e) => setTask(e.target.value)} />
          <button className="btn btn-primary" onClick={() => onSchedule(task)}>Agendar</button>
        </div>
        {!l.next_task_id && <p style={{ color: "var(--status-danger)", fontSize: "0.75rem", marginTop: 4 }}>⚠ Lead sem tarefa futura — risco de ser esquecido.</p>}
      </div>

      {/* Funil Stages */}
      <div className="card" style={{ background: "var(--surface-2)" }}>
        <div className="card-title" style={{ marginBottom: 6 }}>Mover Etapa do Funil</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {stages.map((s: any) => (
            <button key={s.id} className={`btn ${l.stage_id === s.id ? "btn-primary" : ""}`} style={{ fontSize: "0.78rem" }} onClick={() => handleStageSelect(s.id)}>{s.name}</button>
          ))}
        </div>
      </div>

      {/* Transferência */}
      <div className="card" style={{ background: "var(--surface-2)" }}>
        <div className="card-title" style={{ marginBottom: 6 }}>Transferir responsável (D6)</div>
        <div className="flex-gap">
          <select className="form-select" style={{ flex: 1 }} value={broker} onChange={(e) => setBroker(e.target.value)}>
            <option value="">Selecione um corretor...</option>
            {brokers.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <button className="btn btn-primary" onClick={() => onTransfer(broker, reason)}>Transferir</button>
        </div>
        <input className="form-input" style={{ marginTop: 6 }} placeholder="Motivo da transferência..." value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>

      {/* Timeline */}
      <div>
        <div className="card-title" style={{ marginBottom: 6 }}>Histórico de ações (linha do tempo)</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {detail.timeline?.length ? detail.timeline.map((ev: any) => {
            const r = renderEvent(ev);
            return (
              <div key={ev.id} className="timeline-item" style={{ borderLeft: "2px solid var(--border-color)", paddingLeft: 10, paddingBottom: 6 }}>
                <div style={{ fontSize: "0.82rem" }}><strong>{r.icon}</strong> {r.text}</div>
                <div className="timeline-meta" style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{new Date(r.when).toLocaleString("pt-BR")}</div>
              </div>
            );
          }) : <p className="muted" style={{ fontSize: "0.8rem" }}>Sem ações registradas.</p>}
        </div>
      </div>
    </div>
  );
}

function NewLeadModal({ sources, developments, onClose, onSaved }: any) {
  const [f, setF] = useState({ name: "", phone: "", email: "", estimatedValue: "", source: sources[0]?.name || "Site Formulário", interest: developments[0]?.name || "", notes: "" });
  const [dup, setDup] = useState<any>(null);
  const [err, setErr] = useState("");
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const save = async (force = false) => {
    setErr("");
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, estimatedValue: Number(f.estimatedValue) || 0, force }),
    });
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 409 && data.duplicateDetected) { setDup(data); return; }
      setErr(data.error || "Erro ao salvar."); return;
    }
    onSaved();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="flex-between" style={{ marginBottom: "1.25rem" }}>
          <h2>Cadastrar novo lead</h2>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>

        {err && <div className="badge badge-danger" style={{ display: "block", padding: "0.6rem", marginBottom: 12 }}>{err}</div>}

        {dup ? (
          <div>
            <div className="card" style={{ borderColor: "var(--status-danger)", background: "var(--status-danger-bg)" }}>
              <strong style={{ color: "var(--status-danger)" }}>⚠ Duplicidade detectada (D4)</strong>
              <p style={{ fontSize: "0.85rem", marginTop: 6 }}>Já existe lead com esse telefone/e-mail:</p>
              {dup.matches.map((m: any) => <div key={m.code} style={{ fontSize: "0.82rem", marginTop: 4 }}>• <strong>{m.name}</strong> ({m.code})</div>)}
            </div>
            <div className="flex-gap" style={{ marginTop: 16 }}>
              <button className="btn" style={{ flex: 1 }} onClick={() => save(true)}>Cadastrar mesmo assim</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={onClose}>Cancelar</button>
            </div>
          </div>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); save(); }}>
            <div className="form-group"><label className="form-label">Nome completo *</label><input className="form-input" value={f.name} onChange={(e) => set("name", e.target.value)} required /></div>
            <div className="form-group"><label className="form-label">Telefone (E.164) *</label><input className="form-input" placeholder="+5511987654321" value={f.phone} onChange={(e) => set("phone", e.target.value)} required /></div>
            <div className="form-group"><label className="form-label">E-mail</label><input className="form-input" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Valor estimado (R$)</label><input className="form-input" type="number" value={f.estimatedValue} onChange={(e) => set("estimatedValue", e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Origem</label><select className="form-select" value={f.source} onChange={(e) => set("source", e.target.value)}>{sources.map((s: any) => <option key={s.id} value={s.name}>{s.name}</option>)}</select></div>
            <div className="form-group">
              <label className="form-label">Empreendimento de interesse *</label>
              <select className="form-select" value={f.interest} onChange={(e) => set("interest", e.target.value)}>
                {developments.map((d: any) => <option key={d.id} value={d.name}>{d.name}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">Observações</label><textarea className="form-input" rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} /></div>
            <button type="submit" className="btn btn-primary" style={{ width: "100%", marginTop: 8 }}>Salvar e distribuir (Automação Roteiro)</button>
          </form>
        )}
      </div>
    </div>
  );
}
