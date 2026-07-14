import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "../../../../lib/supabase";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get("crm_session")?.value;
    if (!userId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const supabase = getSupabaseAdmin();

    const { data: user } = await supabase
      .from("users")
      .select("id, tenant_id, name, email, phone, status, presence, push_token, push_validated_at, avatar_url")
      .eq("id", userId)
      .single();

    if (!user) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });

    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("roles(name)")
      .eq("user_id", userId)
      .single();

    const role = (roleRow?.roles as any)?.name ?? "Corretor";

    const { data: teamMember } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("user_id", userId)
      .single();

    return NextResponse.json({ user: { ...user, role, team_id: teamMember?.team_id ?? null } });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get("crm_session")?.value;
    if (!userId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const supabase = getSupabaseAdmin();
    const { name, email, phone, avatarUrl, password } = await req.json();

    if (!name || !email) {
      return NextResponse.json({ error: "Nome e E-mail são obrigatórios." }, { status: 400 });
    }

    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .neq("id", userId)
      .single();

    if (existing) {
      return NextResponse.json({ error: "Este e-mail já está sendo utilizado por outro usuário." }, { status: 409 });
    }

    const updates: any = { name, email, phone: phone || "", avatar_url: avatarUrl || "" };
    if (password) updates.password = password;

    await supabase.from("users").update(updates).eq("id", userId);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
