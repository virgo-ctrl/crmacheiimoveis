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

    // Enforce role permission check for export (Admin and Gerente can export, Corretor cannot or can only export self?)
    // RBAC matrices: Admin has export 'all', Gerente has export 'team'. Corretor does NOT have export.
    if (user.role === "Corretor") {
      return NextResponse.json({ error: "Permissão negada. Corretores não podem exportar dados." }, { status: 403 });
    }

    const rls = getRlsFilter(user.role, user.id, "l.responsible_broker_id");
    const sql = `
      SELECT l.code, l.name, l.phone, l.email, l.entered_at, l.estimated_value, l.tracking_source, l.temperature, fs.name as stageName, u.name as brokerName
      FROM leads l
      LEFT JOIN users u ON l.responsible_broker_id = u.id
      LEFT JOIN funnel_stages fs ON l.stage_id = fs.id
      WHERE ${rls.sql}
      ORDER BY l.created_at DESC
    `;

    const leads = db.prepare(sql).all(...rls.params) as any[];

    // Build CSV Content
    let csv = "Codigo,Nome,Telefone,Email,Entrada,Valor Estimado,Origem,Temperatura,Etapa,Responsavel\n";
    leads.forEach((l) => {
      csv += `"${l.code || ""}","${(l.name || "").replace(/"/g, '""')}","${l.phone || ""}","${l.email || ""}","${l.entered_at || ""}",${l.estimated_value || 0},"${l.tracking_source || ""}","${l.temperature || ""}","${l.stageName || ""}","${l.brokerName || ""}"\n`;
    });

    // Write audit log
    db.prepare(`
      INSERT INTO audit_log (id, tenant_id, actor_id, action, entity_type, entity_id, details, ip)
      VALUES (?, ?, ?, 'lead.exported', 'leads', NULL, ?, '127.0.0.1')
    `).run(
      "audit-" + Math.random().toString(36).substr(2, 9),
      user.tenant_id,
      user.id,
      `Exportou ${leads.length} leads em formato CSV.`
    );

    // Return as CSV file download
    const response = new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=leads_export.csv",
      },
    });

    return response;
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
