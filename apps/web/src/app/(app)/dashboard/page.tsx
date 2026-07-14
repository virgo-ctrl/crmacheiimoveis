"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LineChart, DonutChart } from "../../../components/charts";
import { useUser } from "../../../components/app-context";

interface Lead {
  id: string; code: string; name: string; email: string; phone: string;
  estimatedValue: number; temperature: string; stageName: string;
  brokerId: string; brokerName: string; source: string; interest: string; nextTask: string | null;
  dedupeStatus: string; created_at: string;
}
interface Task { id: string; leadId: string; leadCode: string; leadName: string; brokerName: string; type: string; title: string; due_at: string; status: string; }
interface StageSummary { id: string; name: string; count: number; totalValue: number; }
interface BrokerRank { brokerName: string; leadsCount: number; wonVgv: number; }
interface TeamRank { teamName: string; leadsCount: number; wonVgv: number; }
interface Reports { totalVgv: number; ticketMedio: number; forecast: number; stageSummary: StageSummary[]; brokerRanking: BrokerRank[]; teamRanking: TeamRank[]; sourceSummary: any[]; timeSummary: any[]; tasks: Task[]; }

const brl = (n: number) => "R$ " + (n || 0).toLocaleString("pt-BR");
const COLORS = ["#2563eb", "#16a34a", "#d97706", "#7c3aed", "#0d9488", "#db2777", "#64748b"];

export default function DashboardPage() {
  const user = useUser();
  
  const [leads, setLeads] = useState<Lead[]>([]);
  const [grabLeads, setGrabLeads] = useState<any[]>([]);
  const [reports, setReports] = useState<Reports | null>(null);
  
  const [sources, setSources] = useState<any[]>([]);
  const [brokers, setBrokers] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [developments, setDevelopments] = useState<any[]>([]);
  const [developers, setDevelopers] = useState<any[]>([]);

  // Advanced Filters
  const [periodo, setPeriodo] = useState<string>("30d");
  const [origem, setOrigem] = useState("todas");
  const [temp, setTemp] = useState("todas");
  const [filtroCorretor, setFiltroCorretor] = useState("todos");
  const [filtroEquipe, setFiltroEquipe] = useState("todos");
  const [filtroEmpreendimento, setFiltroEmpreendimento] = useState("todos");
  const [filtroConstrutora, setFiltroConstrutora] = useState("todos");

  const loadData = () => {
    fetch("/api/leads").then((r) => r.json()).then((d) => {
      setLeads(d.leads || []);
      setGrabLeads(d.grabLeads || []);
    });
    fetch("/api/reports").then((r) => r.json()).then(setReports);
    fetch("/api/configs").then((r) => r.json()).then((d) => setSources(d.sources || []));
    fetch("/api/admin/users").then((r) => r.json()).then((d) => setBrokers(d.users || []));
    fetch("/api/admin/teams").then((r) => r.json()).then((d) => setTeams(d.teams || []));
    fetch("/api/products").then((r) => r.json()).then((d) => {
      setDevelopments(d.developments || []);
      setDevelopers(d.developers || []);
    });
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filter ranges
  const range = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    switch (periodo) {
      case "hoje": start.setHours(0, 0, 0, 0); break;
      case "7d": start.setDate(now.getDate() - 7); break;
      case "30d": start.setDate(now.getDate() - 30); break;
      case "90d": start.setMonth(now.getMonth() - 3); break;
      default: start.setMonth(now.getMonth() - 12); break; // 12m
    }
    return { start, end: now };
  }, [periodo]);

  const filteredLeads = useMemo(() => leads.filter((l) => {
    const c = new Date(l.created_at);
    const dateCheck = c >= range.start && c <= range.end;
    const sourceCheck = origem === "todas" || l.source === origem;
    const tempCheck = temp === "todas" || l.temperature === temp;
    
    // Broker check
    const brokerCheck = filtroCorretor === "todos" || l.brokerId === filtroCorretor;
    
    // Team check (needs lookup in brokers list)
    const leadBrokerObj = brokers.find((b) => b.id === l.brokerId);
    const teamCheck = filtroEquipe === "todos" || (leadBrokerObj && leadBrokerObj.team_id === filtroEquipe);

    // Development check
    const devCheck = filtroEmpreendimento === "todos" || l.interest === filtroEmpreendimento;

    // Developer check (lookup developer of development interest)
    const interestDevObj = developments.find((d) => d.name === l.interest);
    const developerCheck = filtroConstrutora === "todos" || (interestDevObj && interestDevObj.developer_id === filtroConstrutora);

    return dateCheck && sourceCheck && tempCheck && brokerCheck && teamCheck && devCheck && developerCheck;
  }), [leads, origem, temp, range, filtroCorretor, filtroEquipe, filtroEmpreendimento, filtroConstrutora, brokers, developments]);

  // Handle Grab Lead
  const handleGrabLead = async (leadId: string) => {
    const res = await fetch(`/api/leads/${leadId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brokerId: user.id, reason: "Reivindicado via Caça-Leads" })
    });
    if (res.ok) {
      alert("Lead capturado com sucesso! Verifique a aba Leads.");
      loadData();
    } else {
      alert("Erro ao capturar o lead.");
    }
  };

  // Time series
  const line = useMemo(() => {
    const labels: string[] = [];
    const criados: number[] = [];
    const salesValue: number[] = [];

    // Daily buckets (last 8 days representation)
    const d = new Date(range.start);
    while (d <= range.end) {
      const dayLabel = `${d.getDate()}/${d.getMonth() + 1}`;
      labels.push(dayLabel);

      const inDay = filteredLeads.filter((l) => {
        const c = new Date(l.created_at);
        return c.getDate() === d.getDate() && c.getMonth() === d.getMonth() && c.getFullYear() === d.getFullYear();
      });
      criados.push(inDay.length);

      // Won Sales value in day
      const wonValue = inDay
        .filter((l) => l.stageName === "Vendido (Ganho)")
        .reduce((sum, l) => sum + (l.estimatedValue || 0), 0);
      salesValue.push(wonValue / 1000); // in thousands (k) for chart scaling

      d.setDate(d.getDate() + 1);
    }

    return { labels, criados, salesValue };
  }, [filteredLeads, range]);

  // Donut 1: Origin
  const bySource = useMemo(() => {
    const map = new Map<string, number>();
    filteredLeads.forEach((l) => map.set(l.source || "Geral", (map.get(l.source || "Geral") || 0) + 1));
    return Array.from(map.entries()).map(([label, value], i) => ({ label, value, color: COLORS[i % COLORS.length] }));
  }, [filteredLeads]);

  // Donut 2: Temperature
  const byTemperature = useMemo(() => {
    const map = new Map<string, number>();
    filteredLeads.forEach((l) => map.set(l.temperature || "morno", (map.get(l.temperature || "morno") || 0) + 1));
    return Array.from(map.entries()).map(([label, value], i) => ({ label, value, color: COLORS[i % COLORS.length] }));
  }, [filteredLeads]);

  // Donut 3: Stage
  const byStage = useMemo(() => {
    const map = new Map<string, number>();
    filteredLeads.forEach((l) => map.set(l.stageName || "Novo Contato", (map.get(l.stageName || "Novo Contato") || 0) + 1));
    return Array.from(map.entries()).map(([label, value], i) => ({ label, value, color: COLORS[i % COLORS.length] }));
  }, [filteredLeads]);

  // Tasks categorized
  const tasksCategorized = useMemo(() => {
    const now = new Date();
    const list = reports?.tasks || [];
    return {
      overdue: list.filter((t) => t.status === "pending" && new Date(t.due_at) < now),
      today: list.filter((t) => {
        const d = new Date(t.due_at);
        return t.status === "pending" && d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      }),
      pending: list.filter((t) => t.status === "pending" && new Date(t.due_at) > now),
    };
  }, [reports]);

  const semTarefaCount = filteredLeads.filter((l) => !l.nextTask).length;

  return (
    <div className="page">
      {/* Head */}
      <div className="page-head">
        <div>
          <h1 className="page-title">Dashboard Operacional</h1>
          <p className="page-sub">Visão integrada de funis, tarefas ativas e distribuição comercial</p>
        </div>
        <Link href="/leads" className="btn btn-primary">+ Novo Lead</Link>
      </div>

      {/* Advanced Filters */}
      <div className="filter-bar" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        <select className="form-select" value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
          <option value="hoje">Período: Hoje</option>
          <option value="7d">Período: 7 dias</option>
          <option value="30d">Período: 30 dias</option>
          <option value="90d">Período: 90 dias</option>
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

        <select className="form-select" value={filtroConstrutora} onChange={(e) => setFiltroConstrutora(e.target.value)}>
          <option value="todos">Construtora: Todas</option>
          {developers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      {/* KPI Stats */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">Leads sob Filtro</div>
          <div className="kpi-value">{filteredLeads.length}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">VGV Estimado (Total)</div>
          <div className="kpi-value">{brl(filteredLeads.reduce((s, l) => s + l.estimatedValue, 0))}</div>
        </div>
        <div className="kpi-card" style={{ borderColor: semTarefaCount > 0 ? "var(--status-danger)" : "var(--border-color)" }}>
          <div className="kpi-label" style={{ color: "var(--status-danger)" }}>⚠ Leads Sem Próxima Ação (D1)</div>
          <div className="kpi-value" style={{ color: "var(--status-danger)" }}>{semTarefaCount}</div>
        </div>
      </div>

      {/* Caça-Leads (Reivindicação de Fila Livre) */}
      <div className="card" style={{ border: "2px solid var(--primary)", background: "var(--surface-2)" }}>
        <div className="card-head">
          <div className="card-title">⚡ Caça-Leads (Fila de Captura Livre)</div>
          <span className="badge badge-hot">{grabLeads.length} leads disponíveis</span>
        </div>
        <div style={{ display: "flex", gap: 12, overflowX: "auto", padding: "0.25rem 0" }}>
          {grabLeads.map((gl) => (
            <div key={gl.id} className="card" style={{ minWidth: 240, background: "var(--surface)", border: "1px solid var(--border-color)", padding: "0.85rem" }}>
              <div style={{ fontWeight: 600, fontSize: "0.88rem" }}>{gl.name}</div>
              <div className="muted" style={{ fontSize: "0.78rem", marginTop: 2 }}>Canal: {gl.source}</div>
              <div className="muted" style={{ fontSize: "0.78rem" }}>Interesse: {gl.interest}</div>
              <button className="btn btn-primary" style={{ width: "100%", marginTop: 8, padding: "0.3rem 0.5rem", fontSize: "0.8rem" }} onClick={() => handleGrabLead(gl.id)}>
                Capturar Lead
              </button>
            </div>
          ))}
          {grabLeads.length === 0 && <p className="muted" style={{ fontSize: "0.82rem", padding: "0.5rem 0" }}>Nenhum lead livre aguardando captura no momento.</p>}
        </div>
      </div>

      {/* Evolution Time Series (Leads & Gained VGV Sales) */}
      <div className="card">
        <div className="card-head">
          <div className="card-title">Evolução Comercial (Leads Criados vs Vendas Fechadas em R$ Mil)</div>
        </div>
        <LineChart
          labels={line.labels}
          series={[
            { name: "Leads Criados", color: "#2563eb", points: line.criados },
            { name: "Vendas Concluídas (R$ K)", color: "#16a34a", points: line.salesValue },
          ]}
        />
        <div className="chart-goal">Objetivo: <b>detectar sazonalidade e quedas de performance</b> ligando a entrada de novos clientes com o VGV faturado no período.</div>
      </div>

      {/* Middle Grid: Three Donut charts for decision objectives */}
      <div className="grid-3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        <div className="card">
          <div className="card-head"><div className="card-title">Leads por Origem</div></div>
          {bySource.length > 0 ? <DonutChart data={bySource} /> : <p className="muted">Sem dados.</p>}
          <div className="chart-goal" style={{ marginTop: 12 }}>Objetivo: <b>Identificar canais de maior conversão</b> para direcionar investimentos de mídia.</div>
        </div>

        <div className="card">
          <div className="card-head"><div className="card-title">Leads por Temperatura</div></div>
          {byTemperature.length > 0 ? <DonutChart data={byTemperature} /> : <p className="muted">Sem dados.</p>}
          <div className="chart-goal" style={{ marginTop: 12 }}>Objetivo: <b>Mensurar qualidade e maturidade</b> dos leads que estão sendo nutridos.</div>
        </div>

        <div className="card">
          <div className="card-head"><div className="card-title">Leads por Situação</div></div>
          {byStage.length > 0 ? <DonutChart data={byStage} /> : <p className="muted">Sem dados.</p>}
          <div className="chart-goal" style={{ marginTop: 12 }}>Objetivo: <b>Detectar gargalos nas etapas</b> do funil e direcionar coaching para conversão.</div>
        </div>
      </div>

      {/* Tasks Table: Atrasadas, Hoje, Pendentes */}
      <div className="grid-2">
        <div className="card table-card">
          <div className="card-head">
            <div className="card-title">📋 Tarefas de Acompanhamento (Alerta D1/D2)</div>
          </div>
          <div style={{ maxHeight: 350, overflowY: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Lead / Código</th>
                  <th>Tarefa</th>
                  <th>Data Limite</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {/* Atrasadas */}
                {tasksCategorized.overdue.map((t) => (
                  <tr key={t.id} style={{ background: "var(--status-danger-bg)" }}>
                    <td><strong>{t.leadName}</strong><div className="muted mono" style={{ fontSize: "0.7rem" }}>{t.leadCode}</div></td>
                    <td><strong>{t.title}</strong></td>
                    <td style={{ color: "var(--status-danger)", fontWeight: 600 }}>{new Date(t.due_at).toLocaleDateString("pt-BR")} (Atrasada)</td>
                    <td><span className="badge badge-danger">Atrasada</span></td>
                  </tr>
                ))}
                {/* Hoje */}
                {tasksCategorized.today.map((t) => (
                  <tr key={t.id} style={{ background: "rgba(217, 119, 6, 0.08)" }}>
                    <td><strong>{t.leadName}</strong><div className="muted mono" style={{ fontSize: "0.7rem" }}>{t.leadCode}</div></td>
                    <td><strong>{t.title}</strong></td>
                    <td style={{ color: "#d97706", fontWeight: 600 }}>Hoje às {new Date(t.due_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</td>
                    <td><span className="badge badge-info" style={{ background: "#d97706" }}>Hoje</span></td>
                  </tr>
                ))}
                {/* Futuras */}
                {tasksCategorized.pending.map((t) => (
                  <tr key={t.id}>
                    <td><strong>{t.leadName}</strong><div className="muted mono" style={{ fontSize: "0.7rem" }}>{t.leadCode}</div></td>
                    <td><strong>{t.title}</strong></td>
                    <td className="muted">{new Date(t.due_at).toLocaleDateString("pt-BR")}</td>
                    <td><span className="badge badge-neutral">Agendada</span></td>
                  </tr>
                ))}
                {reports?.tasks.length === 0 && (
                  <tr><td colSpan={4} className="muted" style={{ textAlign: "center", padding: "1.5rem" }}>Nenhuma tarefa pendente sob sua responsabilidade.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Funil & Rankings */}
        <div className="card table-card">
          <div className="card-head">
            <div className="card-title">Ranking de Desempenho por Equipes</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Equipe</th>
                <th>Total Leads</th>
                <th>VGV Ganho</th>
              </tr>
            </thead>
            <tbody>
              {reports?.teamRanking.map((tr, i) => (
                <tr key={i}>
                  <td><strong>{i + 1}º</strong></td>
                  <td><strong>{tr.teamName}</strong></td>
                  <td>{tr.leadsCount}</td>
                  <td style={{ fontWeight: 600, color: "var(--status-success)" }}>{brl(tr.wonVgv)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="chart-goal" style={{ margin: "0.85rem 1.25rem 1.1rem" }}>Objetivo: <b>Comparar equipes de vendas</b> e promover o nivelamento e a competição saudável.</div>
        </div>
      </div>
    </div>
  );
}
