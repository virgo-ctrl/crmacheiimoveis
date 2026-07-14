"use client";

import { useEffect, useState } from "react";
import { useUser } from "../../../components/app-context";

const PRESET_AVATARS = [
  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80",
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80",
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80",
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&q=80"
];

export default function ConfiguracoesPage() {
  const userContext = useUser();
  const isAdmin = userContext.role === "Admin";
  
  const [activeTab, setActiveTab] = useState("profile");
  const [cfg, setCfg] = useState<any>({ sources: [], campaigns: [], lossReasons: [], templates: [], stages: [], scripts: [], channels: [] });
  const [profile, setProfile] = useState({
    name: "",
    email: "",
    phone: "",
    avatarUrl: "",
    password: "",
  });
  const [profileMsg, setProfileMsg] = useState("");
  const [profileErr, setProfileErr] = useState("");

  // Load configs
  const load = () => { 
    fetch("/api/configs").then((r) => r.json()).then(setCfg);
    fetch("/api/auth/me").then((r) => r.json()).then(d => {
      if (d.user) {
        setProfile({
          name: d.user.name || "",
          email: d.user.email || "",
          phone: d.user.phone || "",
          avatarUrl: d.user.avatar_url || "",
          password: "",
        });
      }
    });
  };

  useEffect(() => { load(); }, []);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg("");
    setProfileErr("");
    const res = await fetch("/api/auth/me", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    });
    if (res.ok) {
      setProfileMsg("Perfil atualizado com sucesso!");
    } else {
      setProfileErr((await res.json()).error || "Erro ao salvar perfil.");
    }
  };

  const add = async (type: string, name: string, waBody?: string) => {
    if (!name.trim()) return;
    const res = await fetch("/api/configs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, name, waBody }) });
    if (res.ok) load(); else { const d = await res.json(); alert(d.error); }
  };

  const addChannel = async (channelType: string, identity: string, credentialsRef: string) => {
    if (!identity.trim()) return;
    const res = await fetch("/api/configs", { 
      method: "POST", 
      headers: { "Content-Type": "application/json" }, 
      body: JSON.stringify({ type: "channel", name: identity, channelType, identity, credentialsRef }) 
    });
    if (res.ok) load(); else { const d = await res.json(); alert(d.error); }
  };

  const rename = async (type: string, id: string, name: string) => {
    const res = await fetch("/api/configs", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, id, name }) });
    if (res.ok) load(); else { const d = await res.json(); alert(d.error); }
  };

  const remove = async (type: string, id: string, label: string) => {
    if (!confirm(`Excluir "${label}"?`)) return;
    const res = await fetch("/api/configs", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, id }) });
    if (res.ok) load(); else { const d = await res.json(); alert(d.error); }
  };

  return (
    <div className="page" style={{ maxWidth: 1200, margin: "0 auto", padding: "1rem" }}>
      <div className="page-head" style={{ marginBottom: "1.5rem" }}>
        <div>
          <h1 className="page-title">Configurações do CRM</h1>
          <p className="page-sub">Gerencie seu perfil pessoal e parametrize as regras gerais do sistema</p>
        </div>
      </div>

      <div style={{ display: "flex", gap: "2rem", minHeight: "65vh" }}>
        {/* Sidebar Menu */}
        <div style={{ width: "260px", flexShrink: 0, display: "flex", flexDirection: "column", gap: "6px" }}>
          <button 
            onClick={() => setActiveTab("profile")}
            style={{
              display: "flex", alignItems: "center", gap: 10, padding: "0.8rem 1rem", border: "none", borderRadius: 8, fontSize: "0.9rem", fontWeight: 500, textAlign: "left", cursor: "pointer",
              background: activeTab === "profile" ? "var(--primary)" : "var(--surface)",
              color: activeTab === "profile" ? "#fff" : "var(--text-1)",
              transition: "all 0.2s"
            }}
          >
            👤 Meu Perfil
          </button>
          <button 
            onClick={() => setActiveTab("whatsapp")}
            style={{
              display: "flex", alignItems: "center", gap: 10, padding: "0.8rem 1rem", border: "none", borderRadius: 8, fontSize: "0.9rem", fontWeight: 500, textAlign: "left", cursor: "pointer",
              background: activeTab === "whatsapp" ? "var(--primary)" : "var(--surface)",
              color: activeTab === "whatsapp" ? "#fff" : "var(--text-1)",
              transition: "all 0.2s"
            }}
          >
            💬 Canal WhatsApp API
          </button>
          <div style={{ margin: "8px 0 4px 4px", fontSize: "0.72rem", color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Negócio & Atendimento</div>
          <button 
            onClick={() => setActiveTab("stages")}
            style={{
              display: "flex", alignItems: "center", gap: 10, padding: "0.8rem 1rem", border: "none", borderRadius: 8, fontSize: "0.9rem", fontWeight: 500, textAlign: "left", cursor: "pointer",
              background: activeTab === "stages" ? "var(--primary)" : "var(--surface)",
              color: activeTab === "stages" ? "#fff" : "var(--text-1)",
              transition: "all 0.2s"
            }}
          >
            📊 Etapas do Funil
          </button>
          <button 
            onClick={() => setActiveTab("sources")}
            style={{
              display: "flex", alignItems: "center", gap: 10, padding: "0.8rem 1rem", border: "none", borderRadius: 8, fontSize: "0.9rem", fontWeight: 500, textAlign: "left", cursor: "pointer",
              background: activeTab === "sources" ? "var(--primary)" : "var(--surface)",
              color: activeTab === "sources" ? "#fff" : "var(--text-1)",
              transition: "all 0.2s"
            }}
          >
            🔗 Origens de Leads
          </button>
          <button 
            onClick={() => setActiveTab("loss")}
            style={{
              display: "flex", alignItems: "center", gap: 10, padding: "0.8rem 1rem", border: "none", borderRadius: 8, fontSize: "0.9rem", fontWeight: 500, textAlign: "left", cursor: "pointer",
              background: activeTab === "loss" ? "var(--primary)" : "var(--surface)",
              color: activeTab === "loss" ? "#fff" : "var(--text-1)",
              transition: "all 0.2s"
            }}
          >
            ❌ Motivos de Perda
          </button>
          <button 
            onClick={() => setActiveTab("campaigns")}
            style={{
              display: "flex", alignItems: "center", gap: 10, padding: "0.8rem 1rem", border: "none", borderRadius: 8, fontSize: "0.9rem", fontWeight: 500, textAlign: "left", cursor: "pointer",
              background: activeTab === "campaigns" ? "var(--primary)" : "var(--surface)",
              color: activeTab === "campaigns" ? "#fff" : "var(--text-1)",
              transition: "all 0.2s"
            }}
          >
            📢 Campanhas
          </button>
          <button 
            onClick={() => setActiveTab("scripts")}
            style={{
              display: "flex", alignItems: "center", gap: 10, padding: "0.8rem 1rem", border: "none", borderRadius: 8, fontSize: "0.9rem", fontWeight: 500, textAlign: "left", cursor: "pointer",
              background: activeTab === "scripts" ? "var(--primary)" : "var(--surface)",
              color: activeTab === "scripts" ? "#fff" : "var(--text-1)",
              transition: "all 0.2s"
            }}
          >
            📝 Scripts de Qualificação
          </button>
          <button 
            onClick={() => setActiveTab("templates")}
            style={{
              display: "flex", alignItems: "center", gap: 10, padding: "0.8rem 1rem", border: "none", borderRadius: 8, fontSize: "0.9rem", fontWeight: 500, textAlign: "left", cursor: "pointer",
              background: activeTab === "templates" ? "var(--primary)" : "var(--surface)",
              color: activeTab === "templates" ? "#fff" : "var(--text-1)",
              transition: "all 0.2s"
            }}
          >
            ✉️ Templates de WhatsApp
          </button>
        </div>

        {/* Content Pane */}
        <div style={{ flex: 1 }}>
          {activeTab === "profile" && (
            <div className="card">
              <div className="card-head"><h2 className="card-title">Meu Perfil</h2></div>
              {profileMsg && <div className="badge badge-success" style={{ padding: "0.6rem", display: "block", marginBottom: 12 }}>{profileMsg}</div>}
              {profileErr && <div className="badge badge-danger" style={{ padding: "0.6rem", display: "block", marginBottom: 12 }}>{profileErr}</div>}
              
              <form onSubmit={saveProfile} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {/* Avatar Selection */}
                <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
                  <img 
                    src={profile.avatarUrl || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80"} 
                    alt="Avatar" 
                    style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover", border: "2px solid var(--primary)" }} 
                  />
                  <div>
                    <label className="form-label" style={{ marginBottom: 4 }}>Escolha uma foto ou cole a URL:</label>
                    <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                      {PRESET_AVATARS.map((av, idx) => (
                        <button 
                          key={idx} 
                          type="button" 
                          onClick={() => setProfile({ ...profile, avatarUrl: av })}
                          style={{ border: "none", padding: 0, background: "none", cursor: "pointer" }}
                        >
                          <img src={av} alt="Preset" style={{ width: 32, height: 32, borderRadius: "50%", border: profile.avatarUrl === av ? "2px solid var(--primary)" : "1px solid var(--border)" }} />
                        </button>
                      ))}
                    </div>
                    <input 
                      className="form-input" 
                      placeholder="Cole a URL da foto de perfil..." 
                      style={{ fontSize: "0.78rem", width: "300px" }}
                      value={profile.avatarUrl} 
                      onChange={(e) => setProfile({ ...profile, avatarUrl: e.target.value })} 
                    />
                  </div>
                </div>

                <div className="form-group"><label className="form-label">Nome Completo *</label><input className="form-input" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} required /></div>
                <div className="form-group"><label className="form-label">E-mail de Login *</label><input className="form-input" type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} required /></div>
                <div className="form-group"><label className="form-label">WhatsApp de Contato</label><input className="form-input" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} /></div>
                <div className="form-group"><label className="form-label">Redefinir Senha (deixe em branco para manter a atual)</label><input className="form-input" type="password" placeholder="Nova senha..." value={profile.password} onChange={(e) => setProfile({ ...profile, password: e.target.value })} /></div>
                
                <button type="submit" className="btn btn-primary" style={{ alignSelf: "flex-start", marginTop: 12 }}>Salvar Alterações</button>
              </form>
            </div>
          )}

          {activeTab === "whatsapp" && (
            <div className="card">
              <div className="card-head"><h2 className="card-title">Canais & WhatsApp API</h2></div>
              <p className="muted" style={{ fontSize: "0.85rem", marginBottom: 16 }}>Configurações das conexões oficiais Meta Cloud API, e-mail e outros canais integrados.</p>

              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: "2rem" }}>
                {cfg.channels?.map((chan: any) => (
                  <div key={chan.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem", background: "var(--surface-2)", borderRadius: 8 }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <strong>{chan.identity}</strong>
                        <span className="badge badge-success">{chan.type}</span>
                      </div>
                      <p className="muted" style={{ fontSize: "0.78rem", marginTop: 4 }}>Segredo/Credenciais: <code>{chan.credentials_ref}</code> · Status: {chan.status}</p>
                    </div>
                    {isAdmin && (
                      <button className="btn btn-danger" style={{ padding: "0.3rem 0.6rem", fontSize: "0.78rem" }} onClick={() => remove("channel", chan.id, chan.identity)}>Desconectar</button>
                    )}
                  </div>
                ))}
                {(!cfg.channels || cfg.channels.length === 0) && <p className="muted">Nenhum canal ativo cadastrado.</p>}
              </div>

              {isAdmin && (
                <div style={{ borderTop: "1px solid var(--border)", paddingTop: "1.5rem" }}>
                  <h3>Conectar Novo Canal</h3>
                  <NewChannelForm onAdd={addChannel} />
                </div>
              )}
            </div>
          )}

          {activeTab === "stages" && (
            <ConfigCard
              title="Etapas do funil"
              type="stage"
              items={cfg.stages}
              isAdmin={isAdmin}
              onAdd={add} onRename={rename} onRemove={remove}
              renderExtra={(s: any) => (
                <>{s.is_won ? <span className="badge badge-success">ganho</span> : null}{s.is_lost ? <span className="badge badge-danger">perda</span> : null}</>
              )}
            />
          )}

          {activeTab === "sources" && (
            <ConfigCard title="Origens / fontes de lead" type="source" items={cfg.sources} isAdmin={isAdmin} onAdd={add} onRename={rename} onRemove={remove} />
          )}

          {activeTab === "loss" && (
            <ConfigCard title="Motivos de perda" type="loss" items={cfg.lossReasons} isAdmin={isAdmin} onAdd={add} onRename={rename} onRemove={remove} />
          )}

          {activeTab === "campaigns" && (
            <ConfigCard title="Campanhas" type="campaign" items={cfg.campaigns} isAdmin={isAdmin} onAdd={add} onRename={rename} onRemove={remove} />
          )}

          {activeTab === "scripts" && (
            <ConfigCard title="Scripts de Qualificação" type="script" items={cfg.scripts || []} isAdmin={isAdmin} onAdd={add} onRename={rename} onRemove={remove} defaultBody="1. Qual o objetivo da compra?\n2. Preferência de dormitórios?\n3. Orçamento estimado?" />
          )}

          {activeTab === "templates" && (
            <ConfigCard title="Templates (WhatsApp)" type="template" items={cfg.templates} isAdmin={isAdmin} onAdd={add} onRename={rename} onRemove={remove} renderExtra={(t: any) => <span className="badge badge-success">{t.wa_approval_status || "APPROVED"}</span>} defaultBody="Olá {{1}}, aqui é {{2}} da imobiliária. Podemos falar?" />
          )}
        </div>
      </div>
    </div>
  );
}

function NewChannelForm({ onAdd }: any) {
  const [type, setType] = useState("whatsapp");
  const [identity, setIdentity] = useState("");
  const [cred, setCred] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onAdd(type, identity, cred);
    setIdentity("");
    setCred("");
  };

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
      <div className="form-group">
        <label className="form-label">Tipo de Canal</label>
        <select className="form-select" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="whatsapp">WhatsApp (Cloud API Oficial)</option>
          <option value="instagram">Instagram Direct</option>
          <option value="email">E-mail (IMAP/SMTP)</option>
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">Identificação (Número ou Endereço)</label>
        <input className="form-input" placeholder="e.g. +5511999998888 ou @imobiliaria" value={identity} onChange={(e) => setIdentity(e.target.value)} required />
      </div>
      <div className="form-group">
        <label className="form-label">Referência de Credenciais (Cofre de Segredos)</label>
        <input className="form-input" placeholder="e.g. sec-waba-token" value={cred} onChange={(e) => setCred(e.target.value)} required />
      </div>
      <button type="submit" className="btn btn-primary" style={{ alignSelf: "flex-start" }}>Conectar Canal</button>
    </form>
  );
}

function ConfigCard({ title, type, items, isAdmin, onAdd, onRename, onRemove, renderExtra, defaultBody }: any) {
  const [val, setVal] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");

  return (
    <div className="card">
      <div className="card-head"><div className="card-title">{title}</div><span className="card-hint">{items.length}</span></div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((it: any) => (
          <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "0.5rem 0.7rem", background: "var(--surface-2)", borderRadius: 8, fontSize: "0.85rem" }}>
            {editingId === it.id ? (
              <>
                <input className="form-input" style={{ flex: 1, padding: "0.3rem 0.5rem" }} value={editVal} onChange={(e) => setEditVal(e.target.value)} autoFocus onKeyDown={(e) => e.key === "Enter" && (onRename(type, it.id, editVal), setEditingId(null))} />
                <button className="btn btn-primary" style={{ padding: "0.25rem 0.6rem", fontSize: "0.75rem" }} onClick={() => { onRename(type, it.id, editVal); setEditingId(null); }}>Salvar</button>
                <button className="btn btn-ghost" style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }} onClick={() => setEditingId(null)}>✕</button>
              </>
            ) : (
              <>
                <span style={{ flex: 1 }}><strong>{it.name}</strong> {renderExtra && renderExtra(it)}</span>
                {isAdmin && (
                  <>
                    <button className="btn btn-ghost" style={{ padding: "0.2rem 0.45rem", fontSize: "0.75rem" }} title="Renomear" onClick={() => { setEditingId(it.id); setEditVal(it.name); }}>✎</button>
                    <button className="btn btn-ghost" style={{ padding: "0.2rem 0.45rem", fontSize: "0.75rem", color: "var(--status-danger)" }} title="Excluir" onClick={() => onRemove(type, it.id, it.name)}>🗑</button>
                  </>
                )}
              </>
            )}
          </div>
        ))}
        {items.length === 0 && <p className="muted" style={{ fontSize: "0.82rem" }}>Nada cadastrado.</p>}
      </div>
      {isAdmin && (
        <div className="flex-gap" style={{ marginTop: 12 }}>
          <input className="form-input" style={{ flex: 1 }} placeholder="Adicionar novo..." value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (onAdd(type, val, defaultBody), setVal(""))} />
          <button className="btn btn-primary" onClick={() => { onAdd(type, val, defaultBody); setVal(""); }}>+</button>
        </div>
      )}
    </div>
  );
}
