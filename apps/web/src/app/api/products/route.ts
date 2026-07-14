import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "../../../lib/db";
import { normalizeKey } from "@crm/validation";

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

    const developments = db.prepare("SELECT d.*, dv.name as developerName FROM developments d LEFT JOIN developers dv ON d.developer_id = dv.id").all() as any[];
    const properties = db.prepare(`
      SELECT p.*, d.name as developmentName, dev.name as developerName 
      FROM properties p 
      LEFT JOIN developments d ON p.development_id = d.id
      LEFT JOIN developers dev ON p.developer_id = dev.id
    `).all() as any[];
    const developers = db.prepare("SELECT * FROM developers").all() as any[];

    return NextResponse.json({ developments, properties, developers });
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
      return NextResponse.json({ error: "Apenas administradores podem gerenciar o catálogo de produtos." }, { status: 403 });
    }

    const { type, developerId, name, address, city, region, status, vgv } = await req.json();

    if (!name) {
      return NextResponse.json({ error: "O nome do empreendimento é obrigatório." }, { status: 400 });
    }

    const normKey = normalizeKey(name);

    // D4: Prevent duplicate developments before saving
    const existing = db.prepare(`
      SELECT * FROM developments 
      WHERE normalized_key = ? AND tenant_id = ?
    `).get(normKey, user.tenant_id) as any;

    if (existing) {
      return NextResponse.json({
        error: `Erro D4: O empreendimento "${name}" é um possível duplicado de "${existing.name}". Cadastro bloqueado.`
      }, { status: 409 });
    }

    const id = "deve-" + Math.random().toString(36).substr(2, 9);
    
    // Insert development
    db.prepare(`
      INSERT INTO developments (id, tenant_id, developer_id, name, type, address, city, region, status, vgv, normalized_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, user.tenant_id, developerId || null, name, type || "lançamento", address || "", city || "", region || "", status || "lançamento", Number(vgv) || 0, normKey);

    // Log audit
    db.prepare(`
      INSERT INTO audit_log (id, tenant_id, actor_id, action, entity_type, entity_id, details, ip)
      VALUES (?, ?, ?, 'product.created', 'developments', ?, ?, '127.0.0.1')
    `).run(
      "audit-" + Math.random().toString(36).substr(2, 9),
      user.tenant_id,
      user.id,
      id,
      `Empreendimento "${name}" cadastrado com sucesso. Normalized Key: ${normKey}.`
    );

    return NextResponse.json({ success: true, developmentId: id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
