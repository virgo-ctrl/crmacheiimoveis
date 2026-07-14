import { NextResponse } from "next/server";
import { getSupabaseAdmin, getAuthUser } from "../../../../lib/supabase";

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const supabase = getSupabaseAdmin();
    const { data: teams } = await supabase.from("teams").select("*").eq("tenant_id", user.tenant_id);

    const teamsWithMembers = await Promise.all(
      (teams ?? []).map(async (team: any) => {
        const { data: members } = await supabase
          .from("team_members")
          .select("role_in_team, users(id, name, email)")
          .eq("team_id", team.id);
        return {
          ...team,
          members: (members ?? []).map((m: any) => ({ ...m.users, role_in_team: m.role_in_team })),
          membersCount: members?.length ?? 0,
        };
      })
    );

    return NextResponse.json({ teams: teamsWithMembers });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    if (user.role !== "Admin") return NextResponse.json({ error: "Permissão negada. Apenas Admin pode criar equipes." }, { status: 403 });

    const supabase = getSupabaseAdmin();
    const { name } = await req.json();
    if (!name?.trim()) return NextResponse.json({ error: "Nome da equipe é obrigatório." }, { status: 400 });

    const { data: team, error } = await supabase.from("teams").insert({ tenant_id: user.tenant_id, name: name.trim() }).select("id").single();
    if (error) throw new Error(error.message);

    await supabase.from("audit_log").insert({
      tenant_id: user.tenant_id, actor_id: user.id, action: "team.created",
      entity_type: "teams", entity_id: team!.id, details: `Equipe "${name}" criada com sucesso.`,
    });

    return NextResponse.json({ success: true, teamId: team!.id });
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
    const { id, name, managerId } = await req.json();
    if (!id || !name?.trim()) return NextResponse.json({ error: "ID e nome são obrigatórios." }, { status: 400 });

    const { data: team } = await supabase.from("teams").select("*").eq("id", id).eq("tenant_id", user.tenant_id).single();
    if (!team) return NextResponse.json({ error: "Equipe não encontrada." }, { status: 404 });

    await supabase.from("teams").update({ name: name.trim() }).eq("id", id);

    if (managerId !== undefined) {
      await supabase.from("team_members").update({ role_in_team: "member" }).eq("team_id", id);
      if (managerId) {
        const { data: inTeam } = await supabase.from("team_members").select("*").eq("team_id", id).eq("user_id", managerId).single();
        if (inTeam) {
          await supabase.from("team_members").update({ role_in_team: "manager" }).eq("team_id", id).eq("user_id", managerId);
        } else {
          await supabase.from("team_members").insert({ team_id: id, user_id: managerId, role_in_team: "manager" });
        }
      }
    }

    await supabase.from("audit_log").insert({
      tenant_id: user.tenant_id, actor_id: user.id, action: "team.updated",
      entity_type: "teams", entity_id: id,
      details: `Equipe "${team.name}" atualizada.`,
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
    if (user.role !== "Admin") return NextResponse.json({ error: "Apenas administradores podem excluir equipes." }, { status: 403 });

    const supabase = getSupabaseAdmin();
    const { id } = await req.json();

    const { data: team } = await supabase.from("teams").select("*").eq("id", id).eq("tenant_id", user.tenant_id).single();
    if (!team) return NextResponse.json({ error: "Equipe não encontrada." }, { status: 404 });

    await supabase.from("teams").delete().eq("id", id);

    await supabase.from("audit_log").insert({
      tenant_id: user.tenant_id, actor_id: user.id, action: "team.deleted",
      entity_type: "teams", entity_id: id, details: `Equipe "${team.name}" excluída.`,
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
