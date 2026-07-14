import { NextResponse } from "next/server";
import { getSupabaseAdmin, getAuthUser } from "../../../lib/supabase";

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const supabase = getSupabaseAdmin();

    // Resolve team member IDs for Gerente scope
    let brokerIds: string[] | null = null;
    if (user.role === "Corretor") {
      brokerIds = [user.id];
    } else if (user.role === "Gerente") {
      const { data: myTeams } = await supabase.from("team_members").select("team_id").eq("user_id", user.id);
      const teamIds = myTeams?.map((t: any) => t.team_id) ?? [];
      const { data: members } = await supabase.from("team_members").select("user_id").in("team_id", teamIds);
      brokerIds = members?.map((m: any) => m.user_id) ?? [user.id];
    }

    // 1. Funnel stages summary
    const { data: stages } = await supabase
      .from("funnel_stages")
      .select("id, name, is_won, order")
      .eq("tenant_id", user.tenant_id)
      .order("order");

    const stagePromises = (stages ?? []).map(async (stage: any) => {
      let leadsQuery = supabase
        .from("leads")
        .select("id, estimated_value")
        .eq("stage_id", stage.id);

      if (brokerIds) leadsQuery = leadsQuery.in("responsible_broker_id", brokerIds);

      const { data: stageLeads } = await leadsQuery;
      const count = stageLeads?.length ?? 0;
      const totalValue = stageLeads?.reduce((acc: number, l: any) => acc + (Number(l.estimated_value) || 0), 0) ?? 0;

      return { ...stage, count, totalValue };
    });

    const stageSummary = await Promise.all(stagePromises);

    // 2. Broker rankings
    const { data: brokers } = await supabase
      .from("users")
      .select("id, name")
      .eq("tenant_id", user.tenant_id);

    const wonStageIds = (stages ?? []).filter((s: any) => s.is_won).map((s: any) => s.id);

    const brokerPromises = (brokers ?? []).map(async (broker: any) => {
      let leadsQuery = supabase.from("leads").select("id, estimated_value, stage_id").eq("responsible_broker_id", broker.id);
      if (brokerIds) leadsQuery = leadsQuery.in("responsible_broker_id", brokerIds);

      const { data: bl } = await leadsQuery;
      const totalVgv = bl?.reduce((acc: number, l: any) => acc + (Number(l.estimated_value) || 0), 0) ?? 0;
      const wonVgv = bl?.filter((l: any) => wonStageIds.includes(l.stage_id)).reduce((acc: number, l: any) => acc + (Number(l.estimated_value) || 0), 0) ?? 0;

      return { brokerName: broker.name, leadsCount: bl?.length ?? 0, totalVgv, wonVgv };
    });

    const brokerRanking = (await Promise.all(brokerPromises)).sort((a, b) => b.wonVgv - a.wonVgv);

    // 3. Leads by source
    let sourceQuery = supabase.from("leads").select("tracking_source, estimated_value, stage_id");
    if (brokerIds) sourceQuery = sourceQuery.in("responsible_broker_id", brokerIds);
    const { data: sourceLeads } = await sourceQuery;

    const sourceMap: Record<string, { count: number; value: number; wonCount: number }> = {};
    (sourceLeads ?? []).forEach((l: any) => {
      const src = l.tracking_source || "Desconhecido";
      if (!sourceMap[src]) sourceMap[src] = { count: 0, value: 0, wonCount: 0 };
      sourceMap[src].count++;
      sourceMap[src].value += Number(l.estimated_value) || 0;
      if (wonStageIds.includes(l.stage_id)) sourceMap[src].wonCount++;
    });

    const sourceSummary = Object.entries(sourceMap).map(([source, data]) => ({ source, ...data }));

    // 4. Tasks
    let tasksQuery = supabase
      .from("tasks")
      .select("*, users!tasks_broker_id_fkey(name), leads(name, code)")
      .order("due_at");

    if (user.role === "Corretor") tasksQuery = tasksQuery.eq("broker_id", user.id);
    else if (brokerIds) tasksQuery = tasksQuery.in("broker_id", brokerIds);

    const { data: tasks } = await tasksQuery;

    const totalLeads = stageSummary.reduce((acc, s) => acc + s.count, 0);
    const totalValue = stageSummary.reduce((acc, s) => acc + s.totalValue, 0);
    const ticketMedio = totalLeads > 0 ? totalValue / totalLeads : 0;

    let forecast = 0;
    stageSummary.forEach((s) => {
      let rate = 0.15;
      if (s.name.includes("Novo")) rate = 0.1;
      else if (s.name.includes("Quali")) rate = 0.25;
      else if (s.name.includes("Apres") || s.name.includes("Visita")) rate = 0.5;
      else if (s.name.includes("Propo")) rate = 0.8;
      else if (s.is_won) rate = 1.0;
      forecast += s.totalValue * rate;
    });

    return NextResponse.json({
      stageSummary,
      brokerRanking,
      teamRanking: [],
      sourceSummary,
      timeSummary: [],
      tasks: (tasks ?? []).map((t: any) => ({
        ...t,
        brokerName: t.users?.name,
        leadName: t.leads?.name,
        leadCode: t.leads?.code,
      })),
      ticketMedio,
      totalVgv: totalValue,
      forecast,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
