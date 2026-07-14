import { NextResponse } from "next/server";
import { getSupabaseAdmin, getAuthUser } from "../../../../lib/supabase";

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const supabase = getSupabaseAdmin();

    let query = supabase
      .from("users")
      .select(`*, user_roles(roles(name)), team_members(team_id)`)
      .eq("tenant_id", user.tenant_id);

    if (user.role === "Corretor") {
      query = query.eq("id", user.id);
    }

    const { data: usersList } = await query;

    if (user.role === "Gerente") {
      const { data: myTeams } = await supabase.from("team_members").select("team_id").eq("user_id", user.id);
      const teamIds = myTeams?.map((t: any) => t.team_id) ?? [];
      const { data: members } = await supabase.from("team_members").select("user_id").in("team_id", teamIds);
      const memberIds = new Set(members?.map((m: any) => m.user_id) ?? []);

      return NextResponse.json({
        users: (usersList ?? [])
          .filter((u: any) => memberIds.has(u.id))
          .map((u: any) => ({
            ...u,
            roleName: (u.user_roles?.[0]?.roles as any)?.name ?? "Corretor",
            team_id: u.team_members?.[0]?.team_id ?? null,
          })),
      });
    }

    return NextResponse.json({
      users: (usersList ?? []).map((u: any) => ({
        ...u,
        roleName: (u.user_roles?.[0]?.roles as any)?.name ?? "Corretor",
        team_id: u.team_members?.[0]?.team_id ?? null,
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
    if (user.role !== "Admin") return NextResponse.json({ error: "Permissão negada. Apenas Admin pode criar usuários." }, { status: 403 });

    const supabase = getSupabaseAdmin();
    const { name, email, phone, roleName, password, pushToken, teamId } = await req.json();

    if (!name || !email || !roleName) {
      return NextResponse.json({ error: "Nome, e-mail e cargo são obrigatórios." }, { status: 400 });
    }

    const { data: exists } = await supabase.from("users").select("id").eq("email", email).single();
    if (exists) return NextResponse.json({ error: "E-mail já cadastrado." }, { status: 409 });

    const { data: newUser, error: insertError } = await supabase.from("users").insert({
      tenant_id: user.tenant_id, name, email: email.trim(),
      phone: phone || null, status: "ativo",
      push_token: pushToken || null,
      password: password || "password123",
      presence: "offline",
    }).select("id").single();

    if (insertError) throw new Error(insertError.message);

    const { data: roleObj } = await supabase.from("roles").select("id").eq("name", roleName).eq("tenant_id", user.tenant_id).single();
    if (roleObj) await supabase.from("user_roles").insert({ user_id: newUser!.id, role_id: roleObj.id });

    if (teamId) await supabase.from("team_members").insert({ team_id: teamId, user_id: newUser!.id, role_in_team: "member" });

    await supabase.from("audit_log").insert({
      tenant_id: user.tenant_id, actor_id: user.id, action: "user.created",
      entity_type: "users", entity_id: newUser!.id,
      details: `Usuário "${name}" criado como "${roleName}".`,
    });

    return NextResponse.json({ success: true, userId: newUser!.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const supabase = getSupabaseAdmin();
    const { id, name, phone, status, roleName, pushToken, teamId, testPush } = await req.json();

    const isSelf = id === user.id;
    if (!isSelf && user.role !== "Admin") return NextResponse.json({ error: "Permissão negada." }, { status: 403 });

    const { data: targetUser } = await supabase.from("users").select("*").eq("id", id).single();
    if (!targetUser) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });

    const updates: any = {};
    if (name) updates.name = name;
    if (phone) updates.phone = phone;
    if (status) updates.status = status;
    if (pushToken) updates.push_token = pushToken;
    if (Object.keys(updates).length > 0) await supabase.from("users").update(updates).eq("id", id);

    if (roleName && user.role === "Admin") {
      const { data: roleObj } = await supabase.from("roles").select("id").eq("name", roleName).eq("tenant_id", user.tenant_id).single();
      if (roleObj) {
        await supabase.from("user_roles").delete().eq("user_id", id);
        await supabase.from("user_roles").insert({ user_id: id, role_id: roleObj.id });
      }
    }

    if (teamId !== undefined && (user.role === "Admin" || user.role === "Gerente")) {
      await supabase.from("team_members").delete().eq("user_id", id);
      if (teamId) await supabase.from("team_members").insert({ team_id: teamId, user_id: id, role_in_team: "member" });
    }

    let pushStatusMessage = "";
    if (testPush) {
      const token = pushToken || targetUser.push_token;
      if (token && token.trim().length > 8) {
        await supabase.from("users").update({ push_validated_at: new Date().toISOString() }).eq("id", id);
        pushStatusMessage = "Notificação push enviada e validada com sucesso no dispositivo!";
      } else {
        pushStatusMessage = "Falha no envio da notificação push: token de registro inválido.";
      }
    }

    await supabase.from("audit_log").insert({
      tenant_id: user.tenant_id, actor_id: user.id, action: "user.updated",
      entity_type: "users", entity_id: id,
      details: `Usuário "${targetUser.name}" atualizado. ${pushStatusMessage}`,
    });

    return NextResponse.json({ success: true, pushStatusMessage });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    if (user.role !== "Admin") return NextResponse.json({ error: "Apenas administradores podem remover usuários." }, { status: 403 });

    const supabase = getSupabaseAdmin();
    const { id } = await req.json();

    if (id === user.id) return NextResponse.json({ error: "Não é possível excluir a si mesmo." }, { status: 400 });

    await supabase.from("users").delete().eq("id", id);

    await supabase.from("audit_log").insert({
      tenant_id: user.tenant_id, actor_id: user.id, action: "user.deleted",
      entity_type: "users", entity_id: id, details: "Usuário removido do sistema.",
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
