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

    // Find all suspects
    // First, let's insert some suspects if dedupe_candidates is empty for demonstration purposes
    const countObj = db.prepare("SELECT COUNT(*) as c FROM dedupe_candidates").get() as any;
    if (countObj.c === 0) {
      // Simulate suspect generation: find leads with same/similar phone/email
      // Seed duplicates: Roberto Souza (lead-3) and Carlos Eduardo (lead-1) don't duplicate,
      // but let's seed a fake candidate: let's create a lead that duplicates Carlos Eduardo
      const carlos = db.prepare("SELECT * FROM leads WHERE code = 'LD-2026-0001'").get() as any;
      if (carlos) {
        // Create duplicate
        const dupId = "lead-dup-sim";
        const exists = db.prepare("SELECT id FROM leads WHERE id = ?").get(dupId);
        if (!exists) {
          db.prepare(`
            INSERT INTO leads (id, tenant_id, code, name, phone, email, entered_at, estimated_value, tracking_source, temperature, stage_id, responsible_broker_id, dedupe_status, notes)
            VALUES ('lead-dup-sim', ?, 'LD-2026-9999', 'Carlos E. (Dup)', ?, ?, datetime('now'), 550000.0, 'Portal Zap', 'morno', 'stage-1', 'bruno-id', 'suspect', 'Cadastro duplicado teste')
          `).run(carlos.tenant_id, carlos.phone, carlos.email);

          db.prepare(`
            INSERT INTO dedupe_candidates (id, entity_type, entity_id, match_entity_id, match_score, match_fields, status)
            VALUES ('candidate-1', 'lead', 'lead-dup-sim', ?, 0.9, '["phone", "email"]', 'open')
          `).run(carlos.id);
        }
      }
    }

    const candidates = db.prepare(`
      SELECT 
        dc.*, 
        l1.name as entityName, l1.code as entityCode, l1.phone as entityPhone, l1.email as entityEmail,
        l2.name as matchName, l2.code as matchCode, l2.phone as matchPhone, l2.email as matchEmail
      FROM dedupe_candidates dc
      JOIN leads l1 ON dc.entity_id = l1.id
      JOIN leads l2 ON dc.match_entity_id = l2.id
      WHERE dc.status = 'open'
    `).all() as any[];

    return NextResponse.json({ candidates });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Executa a mesclagem (Merge) ou rejeição (Ignore)
export async function POST(req: Request) {
  try {
    const db = getDb();
    const user = await getAuthUser(db);
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    if (user.role !== "Admin" && user.role !== "Gerente") {
      return NextResponse.json({ error: "Apenas administradores e gerentes podem mesclar registros." }, { status: 403 });
    }

    const { candidateId, action } = await req.json(); // action: 'merge' | 'ignore'

    const candidate = db.prepare("SELECT * FROM dedupe_candidates WHERE id = ?").get(candidateId) as any;
    if (!candidate) return NextResponse.json({ error: "Candidato não encontrado." }, { status: 404 });

    const duplicateId = candidate.entity_id;
    const originalId = candidate.match_entity_id;

    if (action === "merge") {
      // 1. Mark duplicate lead as merged and link it
      db.prepare(`
        UPDATE leads 
        SET dedupe_status = 'merged',
            duplicate_of = ?,
            stage_id = 'stage-6' -- Perdido / Inativo
        WHERE id = ?
      `).run(originalId, duplicateId);

      // 2. Move all timeline events to original lead
      db.prepare("UPDATE timeline_events SET lead_id = ? WHERE lead_id = ?").run(originalId, duplicateId);

      // 3. Move all conversations under original lead
      db.prepare("UPDATE conversations SET lead_id = ? WHERE lead_id = ?").run(originalId, duplicateId);

      // 4. Update dedupe candidate status
      db.prepare("UPDATE dedupe_candidates SET status = 'merged' WHERE id = ?").run(candidateId);

      // 5. Add timeline log in original lead
      const origLead = db.prepare("SELECT code FROM leads WHERE id = ?").get(originalId) as any;
      const dupLead = db.prepare("SELECT code FROM leads WHERE id = ?").get(duplicateId) as any;

      db.prepare(`
        INSERT INTO timeline_events (id, lead_id, type, actor_id, payload)
        VALUES (?, ?, 'system', ?, ?)
      `).run(
        "time-" + Math.random().toString(36).substr(2, 9),
        originalId,
        user.id,
        JSON.stringify({ text: `Mesclado com o lead duplicado ${dupLead?.code || duplicateId}. Histórico unificado.` })
      );

      // 6. Audit Log
      db.prepare(`
        INSERT INTO audit_log (id, tenant_id, actor_id, action, entity_type, entity_id, details)
        VALUES (?, ?, ?, 'lead.merged', 'leads', ?, ?)
      `).run(
        "audit-" + Math.random().toString(36).substr(2, 9),
        user.tenant_id,
        user.id,
        originalId,
        `Lead ${dupLead?.code || duplicateId} mesclado com o lead principal ${origLead?.code || originalId}.`
      );
    } else {
      // Action is ignore
      db.prepare("UPDATE dedupe_candidates SET status = 'ignored' WHERE id = ?").run(candidateId);
      db.prepare("UPDATE leads SET dedupe_status = 'unique' WHERE id = ?").run(duplicateId);

      db.prepare(`
        INSERT INTO audit_log (id, tenant_id, actor_id, action, entity_type, entity_id, details)
        VALUES (?, ?, ?, 'lead.dedupe_ignored', 'leads', ?, ?)
      `).run(
        "audit-" + Math.random().toString(36).substr(2, 9),
        user.tenant_id,
        user.id,
        duplicateId,
        `Suspeita de duplicidade ignorada para o lead.`
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
