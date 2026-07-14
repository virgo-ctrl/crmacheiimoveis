import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "../../../../../lib/db";
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

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    const user = await getAuthUser(db);
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    // Assert user has access to conversation via RLS
    const rls = getRlsFilter(user.role, user.id, "c.assigned_broker_id");
    const conv = db.prepare(`SELECT * FROM conversations c WHERE c.id = ? AND ${rls.sql}`).get(id, ...rls.params) as any;
    if (!conv) return NextResponse.json({ error: "Acesso negado." }, { status: 403 });

    // Fetch messages
    const messages = db.prepare(`
      SELECT * FROM messages 
      WHERE conversation_id = ? 
      ORDER BY occurred_at ASC
    `).all(id) as any[];

    // Mark unread count as 0
    db.prepare("UPDATE conversations SET unread_count = 0 WHERE id = ?").run(id);

    return NextResponse.json({ messages });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    const user = await getAuthUser(db);
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const rls = getRlsFilter(user.role, user.id, "c.assigned_broker_id");
    const conv = db.prepare(`SELECT * FROM conversations c WHERE c.id = ? AND ${rls.sql}`).get(id, ...rls.params) as any;
    if (!conv) return NextResponse.json({ error: "Acesso negado." }, { status: 403 });

    const { body, type, templateId, variables } = await req.json();

    let messageBody = body;
    let contentType = type || "text";

    // Enforce 24h WhatsApp rules
    const isWaExpired = conv.channel_id === "chan-1" && new Date(conv.wa_window_expires_at) < new Date();
    
    if (isWaExpired && contentType !== "template") {
      return NextResponse.json({ error: "Janela de 24h expirada. WhatsApp oficial exige envio de templates aprovados." }, { status: 400 });
    }

    if (contentType === "template" && templateId) {
      const template = db.prepare("SELECT * FROM message_templates WHERE id = ?").get(templateId) as any;
      if (!template) return NextResponse.json({ error: "Template não encontrado." }, { status: 404 });

      messageBody = template.body;
      const parsedVars = Array.isArray(variables) ? variables : [];
      parsedVars.forEach((val: string, index: number) => {
        messageBody = messageBody.replace(`{{${index + 1}}}`, val || "");
      });
    }

    const messageId = "msg-" + Math.random().toString(36).substr(2, 9);
    const occurredAt = new Date().toISOString();

    // Insert message
    db.prepare(`
      INSERT INTO messages (id, conversation_id, direction, external_id, sender, content_type, body, occurred_at, status)
      VALUES (?, ?, 'out', ?, ?, ?, ?, ?, 'sent')
    `).run(
      messageId,
      id,
      "ext-" + Math.random().toString(36).substr(2, 9),
      user.name,
      contentType,
      messageBody,
      occurredAt
    );

    // Update conversation last message & refresh 24h window
    db.prepare(`
      UPDATE conversations 
      SET last_message_at = ?,
          wa_window_expires_at = datetime('now', '+24 hours')
      WHERE id = ?
    `).run(occurredAt, id);

    // Save timeline event for lead
    if (conv.lead_id) {
      db.prepare(`
        INSERT INTO timeline_events (id, lead_id, type, actor_id, payload)
        VALUES (?, ?, 'message', ?, ?)
      `).run(
        "time-" + Math.random().toString(36).substr(2, 9),
        conv.lead_id,
        user.id,
        JSON.stringify({ body: messageBody, direction: "out" })
      );
    }

    // Write audit log
    db.prepare(`
      INSERT INTO audit_log (id, tenant_id, actor_id, action, entity_type, entity_id, details, ip)
      VALUES (?, ?, ?, 'conversation.reply', 'conversations', ?, ?, '127.0.0.1')
    `).run(
      "audit-" + Math.random().toString(36).substr(2, 9),
      user.tenant_id,
      user.id,
      id,
      `Mensagem de saída enviada para ${conv.identity}. Tipo: ${contentType}.`
    );

    return NextResponse.json({ success: true, messageId, body: messageBody });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
