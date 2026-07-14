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

    const rls = getRlsFilter(user.role, user.id, "c.assigned_broker_id");

    const sql = `
      SELECT 
        c.*, 
        l.name as leadName, 
        l.email as leadEmail, 
        l.phone as leadPhone
      FROM conversations c
      LEFT JOIN leads l ON c.lead_id = l.id
      WHERE ${rls.sql}
      ORDER BY c.last_message_at DESC
    `;

    const conversations = db.prepare(sql).all(...rls.params) as any[];

    const mappedConvs = conversations.map(c => ({
      id: c.id,
      channel: c.channel_id ? "whatsapp" : c.channel_id || "whatsapp", // fallback standard channel type
      identity: c.leadPhone || c.identity,
      leadName: c.leadName,
      lastMessageAt: c.last_message_at,
      unreadCount: c.unread_count,
      waWindowExpiresAt: c.wa_window_expires_at,
    }));

    return NextResponse.json({ conversations: mappedConvs });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
