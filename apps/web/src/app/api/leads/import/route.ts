import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, getAuthUser } from "../../../../lib/supabase";

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  // Aceita array direto ou wrapper { data: [...] }
  const rows: any[] = Array.isArray(body)
    ? body
    : Array.isArray(body?.data)
    ? body.data
    : Array.isArray(body?.[0]?.data)
    ? body[0].data
    : [];

  if (!rows.length) return NextResponse.json({ error: "Nenhum registro encontrado" }, { status: 400 });

  // Busca etapas, origens e corretores existentes (ou cria on-the-fly)
  const { data: stages } = await supabase.from("funnel_stages").select("id, name").eq("tenant_id", user.tenant_id);
  const { data: sources } = await supabase.from("lead_sources").select("id, name").eq("tenant_id", user.tenant_id);
  const { data: existingUsers } = await supabase.from("users").select("id, name").eq("tenant_id", user.tenant_id);

  const stageMap = Object.fromEntries((stages || []).map((s: any) => [s.name.toLowerCase().trim(), s.id]));
  const sourceMap = Object.fromEntries((sources || []).map((s: any) => [s.name.toLowerCase().trim(), s.id]));
  const brokerMap = Object.fromEntries((existingUsers || []).map((u: any) => [u.name.toLowerCase().trim(), u.id]));

  // Para origens e etapas novas, cria no banco
  const missingSourceNames = [...new Set(rows.map((r) => r.nome_origem).filter(Boolean).filter((n: string) => !sourceMap[n.toLowerCase().trim()]))];
  for (const name of missingSourceNames) {
    const { data } = await supabase.from("lead_sources").insert({ tenant_id: user.tenant_id, name, active: true }).select("id, name").single();
    if (data) sourceMap[name.toLowerCase().trim()] = data.id;
  }

  const missingStageNames = [...new Set(rows.map((r) => r.nome_etapa).filter(Boolean).filter((n: string) => !stageMap[n.toLowerCase().trim()]))];
  for (let i = 0; i < missingStageNames.length; i++) {
    const name = missingStageNames[i];
    const { data } = await supabase.from("funnel_stages").insert({ tenant_id: user.tenant_id, name, order: 99 + i }).select("id, name").single();
    if (data) stageMap[name.toLowerCase().trim()] = data.id;
  }

  let imported = 0;
  let skipped = 0;
  let errors: string[] = [];

  for (const row of rows) {
    try {
      const ddi = row.ddi_pessoa || "55";
      const rawPhone = String(row.telefone_pessoa || "").replace(/\D/g, "");
      const phone = rawPhone ? `+${ddi.replace(/\D/g, "")}${rawPhone}` : null;
      const sourceName = (row.nome_origem || "").toLowerCase().trim();
      const stageName = (row.nome_etapa || "").toLowerCase().trim();
      const calor = Number(row.calor ?? 0);
      const temperature = calor >= 8 ? "quente" : calor >= 4 ? "morno" : "frio";

      // Gera código único baseado no id externo
      const code = `IMP-${row.id}`;

      // Verifica se já existe pelo código (idempotente)
      const { data: existing } = await supabase
        .from("leads")
        .select("id")
        .eq("code", code)
        .eq("tenant_id", user.tenant_id)
        .maybeSingle();

      if (existing) { skipped++; continue; }

      // Corretor — cria usuário placeholder se não existir
      let brokerId: string | null = null;
      if (row.nome_corretor) {
        const key = row.nome_corretor.toLowerCase().trim();
        if (brokerMap[key]) {
          brokerId = brokerMap[key];
        } else {
          const { data: newBroker } = await supabase.from("users").insert({
            tenant_id: user.tenant_id,
            name: row.nome_corretor,
            email: `corretor_${row.id_corretor}@import.local`,
            status: "ativo",
          }).select("id").single();
          if (newBroker) { brokerMap[key] = newBroker.id; brokerId = newBroker.id; }
        }
      }

      const payload: any = {
        tenant_id: user.tenant_id,
        code,
        name: row.nome_pessoa || "Sem nome",
        phone,
        email: row.email_pessoa || null,
        temperature,
        entered_at: row.data_captura ? new Date(row.data_captura).toISOString() : new Date().toISOString(),
        last_interaction_at: row.data_ultima_interacao ? new Date(row.data_ultima_interacao).toISOString() : null,
        source_id: sourceMap[sourceName] || null,
        tracking_source: row.nome_origem || null,
        stage_id: stageMap[stageName] || null,
        responsible_broker_id: brokerId,
        notes: row.anotacoes || null,
        dedupe_status: "unique",
      };

      const { error } = await supabase.from("leads").insert(payload);
      if (error) { errors.push(`${code}: ${error.message}`); } else { imported++; }
    } catch (e: any) {
      errors.push(`row ${row.id}: ${e.message}`);
    }
  }

  return NextResponse.json({
    total: rows.length,
    imported,
    skipped,
    errors: errors.slice(0, 20),
  });
}
