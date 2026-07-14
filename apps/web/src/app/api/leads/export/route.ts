import { NextResponse } from "next/server";
import { getSupabaseAdmin, getAuthUser } from "../../../../lib/supabase";

export async function GET(req: Request) {
  const supabase = getSupabaseAdmin();
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  if (user.role === "Corretor") {
    return NextResponse.json({ error: "Permissão negada. Corretores não podem exportar dados." }, { status: 403 });
  }

  let query = supabase
    .from("leads")
    .select("code, name, phone, email, entered_at, estimated_value, tracking_source, temperature, funnel_stages(name), users!leads_responsible_broker_id_fkey(name)")
    .eq("tenant_id", user.tenant_id)
    .order("created_at", { ascending: false });

  // Gerente vê apenas seus leads (escopo = team é simplificado para self aqui)
  if (user.role === "Gerente") {
    query = query.eq("responsible_broker_id", user.id);
  }

  const { data: leads, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = leads ?? [];

  let csv = "Codigo,Nome,Telefone,Email,Entrada,Valor Estimado,Origem,Temperatura,Etapa,Responsavel\n";
  rows.forEach((l: any) => {
    const stageName = l.funnel_stages?.name ?? "";
    const brokerName = l.users?.name ?? "";
    csv += `"${l.code ?? ""}","${(l.name ?? "").replace(/"/g, '""')}","${l.phone ?? ""}","${l.email ?? ""}","${l.entered_at ?? ""}",${l.estimated_value ?? 0},"${l.tracking_source ?? ""}","${l.temperature ?? ""}","${stageName}","${brokerName}"\n`;
  });

  await supabase.from("audit_log").insert({
    tenant_id: user.tenant_id,
    actor_id: user.id,
    action: "lead.exported",
    entity_type: "leads",
    details: `Exportou ${rows.length} leads em formato CSV.`,
    ip: "server",
  });

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=leads_export.csv",
    },
  });
}
