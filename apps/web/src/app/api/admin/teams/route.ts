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

    const teams = db.prepare("SELECT * FROM teams WHERE tenant_id = ?").all(user.tenant_id) as any[];

    // Fetch members for each team
    const teamsWithMembers = teams.map((team) => {
      const members = db.prepare(`
        SELECT u.id, u.name, u.email, tm.role_in_team
        FROM team_members tm
        JOIN users u ON tm.user_id = u.id
        WHERE tm.team_id = ?
      `).all(team.id) as any[];

      return {
        ...team,
        members,
        membersCount: members.length,
      };
    });

    return NextResponse.json({ teams: teamsWithMembers });
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
      return NextResponse.json({ error: "Permissão negada. Apenas Admin pode criar equipes." }, { status: 403 });
    }

    const { name } = await req.json();
    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Nome da equipe é obrigatório." }, { status: 400 });
    }

    const teamId = "team-" + Math.random().toString(36).substr(2, 9);
    db.prepare("INSERT INTO teams (id, tenant_id, name) VALUES (?, ?, ?)").run(teamId, user.tenant_id, name.trim());

    db.prepare(`
      INSERT INTO audit_log (id, tenant_id, actor_id, action, entity_type, entity_id, details)
      VALUES (?, ?, ?, 'team.created', 'teams', ?, ?)
    `).run(
      "audit-" + Math.random().toString(36).substr(2, 9),
      user.tenant_id,
      user.id,
      teamId,
      `Equipe "${name}" criada com sucesso.`
    );

    return NextResponse.json({ success: true, teamId });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const db = getDb();
    const user = await getAuthUser(db);
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    if (user.role !== "Admin" && user.role !== "Gerente") {
      return NextResponse.json({ error: "Permissão negada." }, { status: 403 });
    }

    const { id, name, managerId } = await req.json();

    if (!id || !name?.trim()) {
      return NextResponse.json({ error: "ID e nome são obrigatórios." }, { status: 400 });
    }

    const team = db.prepare("SELECT * FROM teams WHERE id = ? AND tenant_id = ?").get(id, user.tenant_id) as any;
    if (!team) return NextResponse.json({ error: "Equipe não encontrada." }, { status: 404 });

    db.prepare("UPDATE teams SET name = ? WHERE id = ?").run(name.trim(), id);

    // If manager ID is specified, update role_in_team for that team
    if (managerId !== undefined) {
      // Remove current managers
      db.prepare("UPDATE team_members SET role_in_team = 'member' WHERE team_id = ?").run(id);
      if (managerId) {
        // Ensure user is in team
        const inTeam = db.prepare("SELECT * FROM team_members WHERE team_id = ? AND user_id = ?").get(id, managerId);
        if (inTeam) {
          db.prepare("UPDATE team_members SET role_in_team = 'manager' WHERE team_id = ? AND user_id = ?").run(id, managerId);
        } else {
          db.prepare("INSERT INTO team_members (team_id, user_id, role_in_team) VALUES (?, ?, 'manager')").run(id, managerId);
        }
      }
    }

    db.prepare(`
      INSERT INTO audit_log (id, tenant_id, actor_id, action, entity_type, entity_id, details)
      VALUES (?, ?, ?, 'team.updated', 'teams', ?, ?)
    `).run(
      "audit-" + Math.random().toString(36).substr(2, 9),
      user.tenant_id,
      user.id,
      id,
      `Equipe "${team.name}" renomeada para "${name}"/gerente atualizado.`
    );

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const db = getDb();
    const user = await getAuthUser(db);
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    if (user.role !== "Admin") {
      return NextResponse.json({ error: "Apenas administradores podem excluir equipes." }, { status: 403 });
    }

    const { id } = await req.json();

    const team = db.prepare("SELECT * FROM teams WHERE id = ? AND tenant_id = ?").get(id, user.tenant_id) as any;
    if (!team) return NextResponse.json({ error: "Equipe não encontrada." }, { status: 404 });

    db.prepare("DELETE FROM teams WHERE id = ?").run(id);

    db.prepare(`
      INSERT INTO audit_log (id, tenant_id, actor_id, action, entity_type, entity_id, details)
      VALUES (?, ?, ?, 'team.deleted', 'teams', ?, ?)
    `).run(
      "audit-" + Math.random().toString(36).substr(2, 9),
      user.tenant_id,
      user.id,
      id,
      `Equipe "${team.name}" excluída.`
    );

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
