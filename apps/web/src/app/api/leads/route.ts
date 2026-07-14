import { NextResponse } from "next/server";
import { getSupabaseAdmin, getAuthUser } from "../../../lib/supabase";
import { validatePhoneE164, sanitizeName } from "@crm/validation";
import { distributeLeadAsync } from "../../../lib/distribution";

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const supabase = getSupabaseAdmin();

    let query = supabase
      .from("leads")
      .select(`
        *,
        users!leads_responsible_broker_id_fkey(name),
        funnel_stages(name)
      `)
      .order("created_at", { ascending: false });

    if (user.role === "Corretor") {
      query = query.eq("responsible_broker_id", user.id);
    } else if (user.role === "Gerente") {
      const { data: teamMembers } = await supabase
        .from("team_members")
        .select("user_id")
        .in(
          "team_id",
          (await supabase.from("team_members").select("team_id").eq("user_id", user.id)).data?.map((r: any) => r.team_id) ?? []
        );
      const memberIds = teamMembers?.map((m: any) => m.user_id) ?? [user.id];
      query = query.in("responsible_broker_id", memberIds);
    }

    const { data: leads } = await query;

    const mappedLeads = (leads ?? []).map((l: any) => ({
      id: l.id,
      code: l.code,
      name: l.name,
      phone: l.phone,
      email: l.email,
      estimatedValue: l.estimated_value,
      temperature: l.temperature,
      stageId: l.stage_id,
      stageName: l.funnel_stages?.name ?? null,
      brokerId: l.responsible_broker_id,
      brokerName: l.users?.name ?? null,
      source: l.tracking_source,
      interest: "Vila Mariana Luxury",
      nextTask: l.next_task_id_fk ? "Tarefa Agendada" : null,
      dedupeStatus: l.dedupe_status,
      notes: l.notes,
      created_at: l.created_at,
    }));

    const { data: grabLeadsRaw } = await supabase
      .from("leads")
      .select("*, funnel_stages(name)")
      .is("responsible_broker_id", null);

    const mappedGrab = (grabLeadsRaw ?? []).map((l: any) => ({
      id: l.id,
      code: l.code,
      name: l.name,
      phone: l.phone,
      email: l.email,
      estimatedValue: l.estimated_value,
      temperature: l.temperature,
      stageId: l.stage_id,
      stageName: l.funnel_stages?.name ?? null,
      source: l.tracking_source,
      interest: l.notes || "Geral",
      created_at: l.created_at,
    }));

    return NextResponse.json({ leads: mappedLeads, grabLeads: mappedGrab });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const supabase = getSupabaseAdmin();
    const { name, phone, email, estimatedValue, source, interest, notes, force } = await req.json();

    const cleanName = sanitizeName(name);
    const cleanPhone = phone ? phone.trim() : "";
    const cleanEmail = email ? email.trim() : "";

    if (!cleanName || !cleanPhone) {
      return NextResponse.json({ error: "Nome e telefone são obrigatórios." }, { status: 400 });
    }

    if (!validatePhoneE164(cleanPhone)) {
      return NextResponse.json({ error: "Telefone inválido. Deve obedecer o formato E.164 (Ex: +5511987654321)." }, { status: 400 });
    }

    // D3 Deduplication check
    const { data: duplicates } = await supabase
      .from("leads")
      .select("code, name, responsible_broker_id")
      .or(`phone.eq.${cleanPhone}${cleanEmail ? `,email.ilike.${cleanEmail}` : ""}`);

    if ((duplicates?.length ?? 0) > 0 && !force) {
      return NextResponse.json({
        duplicateDetected: true,
        matches: duplicates?.map((d: any) => ({ code: d.code, name: d.name, brokerId: d.responsible_broker_id })),
      }, { status: 409 });
    }

    // Distribution
    const distResult = await distributeLeadAsync(supabase, user.tenant_id);
    const assignedBrokerId = distResult.brokerId;
    const ruleId = distResult.ruleId ?? null;
    const decisionReason = distResult.reason;

    let brokerName = "Sem corretor (Fila Livre)";
    if (assignedBrokerId) {
      const { data: broker } = await supabase.from("users").select("name").eq("id", assignedBrokerId).single();
      if (broker) brokerName = broker.name;
    }

    const { count } = await supabase.from("leads").select("id", { count: "exact", head: true });
    const leadCode = `LD-2026-${String((count ?? 0) + 1).padStart(4, "0")}`;

    // Get first funnel stage
    const { data: firstStage } = await supabase
      .from("funnel_stages")
      .select("id")
      .eq("tenant_id", user.tenant_id)
      .order("order", { ascending: true })
      .limit(1)
      .single();

    const { data: newLead, error: insertError } = await supabase.from("leads").insert({
      tenant_id: user.tenant_id,
      code: leadCode,
      name: cleanName,
      phone: cleanPhone,
      email: cleanEmail || null,
      entered_at: new Date().toISOString(),
      estimated_value: Number(estimatedValue) || 0,
      tracking_source: source || "Site Formulário",
      temperature: "morno",
      stage_id: firstStage?.id ?? null,
      responsible_broker_id: assignedBrokerId ?? null,
      notes: notes || "",
      dedupe_status: (duplicates?.length ?? 0) > 0 ? "suspect" : "unique",
    }).select("id").single();

    if (insertError) throw new Error(insertError.message);

    const leadId = newLead!.id;

    // Distribution log
    await supabase.from("distribution_log").insert({
      lead_id: leadId,
      rule_id: ruleId,
      assigned_broker_id: assignedBrokerId ?? null,
      decision_reason: decisionReason,
    });

    // Conversation
    const { data: newConv } = await supabase.from("conversations").insert({
      tenant_id: user.tenant_id,
      lead_id: leadId,
      assigned_broker_id: assignedBrokerId ?? null,
      status: "open",
      unread_count: 0,
      last_message_at: new Date().toISOString(),
      wa_window_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }).select("id").single();

    // Message
    if (newConv) {
      await supabase.from("messages").insert({
        conversation_id: newConv.id,
        direction: "in",
        external_id: `ext-${Math.random().toString(36).substr(2, 9)}`,
        sender: cleanName,
        content_type: "text",
        body: `Novo lead integrado com sucesso. Empreendimento: ${interest || "Vila Mariana Luxury"}. Notas: ${notes || ""}`,
        status: "read",
      });
    }

    // Audit log
    await supabase.from("audit_log").insert({
      tenant_id: user.tenant_id,
      actor_id: user.id,
      action: "lead.created",
      entity_type: "leads",
      entity_id: leadId,
      details: `Lead ${leadCode} criado e distribuído. Razão: ${decisionReason}. Corretor: ${brokerName}.`,
      ip: "127.0.0.1",
    });

    return NextResponse.json({ success: true, leadId, code: leadCode });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
