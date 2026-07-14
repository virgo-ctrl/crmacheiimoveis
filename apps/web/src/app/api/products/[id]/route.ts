import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "../../../../lib/db";
import { normalizeKey } from "@crm/validation";

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

// EDITAR empreendimento
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    const user = await getAuthUser(db);
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    if (user.role !== "Admin") return NextResponse.json({ error: "Apenas administradores podem editar o catálogo." }, { status: 403 });

    const dev = db.prepare("SELECT * FROM developments WHERE id = ? AND tenant_id = ?").get(id, user.tenant_id) as any;
    if (!dev) return NextResponse.json({ error: "Empreendimento não encontrado." }, { status: 404 });

    const { name, developerId, type, address, city, region, vgv } = await req.json();
    if (!name) return NextResponse.json({ error: "O nome é obrigatório." }, { status: 400 });

    const normKey = normalizeKey(name);
    // D4: checar duplicidade em outro registro
    const dup = db.prepare("SELECT * FROM developments WHERE normalized_key = ? AND tenant_id = ? AND id != ?").get(normKey, user.tenant_id, id) as any;
    if (dup) return NextResponse.json({ error: `Erro D4: "${name}" já existe como "${dup.name}".` }, { status: 409 });

    db.prepare(`
      UPDATE developments
      SET name = ?, developer_id = ?, type = ?, address = ?, city = ?, region = ?, vgv = ?, normalized_key = ?
      WHERE id = ?
    `).run(name, developerId || null, type || dev.type, address ?? dev.address, city ?? dev.city, region ?? dev.region, Number(vgv) || 0, normKey, id);

    db.prepare(`
      INSERT INTO audit_log (id, tenant_id, actor_id, action, entity_type, entity_id, before, after, ip)
      VALUES (?, ?, ?, 'product.updated', 'developments', ?, ?, ?, '127.0.0.1')
    `).run(
      "audit-" + Math.random().toString(36).substr(2, 9),
      user.tenant_id, user.id, id,
      JSON.stringify({ name: dev.name, vgv: dev.vgv }),
      JSON.stringify({ name, vgv: Number(vgv) || 0 })
    );

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// APAGAR empreendimento
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    const user = await getAuthUser(db);
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    if (user.role !== "Admin") return NextResponse.json({ error: "Apenas administradores podem excluir do catálogo." }, { status: 403 });

    const dev = db.prepare("SELECT * FROM developments WHERE id = ? AND tenant_id = ?").get(id, user.tenant_id) as any;
    if (!dev) return NextResponse.json({ error: "Empreendimento não encontrado." }, { status: 404 });

    // Limpa vínculos e unidades para não deixar órfãos
    try { db.prepare("DELETE FROM lead_interests WHERE development_id = ?").run(id); } catch {}
    try { db.prepare("DELETE FROM properties WHERE development_id = ?").run(id); } catch {}
    db.prepare("DELETE FROM developments WHERE id = ?").run(id);

    db.prepare(`
      INSERT INTO audit_log (id, tenant_id, actor_id, action, entity_type, entity_id, details, ip)
      VALUES (?, ?, ?, 'product.deleted', 'developments', ?, ?, '127.0.0.1')
    `).run(
      "audit-" + Math.random().toString(36).substr(2, 9),
      user.tenant_id, user.id, id,
      `Empreendimento "${dev.name}" excluído.`
    );

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
