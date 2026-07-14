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

    const rls = getRlsFilter(user.role, user.id, "l.responsible_broker_id");

    // 1. VGV and counts by Funnel Stage
    const stageSummary = db.prepare(`
      SELECT 
        fs.id,
        fs.name,
        fs.is_won,
        COUNT(l.id) as count,
        COALESCE(SUM(l.estimated_value), 0) as totalValue
      FROM funnel_stages fs
      LEFT JOIN leads l ON l.stage_id = fs.id AND ${rls.sql}
      GROUP BY fs.id
      ORDER BY fs."order" ASC
    `).all(...rls.params) as any[];

    // 2. Broker Rankings
    const rankingSql = `
      SELECT 
        u.name as brokerName,
        COUNT(l.id) as leadsCount,
        COALESCE(SUM(l.estimated_value), 0) as totalVgv,
        COALESCE(SUM(CASE WHEN fs.is_won = 1 THEN l.estimated_value ELSE 0 END), 0) as wonVgv
      FROM users u
      LEFT JOIN leads l ON l.responsible_broker_id = u.id AND ${rls.sql}
      LEFT JOIN funnel_stages fs ON l.stage_id = fs.id
      GROUP BY u.id
      ORDER BY wonVgv DESC, totalVgv DESC
    `;
    const brokerRanking = db.prepare(rankingSql).all(...rls.params) as any[];

    // 3. Team Rankings
    const teamRanking = db.prepare(`
      SELECT 
        t.name as teamName,
        COUNT(l.id) as leadsCount,
        COALESCE(SUM(l.estimated_value), 0) as totalVgv,
        COALESCE(SUM(CASE WHEN fs.is_won = 1 THEN l.estimated_value ELSE 0 END), 0) as wonVgv
      FROM teams t
      JOIN team_members tm ON t.id = tm.team_id
      LEFT JOIN leads l ON l.responsible_broker_id = tm.user_id
      LEFT JOIN funnel_stages fs ON l.stage_id = fs.id
      GROUP BY t.id
      ORDER BY wonVgv DESC
    `).all() as any[];

    // 4. Leads by Source
    const sourceSummary = db.prepare(`
      SELECT 
        l.tracking_source as source,
        COUNT(l.id) as count,
        COALESCE(SUM(l.estimated_value), 0) as value,
        COALESCE(SUM(CASE WHEN fs.is_won = 1 THEN 1 ELSE 0 END), 0) as wonCount
      FROM leads l
      LEFT JOIN funnel_stages fs ON l.stage_id = fs.id
      WHERE ${rls.sql}
      GROUP BY l.tracking_source
    `).all(...rls.params) as any[];

    // 5. Time series
    const timeSummary = db.prepare(`
      SELECT 
        strftime('%Y-%m-%d', l.created_at) as date,
        COUNT(l.id) as count,
        COALESCE(SUM(l.estimated_value), 0) as value
      FROM leads l
      WHERE ${rls.sql}
      GROUP BY date
      ORDER BY date ASC
    `).all(...rls.params) as any[];

    // 6. Tasks Query
    const tasksRls = getRlsFilter(user.role, user.id, "t.broker_id");
    const tasks = db.prepare(`
      SELECT t.*, u.name as brokerName, l.name as leadName, l.code as leadCode
      FROM tasks t
      JOIN users u ON t.broker_id = u.id
      JOIN leads l ON t.lead_id = l.id
      WHERE ${tasksRls.sql}
      ORDER BY t.due_at ASC
    `).all(...tasksRls.params) as any[];

    const totalLeads = stageSummary.reduce((acc, s) => acc + s.count, 0);
    const totalValue = stageSummary.reduce((acc, s) => acc + s.totalValue, 0);
    const ticketMedio = totalLeads > 0 ? totalValue / totalLeads : 0;

    let forecast = 0;
    stageSummary.forEach(s => {
      let rate = 0.15;
      if (s.name.includes("Novo")) rate = 0.1;
      else if (s.name.includes("Quali")) rate = 0.25;
      else if (s.name.includes("Apres") || s.name.includes("Visita")) rate = 0.5;
      else if (s.name.includes("Propo")) rate = 0.8;
      else if (s.is_won === 1) rate = 1.0;
      forecast += s.totalValue * rate;
    });

    return NextResponse.json({
      stageSummary,
      brokerRanking,
      teamRanking,
      sourceSummary,
      timeSummary,
      tasks,
      ticketMedio,
      totalVgv: totalValue,
      forecast
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
