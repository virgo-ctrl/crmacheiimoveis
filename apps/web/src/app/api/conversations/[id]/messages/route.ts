import { NextResponse } from "next/server";
import { getSupabaseAdmin, getAuthUser } from "../../../../../lib/supabase";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const supabase = getSupabaseAdmin();

    let convQuery = supabase.from("conversations").select("*").eq("id", id);
    if (user.role === "Corretor") convQuery = convQuery.eq("assigned_broker_id", user.id);

    const { data: conv } = await convQuery.single();
    if (!conv) return NextResponse.json({ error: "Acesso negado." }, { status: 403 });

    const { data: messages } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", id)
      .order("occurred_at", { ascending: true });

    await supabase.from("conversations").update({ unread_count: 0 }).eq("id", id);

    return NextResponse.json({ messages: messages ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const supabase = getSupabaseAdmin();

    let convQuery = supabase.from("conversations").select("*").eq("id", id);
    if (user.role === "Corretor") convQuery = convQuery.eq("assigned_broker_id", user.id);

    const { data: conv } = await convQuery.single();
    if (!conv) return NextResponse.json({ error: "Acesso negado." }, { status: 403 });

    const { body, type, templateId, variables } = await req.json();

    let messageBody = body;
    let contentType = type || "text";

    const isWaExpired = conv.wa_window_expires_at && new Date(conv.wa_window_expires_at) < new Date();
    if (isWaExpired && contentType !== "template") {
      return NextResponse.json({ error: "Janela de 24h expirada. WhatsApp oficial exige envio de templates aprovados." }, { status: 400 });
    }

    if (contentType === "template" && templateId) {
      const { data: template } = await supabase.from("message_templates").select("*").eq("id", templateId).single();
      if (!template) return NextResponse.json({ error: "Template não encontrado." }, { status: 404 });

      messageBody = template.body;
      const parsedVars = Array.isArray(variables) ? variables : [];
      parsedVars.forEach((val: string, index: number) => {
        messageBody = messageBody.replace(`{{${index + 1}}}`, val || "");
      });
    }

    const now = new Date().toISOString();

    const { data: newMsg } = await supabase.from("messages").insert({
      conversation_id: id,
      direction: "out",
      external_id: `ext-${Math.random().toString(36).substr(2, 9)}`,
      sender: user.name,
      content_type: contentType,
      body: messageBody,
      status: "sent",
    }).select("id").single();

    await supabase.from("conversations").update({
      last_message_at: now,
      wa_window_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }).eq("id", id);

    if (conv.lead_id) {
      await supabase.from("timeline_events").insert({
        lead_id: conv.lead_id, type: "message", actor_id: user.id,
        payload: { body: messageBody, direction: "out" },
      });
    }

    await supabase.from("audit_log").insert({
      tenant_id: user.tenant_id, actor_id: user.id, action: "conversation.reply",
      entity_type: "conversations", entity_id: id,
      details: `Mensagem de saída enviada. Tipo: ${contentType}.`, ip: "127.0.0.1",
    });

    return NextResponse.json({ success: true, messageId: newMsg?.id, body: messageBody });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
