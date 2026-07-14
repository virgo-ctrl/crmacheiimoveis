import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "../../../../lib/db";

async function getAuthUser(db: any) {
  const cookieStore = await cookies();
  const userId = cookieStore.get("crm_session")?.value;
  if (!userId) return null;
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as any;
  if (!user) return null;
  const roleObj = db.prepare(`
    SELECT r.name FROM roles r
    JOIN user_roles ur ON ur.role_id = r.id
    WHERE ur.user_id = ?
  `).get(userId) as any;
  return { ...user, role: roleObj ? roleObj.name : "Corretor" };
}

export async function GET() {
  try {
    const db = getDb();
    const user = await getAuthUser(db);
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const rules = db.prepare("SELECT * FROM distribution_rules WHERE tenant_id = ?").all(user.tenant_id) as any[];
    return NextResponse.json({ rules });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const db = getDb();
    const user = await getAuthUser(db);
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    if (user.role !== "Admin") return NextResponse.json({ error: "Apenas Admin." }, { status: 403 });

    const { name, type, criteria, priority } = await req.json();
    if (!name || !type) return NextResponse.json({ error: "Nome e Tipo são obrigatórios." }, { status: 400 });

    // Force only one active rule: deactivate others first
    db.prepare("UPDATE distribution_rules SET active = 0 WHERE tenant_id = ?").run(user.tenant_id);

    const id = "rule-" + Math.random().toString(36).substr(2, 9);
    db.prepare(`
      INSERT INTO distribution_rules (id, tenant_id, name, type, criteria, priority, active)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(id, user.tenant_id, name, type, criteria || "{}", Number(priority) || 1);

    return NextResponse.json({ success: true, ruleId: id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const db = getDb();
    const user = await getAuthUser(db);
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    if (user.role !== "Admin") return NextResponse.json({ error: "Apenas Admin." }, { status: 403 });

    const { id, name, type, criteria, priority, active } = await req.json();

    // Force only one active rule: deactivate others if active is set to 1
    if (active === 1) {
      db.prepare("UPDATE distribution_rules SET active = 0 WHERE tenant_id = ? AND id != ?").run(user.tenant_id, id);
    }

    db.prepare(`
      UPDATE distribution_rules
      SET name = COALESCE(?, name),
          type = COALESCE(?, type),
          criteria = COALESCE(?, criteria),
          priority = COALESCE(?, priority),
          active = COALESCE(?, active)
      WHERE id = ? AND tenant_id = ?
    `).run(name, type, criteria, priority, active, id, user.tenant_id);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const db = getDb();
    const user = await getAuthUser(db);
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    if (user.role !== "Admin") return NextResponse.json({ error: "Apenas Admin." }, { status: 403 });

    const { id } = await req.json();
    db.prepare("DELETE FROM distribution_rules WHERE id = ? AND tenant_id = ?").run(id, user.tenant_id);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
