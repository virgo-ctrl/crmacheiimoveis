import { NextResponse } from "next/server";
import { getSupabaseAdmin, getAuthUser } from "../../../../lib/supabase";

export async function GET(req: Request) {
  const supabase = getSupabaseAdmin();
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const [devResult, propResult] = await Promise.all([
    supabase.from("developers").select("*").eq("tenant_id", user.tenant_id),
    supabase
      .from("properties")
      .select("*, developments(name)")
      .eq("tenant_id", user.tenant_id),
  ]);

  const properties = (propResult.data ?? []).map((p: any) => ({
    ...p,
    developmentName: p.developments?.name ?? null,
    developments: undefined,
  }));

  return NextResponse.json({
    developers: devResult.data ?? [],
    properties,
  });
}

export async function POST(req: Request) {
  const supabase = getSupabaseAdmin();
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (user.role !== "Admin") return NextResponse.json({ error: "Apenas administradores podem cadastrar produtos e construtoras." }, { status: 403 });

  const body = await req.json();
  const { type, name, cnpj, contact, address, number, country, state, city, neighborhood, zip, complement,
    developmentId, developerId, code, price, area, bedrooms, status } = body;

  if (type === "developer") {
    if (!name || !cnpj) return NextResponse.json({ error: "Nome e CNPJ da construtora são obrigatórios." }, { status: 400 });

    const { data: existing } = await supabase
      .from("developers")
      .select("id, name")
      .eq("tenant_id", user.tenant_id)
      .eq("cnpj", cnpj.replace(/[^\d]/g, ""))
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: `Erro D4: A construtora com CNPJ "${cnpj}" já está cadastrada como "${(existing as any).name}".` }, { status: 409 });
    }

    const { data: inserted, error } = await supabase
      .from("developers")
      .insert({ tenant_id: user.tenant_id, name, cnpj, contact, address, number, country: country ?? "Brasil", state, city, neighborhood, zip, complement })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await supabase.from("audit_log").insert({
      tenant_id: user.tenant_id, actor_id: user.id,
      action: "developer.created", entity_type: "developers", entity_id: inserted.id,
      details: `Construtora "${name}" (CNPJ: ${cnpj}) cadastrada.`, ip: "server",
    });

    return NextResponse.json({ success: true, id: inserted.id }, { status: 201 });
  }

  if (type === "property") {
    if (!code || !price) return NextResponse.json({ error: "Código da unidade e preço são obrigatórios." }, { status: 400 });

    const { data: inserted, error } = await supabase
      .from("properties")
      .insert({
        tenant_id: user.tenant_id,
        development_id: developmentId ?? null,
        developer_id: developerId ?? null,
        code,
        type: "Apartamento",
        price: Number(price),
        area: Number(area) || 0,
        bedrooms: Number(bedrooms) || 0,
        status: status ?? "disponível",
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await supabase.from("audit_log").insert({
      tenant_id: user.tenant_id, actor_id: user.id,
      action: "property.created", entity_type: "properties", entity_id: inserted.id,
      details: `Unidade "${code}" cadastrada.`, ip: "server",
    });

    return NextResponse.json({ success: true, id: inserted.id }, { status: 201 });
  }

  return NextResponse.json({ error: "Tipo de produto inválido." }, { status: 400 });
}

export async function PUT(req: Request) {
  const supabase = getSupabaseAdmin();
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (user.role !== "Admin") return NextResponse.json({ error: "Apenas Admin." }, { status: 403 });

  const body = await req.json();
  const { type, id, name, cnpj, contact, address, number, country, state, city, neighborhood, zip, complement,
    code, price, area, bedrooms, status, developmentId, developerId } = body;

  if (!id) return NextResponse.json({ error: "ID obrigatório." }, { status: 400 });

  if (type === "developer") {
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (cnpj !== undefined) updates.cnpj = cnpj;
    if (contact !== undefined) updates.contact = contact;
    if (address !== undefined) updates.address = address;
    if (number !== undefined) updates.number = number;
    if (country !== undefined) updates.country = country;
    if (state !== undefined) updates.state = state;
    if (city !== undefined) updates.city = city;
    if (neighborhood !== undefined) updates.neighborhood = neighborhood;
    if (zip !== undefined) updates.zip = zip;
    if (complement !== undefined) updates.complement = complement;

    const { error } = await supabase.from("developers").update(updates).eq("id", id).eq("tenant_id", user.tenant_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else if (type === "property") {
    const updates: Record<string, unknown> = {};
    if (code !== undefined) updates.code = code;
    if (price !== undefined) updates.price = Number(price);
    if (area !== undefined) updates.area = Number(area);
    if (bedrooms !== undefined) updates.bedrooms = Number(bedrooms);
    if (status !== undefined) updates.status = status;
    if (developmentId !== undefined) updates.development_id = developmentId;
    if (developerId !== undefined) updates.developer_id = developerId;

    const { error } = await supabase.from("properties").update(updates).eq("id", id).eq("tenant_id", user.tenant_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request) {
  const supabase = getSupabaseAdmin();
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (user.role !== "Admin") return NextResponse.json({ error: "Apenas Admin." }, { status: 403 });

  const body = await req.json();
  const { type, id } = body;
  if (!type || !id) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });

  if (type === "developer") {
    const { count } = await supabase
      .from("developments")
      .select("*", { count: "exact", head: true })
      .eq("developer_id", id);

    if ((count ?? 0) > 0) {
      return NextResponse.json({ error: "Excluir construtora bloqueado: existem empreendimentos vinculados a ela." }, { status: 409 });
    }
    const { error } = await supabase.from("developers").delete().eq("id", id).eq("tenant_id", user.tenant_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else if (type === "property") {
    const { error } = await supabase.from("properties").delete().eq("id", id).eq("tenant_id", user.tenant_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
