import { NextResponse } from "next/server";
import { getDb } from "../../../../lib/db";
import { distributeLead } from "../../../../lib/distribution";

export async function POST(req: Request) {
  try {
    const { phone, name, body } = await req.json();

    if (!phone || !body) {
      return NextResponse.json({ error: "Telefone e corpo da mensagem são obrigatórios." }, { status: 400 });
    }

    const db = getDb();
    const cleanPhone = phone.trim();
    const cleanName = name ? name.trim() : "Cliente WhatsApp";

    // 1. Lead Resolver: Procura lead por telefone
    let lead = db.prepare("SELECT * FROM leads WHERE phone = ?").get(cleanPhone) as any;
    let leadId = lead?.id;
    let brokerId = lead?.responsible_broker_id;
    const isNewLead = !lead;

    if (isNewLead) {
      // Call the advanced distribution engine helper
      const distResult = distributeLead(db, "tenant-1");
      brokerId = distResult.brokerId;
      const ruleId = distResult.ruleId || "rule-1";
      const decisionReason = distResult.reason;

      // Get selected broker name for logs
      let brokerName = "Sem corretor (Fila Livre)";
      if (brokerId) {
        const brokerObj = db.prepare("SELECT name FROM users WHERE id = ?").get(brokerId) as any;
        if (brokerObj) brokerName = brokerObj.name;
      }

      const leadsCount = (db.prepare("SELECT count(*) as count FROM leads").get() as any).count;
      leadId = "lead-" + Math.random().toString(36).substr(2, 9);
      const leadCode = `LD-2026-${String(leadsCount + 1).padStart(4, "0")}`;

      db.prepare(`
        INSERT INTO leads (id, tenant_id, code, name, phone, entered_at, estimated_value, tracking_source, temperature, stage_id, responsible_broker_id, dedupe_status)
        VALUES (?, 'tenant-1', ?, ?, ?, datetime('now'), 0.0, 'WhatsApp Webhook', 'quente', 'stage-1', ?, 'unique')
      `).run(leadId, leadCode, cleanName, cleanPhone, brokerId);

      // Log distribution
      db.prepare(`
        INSERT INTO distribution_log (id, lead_id, rule_id, assigned_broker_id, decision_reason)
        VALUES (?, ?, ?, ?, ?)
      `).run("dist-" + Math.random().toString(36).substr(2, 9), leadId, ruleId, brokerId, decisionReason);

      // Audit Log
      db.prepare(`
        INSERT INTO audit_log (id, tenant_id, actor_id, action, entity_type, entity_id, details, ip)
        VALUES (?, 'tenant-1', 'admin-id', 'lead.created', 'leads', ?, ?, '127.0.0.1')
      `).run(
        "audit-" + Math.random().toString(36).substr(2, 9),
        leadId,
        `Lead ${leadCode} criado automaticamente via Lead Resolver (WhatsApp).`
      );
    }

    // 2. Procura ou cria conversa
    let conv = db.prepare("SELECT * FROM conversations WHERE identity = ?").get(cleanPhone) as any;
    let convId = conv?.id;

    if (!conv) {
      convId = "conv-" + Math.random().toString(36).substr(2, 9);
      db.prepare(`
        INSERT INTO conversations (id, tenant_id, lead_id, assigned_broker_id, status, unread_count, last_message_at, wa_window_expires_at)
        VALUES (?, 'tenant-1', ?, ?, 'open', 1, datetime('now'), datetime('now', '+24 hours'))
      `).run(convId, leadId, brokerId);
    } else {
      db.prepare(`
        UPDATE conversations 
        SET unread_count = unread_count + 1,
            last_message_at = datetime('now'),
            wa_window_expires_at = datetime('now', '+24 hours')
        WHERE id = ?
      `).run(convId);
    }

    // 3. Insere Mensagem
    db.prepare(`
      INSERT INTO messages (id, conversation_id, direction, external_id, sender, content_type, body, occurred_at, status)
      VALUES (?, ?, 'in', ?, ?, 'text', ?, datetime('now'), 'delivered')
    `).run(
      "msg-" + Math.random().toString(36).substr(2, 9),
      convId,
      "ext-" + Math.random().toString(36).substr(2, 9),
      cleanName,
      body
    );

    // 4. Insere timeline event
    db.prepare(`
      INSERT INTO timeline_events (id, lead_id, type, payload)
      VALUES (?, ?, 'message', ?)
    `).run(
      "time-" + Math.random().toString(36).substr(2, 9),
      leadId,
      JSON.stringify({ body, direction: "in" })
    );

    return NextResponse.json({ success: true, leadId, conversationId: convId });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
