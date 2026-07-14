import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "../../../../lib/db";

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();
    const db = getDb();
    
    // Find user by email
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as any;
    
    if (!user || user.password !== password) {
      return NextResponse.json({ error: "E-mail ou senha incorretos." }, { status: 401 });
    }

    if (user.status !== "ativo") {
      return NextResponse.json({ error: "Sua conta está inativa." }, { status: 403 });
    }

    // Set cookie session (plain user ID for local functional prototype simplicity)
    const cookieStore = await cookies();
    cookieStore.set("crm_session", user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 1 week
    });

    // Write audit log
    db.prepare(`
      INSERT INTO audit_log (id, tenant_id, actor_id, action, entity_type, entity_id, details, ip)
      VALUES (?, ?, ?, 'user.login', 'users', ?, 'Usuário efetuou login com sucesso.', '127.0.0.1')
    `).run(
      "audit-" + Math.random().toString(36).substr(2, 9),
      user.tenant_id,
      user.id,
      user.id
    );

    return NextResponse.json({ success: true, userId: user.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
