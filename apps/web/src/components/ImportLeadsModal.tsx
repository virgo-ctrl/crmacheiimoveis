"use client";

import { useRef, useState } from "react";

interface ImportResult {
  total: number;
  imported: number;
  skipped: number;
  errors: string[];
}

interface Props {
  onClose: () => void;
  onImported: () => void;
}

const COLUMN_LABELS: Record<string, string> = {
  id: "ID Externo",
  nome_pessoa: "Nome",
  ddi_pessoa: "DDI",
  telefone_pessoa: "Telefone",
  email_pessoa: "E-mail",
  nome_origem: "Origem",
  nome_campanha: "Campanha",
  data_captura: "Data Captura",
  data_qualificado: "Data Qualificado",
  data_com_corretor: "Data c/ Corretor",
  data_ultima_interacao: "Última Interação",
  nome_etapa: "Etapa",
  nome_situacao: "Situação",
  nome_qualificador: "Qualificador",
  id_corretor: "ID Corretor",
  nome_corretor: "Corretor",
  calor: "Calor (0-10)",
  nome_status: "Status",
  nome_empreendimento: "Empreendimento",
  nome_construtora: "Construtora",
  valor_vendido: "Valor Vendido",
  motivo_perda: "Motivo de Perda",
};

function parseInput(raw: string): any[] | null {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed[0]?.data) return parsed[0].data;
    if (Array.isArray(parsed) && parsed[0]?.id) return parsed;
    if (Array.isArray(parsed)) return parsed;
    return null;
  } catch {
    return null;
  }
}

export default function ImportLeadsModal({ onClose, onImported }: Props) {
  const [step, setStep] = useState<"paste" | "preview" | "importing" | "done">("paste");
  const [rawText, setRawText] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [parseError, setParseError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleParse = () => {
    const parsed = parseInput(rawText);
    if (!parsed || parsed.length === 0) {
      setParseError("JSON inválido ou sem registros. Verifique o formato e tente novamente.");
      return;
    }
    setParseError("");
    setRows(parsed);
    setStep("preview");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setRawText(text);
      const parsed = parseInput(text);
      if (!parsed) { setParseError("Arquivo inválido."); return; }
      setParseError("");
      setRows(parsed);
      setStep("preview");
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    setStep("importing");
    try {
      const res = await fetch("/api/leads/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rows),
      });
      const data = await res.json();
      setResult(data);
      setStep("done");
    } catch {
      setResult({ total: rows.length, imported: 0, skipped: 0, errors: ["Erro de conexão com o servidor."] });
      setStep("done");
    }
  };

  // Detecta as colunas presentes no primeiro registro
  const detectedColumns = rows.length > 0 ? Object.keys(rows[0]).filter((k) => COLUMN_LABELS[k]) : [];
  const previewRows = rows.slice(0, 5);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: step === "preview" ? 860 : 520, width: "100%" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex-between" style={{ marginBottom: "1.25rem" }}>
          <div>
            <h2 style={{ fontSize: "1.1rem" }}>Importar Leads</h2>
            <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginTop: 2 }}>
              {step === "paste" && "Cole o JSON ou faça upload do arquivo"}
              {step === "preview" && `${rows.length} registros detectados — revise antes de importar`}
              {step === "importing" && "Importando registros..."}
              {step === "done" && "Importação concluída"}
            </p>
          </div>
          <button className="btn btn-ghost" style={{ padding: "0.3rem 0.6rem" }} onClick={onClose}>✕</button>
        </div>

        {/* STEP: paste */}
        {step === "paste" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Cole o JSON aqui</label>
              <textarea
                className="form-textarea"
                rows={10}
                style={{ fontFamily: "monospace", fontSize: "0.8rem", resize: "vertical" }}
                placeholder={`[\n  {\n    "id": 4724652,\n    "nome_pessoa": "Michelle Porfirio",\n    ...\n  }\n]`}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
              />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <div style={{ flex: 1, height: 1, background: "var(--border-color)" }} />
              <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>ou</span>
              <div style={{ flex: 1, height: 1, background: "var(--border-color)" }} />
            </div>

            <div>
              <button className="btn" style={{ width: "100%" }} onClick={() => fileRef.current?.click()}>
                Fazer upload de arquivo .json
              </button>
              <input ref={fileRef} type="file" accept=".json" style={{ display: "none" }} onChange={handleFileUpload} />
            </div>

            {parseError && (
              <div style={{ background: "var(--status-danger-bg)", color: "var(--status-danger)", borderRadius: 8, padding: "0.6rem 0.8rem", fontSize: "0.83rem" }}>
                {parseError}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.25rem" }}>
              <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleParse} disabled={!rawText.trim()}>
                Analisar JSON
              </button>
            </div>
          </div>
        )}

        {/* STEP: preview */}
        {step === "preview" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>

            {/* Resumo das colunas detectadas */}
            <div style={{ background: "var(--surface-2)", border: "1px solid var(--border-color)", borderRadius: 10, padding: "0.85rem 1rem" }}>
              <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 600, marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                Colunas detectadas ({detectedColumns.length})
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                {detectedColumns.map((col) => (
                  <span key={col} className="badge badge-info" style={{ fontSize: "0.72rem" }}>
                    {COLUMN_LABELS[col] || col}
                  </span>
                ))}
              </div>
            </div>

            {/* Preview da tabela */}
            <div style={{ overflowX: "auto", border: "1px solid var(--border-color)", borderRadius: 10 }}>
              <table>
                <thead>
                  <tr>
                    <th>ID Ext.</th>
                    <th>Nome</th>
                    <th>Telefone</th>
                    <th>Origem</th>
                    <th>Campanha</th>
                    <th>Etapa</th>
                    <th>Situação</th>
                    <th>Corretor</th>
                    <th>Captura</th>
                    <th>Calor</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row) => {
                    const ddi = row.ddi_pessoa || "55";
                    const phone = row.telefone_pessoa ? `+${ddi}${row.telefone_pessoa}` : "—";
                    const calor = Number(row.calor ?? 0);
                    const tempColor = calor >= 8 ? "var(--status-danger)" : calor >= 4 ? "var(--status-warning)" : "var(--status-info)";
                    return (
                      <tr key={row.id}>
                        <td className="mono">{row.id}</td>
                        <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{row.nome_pessoa}</td>
                        <td className="mono">{phone}</td>
                        <td>{row.nome_origem || "—"}</td>
                        <td style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.nome_campanha || "—"}</td>
                        <td><span className="badge badge-info" style={{ whiteSpace: "nowrap" }}>{row.nome_etapa || "—"}</span></td>
                        <td style={{ whiteSpace: "nowrap", fontSize: "0.78rem" }}>{row.nome_situacao || "—"}</td>
                        <td style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "0.8rem" }}>{row.nome_corretor || "—"}</td>
                        <td className="mono" style={{ whiteSpace: "nowrap", fontSize: "0.78rem" }}>{row.data_captura ? row.data_captura.slice(0, 10) : "—"}</td>
                        <td>
                          <span style={{ fontWeight: 700, color: tempColor }}>{calor}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {rows.length > 5 && (
                <div style={{ padding: "0.6rem 1rem", fontSize: "0.78rem", color: "var(--text-muted)", background: "var(--surface-2)", borderTop: "1px solid var(--border-color)" }}>
                  Exibindo 5 de {rows.length} registros
                </div>
              )}
            </div>

            {/* Regras de mapeamento */}
            <div style={{ background: "var(--primary-light)", border: "1px solid var(--primary-200)", borderRadius: 10, padding: "0.85rem 1rem", fontSize: "0.82rem", color: "var(--text-secondary)" }}>
              <strong style={{ color: "var(--primary-dark)" }}>Regras de importação:</strong>
              <ul style={{ marginTop: "0.4rem", marginLeft: "1rem", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                <li>Leads com o mesmo ID externo (campo <code>id</code>) serão pulados (idempotente)</li>
                <li>Origens e etapas novas serão criadas automaticamente</li>
                <li>Corretores não existentes serão criados como usuários placeholder</li>
                <li><code>calor</code> 0-3 = Frio, 4-7 = Morno, 8-10 = Quente</li>
                <li>Telefone formatado com DDI+número (ex.: +558192543264)</li>
              </ul>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
              <button className="btn btn-ghost" onClick={() => setStep("paste")}>Voltar</button>
              <button className="btn btn-primary" onClick={handleImport}>
                Importar {rows.length} leads
              </button>
            </div>
          </div>
        )}

        {/* STEP: importing */}
        {step === "importing" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1.5rem", padding: "2rem 0" }}>
            <div style={{
              width: 52, height: 52, border: "4px solid var(--border-color)", borderTopColor: "var(--primary)",
              borderRadius: "50%", animation: "spin 0.9s linear infinite"
            }} />
            <div style={{ textAlign: "center" }}>
              <div style={{ fontWeight: 600 }}>Importando {rows.length} registros...</div>
              <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: 4 }}>Criando origens, etapas e corretores novos automaticamente</div>
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* STEP: done */}
        {step === "done" && result && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem" }}>
              <div style={{ background: "var(--status-info-bg)", borderRadius: 10, padding: "1rem", textAlign: "center" }}>
                <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--status-info)" }}>{result.total}</div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 2 }}>Total no arquivo</div>
              </div>
              <div style={{ background: "var(--status-success-bg)", borderRadius: 10, padding: "1rem", textAlign: "center" }}>
                <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--status-success)" }}>{result.imported}</div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 2 }}>Importados</div>
              </div>
              <div style={{ background: "var(--surface-2)", borderRadius: 10, padding: "1rem", textAlign: "center" }}>
                <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--text-secondary)" }}>{result.skipped}</div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 2 }}>Já existiam</div>
              </div>
            </div>

            {result.errors.length > 0 && (
              <div style={{ background: "var(--status-danger-bg)", border: "1px solid var(--status-danger)", borderRadius: 10, padding: "0.85rem 1rem" }}>
                <div style={{ fontWeight: 600, color: "var(--status-danger)", fontSize: "0.85rem", marginBottom: "0.4rem" }}>
                  {result.errors.length} erro(s)
                </div>
                <ul style={{ fontSize: "0.78rem", color: "var(--status-danger)", marginLeft: "1rem", display: "flex", flexDirection: "column", gap: "0.15rem" }}>
                  {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}

            {result.errors.length === 0 && (
              <div style={{ background: "var(--status-success-bg)", borderRadius: 10, padding: "0.85rem 1rem", fontSize: "0.85rem", color: "var(--status-success)", fontWeight: 600, textAlign: "center" }}>
                Importação concluída com sucesso.
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
              {result.imported < result.total && (
                <button className="btn" onClick={() => { setStep("paste"); setResult(null); }}>Nova Importação</button>
              )}
              <button className="btn btn-primary" onClick={() => { onImported(); onClose(); }}>
                Ver Leads
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
