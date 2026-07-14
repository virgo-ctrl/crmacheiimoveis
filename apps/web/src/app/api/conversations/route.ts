import { NextResponse } from "next/server";
import { getSupabaseAdmin, getAuthUser } from "../../../lib/supabase";

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const supabase = getSupabaseAdmin();

    let query = supabase
      .from("conversations")
      .select("*, leads(name, email, phone)")
      .order("last_message_at", { ascending: false, nullsFirst: false });

    if (user.role === "Corretor") {
      query = query.eq("assigned_broker_id", user.id);
    } else if (user.role === "Gerente") {
      const { data: myTeams } = await supabase.from("team_members").select("team_id").eq("user_id", user.id);
      const teamIds = myTeams?.map((t: any) => t.team_id) ?? [];
      const { data: members } = await supabase.from("team_members").select("user_id").in("team_id", teamIds);
      const memberIds = members?.map((m: any) => m.user_id) ?? [user.id];
      query = query.in("assigned_broker_id", memberIds);
    }

    const { data: conversations } = await query;

    const mappedConvs = (conversations ?? []).map((c: any) => ({
      id: c.id,
      channel: "whatsapp",
      identity: c.leads?.phone ?? "",
      leadName: c.leads?.name ?? "",
      lastMessageAt: c.last_message_at,
      unreadCount: c.unread_count,
      waWindowExpiresAt: c.wa_window_expires_at,
    }));

    return NextResponse.json({ conversations: mappedConvs });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
