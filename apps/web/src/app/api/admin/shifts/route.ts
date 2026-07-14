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
    SELECT r.name 
    FROM roles r
    JOIN user_roles ur ON ur.role_id = r.id
    WHERE ur.user_id = ?
  `).get(userId) as any;

  return {
    ...user,
    role: roleObj ? roleObj.name : "Corretor",
  };
}

export async function GET() {
  try {
    const db = getDb();
    const user = await getAuthUser(db);
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    let sql = `
      SELECT s.*, u.name as brokerName, t.name as teamName
      FROM shifts s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN teams t ON s.team_id = t.id
      WHERE s.tenant_id = ?
    `;
    const params = [user.tenant_id];

    if (user.role === "Gerente") {
      sql += ` AND s.team_id IN (SELECT team_id FROM team_members WHERE user_id = ?)`;
      params.push(user.id);
    } else if (user.role === "Corretor") {
      sql += ` AND s.user_id = ?`;
      params.push(user.id);
    }

    const shifts = db.prepare(sql).all(...params) as any[];

    return NextResponse.json({ shifts });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const db = getDb();
    const user = await getAuthUser(db);
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    if (user.role !== "Admin" && user.role !== "Gerente") {
      return NextResponse.json({ error: "Apenas administradores e gerentes podem criar plantões." }, { status: 403 });
    }

    const { userId, teamId, location, startsAt, endsAt, recurrence } = await req.json();

    if (!userId || !startsAt || !endsAt) {
      return NextResponse.json({ error: "Usuário, data inicial e final são obrigatórios." }, { status: 400 });
    }

    const shiftId = "shift-" + Math.random().toString(36).substr(2, 9);
    
    db.prepare(`
      INSERT INTO shifts (id, tenant_id, team_id, user_id, location, starts_at, ends_at, recurrence)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(shiftId, user.tenant_id, teamId || null, userId, location || "Online", startsAt, endsAt, recurrence || null);

    const broker = db.prepare("SELECT name FROM users WHERE id = ?").get(userId) as any;

    db.prepare(`
      INSERT INTO audit_log (id, tenant_id, actor_id, action, entity_type, entity_id, details)
      VALUES (?, ?, ?, 'shift.created', 'shifts', ?, ?)
    `).run(
      "audit-" + Math.random().toString(36).substr(2, 9),
      user.tenant_id,
      user.id,
      shiftId,
      `Plantão agendado para o corretor "${broker?.name || userId}" em ${location || "Online"}.`
    );

    return NextResponse.json({ success: true, shiftId });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const db = getDb();
    const user = await getAuthUser(db);
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    if (user.role !== "Admin" && user.role !== "Gerente") {
      return NextResponse.json({ error: "Permissão negada." }, { status: 403 });
    }

    const { id, userId, teamId, location, startsAt, endsAt, recurrence } = await req.json();

    const shift = db.prepare("SELECT * FROM shifts WHERE id = ? AND tenant_id = ?").get(id, user.tenant_id) as any;
    if (!shift) return NextResponse.json({ error: "Plantão não encontrado." }, { status: 404 });

    db.prepare(`
      UPDATE shifts
      SET user_id = COALESCE(?, user_id),
          team_id = COALESCE(?, team_id),
          location = COALESCE(?, location),
          starts_at = COALESCE(?, starts_at),
          ends_at = COALESCE(?, ends_at),
          recurrence = COALESCE(?, recurrence)
      WHERE id = ?
    `).run(userId, teamId, location, startsAt, endsAt, recurrence, id);

    db.prepare(`
      INSERT INTO audit_log (id, tenant_id, actor_id, action, entity_type, entity_id, details)
      VALUES (?, ?, ?, 'shift.updated', 'shifts', ?, 'Plantão atualizado pelo gestor.')
    `).run("audit-" + Math.random().toString(36).substr(2, 9), user.tenant_id, user.id, id);

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
    if (user.role !== "Admin" && user.role !== "Gerente") {
      return NextResponse.json({ error: "Permissão negada." }, { status: 403 });
    }

    const { id } = await req.json();

    const shift = db.prepare("SELECT * FROM shifts WHERE id = ? AND tenant_id = ?").get(id, user.tenant_id) as any;
    if (!shift) return NextResponse.json({ error: "Plantão não encontrado." }, { status: 404 });

    db.prepare("DELETE FROM shifts WHERE id = ?").run(id);

    db.prepare(`
      INSERT INTO audit_log (id, tenant_id, actor_id, action, entity_type, entity_id, details)
      VALUES (?, ?, ?, 'shift.deleted', 'shifts', ?, 'Plantão excluído.')
    `).run("audit-" + Math.random().toString(36).substr(2, 9), user.tenant_id, user.id, id);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
