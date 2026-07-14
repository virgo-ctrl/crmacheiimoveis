import { NextResponse } from "next/server";
import { getSupabaseAdmin, getAuthUser } from "../../../lib/supabase";

const TABLE_MAP: Record<string, string> = {
  source: "lead_sources",
  campaign: "campaigns",
  loss: "loss_reasons",
  template: "message_templates",
  stage: "funnel_stages",
  script: "qualification_scripts",
  channel: "channels",
};

export async function GET(req: Request) {
  const supabase = getSupabaseAdmin();
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const [sources, campaigns, lossReasons, templates, stages, scripts, channels] = await Promise.all([
    supabase.from("lead_sources").select("*").eq("tenant_id", user.tenant_id),
    supabase.from("campaigns").select("*").eq("tenant_id", user.tenant_id),
    supabase.from("loss_reasons").select("*").eq("tenant_id", user.tenant_id),
    supabase.from("message_templates").select("*").eq("tenant_id", user.tenant_id),
    supabase.from("funnel_stages").select("*").eq("tenant_id", user.tenant_id).order("order"),
    supabase.from("qualification_scripts").select("*").eq("tenant_id", user.tenant_id).eq("active", true),
    supabase.from("channels").select("*").eq("tenant_id", user.tenant_id),
  ]);

  return NextResponse.json({
    sources: sources.data ?? [],
    campaigns: campaigns.data ?? [],
    lossReasons: lossReasons.data ?? [],
    templates: templates.data ?? [],
    stages: stages.data ?? [],
    scripts: scripts.data ?? [],
    channels: channels.data ?? [],
  });
}

export async function POST(req: Request) {
  const supabase = getSupabaseAdmin();
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (user.role !== "Admin") return NextResponse.json({ error: "Apenas administradores podem modificar configurações." }, { status: 403 });

  const body = await req.json();
  const { type, name, waBody, identity, channelType, credentialsRef } = body;
  const table = TABLE_MAP[type];
  if (!table) return NextResponse.json({ error: "Tipo de configuração inválido." }, { status: 400 });

  let payload: Record<string, unknown> = { tenant_id: user.tenant_id, name };

  if (type === "template") {
    payload = { ...payload, channel_type: "whatsapp", body: waBody, wa_approval_status: "APPROVED", active: true };
  } else if (type === "stage") {
    const { data: maxRow } = await supabase
      .from("funnel_stages")
      .select("order")
      .eq("tenant_id", user.tenant_id)
      .order("order", { ascending: false })
      .limit(1)
      .single();
    payload = { ...payload, order: ((maxRow as any)?.order ?? 0) + 1, is_won: false, is_lost: false };
  } else if (type === "script") {
    payload = { ...payload, body: waBody ?? "", active: true };
  } else if (type === "channel") {
    payload = { ...payload, type: channelType ?? "whatsapp", identity: identity ?? "", owner_user_id: user.id, status: "active", credentials_ref: credentialsRef ?? "sec-token" };
    // channel table has a "type" column, not a "name" column
    delete payload.name;
  }

  const { data: inserted, error } = await supabase.from(table).insert(payload).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("audit_log").insert({
    tenant_id: user.tenant_id,
    actor_id: user.id,
    action: "config.created",
    entity_type: "configs",
    entity_id: inserted.id,
    details: `Configuração adicionada: ${type} - ${name}.`,
    ip: "server",
  });

  return NextResponse.json(inserted, { status: 201 });
}

export async function PUT(req: Request) {
  const supabase = getSupabaseAdmin();
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (user.role !== "Admin") return NextResponse.json({ error: "Apenas administradores podem editar configurações." }, { status: 403 });

  const body = await req.json();
  const { type, id, name, isWon, isLost, identity, channelType, credentialsRef } = body;
  const table = TABLE_MAP[type];
  if (!table || !id) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (type === "stage") {
    if (isWon !== undefined) updates.is_won = isWon;
    if (isLost !== undefined) updates.is_lost = isLost;
  }
  if (type === "channel") {
    if (identity !== undefined) updates.identity = identity;
    if (channelType !== undefined) updates.type = channelType;
    if (credentialsRef !== undefined) updates.credentials_ref = credentialsRef;
  }

  const { error } = await supabase.from(table).update(updates).eq("id", id).eq("tenant_id", user.tenant_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("audit_log").insert({
    tenant_id: user.tenant_id,
    actor_id: user.id,
    action: "config.updated",
    entity_type: "configs",
    entity_id: id,
    details: `Configuração (${type}) atualizada.`,
    ip: "server",
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request) {
  const supabase = getSupabaseAdmin();
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (user.role !== "Admin") return NextResponse.json({ error: "Apenas administradores podem excluir configurações." }, { status: 403 });

  const body = await req.json();
  const { type, id } = body;
  const table = TABLE_MAP[type];
  if (!table || !id) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });

  if (type === "stage") {
    const { count } = await supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("stage_id", id);
    if ((count ?? 0) > 0) {
      return NextResponse.json({ error: `Não é possível excluir: existem ${count} leads nesta etapa. Mova-os antes.` }, { status: 409 });
    }
  }

  const { error } = await supabase.from(table).delete().eq("id", id).eq("tenant_id", user.tenant_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("audit_log").insert({
    tenant_id: user.tenant_id,
    actor_id: user.id,
    action: "config.deleted",
    entity_type: "configs",
    entity_id: id,
    details: `Configuração (${type}) excluída.`,
    ip: "server",
  });

  return NextResponse.json({ success: true });
}
