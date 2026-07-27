import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "../../../../lib/supabase";

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: "E-mail e senha são obrigatórios." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // RPC login_with_password: consulta users + user_roles, verifica bcrypt internamente
    const { data, error } = await supabase.rpc("login_with_password", {
      p_email: email,
      p_password: password,
    });

    if (error) {
      console.log("[v0] login rpc error:", error.message);
      return NextResponse.json({ error: "Erro interno. Tente novamente." }, { status: 500 });
    }

    const user = Array.isArray(data) ? data[0] : data;

    if (!user) {
      return NextResponse.json({ error: "E-mail ou senha incorretos." }, { status: 401 });
    }

    // Salva sessão em cookie httpOnly
    const cookieStore = await cookies();
    cookieStore.set("crm_session", user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    // Registra no audit_log (sem bloquear resposta em caso de falha)
    supabase.from("audit_log").insert({
      tenant_id: user.tenant_id,
      actor_id: user.id,
      action: "user.login",
      entity_type: "users",
      entity_id: user.id,
      details: "Usuário efetuou login com sucesso.",
      ip: "127.0.0.1",
    }).then();

    return NextResponse.json({
      success: true,
      userId: user.id,
      name: user.name,
      role: user.role_name,
    });
  } catch (err: any) {
    console.log("[v0] login error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
