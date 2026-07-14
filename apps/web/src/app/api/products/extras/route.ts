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

export async function GET() {
  try {
    const db = getDb();
    const user = await getAuthUser(db);
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const developers = db.prepare("SELECT * FROM developers WHERE tenant_id = ?").all(user.tenant_id) as any[];
    const properties = db.prepare(`
      SELECT p.*, d.name as developmentName 
      FROM properties p
      LEFT JOIN developments d ON p.development_id = d.id
      WHERE p.tenant_id = ?
    `).all(user.tenant_id) as any[];

    return NextResponse.json({ developers, properties });
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
      return NextResponse.json({ error: "Apenas administradores podem cadastrar produtos e construtoras." }, { status: 403 });
    }

    const { 
      type, name, cnpj, contact, 
      address, number, country, state, city, neighborhood, zip, complement,
      developmentId, developerId, code, price, area, bedrooms, status 
    } = await req.json();

    if (type === "developer") {
      if (!name || !cnpj) {
        return NextResponse.json({ error: "Nome e CNPJ da construtora são obrigatórios." }, { status: 400 });
      }

      // Check unique CNPJ constraint (D4)
      const cleanCnpj = cnpj.replace(/[^\d]/g, "");
      const existing = db.prepare("SELECT * FROM developers WHERE tenant_id = ? AND REPLACE(REPLACE(REPLACE(cnpj, '.', ''), '/', ''), '-', '') = ?").get(user.tenant_id, cleanCnpj);
      if (existing) {
        return NextResponse.json({ error: `Erro D4: A construtora com CNPJ "${cnpj}" já está cadastrada como "${(existing as any).name}".` }, { status: 409 });
      }

      const id = "dev-" + Math.random().toString(36).substr(2, 9);
      db.prepare(`
        INSERT INTO developers (id, tenant_id, name, cnpj, contact, address, number, country, state, city, neighborhood, zip, complement)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, 
        user.tenant_id, 
        name, 
        cnpj, 
        contact || "", 
        address || "", 
        number || "", 
        country || "Brasil", 
        state || "", 
        city || "", 
        neighborhood || "", 
        zip || "", 
        complement || ""
      );

      db.prepare(`
        INSERT INTO audit_log (id, tenant_id, actor_id, action, entity_type, entity_id, details)
        VALUES (?, ?, ?, 'developer.created', 'developers', ?, ?)
      `).run("audit-" + Math.random().toString(36).substr(2, 9), user.tenant_id, user.id, id, `Construtora "${name}" (CNPJ: ${cnpj}) cadastrada.`);

      return NextResponse.json({ success: true, id });
    } else if (type === "property") {
      if (!code || !price) {
        return NextResponse.json({ error: "Código/Número da unidade e preço são obrigatórios." }, { status: 400 });
      }

      const id = "prop-" + Math.random().toString(36).substr(2, 9);
      db.prepare(`
        INSERT INTO properties (id, tenant_id, development_id, developer_id, code, type, price, area, bedrooms, status)
        VALUES (?, ?, ?, ?, ?, 'Apartamento', ?, ?, ?, ?)
      `).run(
        id,
        user.tenant_id,
        developmentId || null,
        developerId || null,
        code,
        Number(price) || 0,
        Number(area) || 0,
        Number(bedrooms) || 0,
        status || "disponível"
      );

      db.prepare(`
        INSERT INTO audit_log (id, tenant_id, actor_id, action, entity_type, entity_id, details)
        VALUES (?, ?, ?, 'property.created', 'properties', ?, ?)
      `).run("audit-" + Math.random().toString(36).substr(2, 9), user.tenant_id, user.id, id, `Unidade "${code}" cadastrada.`);

      return NextResponse.json({ success: true, id });
    } else {
      return NextResponse.json({ error: "Tipo de produto inválido." }, { status: 400 });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const db = getDb();
    const user = await getAuthUser(db);
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    if (user.role !== "Admin") return NextResponse.json({ error: "Apenas Admin." }, { status: 403 });

    const { 
      type, id, name, cnpj, contact, 
      address, number, country, state, city, neighborhood, zip, complement,
      code, price, area, bedrooms, status, developmentId, developerId 
    } = await req.json();

    if (type === "developer") {
      db.prepare(`
        UPDATE developers
        SET name = COALESCE(?, name),
            cnpj = COALESCE(?, cnpj),
            contact = COALESCE(?, contact),
            address = COALESCE(?, address),
            number = COALESCE(?, number),
            country = COALESCE(?, country),
            state = COALESCE(?, state),
            city = COALESCE(?, city),
            neighborhood = COALESCE(?, neighborhood),
            zip = COALESCE(?, zip),
            complement = COALESCE(?, complement)
        WHERE id = ? AND tenant_id = ?
      `).run(
        name, 
        cnpj, 
        contact, 
        address, 
        number, 
        country, 
        state, 
        city, 
        neighborhood, 
        zip, 
        complement, 
        id, 
        user.tenant_id
      );
    } else if (type === "property") {
      db.prepare(`
        UPDATE properties
        SET code = COALESCE(?, code),
            price = COALESCE(?, price),
            area = COALESCE(?, area),
            bedrooms = COALESCE(?, bedrooms),
            status = COALESCE(?, status),
            development_id = COALESCE(?, development_id),
            developer_id = COALESCE(?, developer_id)
        WHERE id = ? AND tenant_id = ?
      `).run(
        code, 
        price, 
        area, 
        bedrooms, 
        status, 
        developmentId, 
        developerId, 
        id, 
        user.tenant_id
      );
    }

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
    if (user.role !== "Admin") return NextResponse.json({ error: "Apenas Admin." }, { status: 403 });

    const { type, id } = await req.json();

    if (type === "developer") {
      // Check if there are developments linking to this developer
      const hasDevs = (db.prepare("SELECT COUNT(*) as c FROM developments WHERE developer_id = ?").get(id) as any).c;
      if (hasDevs > 0) {
        return NextResponse.json({ error: "Excluir construtora bloqueado: existem empreendimentos vinculados a ela." }, { status: 409 });
      }
      db.prepare("DELETE FROM developers WHERE id = ?").run(id);
    } else if (type === "property") {
      db.prepare("DELETE FROM properties WHERE id = ?").run(id);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
