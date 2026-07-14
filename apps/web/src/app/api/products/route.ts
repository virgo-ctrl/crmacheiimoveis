import { NextResponse } from "next/server";
import { getSupabaseAdmin, getAuthUser } from "../../../lib/supabase";
import { normalizeKey } from "@crm/validation";

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const supabase = getSupabaseAdmin();

    const [{ data: developments }, { data: properties }, { data: developers }] = await Promise.all([
      supabase.from("developments").select("*, developers(name)"),
      supabase.from("properties").select("*, developments(name), developers(name)"),
      supabase.from("developers").select("*"),
    ]);

    return NextResponse.json({
      developments: (developments ?? []).map((d: any) => ({ ...d, developerName: d.developers?.name })),
      properties: (properties ?? []).map((p: any) => ({ ...p, developmentName: p.developments?.name, developerName: p.developers?.name })),
      developers: developers ?? [],
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    if (user.role !== "Admin") return NextResponse.json({ error: "Apenas administradores podem gerenciar o catálogo de produtos." }, { status: 403 });

    const supabase = getSupabaseAdmin();
    const { developerId, name, type, address, city, region, status, vgv } = await req.json();

    if (!name) return NextResponse.json({ error: "O nome do empreendimento é obrigatório." }, { status: 400 });

    const normKey = normalizeKey(name);

    const { data: existing } = await supabase
      .from("developments")
      .select("id, name")
      .eq("normalized_key", normKey)
      .eq("tenant_id", user.tenant_id)
      .single();

    if (existing) {
      return NextResponse.json({
        error: `Erro D4: O empreendimento "${name}" é um possível duplicado de "${existing.name}". Cadastro bloqueado.`,
      }, { status: 409 });
    }

    const { data: dev, error } = await supabase.from("developments").insert({
      tenant_id: user.tenant_id, developer_id: developerId || null, name,
      type: type || "lançamento", address: address || "", city: city || "",
      region: region || "", status: status || "lançamento",
      vgv: Number(vgv) || 0, normalized_key: normKey,
    }).select("id").single();

    if (error) throw new Error(error.message);

    await supabase.from("audit_log").insert({
      tenant_id: user.tenant_id, actor_id: user.id, action: "product.created",
      entity_type: "developments", entity_id: dev!.id,
      details: `Empreendimento "${name}" cadastrado. Key: ${normKey}.`, ip: "127.0.0.1",
    });

    return NextResponse.json({ success: true, developmentId: dev!.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
