import { NextResponse } from "next/server";
import { getSupabaseAdmin, getAuthUser } from "../../../../lib/supabase";

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const supabase = getSupabaseAdmin();
    const { data: rules } = await supabase.from("distribution_rules").select("*").eq("tenant_id", user.tenant_id);

    return NextResponse.json({ rules: rules ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    if (user.role !== "Admin") return NextResponse.json({ error: "Apenas Admin." }, { status: 403 });

    const supabase = getSupabaseAdmin();
    const { name, type, criteria, priority } = await req.json();
    if (!name || !type) return NextResponse.json({ error: "Nome e Tipo são obrigatórios." }, { status: 400 });

    await supabase.from("distribution_rules").update({ active: false }).eq("tenant_id", user.tenant_id);

    const { data: rule, error } = await supabase.from("distribution_rules").insert({
      tenant_id: user.tenant_id, name, type,
      criteria: criteria || {}, priority: Number(priority) || 1, active: true,
    }).select("id").single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, ruleId: rule!.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    if (user.role !== "Admin") return NextResponse.json({ error: "Apenas Admin." }, { status: 403 });

    const supabase = getSupabaseAdmin();
    const { id, name, type, criteria, priority, active } = await req.json();

    if (active === true) {
      await supabase.from("distribution_rules").update({ active: false }).eq("tenant_id", user.tenant_id).neq("id", id);
    }

    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (type !== undefined) updates.type = type;
    if (criteria !== undefined) updates.criteria = criteria;
    if (priority !== undefined) updates.priority = priority;
    if (active !== undefined) updates.active = active;

    await supabase.from("distribution_rules").update(updates).eq("id", id).eq("tenant_id", user.tenant_id);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    if (user.role !== "Admin") return NextResponse.json({ error: "Apenas Admin." }, { status: 403 });

    const supabase = getSupabaseAdmin();
    const { id } = await req.json();
    await supabase.from("distribution_rules").delete().eq("id", id).eq("tenant_id", user.tenant_id);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
