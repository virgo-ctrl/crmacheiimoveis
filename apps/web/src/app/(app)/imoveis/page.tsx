"use client";

import { useEffect, useState } from "react";
import { useUser } from "../../../components/app-context";

const brl = (n: number) => "R$ " + (n || 0).toLocaleString("pt-BR");

export default function ImoveisPage() {
  const user = useUser();
  const isAdmin = user.role === "Admin";

  const [activeTab, setActiveTab] = useState<"developments" | "developers" | "properties">("developments");

  const [devs, setDevs] = useState<any[]>([]); // developments
  const [developers, setDevelopers] = useState<any[]>([]); // construtoras
  const [properties, setProperties] = useState<any[]>([]); // unidades

  // Modals editing states
  const [editDev, setEditDev] = useState<any | null>(null);
  const [editDeveloper, setEditDeveloper] = useState<any | null>(null);
  const [editProp, setEditProp] = useState<any | null>(null);

  const loadAll = () => {
    fetch("/api/products").then((r) => r.json()).then((d) => {
      setDevs(d.developments || []);
      setDevelopers(d.developers || []);
    });
    fetch("/api/products/extras").then((r) => r.json()).then((d) => {
      setProperties(d.properties || []);
      if (d.developers) setDevelopers(d.developers); // sync fresh developers
    });
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleRemoveDev = async (id: string) => {
    if (!confirm("Excluir este empreendimento? Todas as unidades associadas serão limpas.")) return;
    const res = await fetch(`/api/products/${id}`, { method: "DELETE" });
    if (res.ok) loadAll();
    else alert((await res.json()).error);
  };

  const handleRemoveDeveloper = async (id: string) => {
    if (!confirm("Excluir esta construtora?")) return;
    const res = await fetch("/api/products/extras", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "developer", id }),
    });
    if (res.ok) loadAll();
    else alert((await res.json()).error);
  };

  const handleRemoveProperty = async (id: string) => {
    if (!confirm("Excluir esta unidade?")) return;
    const res = await fetch("/api/products/extras", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "property", id }),
    });
    if (res.ok) loadAll();
    else alert((await res.json()).error);
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Catálogo de Produtos</h1>
          <p className="page-sub">Gestão de empreendimentos imobiliários, construtoras parceiras e estoque de unidades</p>
        </div>
        {isAdmin && (
          <div className="flex-gap">
            {activeTab === "developments" && <button className="btn btn-primary" onClick={() => setEditDev({})}>+ Novo Empreendimento</button>}
            {activeTab === "developers" && <button className="btn btn-primary" onClick={() => setEditDeveloper({})}>+ Nova Construtora</button>}
            {activeTab === "properties" && <button className="btn btn-primary" onClick={() => setEditProp({})}>+ Nova Unidade</button>}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex-gap" style={{ borderBottom: "2px solid var(--border-color)", paddingBottom: 8, marginBottom: 16 }}>
        <button className={`btn ${activeTab === "developments" ? "btn-primary" : "btn-ghost"}`} onClick={() => setActiveTab("developments")}>
          🏢 Empreendimentos ({devs.length})
        </button>
        <button className={`btn ${activeTab === "developers" ? "btn-primary" : "btn-ghost"}`} onClick={() => setActiveTab("developers")}>
          👷 Construtoras / Incorporadoras ({developers.length})
        </button>
        <button className={`btn ${activeTab === "properties" ? "btn-primary" : "btn-ghost"}`} onClick={() => setActiveTab("properties")}>
          🔑 Unidades / Imóveis ({properties.length})
        </button>
      </div>

      {/* Content Tab 1: Developments */}
      {activeTab === "developments" && (
        <div className="card table-card">
          <table>
            <thead>
              <tr>
                <th>Empreendimento</th>
                <th>Construtora</th>
                <th>Cidade / Região</th>
                <th>Tipo</th>
                <th>VGV</th>
                {isAdmin && <th style={{ textAlign: "right" }}>Ações</th>}
              </tr>
            </thead>
            <tbody>
              {devs.map((d) => (
                <tr key={d.id}>
                  <td><strong>{d.name}</strong></td>
                  <td>{d.developerName || "—"}</td>
                  <td>{d.city} {d.region ? `· ${d.region}` : ""}</td>
                  <td><span className="badge badge-info">{d.type}</span></td>
                  <td style={{ fontWeight: 600, color: "var(--primary)" }}>{brl(d.vgv)}</td>
                  {isAdmin && (
                    <td>
                      <div className="flex-gap" style={{ justifyContent: "flex-end" }}>
                        <button className="btn" style={{ padding: "0.3rem 0.6rem", fontSize: "0.78rem" }} onClick={() => setEditDev(d)}>Editar</button>
                        <button className="btn btn-danger" style={{ padding: "0.3rem 0.6rem", fontSize: "0.78rem" }} onClick={() => handleRemoveDev(d.id)}>Excluir</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {devs.length === 0 && <tr><td colSpan={6} className="muted" style={{ textAlign: "center", padding: "2rem" }}>Nenhum empreendimento cadastrado.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Content Tab 2: Developers */}
      {activeTab === "developers" && (
        <div className="card table-card">
          <table>
            <thead>
              <tr>
                <th>Nome da Construtora</th>
                <th>CNPJ (Filtro D4)</th>
                <th>Cidade / UF</th>
                <th>Endereço</th>
                <th>Contato</th>
                {isAdmin && <th style={{ textAlign: "right" }}>Ações</th>}
              </tr>
            </thead>
            <tbody>
              {developers.map((d) => (
                <tr key={d.id}>
                  <td><strong>{d.name}</strong></td>
                  <td className="mono">{d.cnpj}</td>
                  <td>{d.city ? `${d.city}${d.state ? ` / ${d.state}` : ""}` : "—"}</td>
                  <td>{d.address ? `${d.address}${d.number ? `, ${d.number}` : ""}` : "—"}</td>
                  <td>{d.contact || "—"}</td>
                  {isAdmin && (
                    <td>
                      <div className="flex-gap" style={{ justifyContent: "flex-end" }}>
                        <button className="btn" style={{ padding: "0.3rem 0.6rem", fontSize: "0.78rem" }} onClick={() => setEditDeveloper(d)}>Editar</button>
                        <button className="btn btn-danger" style={{ padding: "0.3rem 0.6rem", fontSize: "0.78rem" }} onClick={() => handleRemoveDeveloper(d.id)}>Excluir</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {developers.length === 0 && <tr><td colSpan={6} className="muted" style={{ textAlign: "center", padding: "2rem" }}>Nenhuma construtora cadastrada.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Content Tab 3: Properties */}
      {activeTab === "properties" && (
        <div className="card table-card">
          <table>
            <thead>
              <tr>
                <th>Unidade</th>
                <th>Empreendimento</th>
                <th>Construtora</th>
                <th>Tipo</th>
                <th>Preço</th>
                <th>Dormitórios</th>
                <th>Status</th>
                {isAdmin && <th style={{ textAlign: "right" }}>Ações</th>}
              </tr>
            </thead>
            <tbody>
              {properties.map((p) => (
                <tr key={p.id}>
                  <td><strong>{p.code}</strong></td>
                  <td>{p.developmentName || "Avulso"}</td>
                  <td>{p.developerName || "—"}</td>
                  <td><span className="badge badge-info">{p.type}</span></td>
                  <td style={{ fontWeight: 600, color: "var(--primary)" }}>{brl(p.price)}</td>
                  <td>{p.bedrooms ? `${p.bedrooms} dorm.` : "—"}</td>
                  <td>
                    <span className={`badge ${
                      p.status === "disponível" ? "badge-success" : p.status === "reservado" ? "badge-warning" : "badge-danger"
                    }`}>{p.status}</span>
                  </td>
                  {isAdmin && (
                    <td>
                      <div className="flex-gap" style={{ justifyContent: "flex-end" }}>
                        <button className="btn" style={{ padding: "0.3rem 0.6rem", fontSize: "0.78rem" }} onClick={() => setEditProp(p)}>Editar</button>
                        <button className="btn btn-danger" style={{ padding: "0.3rem 0.6rem", fontSize: "0.78rem" }} onClick={() => handleRemoveProperty(p.id)}>Excluir</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {properties.length === 0 && <tr><td colSpan={8} className="muted" style={{ textAlign: "center", padding: "2rem" }}>Nenhuma unidade em estoque.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals definitions */}
      {editDev && (
        <DevelopmentModal dev={editDev} developers={developers} onClose={() => setEditDev(null)} onSaved={loadAll} />
      )}

      {editDeveloper && (
        <DeveloperModal developer={editDeveloper} onClose={() => setEditDeveloper(null)} onSaved={loadAll} />
      )}

      {editProp && (
        <PropertyModal property={editProp} developments={devs} developers={developers} onClose={() => setEditProp(null)} onSaved={loadAll} />
      )}
    </div>
  );
}

function DevelopmentModal({ dev, developers, onClose, onSaved }: any) {
  const isEdit = !!dev.id;
  const [f, setF] = useState({
    id: dev.id || "",
    name: dev.name || "",
    developerId: dev.developer_id || "",
    type: dev.type || "lançamento",
    address: dev.address || "",
    city: dev.city || "",
    region: dev.region || "",
    vgv: dev.vgv != null ? String(dev.vgv) : "",
  });
  const [err, setErr] = useState("");

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    const url = isEdit ? `/api/products/${dev.id}` : "/api/products";
    const method = isEdit ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, vgv: Number(f.vgv) || 0 }),
    });
    if (res.ok) {
      onSaved();
      onClose();
    } else {
      setErr((await res.json()).error);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{isEdit ? "Editar Empreendimento" : "Novo Empreendimento"}</h2>
        {err && <div className="badge badge-danger" style={{ display: "block", padding: "0.6rem", margin: "8px 0" }}>{err}</div>}
        <form onSubmit={save}>
          <div className="form-group"><label className="form-label">Nome *</label><input className="form-input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></div>
          <div className="form-group">
            <label className="form-label">Construtora</label>
            <select className="form-select" value={f.developerId} onChange={(e) => setF({ ...f, developerId: e.target.value })}>
              <option value="">Nenhuma</option>
              {developers.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Tipo</label>
            <select className="form-select" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
              <option value="lançamento">Lançamento</option>
              <option value="em obra">Em Obra</option>
              <option value="pronto">Pronto</option>
            </select>
          </div>
          <div className="form-group"><label className="form-label">Cidade</label><input className="form-input" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">Bairro / Região</label><input className="form-input" value={f.region} onChange={(e) => setF({ ...f, region: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">Endereço</label><input className="form-input" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">VGV Estimado (R$)</label><input className="form-input" type="number" value={f.vgv} onChange={(e) => setF({ ...f, vgv: e.target.value })} /></div>

          <div className="flex-gap" style={{ marginTop: 16 }}>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Salvar</button>
            <button type="button" className="btn" style={{ flex: 1 }} onClick={onClose}>Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeveloperModal({ developer, onClose, onSaved }: any) {
  const isEdit = !!developer.id;
  const [f, setF] = useState({
    id: developer.id || "",
    name: developer.name || "",
    cnpj: developer.cnpj || "",
    contact: developer.contact || "",
    address: developer.address || "",
    number: developer.number || "",
    country: developer.country || "Brasil",
    state: developer.state || "",
    city: developer.city || "",
    neighborhood: developer.neighborhood || "",
    zip: developer.zip || "",
    complement: developer.complement || "",
  });
  const [err, setErr] = useState("");

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    const url = "/api/products/extras";
    const method = isEdit ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, type: "developer" }),
    });
    if (res.ok) {
      onSaved();
      onClose();
    } else {
      setErr((await res.json()).error);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <h2>{isEdit ? "Editar Construtora" : "Cadastrar Construtora"}</h2>
        {err && <div className="badge badge-danger" style={{ display: "block", padding: "0.6rem", margin: "8px 0" }}>{err}</div>}
        <form onSubmit={save}>
          <div className="form-group"><label className="form-label">Nome da Construtora / Incorporadora *</label><input className="form-input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></div>
          <div className="form-group"><label className="form-label">CNPJ *</label><input className="form-input" placeholder="00.000.000/0001-00" value={f.cnpj} onChange={(e) => setF({ ...f, cnpj: e.target.value })} required disabled={isEdit} /></div>
          <div className="form-group"><label className="form-label">Telefone / E-mail de Contato</label><input className="form-input" value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} /></div>

          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8 }}>
            <div className="form-group"><label className="form-label">Endereço</label><input className="form-input" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></div>
            <div className="form-group"><label className="form-label">Número</label><input className="form-input" value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} /></div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <div className="form-group">
              <label className="form-label">País</label>
              <select className="form-select" value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })}>
                <option value="Brasil">Brasil</option>
                <option value="Portugal">Portugal</option>
                <option value="EUA">EUA</option>
              </select>
            </div>
            <div className="form-group"><label className="form-label">Estado</label><input className="form-input" placeholder="e.g. SP" value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })} /></div>
            <div className="form-group"><label className="form-label">Cidade</label><input className="form-input" placeholder="e.g. São Paulo" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div className="form-group"><label className="form-label">Bairro</label><input className="form-input" value={f.neighborhood} onChange={(e) => setF({ ...f, neighborhood: e.target.value })} /></div>
            <div className="form-group"><label className="form-label">CEP</label><input className="form-input" placeholder="00000-000" value={f.zip} onChange={(e) => setF({ ...f, zip: e.target.value })} /></div>
          </div>

          <div className="form-group"><label className="form-label">Complemento</label><input className="form-input" value={f.complement} onChange={(e) => setF({ ...f, complement: e.target.value })} /></div>

          <div className="flex-gap" style={{ marginTop: 16 }}>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Salvar</button>
            <button type="button" className="btn" style={{ flex: 1 }} onClick={onClose}>Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PropertyModal({ property, developments, developers, onClose, onSaved }: any) {
  const isEdit = !!property.id;
  const [f, setF] = useState({
    id: property.id || "",
    developmentId: property.development_id || "",
    developerId: property.developer_id || "",
    code: property.code || "",
    price: property.price != null ? String(property.price) : "",
    area: property.area != null ? String(property.area) : "",
    bedrooms: property.bedrooms != null ? String(property.bedrooms) : "",
    status: property.status || "disponível",
  });
  const [err, setErr] = useState("");

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    const url = "/api/products/extras";
    const method = isEdit ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...f,
        type: "property",
        price: Number(f.price) || 0,
        area: Number(f.area) || 0,
        bedrooms: Number(f.bedrooms) || 0,
      }),
    });
    if (res.ok) {
      onSaved();
      onClose();
    } else {
      setErr((await res.json()).error);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{isEdit ? "Editar Unidade" : "Adicionar Unidade"}</h2>
        {err && <div className="badge badge-danger" style={{ display: "block", padding: "0.6rem", margin: "8px 0" }}>{err}</div>}
        <form onSubmit={save}>
          <div className="form-group">
            <label className="form-label">Empreendimento Vinculado</label>
            <select className="form-select" value={f.developmentId} onChange={(e) => setF({ ...f, developmentId: e.target.value })}>
              <option value="">Avulso / Sem empreendimento</option>
              {developments.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Construtora Vinculada</label>
            <select className="form-select" value={f.developerId} onChange={(e) => setF({ ...f, developerId: e.target.value })}>
              <option value="">Nenhuma / Sem construtora</option>
              {developers.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div className="form-group"><label className="form-label">Identificação / Nº da Unidade *</label><input className="form-input" placeholder="e.g. AP-102, Cobertura B" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} required /></div>
          <div className="form-group"><label className="form-label">Preço de Venda (R$) *</label><input className="form-input" type="number" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} required /></div>
          <div className="form-group"><label className="form-label">Área Privativa (m²)</label><input className="form-input" type="number" value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">Dormitórios</label><input className="form-input" type="number" value={f.bedrooms} onChange={(e) => setF({ ...f, bedrooms: e.target.value })} /></div>
          <div className="form-group">
            <label className="form-label">Situação de Estoque</label>
            <select className="form-select" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
              <option value="disponível">Disponível</option>
              <option value="reservado">Reservado</option>
              <option value="vendido">Vendido</option>
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
