"use client";

import { useEffect, useMemo, useState } from "react";
import { DonutChart } from "../../../components/charts";
import { useUser } from "../../../components/app-context";

const brl = (n: number) => "R$ " + (n || 0).toLocaleString("pt-BR");
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const COLORS = ["#2563eb", "#16a34a", "#d97706", "#7c3aed", "#0d9488", "#db2777", "#64748b"];

interface Lead { id: string; name: string; estimatedValue: number; temperature: string; stageId: string; brokerId: string; brokerName: string; source: string; interest: string; created_at: string; }

function stageRate(s: any) {
  if (s.is_won) return 1.0;
  const n = (s.name || "").toLowerCase();
  if (n.includes("nov")) return 0.1;
  if (n.includes("quali")) return 0.25;
  if (n.includes("apres") || n.includes("visita")) return 0.5;
  if (n.includes("propo")) return 0.8;
  return 0.15;
}

export default function RelatoriosPage() {
  const user = useUser();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stages, setStages] = useState<any[]>([]);
  const [sources, setSources] = useState<any[]>([]);
  const [brokers, setBrokers] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [developments, setDevelopments] = useState<any[]>([]);

  // Advanced Filters
  const [periodo, setPeriodo] = useState("30d");
  const [origem, setOrigem] = useState("todas");
  const [temp, setTemp] = useState("todas");
  const [filtroCorretor, setFiltroCorretor] = useState("todos");
  const [filtroEquipe, setFiltroEquipe] = useState("todos");
  const [filtroEmpreendimento, setFiltroEmpreendimento] = useState("todos");

  useEffect(() => {
    fetch("/api/leads").then((r) => r.json()).then((d) => setLeads(d.leads || []));
    fetch("/api/configs").then((r) => r.json()).then((d) => { setStages(d.stages || []); setSources(d.sources || []); });
    fetch("/api/admin/users").then((r) => r.json()).then((d) => setBrokers(d.users || []));
    fetch("/api/admin/teams").then((r) => r.json()).then((d) => setTeams(d.teams || []));
    fetch("/api/products").then((r) => r.json()).then((d) => setDevelopments(d.developments || []));
  }, []);

  const range = useMemo(() => {
    const now = new Date(); const start = new Date(now);
    switch (periodo) {
      case "hoje": start.setHours(0, 0, 0, 0); break;
      case "7d": start.setDate(now.getDate() - 7); break;
      case "30d": start.setDate(now.getDate() - 30); break;
      case "90d": start.setMonth(now.getMonth() - 3); break;
      default: start.setMonth(now.getMonth() - 12); break;
    }
    return { start, end: now };
  }, [periodo]);

  const filtered = useMemo(() => leads.filter((l) => {
    const c = new Date(l.created_at);
    const dateCheck = c >= range.start && c <= range.end;
    const sourceCheck = origem === "todas" || l.source === origem;
    const tempCheck = temp === "todas" || l.temperature === temp;
    const brokerCheck = filtroCorretor === "todos" || l.brokerId === filtroCorretor;

    // Team check lookup
    const brokerObj = brokers.find((b) => b.id === l.brokerId);
    const teamCheck = filtroEquipe === "todos" || (brokerObj && brokerObj.team_id === filtroEquipe);

    // Interest check
    const devCheck = filtroEmpreendimento === "todos" || l.interest === filtroEmpreendimento;

    return dateCheck && sourceCheck && tempCheck && brokerCheck && teamCheck && devCheck;
  }), [leads, origem, temp, range, filtroCorretor, filtroEquipe, filtroEmpreendimento, brokers]);

  const stageById = useMemo(() => Object.fromEntries(stages.map((s) => [s.id, s])), [stages]);

  // KPIs
  const totalVgv = filtered.reduce((a, l) => a + (l.estimatedValue || 0), 0);
  const ticket = filtered.length ? totalVgv / filtered.length : 0;
  const forecast = useMemo(() => filtered.reduce((a, l) => { const s = stageById[l.stageId]; return a + (l.estimatedValue || 0) * (s ? stageRate(s) : 0.15); }, 0), [filtered, stageById]);

  // Funil com taxa de conversão
  const funnel = useMemo(() => {
    const ordered = stages.filter((s) => !s.is_lost).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const base = filtered.length;
    const reachedOf = (s: any) => filtered.filter((l) => { const st = stageById[l.stageId]; return st && !st.is_lost && (st.order ?? 0) >= (s.order ?? 0); }).length;
    const reached = ordered.map(reachedOf);
    return ordered.map((s, i) => ({
      name: s.name,
      count: filtered.filter((l) => l.stageId === s.id).length,
      reached: reached[i],
      pctTotal: base ? reached[i] / base : 0,
      convNext: i < ordered.length - 1 && reached[i] ? reached[i + 1] / reached[i] : null,
    }));
  }, [stages, filtered, stageById]);

  const lostCount = filtered.filter((l) => stageById[l.stageId]?.is_lost).length;

  // Broker Ranking
  const brokerRanking = useMemo(() => {
    const map = new Map<string, { brokerName: string; leadsCount: number; totalVgv: number; wonVgv: number }>();
    filtered.forEach((l) => {
      const key = l.brokerName || "Fila Livre";
      const e = map.get(key) || { brokerName: key, leadsCount: 0, totalVgv: 0, wonVgv: 0 };
      e.leadsCount++; e.totalVgv += l.estimatedValue || 0;
      if (stageById[l.stageId]?.is_won) e.wonVgv += l.estimatedValue || 0;
      map.set(key, e);
    });
    return Array.from(map.values()).sort((a, b) => b.wonVgv - a.wonVgv || b.totalVgv - a.totalVgv);
  }, [filtered, stageById]);

  // Team Ranking
  const teamRanking = useMemo(() => {
    const map = new Map<string, { teamName: string; leadsCount: number; totalVgv: number; wonVgv: number }>();
    filtered.forEach((l) => {
      const bObj = brokers.find((b) => b.id === l.brokerId);
      const tObj = teams.find((t) => t.id === bObj?.team_id);
      const key = tObj?.name || "Sem equipe";

      const e = map.get(key) || { teamName: key, leadsCount: 0, totalVgv: 0, wonVgv: 0 };
      e.leadsCount++; e.totalVgv += l.estimatedValue || 0;
      if (stageById[l.stageId]?.is_won) e.wonVgv += l.estimatedValue || 0;
      map.set(key, e);
    });
    return Array.from(map.values()).sort((a, b) => b.wonVgv - a.wonVgv);
  }, [filtered, stageById, brokers, teams]);

  // VGV by Developments (Empreendimentos)
  const devRanking = useMemo(() => {
    const map = new Map<string, { devName: string; leadsCount: number; totalVgv: number; wonVgv: number }>();
    filtered.forEach((l) => {
      const key = l.interest || "Geral";
      const e = map.get(key) || { devName: key, leadsCount: 0, totalVgv: 0, wonVgv: 0 };
      e.leadsCount++; e.totalVgv += l.estimatedValue || 0;
      if (stageById[l.stageId]?.is_won) e.wonVgv += l.estimatedValue || 0;
      map.set(key, e);
    });
    return Array.from(map.values()).sort((a, b) => b.wonVgv - a.wonVgv || b.totalVgv - a.totalVgv);
  }, [filtered, stageById]);

  // Lead channels faturamento
  const sourceTableData = useMemo(() => {
    const map = new Map<string, { sourceName: string; count: number; salesWon: number; wonValue: number }>();
    filtered.forEach((l) => {
      const key = l.source || "Não Informada";
      const e = map.get(key) || { sourceName: key, count: 0, salesWon: 0, wonValue: 0 };
      e.count++;
      if (stageById[l.stageId]?.is_won) {
        e.salesWon++;
        e.wonValue += l.estimatedValue || 0;
      }
      map.set(key, e);
    });
    return Array.from(map.values()).sort((a, b) => b.wonValue - a.wonValue);
  }, [filtered, stageById]);

  const donutSourceData = useMemo(() => {
    return sourceTableData.map((s, i) => ({ label: s.sourceName, value: s.count, color: COLORS[i % COLORS.length] }));
  }, [sourceTableData]);

  const handleExportCSV = () => {
    window.open("/api/leads/export", "_blank");
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Relatórios Gerenciais</h1>
          <p className="page-sub">Auditoria comercial de VGV, ticket médio e conversão por canal de marketing</p>
        </div>
        <button className="btn btn-primary" onClick={handleExportCSV}>📥 Exportar CSV (Audita D5)</button>
      </div>

      {/* Advanced Filters */}
      <div className="filter-bar" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        <select className="form-select" value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
          <option value="hoje">Hoje</option>
          <option value="7d">Últimos 7 dias</option>
          <option value="30d">Últimos 30 dias</option>
          <option value="90d">Últimos 3 meses</option>
          <option value="365d">Últimos 12 meses</option>
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

        <select className="form-select" value={filtroCorretor} onChange={(e) => setFiltroCorretor(e.target.value)}>
          <option value="todos">Corretor: Todos</option>
          {brokers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>

        <select className="form-select" value={filtroEquipe} onChange={(e) => setFiltroEquipe(e.target.value)}>
          <option value="todos">Equipe: Todas</option>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>

        <select className="form-select" value={filtroEmpreendimento} onChange={(e) => setFiltroEmpreendimento(e.target.value)}>
          <option value="todos">Empreendimento: Todos</option>
          {developments.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
        </select>
      </div>

      {/* KPI stats bar */}
      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <div className="kpi-card"><div className="kpi-label">VGV total em carteira</div><div className="kpi-value">{brl(totalVgv)}</div></div>
        <div className="kpi-card"><div className="kpi-label">Ticket médio</div><div className="kpi-value">{brl(ticket)}</div></div>
        <div className="kpi-card"><div className="kpi-label">Previsão ponderada (Forecast)</div><div className="kpi-value" style={{ color: "var(--status-success)" }}>{brl(forecast)}</div></div>
      </div>

      {/* Funnel vs Origin */}
      <div className="grid-2">
        <div className="card table-card">
          <div className="card-head"><div className="card-title">Conversão por etapa do funil</div></div>
          <table>
            <thead><tr><th>Etapa</th><th>Leads na etapa</th><th>% do total</th><th>Conversão → próxima</th></tr></thead>
            <tbody>
              {funnel.map((s, i) => (
                <tr key={i}>
                  <td><strong>{s.name}</strong></td>
                  <td>{s.count}</td>
                  <td><span className="badge badge-info">{pct(s.pctTotal)}</span></td>
                  <td style={{ fontWeight: 600, color: s.convNext == null ? "var(--text-muted)" : "var(--status-success)" }}>
                    {s.convNext == null ? "—" : pct(s.convNext)}
                  </td>
                </tr>
              ))}
              {lostCount > 0 && (
                <tr><td><strong style={{ color: "var(--status-danger)" }}>Perdidos</strong></td><td>{lostCount}</td><td><span className="badge badge-danger">{pct(filtered.length ? lostCount / filtered.length : 0)}</span></td><td className="muted">—</td></tr>
              )}
            </tbody>
          </table>
          <div className="chart-goal" style={{ margin: "0.85rem 1.25rem 1.1rem" }}>Objetivo: <b>ver onde o funil vaza</b> — direciona treinamentos nas etapas estagnadas.</div>
        </div>

        <div className="card">
          <div className="card-head"><div className="card-title">Origem / Canais de Entrada</div></div>
          {donutSourceData.length ? <DonutChart data={donutSourceData} /> : <p className="muted">Sem dados.</p>}
          <div className="chart-goal">Objetivo: <b>identificar quais canais trazem mais leads</b> para realocar investimento de marketing.</div>
        </div>
      </div>

      {/* Conversão e Faturamento por Origem de Mídia */}
      <div className="card table-card">
        <div className="card-head">
          <div className="card-title">Retorno financeiro por origem de mídia</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Cadeia / Origem</th>
              <th>Leads Recebidos</th>
              <th>Vendas Concluídas</th>
              <th>Faturamento VGV Ganho</th>
            </tr>
          </thead>
          <tbody>
            {sourceTableData.map((s, i) => (
              <tr key={i}>
                <td><strong>{s.sourceName}</strong></td>
                <td>{s.count}</td>
                <td>{s.salesWon}</td>
                <td style={{ fontWeight: 600, color: "var(--status-success)" }}>{brl(s.wonValue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="chart-goal" style={{ margin: "0.85rem 1.25rem 1.1rem" }}>Objetivo: <b>identificar quais canais trazem vendas reais</b> e não apenas tráfego sujo, otimizando o CAC.</div>
      </div>

      {/* VGV por Empreendimento */}
      <div className="card table-card">
        <div className="card-head">
          <div className="card-title">Faturamento VGV por Empreendimento de Interesse</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Empreendimento</th>
              <th>Leads Interessados</th>
              <th>VGV em Carteira (Total)</th>
              <th>VGV Convertido (Ganho)</th>
            </tr>
          </thead>
          <tbody>
            {devRanking.map((dr, i) => (
              <tr key={i}>
                <td><strong>{dr.devName}</strong></td>
                <td>{dr.leadsCount}</td>
                <td style={{ color: "var(--primary)", fontWeight: 600 }}>{brl(dr.totalVgv)}</td>
                <td style={{ color: "var(--status-success)", fontWeight: 600 }}>{brl(dr.wonVgv)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="chart-goal" style={{ margin: "0.85rem 1.25rem 1.1rem" }}>Objetivo: <b>analisar atratividade do catálogo</b>, auxiliando na priorização de lançamentos e estoque.</div>
      </div>

      {/* Rankings: Corretores e Equipes */}
      <div className="grid-2">
        <div className="card table-card">
          <div className="card-head"><div className="card-title">Ranking de Corretores</div></div>
          <table>
            <thead><tr><th>#</th><th>Corretor</th><th>Leads</th><th>VGV Total</th><th>VGV Ganho</th></tr></thead>
            <tbody>
              {brokerRanking.map((b, i) => (
                <tr key={i}><td><strong>{i + 1}º</strong></td><td>{b.brokerName}</td><td>{b.leadsCount}</td><td>{brl(b.totalVgv)}</td><td style={{ fontWeight: 600, color: "var(--status-success)" }}>{brl(b.wonVgv)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card table-card">
          <div className="card-head"><div className="card-title">Ranking de Equipes</div></div>
          <table>
            <thead><tr><th>#</th><th>Equipe</th><th>Leads</th><th>VGV Total</th><th>VGV Ganho</th></tr></thead>
            <tbody>
              {teamRanking.map((t, i) => (
                <tr key={i}><td><strong>{i + 1}º</strong></td><td>{t.teamName}</td><td>{t.leadsCount}</td><td>{brl(t.totalVgv)}</td><td style={{ fontWeight: 600, color: "var(--status-success)" }}>{brl(t.wonVgv)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
