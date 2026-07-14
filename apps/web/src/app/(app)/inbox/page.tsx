"use client";

import { useEffect, useState } from "react";

interface Conversation { id: string; channel: string; identity: string; leadId?: string; leadName?: string; lastMessageAt: string; unreadCount: number; waWindowExpiresAt: string; }
interface Message { id: string; direction: "in" | "out"; sender: string; body: string; occurredAt: string; status: string; }

const CHANNEL_ICON: Record<string, string> = { whatsapp: "🟢 WhatsApp", instagram: "📷 Instagram", messenger: "💬 Messenger", email: "✉ E-mail", webchat: "💻 Chat do site" };

const QUICK_RESPONSES = [
  "Olá! Como posso ajudar você hoje?",
  "Tudo bem? Temos unidades disponíveis de 2 e 3 dormitórios.",
  "Agendamento confirmado para visita no decorrer da semana!",
  "Vou verificar com a construtora e já retorno com a tabela de preços."
];

export default function InboxPage() {
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [brokers, setBrokers] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [tpl, setTpl] = useState("");

  // Transfer State
  const [targetBrokerId, setTargetBrokerId] = useState("");
  const [transferReason, setTransferReason] = useState("");

  // Simulator Panel State
  const [showSim, setShowSim] = useState(false);
  const [simForm, setSimForm] = useState({ channel: "whatsapp", phone: "+5511988887777", name: "Gabriel Simulado", email: "gabriel@simulado.com", body: "Olá, tenho interesse no stand da Vila Mariana" });

  const loadConvs = () => fetch("/api/conversations").then((r) => r.json()).then((d) => setConvs(d.conversations || []));
  
  useEffect(() => {
    loadConvs();
    fetch("/api/configs").then((r) => r.json()).then((d) => setTemplates(d.templates || []));
    fetch("/api/admin/users").then((r) => r.json()).then((d) => setBrokers(d.users || []));
  }, []);

  useEffect(() => {
    if (activeId) fetch(`/api/conversations/${activeId}/messages`).then((r) => r.json()).then((d) => setMessages(d.messages || []));
  }, [activeId]);

  const active = convs.find((c) => c.id === activeId);
  const waExpired = active?.channel === "whatsapp" && new Date(active.waWindowExpiresAt) < new Date();

  const reloadMsgs = () => activeId && fetch(`/api/conversations/${activeId}/messages`).then((r) => r.json()).then((d) => setMessages(d.messages || []));

  const send = async () => {
    if (!text.trim() || !activeId) return;
    const res = await fetch(`/api/conversations/${activeId}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: text }) });
    if (res.ok) { setText(""); reloadMsgs(); loadConvs(); } else { const d = await res.json(); alert(d.error); }
  };

  const sendTemplate = async () => {
    if (!tpl || !activeId) return;
    const res = await fetch(`/api/conversations/${activeId}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "template", templateId: tpl, variables: [] }) });
    if (res.ok) { setTpl(""); reloadMsgs(); loadConvs(); } else { const d = await res.json(); alert(d.error); }
  };

  const handleTransferChat = async () => {
    if (!active?.leadId || !targetBrokerId) return;
    const res = await fetch(`/api/leads/${active.leadId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brokerId: targetBrokerId, reason: transferReason || "Transferência pela Inbox Omnichannel" })
    });
    if (res.ok) {
      alert("Atendimento transferido com sucesso!");
      setTargetBrokerId("");
      setTransferReason("");
      setActiveId(null);
      loadConvs();
    } else {
      alert((await res.json()).error);
    }
  };

  const handleTriggerWebhook = async () => {
    const res = await fetch("/api/webhooks/simulator", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(simForm)
    });
    if (res.ok) {
      alert("Gatilho simulado disparado com sucesso!");
      setShowSim(false);
      loadConvs();
    } else {
      alert((await res.json()).error);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Inbox Omnichannel</h1>
          <p className="page-sub">Central de atendimento unificada (WhatsApp, Instagram DM, Messenger, E-mail, Webchat)</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowSim(true)}>⚡ Simulador Webhook Canais</button>
      </div>

      <div className="chat-layout">
        <div className="chat-list">
          {convs.length === 0 && <p className="muted" style={{ padding: "1rem" }}>Nenhuma conversa. Use o simulador acima para disparar webhooks de canais.</p>}
          {convs.map((c) => (
            <div key={c.id} className={`chat-item ${activeId === c.id ? "active" : ""}`} onClick={() => setActiveId(c.id)}>
              <div className="flex-between">
                <strong style={{ fontSize: "0.9rem" }}>{c.leadName || c.identity}</strong>
                <span className="muted" style={{ fontSize: "0.7rem" }}>{new Date(c.lastMessageAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              <div className="flex-between" style={{ marginTop: 4 }}>
                <span className="muted" style={{ fontSize: "0.75rem" }}><span className="presence online" />{CHANNEL_ICON[c.channel] || c.channel}</span>
                {c.unreadCount > 0 && <span className="badge badge-info">{c.unreadCount}</span>}
              </div>
            </div>
          ))}
        </div>

        <div className="chat-view">
          {active ? (
            <>
              {/* Chat Header with Broker Transfer Option */}
              <div className="chat-header flex-between" style={{ flexWrap: "wrap", gap: 12 }}>
                <div>
                  <strong>{active.leadName || active.identity}</strong>
                  <div className="muted" style={{ fontSize: "0.75rem" }}>{CHANNEL_ICON[active.channel]} · {active.identity}</div>
                </div>
                
                {active.leadId && (
                  <div className="flex-gap" style={{ alignItems: "center" }}>
                    <select className="form-select" style={{ padding: "0.3rem 0.5rem", fontSize: "0.8rem" }} value={targetBrokerId} onChange={(e) => setTargetBrokerId(e.target.value)}>
                      <option value="">Transferir conversa...</option>
                      {brokers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <button className="btn" style={{ padding: "0.3rem 0.6rem", fontSize: "0.8rem" }} onClick={handleTransferChat} disabled={!targetBrokerId}>
                      Transferir
                    </button>
                  </div>
                )}
              </div>

              {/* Chat Messages */}
              <div className="chat-messages">
                {messages.map((m) => (
                  <div key={m.id} className={`message-bubble ${m.direction === "in" ? "message-in" : "message-out"}`}>
                    <div>{m.body}</div>
                    <div style={{ fontSize: "0.65rem", opacity: 0.7, textAlign: "right", marginTop: 3 }}>
                      {new Date(m.occurredAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}{m.direction === "out" ? " · " + m.status : ""}
                    </div>
                  </div>
                ))}
              </div>

              {/* Respostas Rápidas Card */}
              <div style={{ padding: "0.5rem 1.25rem", background: "var(--surface-2)", borderTop: "1px solid var(--border-color)", display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span className="muted" style={{ fontSize: "0.78rem", alignSelf: "center" }}>Respostas rápidas:</span>
                {QUICK_RESPONSES.map((qr) => (
                  <button key={qr} className="btn btn-ghost" style={{ padding: "0.2rem 0.5rem", fontSize: "0.72rem", border: "1px solid var(--border-color)" }} onClick={() => setText(qr)}>
                    {qr.slice(0, 20)}...
                  </button>
                ))}
              </div>

              {/* Chat Input Area */}
              <div className="chat-input-area">
                {waExpired ? (
                  <div style={{ width: "100%" }}>
                    <p style={{ fontSize: "0.8rem", color: "var(--status-danger)", fontWeight: 600, marginBottom: 8 }}>⚠ Janela de 24h expirada (WhatsApp Oficial) — envie template aprovado:</p>
                    <div className="flex-gap">
                      <select className="form-select" style={{ flex: 1 }} value={tpl} onChange={(e) => setTpl(e.target.value)}>
                        <option value="">Selecione um template...</option>
                        {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                      <button className="btn btn-primary" onClick={sendTemplate} disabled={!tpl}>Enviar template</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <input className="form-input" style={{ flex: 1 }} placeholder="Escreva uma resposta..." value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
                    <button className="btn btn-primary" onClick={send}>Enviar</button>
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="center-screen" style={{ minHeight: "auto", flex: 1 }}>Selecione uma conversa para iniciar o atendimento.</div>
          )}
        </div>
      </div>

      {/* Simulator Webhook Modal */}
      {showSim && (
        <div className="modal-overlay" onClick={() => setShowSim(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="flex-between" style={{ marginBottom: "1.25rem" }}>
              <h2>Simulador de Webhook Externo</h2>
              <button className="btn btn-ghost" onClick={() => setShowSim(false)}>✕</button>
            </div>
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 12 }}>Simula a chegada de leads/mensagens por portais imobiliários (OLX/Zap) ou outras redes sociais integradas.</p>
            
            <form onSubmit={(e) => { e.preventDefault(); handleTriggerWebhook(); }}>
              <div className="form-group">
                <label className="form-label">Canal de Entrada *</label>
                <select className="form-select" value={simForm.channel} onChange={(e) => setSimForm({ ...simForm, channel: e.target.value })}>
                  <option value="whatsapp">WhatsApp (Meta Cloud API)</option>
                  <option value="instagram">Instagram Direct DM</option>
                  <option value="messenger">Facebook Messenger</option>
                  <option value="email">E-mail Entrada (IMAP)</option>
                  <option value="webchat">Chat do Site (JivoChat/Jivo)</option>
                  <option value="portal">Zap Imóveis / OLX (Portal)</option>
                </select>
              </div>
              <div className="form-group"><label className="form-label">Nome do Lead</label><input className="form-input" value={simForm.name} onChange={(e) => setSimForm({ ...simForm, name: e.target.value })} /></div>
              <div className="form-group"><label className="form-label">Telefone (E.164)</label><input className="form-input" placeholder="+5511999999999" value={simForm.phone} onChange={(e) => setSimForm({ ...simForm, phone: e.target.value })} /></div>
              <div className="form-group"><label className="form-label">E-mail</label><input className="form-input" type="email" value={simForm.email} onChange={(e) => setSimForm({ ...simForm, email: e.target.value })} /></div>
              <div className="form-group"><label className="form-label">Mensagem / Texto Integrado</label><textarea className="form-input" rows={2} value={simForm.body} onChange={(e) => setSimForm({ ...simForm, body: e.target.value })} /></div>

              <button type="submit" className="btn btn-primary" style={{ width: "100%", marginTop: 8 }}>⚡ Disparar Webhook de Simulação</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
