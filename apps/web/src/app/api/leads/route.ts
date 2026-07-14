import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "../../../lib/db";
import { getRlsFilter } from "@crm/auth";
import { validatePhoneE164, sanitizeName, normalizeKey } from "@crm/validation";
import { distributeLead } from "../../../lib/distribution";

// Helper to get authenticated user & role
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
    
    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    // Resolve RLS SQL filter
    const rls = getRlsFilter(user.role, user.id, "l.responsible_broker_id");

    const sql = `
      SELECT 
        l.*, 
        u.name as brokerName, 
        fs.name as stageName
      FROM leads l 
      LEFT JOIN users u ON l.responsible_broker_id = u.id 
      LEFT JOIN funnel_stages fs ON l.stage_id = fs.id
      WHERE ${rls.sql}
      ORDER BY l.created_at DESC
    `;

    const leads = db.prepare(sql).all(...rls.params) as any[];

    // Map properties for UI compatibility
    const mappedLeads = leads.map(l => ({
      id: l.id,
      code: l.code,
      name: l.name,
      phone: l.phone,
      email: l.email,
      estimatedValue: l.estimated_value,
      temperature: l.temperature,
      stageId: l.stage_id,
      stageName: l.stageName,
      brokerId: l.responsible_broker_id,
      brokerName: l.brokerName,
      teamId: l.team_id,
      source: l.tracking_source,
      interest: l.interest || "Vila Mariana Luxury",
      nextTask: l.next_task_id ? "Tarefa Agendada" : null, // Logical check
      dedupeStatus: l.dedupe_status,
      notes: l.notes,
      created_at: l.created_at
    }));

    // Fetch grab/unassigned leads
    const grabList = db.prepare(`
      SELECT l.*, fs.name as stageName
      FROM leads l
      LEFT JOIN funnel_stages fs ON l.stage_id = fs.id
      WHERE l.responsible_broker_id IS NULL
    `).all() as any[];

    const mappedGrab = grabList.map(l => ({
      id: l.id,
      code: l.code,
      name: l.name,
      phone: l.phone,
      email: l.email,
      estimatedValue: l.estimated_value,
      temperature: l.temperature,
      stageId: l.stage_id,
      stageName: l.stageName,
      source: l.tracking_source,
      interest: l.notes || "Geral",
      created_at: l.created_at
    }));

    return NextResponse.json({ leads: mappedLeads, grabLeads: mappedGrab });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const db = getDb();
    const user = await getAuthUser(db);
    
    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const { name, phone, email, estimatedValue, source, interest, notes, force } = await req.json();

    const cleanName = sanitizeName(name);
    const cleanPhone = phone ? phone.trim() : "";
    const cleanEmail = email ? email.trim() : "";

    if (!cleanName || !cleanPhone) {
      return NextResponse.json({ error: "Nome e telefone são obrigatórios." }, { status: 400 });
    }

    // D3 Validation
    if (!validatePhoneE164(cleanPhone)) {
      return NextResponse.json({ error: "Telefone inválido. Deve obedecer o formato E.164 (Ex: +5511987654321)." }, { status: 400 });
    }

    // D4 Deduplication check
    const duplicates = db.prepare(`
      SELECT * FROM leads 
      WHERE phone = ? OR (email IS NOT NULL AND email != '' AND LOWER(email) = LOWER(?))
    `).all(cleanPhone, cleanEmail) as any[];

    if (duplicates.length > 0 && !force) {
      return NextResponse.json({
        duplicateDetected: true,
        matches: duplicates.map(d => ({ code: d.code, name: d.name, brokerId: d.responsible_broker_id }))
      }, { status: 409 });
    }

    // Call the advanced distribution engine helper
    const distResult = distributeLead(db, user.tenant_id);
    const assignedBrokerId = distResult.brokerId;
    const ruleId = distResult.ruleId || "rule-1";
    const decisionReason = distResult.reason;

    // Get selected broker name for logs
    let brokerName = "Sem corretor (Fila Livre)";
    if (assignedBrokerId) {
      const brokerObj = db.prepare("SELECT name FROM users WHERE id = ?").get(assignedBrokerId) as any;
      if (brokerObj) brokerName = brokerObj.name;
    }

    const leadsCount = (db.prepare("SELECT count(*) as count FROM leads").get() as any).count;
    const leadId = "lead-" + Math.random().toString(36).substr(2, 9);
    const leadCode = `LD-2026-${String(leadsCount + 1).padStart(4, "0")}`;
    const enteredAt = new Date().toISOString();

    // Insert Lead
    db.prepare(`
      INSERT INTO leads (id, tenant_id, code, name, phone, email, entered_at, estimated_value, tracking_source, temperature, stage_id, responsible_broker_id, notes, dedupe_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'morno', 'stage-1', ?, ?, ?)
    `).run(
      leadId,
      user.tenant_id,
      leadCode,
      cleanName,
      cleanPhone,
      cleanEmail,
      enteredAt,
      Number(estimatedValue) || 0,
      source || "Site Formulário",
      assignedBrokerId,
      notes || "",
      duplicates.length > 0 ? "suspect" : "unique"
    );

    // Save distribution log
    const distLogId = "dist-" + Math.random().toString(36).substr(2, 9);
    db.prepare(`
      INSERT INTO distribution_log (id, lead_id, rule_id, assigned_broker_id, decision_reason)
      VALUES (?, ?, ?, ?, ?)
    `).run(distLogId, leadId, ruleId, assignedBrokerId, decisionReason);

    // Create WhatsApp Conversation (assigned to broker, or null for grab)
    const convId = "conv-" + Math.random().toString(36).substr(2, 9);
    db.prepare(`
      INSERT INTO conversations (id, tenant_id, lead_id, assigned_broker_id, status, unread_count, last_message_at, wa_window_expires_at)
      VALUES (?, ?, ?, ?, 'open', 0, ?, datetime('now', '+24 hours'))
    `).run(convId, user.tenant_id, leadId, assignedBrokerId, enteredAt);

    // Create Message
    db.prepare(`
      INSERT INTO messages (id, conversation_id, direction, external_id, sender, content_type, body, occurred_at, status)
      VALUES (?, ?, 'in', ?, ?, 'text', ?, ?, 'read')
    `).run(
      "msg-" + Math.random().toString(36).substr(2, 9),
      convId,
      "ext-" + Math.random().toString(36).substr(2, 9),
      cleanName,
      `Novo lead integrado com sucesso. Empreendimento: ${interest || 'Vila Mariana Luxury'}. Notas: ${notes || ''}`,
      enteredAt
    );

    // Write Audit Log
    db.prepare(`
      INSERT INTO audit_log (id, tenant_id, actor_id, action, entity_type, entity_id, details, ip)
      VALUES (?, ?, ?, 'lead.created', 'leads', ?, ?, '127.0.0.1')
    `).run(
      "audit-" + Math.random().toString(36).substr(2, 9),
      user.tenant_id,
      user.id,
      leadId,
      `Lead ${leadCode} criado e distribuído. Razão: ${decisionReason}. Corretor: ${brokerName}.`
    );

    return NextResponse.json({ success: true, leadId, code: leadCode });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
