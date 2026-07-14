import { NextResponse } from "next/server";
import { getSupabaseAdmin, getAuthUser } from "../../../../lib/supabase";

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const supabase = getSupabaseAdmin();

    let query = supabase
      .from("shifts")
      .select("*, users!shifts_user_id_fkey(name), teams(name)")
      .eq("tenant_id", user.tenant_id);

    if (user.role === "Corretor") {
      query = query.eq("user_id", user.id);
    } else if (user.role === "Gerente") {
      const { data: myTeams } = await supabase.from("team_members").select("team_id").eq("user_id", user.id);
      const teamIds = myTeams?.map((t: any) => t.team_id) ?? [];
      query = query.in("team_id", teamIds);
    }

    const { data: shifts } = await query;

    return NextResponse.json({
      shifts: (shifts ?? []).map((s: any) => ({
        ...s,
        brokerName: s.users?.name,
        teamName: s.teams?.name,
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
    if (user.role !== "Admin" && user.role !== "Gerente") return NextResponse.json({ error: "Apenas administradores e gerentes podem criar plantões." }, { status: 403 });

    const supabase = getSupabaseAdmin();
    const { userId, teamId, location, startsAt, endsAt, recurrence } = await req.json();

    if (!userId || !startsAt || !endsAt) {
      return NextResponse.json({ error: "Usuário, data inicial e final são obrigatórios." }, { status: 400 });
    }

    const { data: shift, error } = await supabase.from("shifts").insert({
      tenant_id: user.tenant_id, team_id: teamId || null,
      user_id: userId, location: location || "Online",
      starts_at: startsAt, ends_at: endsAt, recurrence: recurrence || null,
    }).select("id").single();

    if (error) throw new Error(error.message);

    const { data: broker } = await supabase.from("users").select("name").eq("id", userId).single();

    await supabase.from("audit_log").insert({
      tenant_id: user.tenant_id, actor_id: user.id, action: "shift.created",
      entity_type: "shifts", entity_id: shift!.id,
      details: `Plantão agendado para "${broker?.name ?? userId}" em ${location || "Online"}.`,
    });

    return NextResponse.json({ success: true, shiftId: shift!.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    if (user.role !== "Admin" && user.role !== "Gerente") return NextResponse.json({ error: "Permissão negada." }, { status: 403 });

    const supabase = getSupabaseAdmin();
    const { id, userId, teamId, location, startsAt, endsAt, recurrence } = await req.json();

    const { data: shift } = await supabase.from("shifts").select("*").eq("id", id).eq("tenant_id", user.tenant_id).single();
    if (!shift) return NextResponse.json({ error: "Plantão não encontrado." }, { status: 404 });

    const updates: any = {};
    if (userId) updates.user_id = userId;
    if (teamId) updates.team_id = teamId;
    if (location) updates.location = location;
    if (startsAt) updates.starts_at = startsAt;
    if (endsAt) updates.ends_at = endsAt;
    if (recurrence) updates.recurrence = recurrence;

    await supabase.from("shifts").update(updates).eq("id", id);

    await supabase.from("audit_log").insert({
      tenant_id: user.tenant_id, actor_id: user.id, action: "shift.updated",
      entity_type: "shifts", entity_id: id, details: "Plantão atualizado pelo gestor.",
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    if (user.role !== "Admin" && user.role !== "Gerente") return NextResponse.json({ error: "Permissão negada." }, { status: 403 });

    const supabase = getSupabaseAdmin();
    const { id } = await req.json();

    const { data: shift } = await supabase.from("shifts").select("*").eq("id", id).eq("tenant_id", user.tenant_id).single();
    if (!shift) return NextResponse.json({ error: "Plantão não encontrado." }, { status: 404 });

    await supabase.from("shifts").delete().eq("id", id);

    await supabase.from("audit_log").insert({
      tenant_id: user.tenant_id, actor_id: user.id, action: "shift.deleted",
      entity_type: "shifts", entity_id: id, details: "Plantão excluído.",
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
