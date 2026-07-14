import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "../../../lib/db";

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

    const sources = db.prepare("SELECT * FROM lead_sources").all() as any[];
    const campaigns = db.prepare("SELECT * FROM campaigns").all() as any[];
    const lossReasons = db.prepare("SELECT * FROM loss_reasons").all() as any[];
    const templates = db.prepare("SELECT * FROM message_templates").all() as any[];
    const stages = db.prepare("SELECT * FROM funnel_stages ORDER BY \"order\"").all() as any[];
    const scripts = db.prepare("SELECT * FROM qualification_scripts WHERE active = 1").all() as any[];
    const channels = db.prepare("SELECT * FROM channels").all() as any[];

    return NextResponse.json({ sources, campaigns, lossReasons, templates, stages, scripts, channels });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const db = getDb();
    const user = await getAuthUser(db);
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    if (user.role !== "Admin") {
      return NextResponse.json({ error: "Apenas administradores podem modificar configurações de negócio." }, { status: 403 });
    }

    const { type, name, waBody } = await req.json();

    if (type === "source") {
      const id = "source-" + Math.random().toString(36).substr(2, 9);
      db.prepare("INSERT INTO lead_sources (id, tenant_id, name, active) VALUES (?, ?, ?, 1)").run(id, user.tenant_id, name);
    } else if (type === "campaign") {
      const id = "camp-" + Math.random().toString(36).substr(2, 9);
      db.prepare("INSERT INTO campaigns (id, tenant_id, name, active) VALUES (?, ?, ?, 1)").run(id, user.tenant_id, name);
    } else if (type === "loss") {
      const id = "loss-" + Math.random().toString(36).substr(2, 9);
      db.prepare("INSERT INTO loss_reasons (id, tenant_id, name, active) VALUES (?, ?, ?, 1)").run(id, user.tenant_id, name);
    } else if (type === "template") {
      const id = "tpl-" + Math.random().toString(36).substr(2, 9);
      db.prepare("INSERT INTO message_templates (id, tenant_id, channel_type, name, body, wa_approval_status, active) VALUES (?, ?, 'whatsapp', ?, ?, 'APPROVED', 1)").run(id, user.tenant_id, name, waBody);
    } else if (type === "stage") {
      const id = "stage-" + Math.random().toString(36).substr(2, 9);
      const maxOrder = (db.prepare('SELECT COALESCE(MAX("order"), 0) as m FROM funnel_stages WHERE tenant_id = ?').get(user.tenant_id) as any).m;
      db.prepare('INSERT INTO funnel_stages (id, tenant_id, name, "order", is_won, is_lost) VALUES (?, ?, ?, ?, 0, 0)').run(id, user.tenant_id, name, maxOrder + 1);
    } else if (type === "script") {
      const id = "script-" + Math.random().toString(36).substr(2, 9);
      db.prepare("INSERT INTO qualification_scripts (id, tenant_id, name, body, active) VALUES (?, ?, ?, ?, 1)").run(id, user.tenant_id, name, waBody || "");
    } else if (type === "channel") {
      const id = "chan-" + Math.random().toString(36).substr(2, 9);
      const { identity, channelType, credentialsRef } = await req.json();
      db.prepare("INSERT INTO channels (id, tenant_id, type, identity, owner_user_id, status, credentials_ref) VALUES (?, ?, ?, ?, ?, 'active', ?)")
        .run(id, user.tenant_id, channelType || "whatsapp", identity || "", user.id, credentialsRef || "sec-token");
    } else {
      return NextResponse.json({ error: "Tipo de configuração inválido." }, { status: 400 });
    }

    // Log audit
    db.prepare(`
      INSERT INTO audit_log (id, tenant_id, actor_id, action, entity_type, entity_id, details, ip)
      VALUES (?, ?, ?, 'config.updated', 'configs', ?, ?, '127.0.0.1')
    `).run(
      "audit-" + Math.random().toString(36).substr(2, 9),
      user.tenant_id,
      user.id,
      "CONFIG",
      `Configuração adicionada: ${type} - ${name}.`
    );

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

const TABLE_MAP: Record<string, string> = {
  source: "lead_sources",
  campaign: "campaigns",
  loss: "loss_reasons",
  template: "message_templates",
  stage: "funnel_stages",
  script: "qualification_scripts",
  channel: "channels",
};

// RENOMEAR / EDITAR item de configuração
export async function PUT(req: Request) {
  try {
    const db = getDb();
    const user = await getAuthUser(db);
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    if (user.role !== "Admin") return NextResponse.json({ error: "Apenas administradores podem editar configurações." }, { status: 403 });

    const { type, id, name, isWon, isLost } = await req.json();
    const table = TABLE_MAP[type];
    if (!table || !id || !name?.trim()) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });

    db.prepare(`UPDATE ${table} SET name = ? WHERE id = ? AND tenant_id = ?`).run(name.trim(), id, user.tenant_id);

    // Para canais, atualiza a identidade e tipo
    if (type === "channel") {
      const { identity, channelType, credentialsRef } = await req.json();
      db.prepare("UPDATE channels SET identity = COALESCE(?, identity), type = COALESCE(?, type), credentials_ref = COALESCE(?, credentials_ref) WHERE id = ? AND tenant_id = ?")
        .run(identity, channelType, credentialsRef, id, user.tenant_id);
    }

    // Para etapas, permite marcar ganho/perda
    if (type === "stage" && (isWon !== undefined || isLost !== undefined)) {
      db.prepare('UPDATE funnel_stages SET is_won = COALESCE(?, is_won), is_lost = COALESCE(?, is_lost) WHERE id = ? AND tenant_id = ?')
        .run(isWon === undefined ? null : (isWon ? 1 : 0), isLost === undefined ? null : (isLost ? 1 : 0), id, user.tenant_id);
    }

    db.prepare(`
      INSERT INTO audit_log (id, tenant_id, actor_id, action, entity_type, entity_id, details, ip)
      VALUES (?, ?, ?, 'config.updated', 'configs', ?, ?, '127.0.0.1')
    `).run("audit-" + Math.random().toString(36).substr(2, 9), user.tenant_id, user.id, id, `Configuração (${type}) renomeada para "${name}".`);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// EXCLUIR item de configuração
export async function DELETE(req: Request) {
  try {
    const db = getDb();
    const user = await getAuthUser(db);
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    if (user.role !== "Admin") return NextResponse.json({ error: "Apenas administradores podem excluir configurações." }, { status: 403 });

    const { type, id } = await req.json();
    const table = TABLE_MAP[type];
    if (!table || !id) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });

    if (type === "stage") {
      const count = (db.prepare("SELECT COUNT(*) as c FROM leads WHERE stage_id = ?").get(id) as any).c;
      if (count > 0) return NextResponse.json({ error: `Não é possível excluir: existem ${count} leads nesta etapa. Mova-os antes.` }, { status: 409 });
    }

    db.prepare(`DELETE FROM ${table} WHERE id = ? AND tenant_id = ?`).run(id, user.tenant_id);

    db.prepare(`
      INSERT INTO audit_log (id, tenant_id, actor_id, action, entity_type, entity_id, details, ip)
      VALUES (?, ?, ?, 'config.deleted', 'configs', ?, ?, '127.0.0.1')
    `).run("audit-" + Math.random().toString(36).substr(2, 9), user.tenant_id, user.id, id, `Configuração (${type}) excluída.`);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
