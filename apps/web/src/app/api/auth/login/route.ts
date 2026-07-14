import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "../../../../lib/supabase";

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();
    const supabase = getSupabaseAdmin();

    const { data: user } = await supabase
      .from("users")
      .select("*")
      .eq("email", email)
      .eq("password", password)
      .single();

    if (!user) {
      return NextResponse.json({ error: "E-mail ou senha incorretos." }, { status: 401 });
    }

    if (user.status !== "ativo") {
      return NextResponse.json({ error: "Sua conta está inativa." }, { status: 403 });
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
