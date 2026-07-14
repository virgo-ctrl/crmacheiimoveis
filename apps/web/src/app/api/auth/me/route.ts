import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "../../../../lib/db";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get("crm_session")?.value;

    if (!userId) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const db = getDb();
    const user = db.prepare("SELECT id, tenant_id, name, email, phone, status, presence, push_token, push_validated_at, avatar_url FROM users WHERE id = ?").get(userId) as any;

    if (!user) {
      return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
    }

    // Get user role
    const roleObj = db.prepare(`
      SELECT r.name 
      FROM roles r
      JOIN user_roles ur ON ur.role_id = r.id
      WHERE ur.user_id = ?
    `).get(userId) as any;

    const role = roleObj ? roleObj.name : "Corretor";

    // Get user team_id
    const teamMemberObj = db.prepare("SELECT team_id FROM team_members WHERE user_id = ?").get(userId) as any;
    const team_id = teamMemberObj ? teamMemberObj.team_id : null;

    return NextResponse.json({ user: { ...user, role, team_id } });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get("crm_session")?.value;

    if (!userId) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const db = getDb();
    const { name, email, phone, avatarUrl, password } = await req.json();

    if (!name || !email) {
      return NextResponse.json({ error: "Nome e E-mail são obrigatórios." }, { status: 400 });
    }

    // Check unique email
    const existing = db.prepare("SELECT id FROM users WHERE email = ? AND id != ?").get(email, userId) as any;
    if (existing) {
      return NextResponse.json({ error: "Este e-mail já está sendo utilizado por outro usuário." }, { status: 409 });
    }

    if (password) {
      db.prepare(`
        UPDATE users 
        SET name = ?, email = ?, phone = ?, avatar_url = ?, password = ? 
        WHERE id = ?
      `).run(name, email, phone || "", avatarUrl || "", password, userId);
    } else {
      db.prepare(`
        UPDATE users 
        SET name = ?, email = ?, phone = ?, avatar_url = ? 
        WHERE id = ?
      `).run(name, email, phone || "", avatarUrl || "", userId);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
