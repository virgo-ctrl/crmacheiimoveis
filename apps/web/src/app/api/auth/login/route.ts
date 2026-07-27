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

    // Busca usuário pelo email
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id, tenant_id, name, email, status, password_hash")
      .eq("email", email)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: "E-mail ou senha incorretos." }, { status: 401 });
    }

    if (user.status !== "ativo") {
      return NextResponse.json({ error: "Sua conta está inativa." }, { status: 403 });
    }

    // Verifica senha com pgcrypto via rpc
    const { data: valid, error: cryptoError } = await supabase.rpc("verify_password", {
      plain: password,
      hashed: user.password_hash,
    });

    console.log("[v0] verify_password result:", { valid, cryptoError });
    if (cryptoError || !valid) {
      return NextResponse.json({ error: "E-mail ou senha incorretos." }, { status: 401 });
    }

    const cookieStore = await cookies();
    cookieStore.set("crm_session", user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    await supabase.from("audit_log").insert({
      tenant_id: user.tenant_id,
      actor_id: user.id,
      action: "user.login",
      entity_type: "users",
      entity_id: user.id,
      details: "Usuário efetuou login com sucesso.",
      ip: "127.0.0.1",
    });

    return NextResponse.json({ success: true, userId: user.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
