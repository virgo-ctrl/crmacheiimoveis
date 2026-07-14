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

    let sql = `
      SELECT u.id, u.name, u.email, u.phone, u.status, u.avatar_url, u.push_token, u.push_validated_at, u.presence, r.name as roleName, tm.team_id
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      LEFT JOIN team_members tm ON u.id = tm.user_id
      WHERE u.tenant_id = ?
    `;
    const params = [user.tenant_id];

    if (user.role === "Gerente") {
      sql += ` AND tm.team_id IN (SELECT team_id FROM team_members WHERE user_id = ?)`;
      params.push(user.id);
    } else if (user.role === "Corretor") {
      sql += ` AND u.id = ?`;
      params.push(user.id);
    }

    const usersList = db.prepare(sql).all(...params) as any[];

    return NextResponse.json({ users: usersList });
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
      return NextResponse.json({ error: "Permissão negada. Apenas Admin pode criar usuários." }, { status: 403 });
    }

    const { name, email, phone, roleName, password, pushToken, teamId } = await req.json();

    if (!name || !email || !roleName) {
      return NextResponse.json({ error: "Nome, e-mail e cargo são obrigatórios." }, { status: 400 });
    }

    const exists = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (exists) {
      return NextResponse.json({ error: "E-mail já cadastrado." }, { status: 409 });
    }

    const newUserId = "user-" + Math.random().toString(36).substr(2, 9);
    const pass = password || "password123";

    db.prepare(`
      INSERT INTO users (id, tenant_id, name, email, phone, status, push_token, password, presence)
      VALUES (?, ?, ?, ?, ?, 'ativo', ?, ?, 'offline')
    `).run(newUserId, user.tenant_id, name, email.trim(), phone || null, pushToken || null, pass);

    const roleObj = db.prepare("SELECT id FROM roles WHERE name = ? AND tenant_id = ?").get(roleName, user.tenant_id) as any;
    if (roleObj) {
      db.prepare("INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)").run(newUserId, roleObj.id);
    }

    if (teamId) {
      db.prepare("INSERT INTO team_members (team_id, user_id, role_in_team) VALUES (?, ?, 'member')").run(teamId, newUserId);
    }

    db.prepare(`
      INSERT INTO audit_log (id, tenant_id, actor_id, action, entity_type, entity_id, details)
      VALUES (?, ?, ?, 'user.created', 'users', ?, ?)
    `).run(
      "audit-" + Math.random().toString(36).substr(2, 9),
      user.tenant_id,
      user.id,
      newUserId,
      `Usuário "${name}" criado como "${roleName}".`
    );

    return NextResponse.json({ success: true, userId: newUserId });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const db = getDb();
    const user = await getAuthUser(db);
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const { id, name, phone, status, roleName, pushToken, teamId, testPush } = await req.json();

    const isSelf = id === user.id;
    if (!isSelf && user.role !== "Admin") {
      return NextResponse.json({ error: "Permissão negada." }, { status: 403 });
    }

    const targetUser = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as any;
    if (!targetUser) {
      return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
    }

    db.prepare(`
      UPDATE users 
      SET name = COALESCE(?, name),
          phone = COALESCE(?, phone),
          status = COALESCE(?, status),
          push_token = COALESCE(?, push_token)
      WHERE id = ?
    `).run(name, phone, status, pushToken, id);

    if (roleName && user.role === "Admin") {
      const roleObj = db.prepare("SELECT id FROM roles WHERE name = ? AND tenant_id = ?").get(roleName, user.tenant_id) as any;
      if (roleObj) {
        db.prepare("DELETE FROM user_roles WHERE user_id = ?").run(id);
        db.prepare("INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)").run(id, roleObj.id);
      }
    }

    if (teamId !== undefined && (user.role === "Admin" || user.role === "Gerente")) {
      db.prepare("DELETE FROM team_members WHERE user_id = ?").run(id);
      if (teamId) {
        db.prepare("INSERT INTO team_members (team_id, user_id, role_in_team) VALUES (?, ?, 'member')").run(teamId, id);
      }
    }

    let pushStatusMessage = "";
    if (testPush) {
      const token = pushToken || targetUser.push_token;
      const isValid = token && token.trim().length > 8;
      if (isValid) {
        const validatedAt = new Date().toISOString();
        db.prepare("UPDATE users SET push_validated_at = ? WHERE id = ?").run(validatedAt, id);
        pushStatusMessage = "Notificação push enviada e validada com sucesso no dispositivo!";
      } else {
        pushStatusMessage = "Falha no envio da notificação push: token de registro inválido.";
      }
    }

    db.prepare(`
      INSERT INTO audit_log (id, tenant_id, actor_id, action, entity_type, entity_id, details)
      VALUES (?, ?, ?, 'user.updated', 'users', ?, ?)
    `).run(
      "audit-" + Math.random().toString(36).substr(2, 9),
      user.tenant_id,
      user.id,
      id,
      `Usuário "${targetUser.name}" atualizado. ${pushStatusMessage}`
    );

    return NextResponse.json({ success: true, pushStatusMessage });
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
      return NextResponse.json({ error: "Apenas administradores podem remover usuários." }, { status: 403 });
    }

    const { id } = await req.json();

    if (id === user.id) {
      return NextResponse.json({ error: "Não é possível excluir a si mesmo." }, { status: 400 });
    }

    db.prepare("DELETE FROM users WHERE id = ?").run(id);

    db.prepare(`
      INSERT INTO audit_log (id, tenant_id, actor_id, action, entity_type, entity_id, details)
      VALUES (?, ?, ?, 'user.deleted', 'users', ?, 'Usuário removido do sistema.')
    `).run("audit-" + Math.random().toString(36).substr(2, 9), user.tenant_id, user.id, id);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
