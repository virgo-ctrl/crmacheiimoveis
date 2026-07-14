import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabase";
import { distributeLeadAsync } from "../../../../lib/distribution";

export async function POST(req: Request) {
  try {
    const { phone, name, body } = await req.json();

    if (!phone || !body) {
      return NextResponse.json({ error: "Telefone e corpo da mensagem são obrigatórios." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const cleanPhone = phone.trim();
    const cleanName = name ? name.trim() : "Cliente WhatsApp";

    // 1. Lead Resolver: procura lead por telefone
    const { data: existingLead } = await supabase
      .from("leads")
      .select("*")
      .eq("phone", cleanPhone)
      .maybeSingle();

    let leadId = existingLead?.id;
    let brokerId = existingLead?.responsible_broker_id;
    const isNewLead = !existingLead;

    if (isNewLead) {
      const distResult = await distributeLeadAsync(supabase, "tenant-1");
      brokerId = distResult.brokerId;
      const ruleId = distResult.ruleId;
      const decisionReason = distResult.reason;

      const { count: leadsCount } = await supabase
        .from("leads")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", "tenant-1");

      const leadCode = `LD-2026-${String((leadsCount ?? 0) + 1).padStart(4, "0")}`;

      const { data: newLead, error: leadErr } = await supabase
        .from("leads")
        .insert({
          tenant_id: "tenant-1",
          code: leadCode,
          name: cleanName,
          phone: cleanPhone,
          tracking_source: "WhatsApp Webhook",
          temperature: "quente",
          responsible_broker_id: brokerId,
          dedupe_status: "unique",
        })
        .select()
        .single();

      if (leadErr) return NextResponse.json({ error: leadErr.message }, { status: 500 });
      leadId = newLead.id;

      await Promise.all([
        supabase.from("distribution_log").insert({
          lead_id: leadId,
          rule_id: ruleId,
          assigned_broker_id: brokerId,
          decision_reason: decisionReason,
        }),
        supabase.from("audit_log").insert({
          tenant_id: "tenant-1",
          action: "lead.created",
          entity_type: "leads",
          entity_id: leadId,
          details: `Lead ${leadCode} criado automaticamente via Lead Resolver (WhatsApp).`,
          ip: "webhook",
        }),
      ]);
    }

    // 2. Canal WhatsApp
    const { data: channelObj } = await supabase
      .from("channels")
      .select("id")
      .eq("tenant_id", "tenant-1")
      .eq("type", "whatsapp")
      .limit(1)
      .maybeSingle();

    const channelId = channelObj?.id ?? null;

    // 3. Procura ou cria conversa
    const { data: existingConv } = await supabase
      .from("conversations")
      .select("id")
      .eq("lead_id", leadId)
      .eq("tenant_id", "tenant-1")
      .maybeSingle();

    let convId = existingConv?.id;

    if (!existingConv) {
      const waExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const { data: newConv, error: convErr } = await supabase
        .from("conversations")
        .insert({
          tenant_id: "tenant-1",
          lead_id: leadId,
          channel_id: channelId,
          assigned_broker_id: brokerId,
          status: "open",
          unread_count: 1,
          last_message_at: new Date().toISOString(),
          wa_window_expires_at: waExpires,
        })
        .select()
        .single();

      if (convErr) return NextResponse.json({ error: convErr.message }, { status: 500 });
      convId = newConv.id;
    } else {
      await supabase
        .from("conversations")
        .update({
          unread_count: (existingConv as any).unread_count + 1,
          last_message_at: new Date().toISOString(),
          wa_window_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        })
        .eq("id", convId);
    }

    // 4. Insere mensagem e timeline
    await Promise.all([
      supabase.from("messages").insert({
        conversation_id: convId,
        direction: "in",
        external_id: "ext-" + Math.random().toString(36).substr(2, 9),
        sender: cleanName,
        content_type: "text",
        body,
        status: "delivered",
      }),
      supabase.from("timeline_events").insert({
        lead_id: leadId,
        type: "message",
        payload: { body, direction: "in" },
      }),
    ]);

    return NextResponse.json({ success: true, leadId, conversationId: convId });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
