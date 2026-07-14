import { NextResponse } from "next/server";
import { getSupabaseAdmin, getAuthUser } from "../../../../lib/supabase";

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const supabase = getSupabaseAdmin();

    const { data: candidates } = await supabase
      .from("dedupe_candidates")
      .select(`
        *,
        entity:leads!dedupe_candidates_entity_id_fkey(name, code, phone, email),
        match:leads!dedupe_candidates_match_entity_id_fkey(name, code, phone, email)
      `)
      .eq("status", "open");

    return NextResponse.json({
      candidates: (candidates ?? []).map((c: any) => ({
        ...c,
        entityName: c.entity?.name, entityCode: c.entity?.code,
        entityPhone: c.entity?.phone, entityEmail: c.entity?.email,
        matchName: c.match?.name, matchCode: c.match?.code,
        matchPhone: c.match?.phone, matchEmail: c.match?.email,
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    if (user.role !== "Admin" && user.role !== "Gerente") {
      return NextResponse.json({ error: "Apenas administradores e gerentes podem mesclar registros." }, { status: 403 });
    }

    const supabase = getSupabaseAdmin();
    const { candidateId, action } = await req.json();

    const { data: candidate } = await supabase.from("dedupe_candidates").select("*").eq("id", candidateId).single();
    if (!candidate) return NextResponse.json({ error: "Candidato não encontrado." }, { status: 404 });

    const duplicateId = candidate.entity_id;
    const originalId = candidate.match_entity_id;

    if (action === "merge") {
      const [{ data: origLead }, { data: dupLead }, { data: firstLostStage }] = await Promise.all([
        supabase.from("leads").select("code").eq("id", originalId).single(),
        supabase.from("leads").select("code").eq("id", duplicateId).single(),
        supabase.from("funnel_stages").select("id").eq("is_lost", true).limit(1).single(),
      ]);

      await supabase.from("leads").update({
        dedupe_status: "merged", duplicate_of: originalId,
        stage_id: firstLostStage?.id ?? null,
      }).eq("id", duplicateId);

      await Promise.all([
        supabase.from("timeline_events").update({ lead_id: originalId }).eq("lead_id", duplicateId),
        supabase.from("conversations").update({ lead_id: originalId }).eq("lead_id", duplicateId),
        supabase.from("dedupe_candidates").update({ status: "merged" }).eq("id", candidateId),
      ]);

      await supabase.from("timeline_events").insert({
        lead_id: originalId, type: "system", actor_id: user.id,
        payload: { text: `Mesclado com o lead duplicado ${dupLead?.code ?? duplicateId}. Histórico unificado.` },
      });

      await supabase.from("audit_log").insert({
        tenant_id: user.tenant_id, actor_id: user.id, action: "lead.merged",
        entity_type: "leads", entity_id: originalId,
        details: `Lead ${dupLead?.code ?? duplicateId} mesclado com ${origLead?.code ?? originalId}.`,
      });
    } else {
      await Promise.all([
        supabase.from("dedupe_candidates").update({ status: "ignored" }).eq("id", candidateId),
        supabase.from("leads").update({ dedupe_status: "unique" }).eq("id", duplicateId),
      ]);

      await supabase.from("audit_log").insert({
        tenant_id: user.tenant_id, actor_id: user.id, action: "lead.dedupe_ignored",
        entity_type: "leads", entity_id: duplicateId,
        details: "Suspeita de duplicidade ignorada.",
      });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
