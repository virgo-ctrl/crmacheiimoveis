import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "../../../../lib/db";
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

    const rls = getRlsFilter(user.role, user.id, "l.responsible_broker_id");
    const lead = db.prepare(`
      SELECT l.*, u.name as brokerName, lr.name as lossReasonName 
      FROM leads l
      LEFT JOIN users u ON l.responsible_broker_id = u.id
      LEFT JOIN loss_reasons lr ON l.loss_reason_id = lr.id
      WHERE l.id = ? AND ${rls.sql}
    `).get(id, ...rls.params) as any;

    if (!lead) {
      return NextResponse.json({ error: "Lead não encontrado ou acesso negado." }, { status: 404 });
    }

    // Fetch Timeline events
    const timeline = db.prepare(`
      SELECT * FROM timeline_events 
      WHERE lead_id = ? 
      ORDER BY occurred_at DESC
    `).all(id) as any[];

    // Fetch transfers
    const transfers = db.prepare(`
      SELECT lt.*, u1.name as fromBroker, u2.name as toBroker 
      FROM lead_transfers lt
      LEFT JOIN users u1 ON lt.from_broker_id = u1.id
      LEFT JOIN users u2 ON lt.to_broker_id = u2.id
      WHERE lt.lead_id = ?
      ORDER BY lt.created_at DESC
    `).all(id) as any[];

    // Fetch tags
    const tagsList = db.prepare("SELECT tag FROM lead_tags WHERE lead_id = ?").all(id) as any[];
    const tags = tagsList.map((t) => t.tag);

    // Fetch interests
    const interestsList = db.prepare(`
      SELECT li.development_id, d.name as developmentName 
      FROM lead_interests li
      JOIN developments d ON li.development_id = d.id
      WHERE li.lead_id = ?
    `).all(id) as any[];

    // Log lead.viewed to audit_log (D5)
    db.prepare(`
      INSERT INTO audit_log (id, tenant_id, actor_id, action, entity_type, entity_id, details, ip)
      VALUES (?, ?, ?, 'lead.viewed', 'leads', ?, ?, '127.0.0.1')
    `).run(
      "audit-" + Math.random().toString(36).substr(2, 9),
      user.tenant_id,
      user.id,
      id,
      `Visualizou a gaveta de detalhes do lead ${lead.code}.`
    );

    return NextResponse.json({ lead, timeline, transfers, tags, interests: interestsList });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    const user = await getAuthUser(db);
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const rls = getRlsFilter(user.role, user.id, "l.responsible_broker_id");
    const lead = db.prepare(`SELECT * FROM leads l WHERE l.id = ? AND ${rls.sql}`).get(id, ...rls.params) as any;
    if (!lead) return NextResponse.json({ error: "Lead não encontrado ou acesso negado." }, { status: 404 });

    const body = await req.json();
    const { stageId, nextTask, brokerId, reason, notes, temperature, estimatedValue, lossReasonId, tags, interestIds } = body;

    // Action 1: Change Funnel Stage & Loss Reason
    if (stageId && stageId !== lead.stage_id) {
      const oldStageObj = db.prepare("SELECT name FROM funnel_stages WHERE id = ?").get(lead.stage_id) as any;
      const newStageObj = db.prepare("SELECT name FROM funnel_stages WHERE id = ?").get(stageId) as any;
      
      const oldStageName = oldStageObj ? oldStageObj.name : "Desconhecido";
      const newStageName = newStageObj ? newStageObj.name : "Desconhecido";

      db.prepare("UPDATE leads SET stage_id = ?, loss_reason_id = ? WHERE id = ?").run(stageId, lossReasonId || null, id);

      // Log to timeline
      db.prepare(`
        INSERT INTO timeline_events (id, lead_id, type, actor_id, payload)
        VALUES (?, ?, 'stage_change', ?, ?)
      `).run(
        "time-" + Math.random().toString(36).substr(2, 9),
        id,
        user.id,
        JSON.stringify({ from: oldStageName, to: newStageName })
      );

      // Log audit
      db.prepare(`
        INSERT INTO audit_log (id, tenant_id, actor_id, action, entity_type, entity_id, before, after, ip)
        VALUES (?, ?, ?, 'lead.stage_changed', 'leads', ?, ?, ?, '127.0.0.1')
      `).run(
        "audit-" + Math.random().toString(36).substr(2, 9),
        user.tenant_id,
        user.id,
        id,
        JSON.stringify({ stage_id: lead.stage_id, loss_reason_id: lead.loss_reason_id }),
        JSON.stringify({ stage_id: stageId, loss_reason_id: lossReasonId })
      );
    } else if (lossReasonId !== undefined && lossReasonId !== lead.loss_reason_id) {
      db.prepare("UPDATE leads SET loss_reason_id = ? WHERE id = ?").run(lossReasonId, id);
    }

    // Action 2: Schedule Task / Follow-up (D1 resolution)
    if (nextTask !== undefined && nextTask !== lead.next_task_id) {
      const taskId = "task-" + Math.random().toString(36).substr(2, 9);
      
      db.prepare(`
        INSERT INTO tasks (id, tenant_id, lead_id, broker_id, type, title, due_at, status)
        VALUES (?, ?, ?, ?, 'follow-up', ?, datetime('now', '+1 day'), 'pending')
      `).run(taskId, user.tenant_id, id, lead.responsible_broker_id, nextTask);

      db.prepare("UPDATE leads SET next_task_id = ? WHERE id = ?").run(taskId, id);

      db.prepare(`
        INSERT INTO timeline_events (id, lead_id, type, actor_id, payload)
        VALUES (?, ?, 'task', ?, ?)
      `).run(
        "time-" + Math.random().toString(36).substr(2, 9),
        id,
        user.id,
        JSON.stringify({ title: nextTask })
      );

      db.prepare(`
        INSERT INTO audit_log (id, tenant_id, actor_id, action, entity_type, entity_id, details, ip)
        VALUES (?, ?, ?, 'task.created', 'leads', ?, ?, '127.0.0.1')
      `).run(
        "audit-" + Math.random().toString(36).substr(2, 9),
        user.tenant_id,
        user.id,
        id,
        `Tarefa de acompanhamento agendada: "${nextTask}". Alerta D1 resolvido.`
      );
    }

    // Action 3: Transfer Broker (D6)
    if (brokerId && brokerId !== lead.responsible_broker_id) {
      const targetBroker = db.prepare("SELECT name FROM users WHERE id = ?").get(brokerId) as any;
      if (!targetBroker) return NextResponse.json({ error: "Corretor destino inválido." }, { status: 400 });

      const fromBrokerId = lead.responsible_broker_id;
      const fromBrokerNameObj = db.prepare("SELECT name FROM users WHERE id = ?").get(fromBrokerId) as any;
      const fromBrokerName = fromBrokerNameObj ? fromBrokerNameObj.name : "Fila";

      // Grab rule rate limit validation (Caça-Leads)
      if (!fromBrokerId && brokerId === user.id) {
        const activeGrabRule = db.prepare("SELECT * FROM distribution_rules WHERE tenant_id = ? AND type = 'grab' AND active = 1").get(user.tenant_id) as any;
        if (activeGrabRule) {
          const criteria = JSON.parse(activeGrabRule.criteria || "{}");
          const limit = criteria.limit_per_period || 3;
          const mins = criteria.period_minutes || 10;

          const recentGrabs = db.prepare(`
            SELECT COUNT(*) as c 
            FROM lead_transfers 
            WHERE to_broker_id = ? 
              AND reason LIKE '%Caça-Leads%'
              AND datetime(created_at) >= datetime('now', ?)
          `).get(user.id, `-${mins} minutes`) as any;

          if (recentGrabs && recentGrabs.c >= limit) {
            return NextResponse.json({ 
              error: `Erro Caça-Leads: Limite atingido. Você só pode capturar até ${limit} leads a cada ${mins} minutos.` 
            }, { status: 429 });
          }
        }
      }

      db.prepare("UPDATE leads SET responsible_broker_id = ? WHERE id = ?").run(brokerId, id);

      db.prepare(`
        INSERT INTO lead_transfers (id, lead_id, from_broker_id, to_broker_id, reason, by_user_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        "trsf-" + Math.random().toString(36).substr(2, 9),
        id,
        fromBrokerId,
        brokerId,
        reason || "Transferência manual",
        user.id
      );

      db.prepare(`
        INSERT INTO timeline_events (id, lead_id, type, actor_id, payload)
        VALUES (?, ?, 'transfer', ?, ?)
      `).run(
        "time-" + Math.random().toString(36).substr(2, 9),
        id,
        user.id,
        JSON.stringify({ from: fromBrokerName, to: targetBroker.name, reason })
      );

      db.prepare("UPDATE conversations SET assigned_broker_id = ? WHERE lead_id = ?").run(brokerId, id);

      db.prepare(`
        INSERT INTO audit_log (id, tenant_id, actor_id, action, entity_type, entity_id, details, ip)
        VALUES (?, ?, ?, 'lead.transferred', 'leads', ?, ?, '127.0.0.1')
      `).run(
        "audit-" + Math.random().toString(36).substr(2, 9),
        user.tenant_id,
        user.id,
        id,
        `Lead transferido de ${fromBrokerName} para ${targetBroker.name}. Motivo: ${reason}`
      );
    }

    // Action 4: Edit notes, temp, value
    if (notes !== undefined || temperature !== undefined || estimatedValue !== undefined) {
      db.prepare(`
        UPDATE leads 
        SET notes = COALESCE(?, notes),
            temperature = COALESCE(?, temperature),
            estimated_value = COALESCE(?, estimated_value)
        WHERE id = ?
      `).run(notes, temperature, estimatedValue, id);
    }

    // Action 5: Save Tags
    if (tags !== undefined && Array.isArray(tags)) {
      db.prepare("DELETE FROM lead_tags WHERE lead_id = ?").run(id);
      tags.forEach((tag: string) => {
        if (tag.trim()) {
          db.prepare("INSERT INTO lead_tags (lead_id, tag) VALUES (?, ?)").run(id, tag.trim());
        }
      });
    }

    // Action 6: Save Multiple Interests
    if (interestIds !== undefined && Array.isArray(interestIds)) {
      db.prepare("DELETE FROM lead_interests WHERE lead_id = ?").run(id);
      interestIds.forEach((devId: string) => {
        if (devId.trim()) {
          db.prepare("INSERT INTO lead_interests (lead_id, development_id, priority) VALUES (?, ?, 1)").run(id, devId);
        }
      });
      // Optionally sync the text representation into leads.interest if needed for display fallback
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
