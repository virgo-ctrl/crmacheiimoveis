import { NextResponse } from "next/server";
import { getSupabaseAdmin, getAuthUser } from "../../../../lib/supabase";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const supabase = getSupabaseAdmin();

    let query = supabase
      .from("leads")
      .select("*, users!leads_responsible_broker_id_fkey(name), loss_reasons(name)")
      .eq("id", id);

    if (user.role === "Corretor") query = query.eq("responsible_broker_id", user.id);

    const { data: lead } = await query.single();
    if (!lead) return NextResponse.json({ error: "Lead não encontrado ou acesso negado." }, { status: 404 });

    const { data: timeline } = await supabase
      .from("timeline_events")
      .select("*")
      .eq("lead_id", id)
      .order("occurred_at", { ascending: false });

    const { data: transfers } = await supabase
      .from("lead_transfers")
      .select("*, from:from_broker_id(name), to:to_broker_id(name)")
      .eq("lead_id", id)
      .order("created_at", { ascending: false });

    const { data: tagsList } = await supabase
      .from("lead_tags")
      .select("tag")
      .eq("lead_id", id);

    const { data: interestsList } = await supabase
      .from("lead_interests")
      .select("development_id, developments(name)")
      .eq("lead_id", id);

    await supabase.from("audit_log").insert({
      tenant_id: user.tenant_id,
      actor_id: user.id,
      action: "lead.viewed",
      entity_type: "leads",
      entity_id: id,
      details: `Visualizou a gaveta de detalhes do lead ${lead.code}.`,
      ip: "127.0.0.1",
    });

    return NextResponse.json({
      lead,
      timeline: timeline ?? [],
      transfers: (transfers ?? []).map((t: any) => ({
        ...t,
        fromBroker: t.from?.name,
        toBroker: t.to?.name,
      })),
      tags: (tagsList ?? []).map((t: any) => t.tag),
      interests: (interestsList ?? []).map((i: any) => ({
        development_id: i.development_id,
        developmentName: i.developments?.name,
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const supabase = getSupabaseAdmin();
    const body = await req.json();
    const { stageId, nextTask, brokerId, reason, notes, temperature, estimatedValue, lossReasonId, tags, interestIds } = body;

    const { data: lead } = await supabase.from("leads").select("*").eq("id", id).single();
    if (!lead) return NextResponse.json({ error: "Lead não encontrado." }, { status: 404 });

    // Stage change
    if (stageId && stageId !== lead.stage_id) {
      const [{ data: oldStage }, { data: newStage }] = await Promise.all([
        supabase.from("funnel_stages").select("name").eq("id", lead.stage_id).single(),
        supabase.from("funnel_stages").select("name").eq("id", stageId).single(),
      ]);

      await supabase.from("leads").update({ stage_id: stageId, loss_reason_id: lossReasonId ?? null }).eq("id", id);

      await supabase.from("timeline_events").insert({
        lead_id: id, type: "stage_change", actor_id: user.id,
        payload: { from: oldStage?.name, to: newStage?.name },
      });

      await supabase.from("audit_log").insert({
        tenant_id: user.tenant_id, actor_id: user.id, action: "lead.stage_changed",
        entity_type: "leads", entity_id: id,
        before: { stage_id: lead.stage_id }, after: { stage_id: stageId }, ip: "127.0.0.1",
      });
    } else if (lossReasonId !== undefined && lossReasonId !== lead.loss_reason_id) {
      await supabase.from("leads").update({ loss_reason_id: lossReasonId }).eq("id", id);
    }

    // Schedule task
    if (nextTask !== undefined) {
      const { data: newTask } = await supabase.from("tasks").insert({
        tenant_id: user.tenant_id, lead_id: id,
        broker_id: lead.responsible_broker_id,
        type: "follow-up", title: nextTask,
        due_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        status: "pending",
      }).select("id").single();

      if (newTask) {
        await supabase.from("leads").update({ next_task_id_fk: newTask.id }).eq("id", id);
      }

      await supabase.from("timeline_events").insert({
        lead_id: id, type: "task", actor_id: user.id, payload: { title: nextTask },
      });
    }

    // Transfer broker
    if (brokerId && brokerId !== lead.responsible_broker_id) {
      const { data: targetBroker } = await supabase.from("users").select("name").eq("id", brokerId).single();
      if (!targetBroker) return NextResponse.json({ error: "Corretor destino inválido." }, { status: 400 });

      const { data: fromBroker } = lead.responsible_broker_id
        ? await supabase.from("users").select("name").eq("id", lead.responsible_broker_id).single()
        : { data: null };

      await supabase.from("leads").update({ responsible_broker_id: brokerId }).eq("id", id);

      await supabase.from("lead_transfers").insert({
        lead_id: id, from_broker_id: lead.responsible_broker_id,
        to_broker_id: brokerId, reason: reason || "Transferência manual", by_user_id: user.id,
      });

      await supabase.from("timeline_events").insert({
        lead_id: id, type: "transfer", actor_id: user.id,
        payload: { from: fromBroker?.name ?? "Fila", to: targetBroker.name, reason },
      });

      await supabase.from("conversations").update({ assigned_broker_id: brokerId }).eq("lead_id", id);

      await supabase.from("audit_log").insert({
        tenant_id: user.tenant_id, actor_id: user.id, action: "lead.transferred",
        entity_type: "leads", entity_id: id,
        details: `Lead transferido de ${fromBroker?.name ?? "Fila"} para ${targetBroker.name}. Motivo: ${reason}`,
        ip: "127.0.0.1",
      });
    }

    // Edit notes/temp/value
    const updates: any = {};
    if (notes !== undefined) updates.notes = notes;
    if (temperature !== undefined) updates.temperature = temperature;
    if (estimatedValue !== undefined) updates.estimated_value = estimatedValue;
    if (Object.keys(updates).length > 0) {
      await supabase.from("leads").update(updates).eq("id", id);
    }

    // Tags
    if (tags !== undefined && Array.isArray(tags)) {
      await supabase.from("lead_tags").delete().eq("lead_id", id);
      const tagRows = tags.filter((t: string) => t.trim()).map((t: string) => ({ lead_id: id, tag: t.trim() }));
      if (tagRows.length > 0) await supabase.from("lead_tags").insert(tagRows);
    }

    // Interests
    if (interestIds !== undefined && Array.isArray(interestIds)) {
      await supabase.from("lead_interests").delete().eq("lead_id", id);
      const interestRows = interestIds.filter((d: string) => d.trim()).map((d: string) => ({ lead_id: id, development_id: d, priority: 1 }));
      if (interestRows.length > 0) await supabase.from("lead_interests").insert(interestRows);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
