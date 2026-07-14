import { NextResponse } from "next/server";
import { getSupabaseAdmin, getAuthUser } from "../../../lib/supabase";

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const supabase = getSupabaseAdmin();

    let query = supabase
      .from("audit_log")
      .select("*, users!audit_log_actor_id_fkey(name)")
      .order("occurred_at", { ascending: false });

    if (user.role === "Corretor") {
      query = query.eq("actor_id", user.id);
    }

    const { data: logs } = await query;

    return NextResponse.json({
      logs: (logs ?? []).map((l: any) => ({
        id: l.id,
        actor: l.users?.name ?? "Sistema",
        action: l.action,
        entityType: l.entity_type,
        entityCode: l.entity_id ?? "SYS",
        details: l.details || "Ação executada no sistema.",
        occurredAt: l.occurred_at,
        ip: l.ip || "127.0.0.1",
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
