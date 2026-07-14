import { NextResponse } from "next/server";
import { getSupabaseAdmin, getAuthUser } from "../../../../lib/supabase";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (user.role !== "Admin") return NextResponse.json({ error: "Apenas administradores podem editar o catálogo." }, { status: 403 });

  const { data: dev } = await supabase
    .from("developments")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", user.tenant_id)
    .maybeSingle();

  if (!dev) return NextResponse.json({ error: "Empreendimento não encontrado." }, { status: 404 });

  const body = await req.json();
  const { name, developerId, type, address, city, region, vgv } = body;
  if (!name) return NextResponse.json({ error: "O nome é obrigatório." }, { status: 400 });

  // D4: checar duplicidade em outro registro
  const { data: dup } = await supabase
    .from("developments")
    .select("id, name")
    .eq("tenant_id", user.tenant_id)
    .ilike("name", name)
    .neq("id", id)
    .maybeSingle();

  if (dup) return NextResponse.json({ error: `Erro D4: "${name}" já existe como "${(dup as any).name}".` }, { status: 409 });

  const updates: Record<string, unknown> = { name };
  if (developerId !== undefined) updates.developer_id = developerId || null;
  if (type !== undefined) updates.type = type;
  if (address !== undefined) updates.address = address;
  if (city !== undefined) updates.city = city;
  if (region !== undefined) updates.region = region;
  if (vgv !== undefined) updates.vgv = Number(vgv) || 0;

  const { error } = await supabase
    .from("developments")
    .update(updates)
    .eq("id", id)
    .eq("tenant_id", user.tenant_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("audit_log").insert({
    tenant_id: user.tenant_id,
    actor_id: user.id,
    action: "product.updated",
    entity_type: "developments",
    entity_id: id,
    before: { name: dev.name, vgv: dev.vgv },
    after: { name, vgv: Number(vgv) || 0 },
    ip: "server",
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (user.role !== "Admin") return NextResponse.json({ error: "Apenas administradores podem excluir do catálogo." }, { status: 403 });

  const { data: dev } = await supabase
    .from("developments")
    .select("id, name")
    .eq("id", id)
    .eq("tenant_id", user.tenant_id)
    .maybeSingle();

  if (!dev) return NextResponse.json({ error: "Empreendimento não encontrado." }, { status: 404 });

  // Limpa vínculos antes de excluir
  await supabase.from("lead_interests").delete().eq("development_id", id);
  await supabase.from("properties").delete().eq("development_id", id);

  const { error } = await supabase.from("developments").delete().eq("id", id).eq("tenant_id", user.tenant_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("audit_log").insert({
    tenant_id: user.tenant_id,
    actor_id: user.id,
    action: "product.deleted",
    entity_type: "developments",
    entity_id: id,
    details: `Empreendimento "${(dev as any).name}" excluído.`,
    ip: "server",
  });

  return NextResponse.json({ success: true });
}
