import { NextResponse } from "next/server";
import { getDb } from "../../../../lib/db";
import { distributeLead } from "../../../../lib/distribution";
import { validatePhoneE164, sanitizeName } from "@crm/validation";

export async function POST(req: Request) {
  try {
    const { channel, phone, name, email, body, interest, externalId } = await req.json();

    if (!channel || !body) {
      return NextResponse.json({ error: "Canal e corpo da mensagem são obrigatórios." }, { status: 400 });
    }

    const db = getDb();
    const cleanPhone = phone ? phone.trim() : "+5511999990000";
    const cleanName = sanitizeName(name || "Cliente Simulação");
    const cleanEmail = email ? email.trim() : "";

    // 1. Lead Resolver (D3/D4)
    let lead = null;
    if (phone) {
      lead = db.prepare("SELECT * FROM leads WHERE phone = ?").get(cleanPhone) as any;
    }
    if (!lead && cleanEmail) {
      lead = db.prepare("SELECT * FROM leads WHERE email = ?").get(cleanEmail) as any;
    }

    let leadId = lead?.id;
    let brokerId = lead?.responsible_broker_id;
    const isNewLead = !lead;

    if (isNewLead) {
      // Validate phone format (D3)
      if (phone && !validatePhoneE164(cleanPhone)) {
        return NextResponse.json({ error: "Simulação abortada: Telefone inválido no formato E.164." }, { status: 400 });
      }

      // Check fuzzy duplicate matching
      const dup = db.prepare("SELECT * FROM leads WHERE phone = ?").get(cleanPhone) as any;
      if (dup) {
        return NextResponse.json({ error: "Simulação abortada: Lead duplicado detectado." }, { status: 409 });
      }

      // Call advanced routing engine
      const distResult = distributeLead(db, "tenant-1");
      brokerId = distResult.brokerId;
      const ruleId = distResult.ruleId || "rule-1";
      const decisionReason = distResult.reason;

      const leadsCount = (db.prepare("SELECT count(*) as count FROM leads").get() as any).count;
      leadId = "lead-" + Math.random().toString(36).substr(2, 9);
      const leadCode = `LD-2026-${String(leadsCount + 1).padStart(4, "0")}`;

      // Insert Lead
      db.prepare(`
        INSERT INTO leads (id, tenant_id, code, name, phone, email, entered_at, estimated_value, tracking_source, temperature, stage_id, responsible_broker_id, dedupe_status)
        VALUES (?, 'tenant-1', ?, ?, ?, ?, datetime('now'), 0.0, ?, 'morno', 'stage-1', ?, 'unique')
      `).run(leadId, leadCode, cleanName, cleanPhone, cleanEmail, channel.toUpperCase(), brokerId);

      // Log distribution (D5)
      db.prepare(`
        INSERT INTO distribution_log (id, lead_id, rule_id, assigned_broker_id, decision_reason)
        VALUES (?, ?, ?, ?, ?)
      `).run("dist-" + Math.random().toString(36).substr(2, 9), leadId, ruleId, brokerId, decisionReason);

      // Audit Log (D5)
      db.prepare(`
        INSERT INTO audit_log (id, tenant_id, actor_id, action, entity_type, entity_id, details)
        VALUES (?, 'tenant-1', 'admin-id', 'lead.created', 'leads', ?, ?)
      `).run(
        "audit-" + Math.random().toString(36).substr(2, 9),
        leadId,
        `Lead ${leadCode} autocriado via webhook simulator (${channel}).`
      );
    }

    // 2. Fetch or create Channel
    let channelObj = db.prepare("SELECT * FROM channels WHERE type = ?").get(channel) as any;
    if (!channelObj) {
      const channelId = "chan-" + Math.random().toString(36).substr(2, 9);
      db.prepare(`
        INSERT INTO channels (id, tenant_id, type, identity, status)
        VALUES (?, 'tenant-1', ?, ?, 'active')
      `).run(channelId, channel, `@sim_${channel}`);
      channelObj = { id: channelId };
    }

    // 3. Procura ou cria conversa
    let conv = db.prepare("SELECT * FROM conversations WHERE lead_id = ? AND channel_id = ?").get(leadId, channelObj.id) as any;
    let convId = conv?.id;

    if (!conv) {
      convId = "conv-" + Math.random().toString(36).substr(2, 9);
      db.prepare(`
        INSERT INTO conversations (id, tenant_id, lead_id, channel_id, assigned_broker_id, status, unread_count, last_message_at, wa_window_expires_at)
        VALUES (?, 'tenant-1', ?, ?, ?, 'open', 1, datetime('now'), datetime('now', '+24 hours'))
      `).run(convId, leadId, channelObj.id, brokerId);
    } else {
      db.prepare(`
        UPDATE conversations 
        SET unread_count = unread_count + 1,
            last_message_at = datetime('now'),
            wa_window_expires_at = datetime('now', '+24 hours')
        WHERE id = ?
      `).run(convId);
    }

    // 4. Insere Mensagem
    const messageId = "msg-" + Math.random().toString(36).substr(2, 9);
    const extId = externalId || "ext-" + Math.random().toString(36).substr(2, 9);

    db.prepare(`
      INSERT INTO messages (id, conversation_id, direction, external_id, sender, content_type, body, occurred_at, status)
      VALUES (?, ?, 'in', ?, ?, 'text', ?, datetime('now'), 'delivered')
    `).run(messageId, convId, extId, cleanName, body);

    // 5. Insere timeline event
    db.prepare(`
      INSERT INTO timeline_events (id, lead_id, type, payload)
      VALUES (?, ?, 'message', ?)
    `).run(
      "time-" + Math.random().toString(36).substr(2, 9),
      leadId,
      JSON.stringify({ body, direction: "in", channel })
    );

    return NextResponse.json({ success: true, leadId, conversationId: convId, isNewLead });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
