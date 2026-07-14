import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "../../../lib/db";
import { getRlsFilter } from "@crm/auth";

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

    const rls = getRlsFilter(user.role, user.id, "a.actor_id");

    const sql = `
      SELECT a.*, u.name as actorName
      FROM audit_log a
      LEFT JOIN users u ON a.actor_id = u.id
      WHERE ${rls.sql}
      ORDER BY a.occurred_at DESC
    `;

    const logs = db.prepare(sql).all(...rls.params) as any[];

    const mappedLogs = logs.map(l => ({
      id: l.id,
      actor: l.actorName || "Sistema",
      action: l.action,
      entityType: l.entity_type,
      entityCode: l.entity_id || "SYS",
      details: l.details || "Ação executada no sistema.",
      occurredAt: l.occurred_at,
      ip: l.ip || "127.0.0.1"
    }));

    return NextResponse.json({ logs: mappedLogs });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
